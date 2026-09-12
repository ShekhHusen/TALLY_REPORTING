import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import { doc, getDoc, getDocs, collection, query, where, limit, startAfter, or } from 'firebase/firestore';
import { fetchFiscalYears, getCurrentFYObject } from '../utils/fiscalYear';
import TransactionTable from './TransactionTable';
import { deleteTransactionRecord } from '../utils/transactionOperations';
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from 'xlsx';
import { X, FileText, Download, ChevronUp, ChevronDown } from 'lucide-react';

const formatCurrency = (num) => {
    const formatted = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(num) || 0);
    return `Rs. ${num < 0 ? '-' : ''}${formatted}`;
};

export default function AccountStatementModal({ isOpen, onClose, accountName }) {
    const [fyOptions, setFyOptions] = useState([]);
    const [selectedFY, setSelectedFY] = useState('');
    const [accountData, setAccountData] = useState(null);
    const [fyData, setFyData] = useState(null);
    const [transactions, setTransactions] = useState([]);
    const [loadingTxns, setLoadingTxns] = useState(false);
    const [lastVisibleTxn, setLastVisibleTxn] = useState(null);
    const [hasMoreTxns, setHasMoreTxns] = useState(false);
    const [showFullDetails, setShowFullDetails] = useState(false);
    const [isSummaryCollapsed, setIsSummaryCollapsed] = useState(false);

    // 1. Fetch Fiscal Years on mount or open
    useEffect(() => {
        if (!isOpen) return;
        const loadFYs = async () => {
            const fys = await fetchFiscalYears();
            setFyOptions(fys);
            const current = getCurrentFYObject(fys);
            if (current) {
                setSelectedFY(current.id);
            } else if (fys.length > 0) {
                setSelectedFY(fys[0].id);
            }
        };
        loadFYs();
    }, [isOpen]);

    // 2. Fetch Account document and FY details when accountName or selectedFY changes
    useEffect(() => {
        if (!isOpen || !accountName) return;

        const fetchAccountAndFY = async () => {
            try {
                // Find account by name
                const snap = await getDocs(collection(db, 'accounts'));
                let foundAcc = null;
                const lowerName = accountName.trim().toLowerCase();
                const matchedDocIds = [];

                snap.forEach(d => {
                    const dName = (d.data().name || '').trim().toLowerCase();
                    if (dName === lowerName) {
                        matchedDocIds.push(d.id);
                        if (!foundAcc) {
                            foundAcc = { id: d.id, ...d.data() };
                        }
                    }
                });

                if (foundAcc) {
                    foundAcc.allDocIds = matchedDocIds;
                    setAccountData(foundAcc);

                    // Fetch FY subdoc
                    if (selectedFY) {
                        let foundFYData = null;
                        for (const docId of matchedDocIds) {
                            const fySnap = await getDoc(doc(db, 'accounts', docId, 'fiscalYears', selectedFY));
                            if (fySnap.exists()) {
                                foundFYData = fySnap.data();
                                break;
                            }
                        }
                        setFyData(foundFYData);
                    }
                } else {
                    setAccountData({ name: accountName, group: 'N/A' });
                    setFyData(null);
                }
            } catch (err) {
                console.error("Error fetching account info:", err);
            }
        };

        fetchAccountAndFY();
    }, [isOpen, accountName, selectedFY]);

    // 3. Fetch transactions for statement
    const fetchTransactions = async (isLoadMore = false) => {
        if (!accountName) return;
        setLoadingTxns(true);
        try {
            const accNameLower = accountName.toLowerCase();
            let q = query(
                collection(db, 'transactions'),
                or(
                    where('debitAccount', '==', accNameLower),
                    where('creditAccount', '==', accNameLower),
                    where('debitAccount', '==', accountName), 
                    where('creditAccount', '==', accountName)
                ),
                limit(50)
            );

            if (isLoadMore && lastVisibleTxn) {
                q = query(q, startAfter(lastVisibleTxn));
            }

            const snap = await getDocs(q);
            const txns = [];
            snap.forEach(d => txns.push({ id: d.id, ...d.data() }));

            const activeFY = fyOptions.find(f => f.id === selectedFY);
            const start = activeFY?.startDate || '1900-01-01';
            const end = activeFY?.endDate || '2100-12-31';

            const fyFiltered = txns.filter(t => t.date >= start && t.date <= end);
            fyFiltered.sort((a, b) => new Date(a.date) - new Date(b.date));

            const combined = isLoadMore ? [...transactions, ...fyFiltered] : fyFiltered;
            setTransactions(combined);
            setLastVisibleTxn(snap.docs[snap.docs.length - 1]);
            setHasMoreTxns(snap.docs.length === 50);
        } catch (err) {
            console.error("Error fetching transactions for statement:", err);
        } finally {
            setLoadingTxns(false);
        }
    };

    // Calculate accurate running balance and account-specific debit/credit amounts based on opening balance
    const processedTransactions = useMemo(() => {
        if (!transactions || transactions.length === 0) return [];

        const ob = parseFloat(fyData?.openingBalance || 0);
        const obType = fyData?.openingBalanceType || '';
        let runningVal = obType === 'Cr' ? -ob : ob;

        const accNameLower = (accountName || '').trim().toLowerCase();
        const sorted = [...transactions].sort((a, b) => new Date(a.date) - new Date(b.date));

        return sorted.map(t => {
            let debAmt = 0;
            let credAmt = 0;

            if (t.allDebitEntries && t.allDebitEntries.length > 0) {
                debAmt = t.allDebitEntries
                    .filter(e => e.name && e.name.trim().toLowerCase() === accNameLower)
                    .reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);
            } else if (t.debitAccount && t.debitAccount.trim().toLowerCase() === accNameLower) {
                debAmt = parseFloat(t.debitAmount || 0);
            }

            if (t.allCreditEntries && t.allCreditEntries.length > 0) {
                credAmt = t.allCreditEntries
                    .filter(e => e.name && e.name.trim().toLowerCase() === accNameLower)
                    .reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);
            } else if (t.creditAccount && t.creditAccount.trim().toLowerCase() === accNameLower) {
                credAmt = parseFloat(t.creditAmount || 0);
            }

            runningVal = runningVal + debAmt - credAmt;

            return {
                ...t,
                accountDebitAmt: debAmt,
                accountCreditAmt: credAmt,
                runningBalance: Math.abs(runningVal),
                runningBalanceType: runningVal < 0 ? 'Cr' : (runningVal > 0 ? 'Dr' : '')
            };
        });
    }, [transactions, fyData, accountName]);

    useEffect(() => {
        if (isOpen && accountName && selectedFY) {
            setTransactions([]);
            setLastVisibleTxn(null);
            fetchTransactions(false);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, accountName, selectedFY, fyData]);

    const handleDelete = async (t) => {
        const ok = await deleteTransactionRecord(t);
        if (ok) {
            fetchTransactions(false);
        }
    };

    const exportToPDF = () => {
        if (!accountName) return;
        const displayBalance = fyData || { openingBalance: 0, openingBalanceType: '', closingBalance: 0, closingBalanceType: '' };
        const docPDF = new jsPDF();
        
        const activeFY = fyOptions.find(f => f.id === selectedFY);
        const fyName = activeFY?.name || selectedFY;
        
        docPDF.setFontSize(14);
        docPDF.text(`Ledger Account Statement (${fyName})`, 14, 15);
        
        docPDF.setFontSize(10);
        docPDF.text(`Account Name: ${accountName}`, 14, 22);
        docPDF.text(`Account Group: ${accountData?.group || 'N/A'}`, 14, 28);
        docPDF.text(`Opening Balance: ${displayBalance.openingBalance || 0} ${displayBalance.openingBalanceType || ''}`, 130, 22);
        docPDF.text(`Closing Balance: ${displayBalance.closingBalance || 0} ${displayBalance.closingBalanceType || ''}`, 130, 28);
        
        const tableColumn = ["Date", "Particulars", "Vch Type", "Vch No", "Debit", "Credit", "Balance"];
        const tableRows = [];

        processedTransactions.forEach(t => {
            const isDebit = t.accountDebitAmt > 0 || (t.accountCreditAmt === 0 && (
                (t.debitAccount && t.debitAccount.toLowerCase() === accountName.toLowerCase()) ||
                (t.allDebitAccounts && t.allDebitAccounts.some(n => n.toLowerCase() === accountName.toLowerCase()))
            ));
            let particulars = isDebit ? `To ${t.creditAccount || '-'}` : `By ${t.debitAccount || '-'}`;
            
            if (showFullDetails && t.narration) {
                particulars += `\n[Narration: ${t.narration}]`;
            }

            const row = [
                t.date,
                particulars,
                t.type,
                t.voucherNo,
                t.accountDebitAmt ? formatCurrency(t.accountDebitAmt) : '',
                t.accountCreditAmt ? formatCurrency(t.accountCreditAmt) : '',
                `${formatCurrency(t.runningBalance)} ${t.runningBalanceType}`
            ];
            tableRows.push(row);
        });

        autoTable(docPDF, {
            head: [tableColumn],
            body: tableRows,
            startY: 35,
            styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak' },
            margin: { left: 14, right: 14 }
        });

        docPDF.save(`${accountName}_Statement_FY${selectedFY}.pdf`);
    };

    const exportToExcel = () => {
        if (!accountName) return;
        const activeFY = fyOptions.find(f => f.id === selectedFY);
        const fyName = activeFY?.name || selectedFY;
        
        const formattedData = processedTransactions.map(t => {
            const isDebit = t.accountDebitAmt > 0 || (t.accountCreditAmt === 0 && (
                (t.debitAccount && t.debitAccount.toLowerCase() === accountName.toLowerCase()) ||
                (t.allDebitAccounts && t.allDebitAccounts.some(n => n.toLowerCase() === accountName.toLowerCase()))
            ));
            let particulars = isDebit ? `To ${t.creditAccount || '-'}` : `By ${t.debitAccount || '-'}`;
            
            return {
                Date: t.date,
                Particulars: particulars,
                VoucherType: t.type,
                VoucherNo: t.voucherNo,
                DebitAmount: t.accountDebitAmt || null,
                CreditAmount: t.accountCreditAmt || null,
                Balance: parseFloat(t.runningBalance || 0),
                BalanceType: t.runningBalanceType || '',
                Narration: t.narration || ''
            };
        });

        const worksheet = XLSX.utils.json_to_sheet(formattedData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Statement");
        XLSX.writeFile(workbook, `${accountName}_Statement_${fyName}.xlsx`);
    };

    if (!isOpen) return null;

    const displayBalance = fyData || {
        openingBalance: 0,
        openingBalanceType: '',
        totalDebit: 0,
        totalCredit: 0,
        closingBalance: 0,
        closingBalanceType: ''
    };

    return (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 sm:p-6">
            <div className="bg-white rounded-2xl shadow-2xl max-w-6xl w-full h-[90vh] flex flex-col overflow-hidden ring-1 ring-black/5">
                {/* Header */}
                <div className="px-4 sm:px-6 py-4 sm:py-5 border-b border-gray-100 bg-white flex flex-col xl:flex-row xl:items-center justify-between gap-4 shrink-0">
                    
                    {/* Account Name & Info (Clickable for mobile to collapse summary) */}
                    <div 
                        className="flex items-center justify-between cursor-pointer xl:cursor-default"
                        onClick={() => setIsSummaryCollapsed(!isSummaryCollapsed)}
                    >
                        <div className="flex items-center gap-3 sm:gap-4 w-full">
                            <div className="p-2 sm:p-3 bg-indigo-50 text-indigo-600 rounded-xl sm:rounded-2xl shrink-0">
                                <FileText className="stroke-[2.5] w-6 h-6 sm:w-7 sm:h-7" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <h3 className="font-extrabold text-lg sm:text-2xl text-gray-900 tracking-tight flex items-center justify-between xl:justify-start gap-2">
                                    <span className="truncate">{accountName}</span>
                                    {/* Collapse Button (Only visible on smaller screens) */}
                                    <button className="xl:hidden text-gray-400 p-1 hover:bg-gray-100 rounded-lg shrink-0 transition-colors">
                                        {isSummaryCollapsed ? <ChevronDown size={20} /> : <ChevronUp size={20} />}
                                    </button>
                                </h3>
                                <div className="flex items-center gap-2 mt-0.5 sm:mt-1">
                                    <span className="text-[10px] sm:text-xs font-bold text-gray-500 uppercase tracking-wider truncate">{accountData?.group || 'N/A'}</span>
                                    <span className="text-gray-300 shrink-0">•</span>
                                    <span className="text-[10px] sm:text-xs font-bold text-indigo-600 shrink-0">Ledger Statement</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    {/* Toolbar actions */}
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full xl:w-auto">
                        {/* Narration Checkbox */}
                        <label className="hidden sm:flex items-center gap-2 text-sm font-bold text-gray-700 cursor-pointer hover:text-gray-900 transition-colors select-none mr-2">
                            <input 
                                type="checkbox" 
                                checked={showFullDetails}
                                onChange={(e) => setShowFullDetails(e.target.checked)}
                                className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 bg-white"
                            />
                            Show narration
                        </label>
                        
                        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1 sm:pb-0 justify-between sm:justify-end">
                            <select
                                value={selectedFY}
                                onChange={(e) => setSelectedFY(e.target.value)}
                                className="px-3 sm:px-4 py-2 border-0 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-bold bg-gray-50 text-gray-800 cursor-pointer hover:bg-gray-100 transition-colors shadow-sm ring-1 ring-inset ring-gray-200 shrink-0"
                            >
                                {fyOptions.map(fy => <option key={fy.id} value={fy.id}>{fy.name}</option>)}
                            </select>

                            <button 
                                onClick={exportToPDF}
                                className="shrink-0 bg-white hover:bg-red-50 text-red-600 px-3 sm:px-3.5 py-2 rounded-lg text-sm font-bold transition-colors flex items-center gap-2 border border-gray-200 hover:border-red-200 shadow-sm"
                            >
                                <Download size={16} className="stroke-[2.5]" /> <span className="hidden sm:inline">PDF</span>
                            </button>
                            <button 
                                onClick={exportToExcel}
                                className="shrink-0 bg-white hover:bg-green-50 text-green-700 px-3 sm:px-3.5 py-2 rounded-lg text-sm font-bold transition-colors flex items-center gap-2 border border-gray-200 hover:border-green-200 shadow-sm"
                            >
                                <Download size={16} className="stroke-[2.5]" /> <span className="hidden sm:inline">Excel</span>
                            </button>
                            
                            <button 
                                onClick={onClose}
                                className="hidden sm:block p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-xl transition-colors ml-1 shrink-0"
                            >
                                <X size={20} className="stroke-[2.5]" />
                            </button>
                        </div>
                        
                        <div className="flex items-center justify-between sm:justify-end gap-3 mt-1 sm:mt-0">
                            <label className="flex items-center justify-center py-2 sm:py-0 px-3 sm:px-0 gap-2 text-xs sm:text-sm font-bold text-gray-700 cursor-pointer sm:bg-transparent bg-gray-50 sm:border-0 border border-gray-200 rounded-lg sm:rounded-none hover:text-gray-900 transition-colors select-none flex-1 sm:flex-none">
                                <input 
                                    type="checkbox" 
                                    checked={showFullDetails}
                                    onChange={(e) => setShowFullDetails(e.target.checked)}
                                    className="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 bg-white"
                                />
                                Show full narration
                            </label>
                            
                            <button 
                                onClick={onClose}
                                className="sm:hidden p-2 bg-gray-100 text-gray-500 hover:text-gray-900 hover:bg-gray-200 rounded-lg transition-colors shrink-0"
                            >
                                <X size={18} className="stroke-[2.5]" />
                            </button>
                        </div>
                    </div>
                </div>

                {/* Balances Grid - Collapsible */}
                {!isSummaryCollapsed && (
                    <div className="px-4 sm:px-6 py-4 sm:py-5 bg-gray-50/50 border-b border-gray-100 flex flex-col gap-5 shrink-0">
                        {/* Balances Grid */}
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                            <div className="bg-white p-3 sm:p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-center">
                                <div className="text-[10px] text-gray-500 font-extrabold uppercase tracking-widest mb-1 sm:mb-1.5">Opening Bal</div>
                                <div className="text-base sm:text-lg font-extrabold text-gray-900 truncate">
                                    {formatCurrency(displayBalance.openingBalance)} <span className="text-[10px] sm:text-xs text-gray-500 font-bold ml-0.5">{displayBalance.openingBalanceType}</span>
                                </div>
                            </div>
                            <div className="bg-white p-3 sm:p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-center">
                                <div className="text-[10px] text-red-500 font-extrabold uppercase tracking-widest mb-1 sm:mb-1.5">Total Debit</div>
                                <div className="text-base sm:text-lg font-extrabold text-red-600 truncate">
                                    {formatCurrency(displayBalance.totalDebit)}
                                </div>
                            </div>
                            <div className="bg-white p-3 sm:p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-center">
                                <div className="text-[10px] text-green-600 font-extrabold uppercase tracking-widest mb-1 sm:mb-1.5">Total Credit</div>
                                <div className="text-base sm:text-lg font-extrabold text-green-600 truncate">
                                    {formatCurrency(displayBalance.totalCredit)}
                                </div>
                            </div>
                            <div className="bg-indigo-50 p-3 sm:p-4 rounded-xl border border-indigo-100 shadow-sm flex flex-col justify-center relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-100 rounded-full blur-2xl -mr-10 -mt-10 opacity-60"></div>
                                <div className="relative z-10">
                                    <div className="text-[10px] text-indigo-700 font-extrabold uppercase tracking-widest mb-1 sm:mb-1.5">Closing Bal</div>
                                    <div className="text-xl sm:text-2xl font-black text-indigo-900 leading-none truncate">
                                        {formatCurrency(displayBalance.closingBalance)} <span className="text-[10px] sm:text-sm font-bold opacity-80 ml-0.5">{displayBalance.closingBalanceType}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Transactions Table Area */}
                <div className="flex-1 overflow-auto p-0 bg-white">
                    <TransactionTable 
                        transactions={processedTransactions} 
                        showFullDetails={showFullDetails} 
                        isStatementView={true} 
                        selectedAccountName={accountName}
                        onDeleteTransaction={handleDelete}
                    />
                    
                    {loadingTxns && (
                        <div className="flex items-center justify-center p-12 text-sm font-bold text-gray-400 gap-3">
                            <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                            Loading statement...
                        </div>
                    )}
                    
                    {!loadingTxns && hasMoreTxns && transactions.length > 0 && (
                        <div className="text-center p-8 border-t border-gray-100">
                            <button 
                                onClick={() => fetchTransactions(true)}
                                className="px-6 py-2.5 bg-white hover:bg-gray-50 text-gray-700 rounded-full text-sm font-bold border border-gray-200 shadow-sm transition-colors"
                            >
                                Load More Transactions
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
