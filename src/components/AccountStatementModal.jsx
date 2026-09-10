import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { doc, getDoc, getDocs, collection, query, where, limit, startAfter, or } from 'firebase/firestore';
import { fetchFiscalYears, getCurrentFYObject } from '../utils/fiscalYear';
import TransactionTable from './TransactionTable';
import { deleteTransactionRecord } from '../utils/transactionOperations';
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from 'xlsx';
import { X, FileText, Download } from 'lucide-react';

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

            let runningVal = fyData 
                ? (fyData.openingBalanceType === 'Cr' ? -1 : 1) * parseFloat(fyData.openingBalance || 0)
                : 0;

            const processed = combined.map(t => {
                const isDebit = t.debitAccount && t.debitAccount.toLowerCase() === accNameLower;
                const debAmt = isDebit ? parseFloat(t.debitAmount || 0) : 0;
                const credAmt = !isDebit ? parseFloat(t.creditAmount || 0) : 0;
                
                runningVal = runningVal + debAmt - credAmt;
                
                return {
                    ...t,
                    runningBalance: Math.abs(runningVal),
                    runningBalanceType: runningVal < 0 ? 'Cr' : (runningVal > 0 ? 'Dr' : '')
                };
            });

            setTransactions(processed);
            setLastVisibleTxn(snap.docs[snap.docs.length - 1]);
            setHasMoreTxns(snap.docs.length === 50);
        } catch (err) {
            console.error("Error fetching transactions for statement:", err);
        } finally {
            setLoadingTxns(false);
        }
    };

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

        transactions.forEach(t => {
            const isDebit = t.debitAccount && t.debitAccount.toLowerCase() === accountName.toLowerCase();
            let particulars = isDebit ? `To ${t.creditAccount}` : `By ${t.debitAccount}`;
            
            if (showFullDetails && t.narration) {
                particulars += `\n[Narration: ${t.narration}]`;
            }

            const row = [
                t.date,
                particulars,
                t.type,
                t.voucherNo,
                isDebit && t.debitAmount ? formatCurrency(t.debitAmount) : '',
                !isDebit && t.creditAmount ? formatCurrency(t.creditAmount) : '',
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
        
        const formattedData = transactions.map(t => {
            const isDebit = t.debitAccount && t.debitAccount.toLowerCase() === accountName.toLowerCase();
            let particulars = isDebit ? `To ${t.creditAccount}` : `By ${t.debitAccount}`;
            
            return {
                Date: t.date,
                Particulars: particulars,
                VoucherType: t.type,
                VoucherNo: t.voucherNo,
                DebitAmount: isDebit ? parseFloat(t.debitAmount || 0) : null,
                CreditAmount: !isDebit ? parseFloat(t.creditAmount || 0) : null,
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-2xl max-w-5xl w-full h-[90vh] flex flex-col overflow-hidden">
                {/* Header */}
                <div className="p-4 border-b border-gray-200 bg-gray-50 flex flex-wrap gap-4 justify-between items-center shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-100 text-blue-800 rounded-lg">
                            <FileText size={20} />
                        </div>
                        <div>
                            <h3 className="font-bold text-lg text-gray-900">{accountName}</h3>
                            <p className="text-xs text-gray-500">Group: {accountData?.group || 'N/A'}</p>
                        </div>
                        <select
                            value={selectedFY}
                            onChange={(e) => setSelectedFY(e.target.value)}
                            className="ml-4 px-3 py-1.5 border border-blue-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm font-medium bg-blue-50 text-blue-800"
                        >
                            {fyOptions.map(fy => <option key={fy.id} value={fy.id}>{fy.name}</option>)}
                        </select>
                    </div>

                    <div className="flex items-center gap-3">
                        <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
                            <input 
                                type="checkbox" 
                                checked={showFullDetails}
                                onChange={(e) => setShowFullDetails(e.target.checked)}
                                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            Show full details
                        </label>
                        <button 
                            onClick={exportToPDF}
                            className="bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded text-sm font-medium transition flex items-center gap-1"
                        >
                            <Download size={14} /> PDF
                        </button>
                        <button 
                            onClick={exportToExcel}
                            className="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded text-sm font-medium transition flex items-center gap-1"
                        >
                            <Download size={14} /> Excel
                        </button>
                        <button 
                            onClick={onClose}
                            className="p-1.5 text-gray-400 hover:text-gray-600 rounded transition ml-2"
                        >
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* Balance Summary Card */}
                <div className="p-4 bg-white border-b border-gray-200 grid grid-cols-2 md:grid-cols-4 gap-4 shrink-0 text-sm">
                    <div className="bg-gray-50 p-3 rounded border border-gray-100">
                        <div className="text-xs text-gray-500 font-medium">Opening Balance</div>
                        <div className="text-base font-semibold text-gray-800 mt-1">
                            {formatCurrency(displayBalance.openingBalance)} {displayBalance.openingBalanceType}
                        </div>
                    </div>
                    <div className="bg-red-50 p-3 rounded border border-red-100">
                        <div className="text-xs text-red-600 font-medium">Total Debit</div>
                        <div className="text-base font-semibold text-red-700 mt-1">
                            {formatCurrency(displayBalance.totalDebit)}
                        </div>
                    </div>
                    <div className="bg-green-50 p-3 rounded border border-green-100">
                        <div className="text-xs text-green-600 font-medium">Total Credit</div>
                        <div className="text-base font-semibold text-green-700 mt-1">
                            {formatCurrency(displayBalance.totalCredit)}
                        </div>
                    </div>
                    <div className="bg-blue-50 p-3 rounded border border-blue-100">
                        <div className="text-xs text-blue-600 font-medium">Closing Balance</div>
                        <div className="text-base font-bold text-blue-900 mt-1">
                            {formatCurrency(displayBalance.closingBalance)} {displayBalance.closingBalanceType}
                        </div>
                    </div>
                </div>

                {/* Transactions Table Area */}
                <div className="flex-1 overflow-auto p-0">
                    <TransactionTable 
                        transactions={transactions} 
                        showFullDetails={showFullDetails} 
                        isStatementView={true} 
                        selectedAccountName={accountName}
                        onDeleteTransaction={handleDelete}
                    />
                    
                    {loadingTxns && <div className="text-center p-4 text-gray-500">Loading transactions...</div>}
                    
                    {!loadingTxns && hasMoreTxns && transactions.length > 0 && (
                        <div className="text-center p-4 border-t border-gray-100">
                            <button 
                                onClick={() => fetchTransactions(true)}
                                className="px-4 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded text-sm font-medium"
                            >
                                Load More
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
