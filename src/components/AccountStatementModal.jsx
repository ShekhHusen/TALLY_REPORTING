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
                limit(10)
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
            setHasMoreTxns(snap.docs.length === 10);
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
                {/* Header Top Bar */}
                <div className="p-4 sm:px-6 sm:py-4 border-b border-slate-100 flex flex-col gap-4 sm:gap-4 shrink-0 bg-white z-20">
                    {/* Row 1: Back, FY, and Actions */}
                    <div className="flex justify-between items-center w-full">
                        <div className="flex items-center gap-2 sm:gap-3">
                            <button
                                onClick={onClose}
                                className="flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors shrink-0"
                                title="Close"
                            >
                                <X className="w-4 h-4 sm:w-5 sm:h-5" strokeWidth={2.5} />
                            </button>
                            <select
                                value={selectedFY}
                                onChange={(e) => setSelectedFY(e.target.value)}
                                className="px-2 py-1.5 sm:px-3 sm:py-1.5 border-0 bg-indigo-100 text-indigo-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-xs sm:text-sm font-bold tracking-wide shadow-inner cursor-pointer shrink-0"
                            >
                                {fyOptions.length === 0 && <option value="">No FY</option>}
                                {fyOptions.map(fy => <option key={fy.id} value={fy.id}>{fy.name}</option>)}
                            </select>
                        </div>
                        <div className="flex items-center gap-2 sm:gap-3">
                            <label className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm font-semibold text-slate-600 cursor-pointer hover:text-slate-900 transition-colors">
                                <input
                                    type="checkbox"
                                    checked={showFullDetails}
                                    onChange={(e) => setShowFullDetails(e.target.checked)}
                                    className="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 transition-all cursor-pointer"
                                />
                                <span>Full</span>
                            </label>
                            <button
                                onClick={exportToPDF}
                                className="flex items-center justify-center w-8 h-8 sm:w-auto sm:px-3 sm:py-1.5 gap-1.5 bg-rose-100 hover:bg-rose-200 text-rose-700 rounded-lg text-sm font-bold transition-colors shrink-0"
                                title="Export PDF"
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                <span className="hidden sm:inline">PDF</span>
                            </button>
                            <button
                                onClick={exportToExcel}
                                className="flex items-center justify-center w-8 h-8 sm:w-auto sm:px-3 sm:py-1.5 gap-1.5 bg-emerald-100 hover:bg-emerald-200 text-emerald-700 rounded-lg text-sm font-bold transition-colors shrink-0"
                                title="Export Excel"
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                <span className="hidden sm:inline">Excel</span>
                            </button>
                        </div>
                    </div>
                    {/* Row 2: Account Name & Collapse Toggle */}
                    <div 
                        className="flex justify-between items-center w-full cursor-pointer group"
                        onClick={() => setIsSummaryCollapsed(!isSummaryCollapsed)}
                    >
                        <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight truncate flex-1 pr-4" title={accountName}>
                            {accountName}
                        </h2>
                        <button 
                            className="flex items-center justify-center w-8 h-8 rounded-full text-slate-400 group-hover:text-indigo-600 transition-all shrink-0"
                        >
                            {!isSummaryCollapsed ? (
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" /></svg>
                            ) : (
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                            )}
                        </button>
                    </div>
                </div>

                {/* Summary Bento Grid */}
                {!isSummaryCollapsed && (
                    <div className="p-4 sm:p-5 border-b border-slate-100 bg-slate-50/50 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 shrink-0 transition-all duration-300 ease-in-out">
                        {/* Info Card (Span 2) */}
                        <div className="lg:col-span-2 bg-white border border-slate-200/60 rounded-xl p-4 flex flex-col justify-center shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                                <div className="w-1.5 h-1.5 rounded-full bg-slate-300"></div> Account Details
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                                <div className="flex flex-col">
                                    <span className="text-slate-500 font-medium text-[11px] uppercase tracking-wider mb-0.5">Group</span>
                                    <span className="text-slate-900 font-semibold truncate" title={accountData?.group}>{accountData?.group || '-'}</span>
                                </div>
                                <div className="flex flex-col sm:col-span-2">
                                    <span className="text-slate-500 font-medium text-[11px] uppercase tracking-wider mb-0.5">Address & Contact</span>
                                    <span className="text-slate-900 font-semibold truncate" title={accountData?.address ? `${accountData.address} ${accountData.contact ? `| ${accountData.contact}` : ''}` : '-'}>
                                        {accountData?.address || '-'} {accountData?.contact ? <span className="text-slate-400 font-normal mx-1">|</span> : ''} {accountData?.contact || ''}
                                    </span>
                                </div>
                            </div>
                        </div>
                        {/* Debit & Credit Flow (Span 1) */}
                        <div className="bg-white border border-slate-200/60 rounded-xl p-4 flex flex-col justify-center shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                            <div className="flex justify-between items-end mb-2.5">
                                <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                                    <div className="w-1.5 h-1.5 rounded-full bg-rose-400"></div> Total Debit
                                </div>
                                <div className="text-sm font-bold text-rose-600">{formatCurrency(displayBalance.totalDebit)}</div>
                            </div>
                            <div className="w-full h-px bg-slate-100 mb-2.5"></div>
                            <div className="flex justify-between items-end">
                                <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400"></div> Total Credit
                                </div>
                                <div className="text-sm font-bold text-emerald-600">{formatCurrency(displayBalance.totalCredit)}</div>
                            </div>
                        </div>
                        {/* Combined Balances (Span 1) */}
                        <div className="bg-gradient-to-br from-indigo-50 to-indigo-100/50 border border-indigo-200/60 rounded-xl p-4 flex flex-col justify-between shadow-sm relative overflow-hidden h-full">
                            <div className="absolute -right-4 -bottom-4 text-indigo-500/10 pointer-events-none">
                                <svg className="w-24 h-24 transform rotate-12" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1.41 16.09V20h-2.67v-1.93c-1.71-.36-3.11-1.36-3.11-2.92v-.46h2.79v.48c0 .76.7 1.31 1.74 1.31 1.11 0 1.73-.57 1.73-1.36 0-.87-.59-1.28-1.92-1.61-1.98-.51-3.26-1.56-3.26-3.25 0-1.46 1.11-2.5 2.69-2.85V5.5h2.67v1.95c1.4.35 2.5 1.31 2.5 2.55v.52h-2.79v-.53c0-.68-.61-1.16-1.5-1.16-.94 0-1.47.51-1.47 1.25 0 .8.65 1.21 2.05 1.57 2.11.53 3.12 1.63 3.12 3.32 0 1.6-1.18 2.67-2.77 3.12z"/></svg>
                            </div>
                            <div className="relative z-10 flex justify-between items-end mb-2">
                                <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                                    Opening
                                </div>
                                <div className="text-sm font-semibold text-slate-600">
                                    {formatCurrency(displayBalance.openingBalance)} <span className="text-xs font-normal ml-0.5">{displayBalance.openingBalanceType}</span>
                                </div>
                            </div>
                            <div className="w-full h-px bg-indigo-200/50 mb-2 relative z-10"></div>
                            <div className="relative z-10 flex flex-col items-start mt-auto">
                                <div className="text-[11px] font-bold text-indigo-600 uppercase tracking-wider mb-0.5 flex items-center gap-1.5">
                                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.8)]"></div> Closing
                                </div>
                                <div className="text-xl font-black text-indigo-950 tracking-tight leading-none mt-1">
                                    {formatCurrency(displayBalance.closingBalance)} <span className="text-sm font-bold text-indigo-600 ml-0.5">{displayBalance.closingBalanceType}</span>
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
