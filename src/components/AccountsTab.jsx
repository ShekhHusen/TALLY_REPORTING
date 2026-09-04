import React, { useState, useMemo, useEffect } from 'react';
import { db } from '../firebase';
import { collection, doc, writeBatch, getDocs, query, where, limit, startAfter, or, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import TransactionTable from './TransactionTable';
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from 'xlsx';
import { fetchFiscalYears, getCurrentFYObject } from '../utils/fiscalYear';

const formatCurrency = (num) => {
    const formatted = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(num) || 0);
    return `Rs. ${num < 0 ? '-' : ''}${formatted}`;
};

export default function AccountsTab({ updateTrigger, setUpdateTrigger, allowedAccount, currentUser, setCurrentUser }) {
    // Top level views: 'directory' | 'details'
    const [view, setView] = useState('directory');
    const [showIgnored, setShowIgnored] = useState(false);
    
    // ----------- DIRECTORY VIEW STATE -----------
    const [fyOptions, setFyOptions] = useState([]);
    const [selectedFY, setSelectedFY] = useState('');
    const [fyBalances, setFyBalances] = useState({});
    const [accounts, setAccounts] = useState([]);
    const [loadingAccounts, setLoadingAccounts] = useState(false);
    
    // Filters
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedGroup, setSelectedGroup] = useState("");
    const [minBalance, setMinBalance] = useState("");
    const [maxBalance, setMaxBalance] = useState("");
    const [verificationStatus, setVerificationStatus] = useState("all"); 
    
    // Sorting
    const [sortConfig, setSortConfig] = useState({ key: 'name', direction: 'ascending' });

    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 50;
    const [verifying, setVerifying] = useState(false);

    // ----------- DETAILS VIEW STATE -----------
    const [selectedAccount, setSelectedAccount] = useState(null);
    const [detailFY, setDetailFY] = useState('');
    const [detailFYData, setDetailFYData] = useState(null);

    useEffect(() => {
        const loadFYs = async () => {
            const fys = await fetchFiscalYears();
            setFyOptions(fys);
            const current = getCurrentFYObject(fys);
            if (current) {
                setSelectedFY(current.id);
                setDetailFY(current.id);
            } else if (fys.length > 0) {
                setSelectedFY(fys[0].id);
                setDetailFY(fys[0].id);
            }
        };
        loadFYs();
    }, []);
    const [accountTxns, setAccountTxns] = useState([]);
    const [loadingTxns, setLoadingTxns] = useState(false);
    const [lastVisibleTxn, setLastVisibleTxn] = useState(null);
    const [hasMoreTxns, setHasMoreTxns] = useState(true);
    const [showFullDetails, setShowFullDetails] = useState(false);

    useEffect(() => {
        const fetchAccounts = async () => {
            setLoadingAccounts(true);
            try {
                const snap = await getDocs(collection(db, 'accounts'));
                const accs = [];
                snap.forEach(d => accs.push({ id: d.id, ...d.data() }));
                setAccounts(accs);
            } catch (err) {
                console.error("Error fetching accounts:", err);
            }
            setLoadingAccounts(false);
        };
        fetchAccounts();
    }, [updateTrigger]);

    useEffect(() => {
        const fetchFYBalances = async () => {
            if (accounts.length === 0) return;
            const balances = {};
            // Fetch FY balance for each account from sub-collection
            const promises = accounts.map(async (acc) => {
                try {
                    const fyDoc = await getDoc(doc(db, 'accounts', acc.id, 'fiscalYears', selectedFY));
                    if (fyDoc.exists()) {
                        balances[acc.id] = fyDoc.data();
                    }
                } catch (e) {
                    console.error(`Error fetching FY data for ${acc.name}:`, e);
                }
            });
            await Promise.all(promises);
            setFyBalances(balances);
        };
        fetchFYBalances();
    }, [selectedFY, accounts]);

    const getAccountBalance = (acc) => {
        const fyData = fyBalances[acc.id];
        if (fyData) {
            return {
                ...acc,
                openingBalance: fyData.openingBalance ?? acc.openingBalance,
                openingBalanceType: fyData.openingBalanceType ?? acc.openingBalanceType,
                totalDebit: fyData.totalDebit ?? acc.totalDebit,
                totalCredit: fyData.totalCredit ?? acc.totalCredit,
                closingBalance: fyData.closingBalance ?? acc.closingBalance,
                closingBalanceType: fyData.closingBalanceType ?? acc.closingBalanceType,
                verifiedBy: fyData.verifiedBy || acc.verifiedBy,
                verifiedAt: fyData.verifiedAt || acc.verifiedAt
            };
        }
        return acc;
    };

    const uniqueGroups = useMemo(() => {
        const groups = new Set();
        accounts.forEach(a => { if (a.group) groups.add(a.group); });
        return Array.from(groups).sort();
    }, [accounts]);

    const filteredAccounts = useMemo(() => {
        let result = accounts;
        
        if (allowedAccount) {
            result = result.filter(a => a.name.toLowerCase() === allowedAccount.toLowerCase());
        }
        
        const ignoredList = currentUser?.ignoredAccounts || [];
        if (!showIgnored) {
            result = result.filter(a => !ignoredList.includes(a.id));
        }
        // If showIgnored is true, we keep all accounts (including ignored ones) as per user feedback
        
        if (searchTerm) {
            result = result.filter(a => a.name.toLowerCase().includes(searchTerm.toLowerCase()));
        }
        if (selectedGroup) {
            result = result.filter(a => a.group === selectedGroup);
        }
        if (verificationStatus === 'verified') {
            result = result.filter(a => !!(fyBalances[a.id]?.verifiedBy || a.verifiedBy));
        } else if (verificationStatus === 'unverified') {
            result = result.filter(a => !(fyBalances[a.id]?.verifiedBy || a.verifiedBy));
        }
        if (minBalance !== "") {
            result = result.filter(a => ((fyBalances[a.id]?.closingBalance ?? a.closingBalance) || 0) >= parseFloat(minBalance));
        }
        if (maxBalance !== "") {
            result = result.filter(a => ((fyBalances[a.id]?.closingBalance ?? a.closingBalance) || 0) <= parseFloat(maxBalance));
        }

        return result;
    }, [accounts, allowedAccount, searchTerm, selectedGroup, minBalance, maxBalance, verificationStatus, fyBalances, currentUser?.ignoredAccounts, showIgnored]);

    const sortedAccounts = useMemo(() => {
        const sorted = [...filteredAccounts].sort((a, b) => {
            let valA = a[sortConfig.key];
            let valB = b[sortConfig.key];
            
            if (['openingBalance', 'totalDebit', 'totalCredit', 'closingBalance'].includes(sortConfig.key)) {
                valA = parseFloat((fyBalances[a.id]?.[sortConfig.key] ?? a[sortConfig.key]) || 0);
                valB = parseFloat((fyBalances[b.id]?.[sortConfig.key] ?? b[sortConfig.key]) || 0);
            } else {
                valA = (valA || '').toString().toLowerCase();
                valB = (valB || '').toString().toLowerCase();
            }

            if (valA < valB) return sortConfig.direction === 'ascending' ? -1 : 1;
            if (valA > valB) return sortConfig.direction === 'ascending' ? 1 : -1;
            return 0;
        });
        return sorted;
    }, [filteredAccounts, sortConfig, fyBalances]);

    const requestSort = (key) => {
        let direction = 'ascending';
        if (sortConfig.key === key && sortConfig.direction === 'ascending') {
            direction = 'descending';
        }
        setSortConfig({ key, direction });
    };

    const getSortIndicator = (key) => {
        if (sortConfig.key !== key) return ' ↕';
        return sortConfig.direction === 'ascending' ? ' ↑' : ' ↓';
    };

    const paginatedAccounts = useMemo(() => {
        const startIndex = (currentPage - 1) * itemsPerPage;
        return sortedAccounts.slice(startIndex, startIndex + itemsPerPage);
    }, [sortedAccounts, currentPage]);

    const totalPages = Math.ceil(sortedAccounts.length / itemsPerPage);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, selectedGroup, minBalance, maxBalance, verificationStatus]);

    const handleVerify = async (accountId) => {
        const userName = currentUser?.name || 'System';
        try {
            setVerifying(true);
            const ref = doc(db, 'accounts', accountId, 'fiscalYears', selectedFY);
            const now = new Date().toLocaleString('en-IN');
            
            await setDoc(ref, {
                verifiedBy: userName,
                verifiedAt: now
            }, { merge: true });
            
            // Update fyBalances locally to reflect immediately without needing a full refetch
            setFyBalances(prev => ({
                ...prev,
                [accountId]: {
                    ...(prev[accountId] || {}),
                    verifiedBy: userName,
                    verifiedAt: now
                }
            }));
        } catch (error) {
            console.error(error);
            alert("Error verifying account: " + error.message);
        } finally {
            setVerifying(false);
        }
    };

    const handleVerifyAll = async () => {
        const userName = currentUser?.name || 'System';
        if(!window.confirm(`Are you sure you want to mark all ${paginatedAccounts.length} accounts on this page as verified by ${userName}?`)) return;

        try {
            setVerifying(true);
            const now = new Date().toLocaleString('en-IN');
            const batch = writeBatch(db);
            const newBalances = { ...fyBalances };
            
            paginatedAccounts.forEach(acc => {
                const ref = doc(db, 'accounts', acc.id, 'fiscalYears', selectedFY);
                batch.set(ref, {
                    verifiedBy: userName,
                    verifiedAt: now
                }, { merge: true });
                
                newBalances[acc.id] = {
                    ...(newBalances[acc.id] || {}),
                    verifiedBy: userName,
                    verifiedAt: now
                };
            });
            await batch.commit();
            setFyBalances(newBalances);
        } catch (error) {
            console.error(error);
            alert("Error verifying accounts: " + error.message);
        } finally {
            setVerifying(false);
        }
    };

    const handleIgnoreToggle = async (accountId, isCurrentlyIgnored) => {
        try {
            const userRef = doc(db, 'users', currentUser.uid);
            const ignoredList = currentUser.ignoredAccounts || [];
            const newList = isCurrentlyIgnored
                ? ignoredList.filter(id => id !== accountId)
                : [...ignoredList, accountId];
                
            await updateDoc(userRef, { ignoredAccounts: newList });
            if (setCurrentUser) {
                setCurrentUser(prev => ({ ...prev, ignoredAccounts: newList }));
            }
        } catch (error) {
            console.error(error);
            alert("Error updating ignore list: " + error.message);
        }
    };

    const fetchAccountTransactions = async (accName, isLoadMore = false, fyId = detailFY) => {
        setLoadingTxns(true);
        try {
            const accNameLower = accName.toLowerCase();
            let q = query(
                collection(db, 'transactions'),
                or(
                    where('debitAccount', '==', accNameLower),
                    where('creditAccount', '==', accNameLower),
                    where('debitAccount', '==', accName), 
                    where('creditAccount', '==', accName)
                ),
                limit(50)
            );

            if (isLoadMore && lastVisibleTxn) {
                q = query(q, startAfter(lastVisibleTxn));
            }

            const snap = await getDocs(q);
            const txns = [];
            snap.forEach(d => txns.push({ id: d.id, ...d.data() }));

            const activeFY = fyOptions.find(f => f.id === fyId);
            const start = activeFY?.startDate || '1900-01-01';
            const end = activeFY?.endDate || '2100-12-31';

            const fyFilteredTxns = txns.filter(t => t.date >= start && t.date <= end);

            // Sort Oldest to Newest for Running Balance
            fyFilteredTxns.sort((a, b) => new Date(a.date) - new Date(b.date));

            // Merge with previous if load more
            const combinedTxns = isLoadMore ? [...accountTxns, ...fyFilteredTxns] : fyFilteredTxns;
            
            // Calculate running balance based on opening balance
            // Ensure we use the correct opening balance sign (+ for Dr, - for Cr)
            let runningVal = detailFYData 
                ? (detailFYData.openingBalanceType === 'Cr' ? -1 : 1) * parseFloat(detailFYData.openingBalance || 0)
                : (selectedAccount?.openingBalanceType === 'Cr' ? -1 : 1) * parseFloat(selectedAccount?.openingBalance || 0);
            
            const processedTxns = combinedTxns.map(t => {
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

            setAccountTxns(processedTxns);
            setLastVisibleTxn(snap.docs[snap.docs.length - 1]);
            setHasMoreTxns(snap.docs.length === 50);

        } catch (err) {
            console.error("Error fetching transactions:", err);
            alert("Error fetching transactions. You might need to create a Firestore Index. Check console.");
        }
        setLoadingTxns(false);
    };

    const openAccountDetails = (acc) => {
        setSelectedAccount(acc);
        setDetailFY(selectedFY);
        setView('details');
        setAccountTxns([]);
        setLastVisibleTxn(null);
        // We will pass the account object so fetchAccountTransactions can use its opening balance
    };

    // Need to trigger fetch when selectedAccount is set
    useEffect(() => {
        if (view === 'details' && selectedAccount && accountTxns.length === 0 && !loadingTxns) {
            fetchAccountTransactions(selectedAccount.name);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [view, selectedAccount, detailFY, detailFYData]);

    useEffect(() => {
        if (view !== 'details' || !selectedAccount) return;
        const fetchFYData = async () => {
            try {
                const fyDoc = await getDoc(doc(db, 'accounts', selectedAccount.id, 'fiscalYears', detailFY));
                if (fyDoc.exists()) {
                    setDetailFYData(fyDoc.data());
                } else {
                    setDetailFYData(null);
                }
            } catch (e) {
                console.error(e);
                setDetailFYData(null);
            }
        };
        fetchFYData();
    }, [view, selectedAccount, detailFY]);


    const exportToPDF = () => {
        if (!selectedAccount) return;
        const displayBalance = detailFYData || selectedAccount;
        const doc = new jsPDF();
        
        const activeFY = fyOptions.find(f => f.id === detailFY);
        const fyName = activeFY?.name || detailFY;
        
        doc.setFontSize(14);
        doc.text(`Ledger Account Statement (${fyName})`, 14, 15);
        
        doc.setFontSize(10);
        doc.text(`Account Name: ${selectedAccount.name}`, 14, 22);
        doc.text(`Account Group: ${selectedAccount.group || 'N/A'}`, 14, 28);
        doc.text(`Opening Balance: ${displayBalance.openingBalance || 0} ${displayBalance.openingBalanceType || ''}`, 130, 22);
        doc.text(`Closing Balance: ${displayBalance.closingBalance || 0} ${displayBalance.closingBalanceType || ''}`, 130, 28);
        
        const tableColumn = ["Date", "Particulars", "Vch Type", "Vch No", "Debit", "Credit", "Balance"];
        const tableRows = [];

        accountTxns.forEach(t => {
            const isDebit = t.debitAccount && t.debitAccount.toLowerCase() === selectedAccount.name.toLowerCase();
            let particulars = isDebit ? `To ${t.creditAccount}` : `By ${t.debitAccount}`;
            
            if (showFullDetails) {
                if (t.narration) particulars += `\n[Narration: ${t.narration}]`;
                if (t.inventory && t.inventory.length > 0) {
                    const invStr = t.inventory.map(i => `${i.itemName} (${i.qty} @ ${i.rate})`).join(', ');
                    particulars += `\n[Inv: ${invStr}]`;
                }
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

        autoTable(doc, {
            head: [tableColumn],
            body: tableRows,
            startY: 35,
            styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak' },
            columnStyles: { 
                0: { cellWidth: 'wrap' }, // Date
                1: { cellWidth: 'auto' }, // Particulars (auto expands and wraps text)
                2: { cellWidth: 'wrap' }, // Vch Type
                3: { cellWidth: 'wrap' }, // Vch No
                4: { cellWidth: 'wrap', halign: 'right' }, // Debit
                5: { cellWidth: 'wrap', halign: 'right' }, // Credit
                6: { cellWidth: 'wrap', halign: 'right' }  // Balance
            },
            margin: { left: 14, right: 14 }
        });

        doc.save(`${selectedAccount.name}_Statement_FY${detailFY}.pdf`);
    };

    const exportToExcel = () => {
        if (!selectedAccount) return;
        
        const activeFY = fyOptions.find(f => f.id === detailFY);
        const fyName = activeFY?.name || detailFY;
        
        const formattedData = accountTxns.map(t => {
            const isDebit = t.debitAccount && t.debitAccount.toLowerCase() === selectedAccount.name.toLowerCase();
            let particulars = isDebit ? `To ${t.creditAccount}` : `By ${t.debitAccount}`;
            
            let row = {
                Date: t.date,
                Particulars: particulars,
                VoucherType: t.type,
                VoucherNo: t.voucherNo,
                DebitAmount: isDebit ? parseFloat(t.debitAmount || 0) : null,
                CreditAmount: !isDebit ? parseFloat(t.creditAmount || 0) : null,
                Balance: parseFloat(t.runningBalance || 0),
                BalanceType: t.runningBalanceType || ''
            };

            if (showFullDetails) {
                row.Narration = t.narration || '';
                let invStr = '';
                if (t.inventory && t.inventory.length > 0) {
                    invStr = t.inventory.map(i => `${i.itemName} (${i.qty} @ ${i.rate})`).join(', ');
                }
                row.Inventory = invStr;
            }
            return row;
        });

        const worksheet = XLSX.utils.json_to_sheet(formattedData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Statement");
        XLSX.writeFile(workbook, `${selectedAccount.name}_Statement_${fyName}.xlsx`);
    };

    if (view === 'details' && selectedAccount) {
        return (
            <div className="flex flex-col h-[calc(100vh-10rem)] gap-4">
                <div className="bg-white rounded-lg shadow border border-gray-200 flex flex-col h-full">
                    {/* Header */}
                    <div className="p-4 border-b border-gray-200 bg-gray-50 rounded-t-lg shrink-0 flex flex-wrap gap-4 justify-between items-center">
                        <div className="flex items-center gap-4">
                            <button 
                                onClick={() => setView('directory')}
                                className="px-3 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded font-medium text-sm transition"
                            >
                                ← Back to Accounts
                            </button>
                            <select
                                value={detailFY}
                                onChange={(e) => { setDetailFY(e.target.value); setAccountTxns([]); setLastVisibleTxn(null); }}
                                className="px-3 py-1.5 border border-blue-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm font-medium bg-blue-50 text-blue-800"
                            >
                                {fyOptions.length === 0 && <option value="">No Fiscal Years</option>}
                                {fyOptions.map(fy => <option key={fy.id} value={fy.id}>{fy.name}</option>)}
                            </select>
                            <h3 className="font-semibold text-xl text-gray-800">
                                {selectedAccount.name}
                            </h3>
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
                                className="bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded text-sm font-medium transition"
                            >
                                Export PDF
                            </button>
                            <button 
                                onClick={exportToExcel}
                                className="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded text-sm font-medium transition"
                            >
                                Export Excel
                            </button>
                        </div>
                    </div>

                    {/* Account Summary & Details Block */}
                    <div className="p-4 border-b border-gray-200 bg-white grid grid-cols-1 md:grid-cols-2 gap-4 shrink-0">
                        <div>
                            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Account Details</h4>
                            <div className="text-sm text-gray-700 grid grid-cols-2 gap-2">
                                <div className="font-medium">Group:</div>
                                <div>{selectedAccount.group || '-'}</div>
                                <div className="font-medium">Address:</div>
                                <div>{selectedAccount.address || '-'}</div>
                                <div className="font-medium">Contact:</div>
                                <div>{selectedAccount.contact || '-'}</div>
                            </div>
                        </div>
                        <div>
                            {(() => {
                                const displayBalance = detailFYData || selectedAccount;
                                return (
                                    <>
                                        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                                            Balance Summary <span className="text-[10px] text-blue-500 normal-case ml-1">({detailFYData ? `${detailFYData.fyName || 'Selected FY'}` : 'Account Default'})</span>
                                        </h4>
                                        <div className="text-sm text-gray-700 grid grid-cols-2 gap-2">
                                            <div className="font-medium">Opening Balance:</div>
                                            <div className="text-right">{formatCurrency(displayBalance.openingBalance)} {displayBalance.openingBalanceType}</div>
                                            <div className="font-medium">Total Debit:</div>
                                            <div className="text-right text-red-600">{formatCurrency(displayBalance.totalDebit)}</div>
                                            <div className="font-medium">Total Credit:</div>
                                            <div className="text-right text-green-600">{formatCurrency(displayBalance.totalCredit)}</div>
                                            <div className="font-medium text-gray-900 border-t pt-1 mt-1">Closing Balance:</div>
                                            <div className="text-right font-bold text-gray-900 border-t pt-1 mt-1">{formatCurrency(displayBalance.closingBalance)} {displayBalance.closingBalanceType}</div>
                                        </div>
                                    </>
                                );
                            })()}
                        </div>
                    </div>

                    <div className="overflow-auto flex-1 p-0">
                        <TransactionTable 
                            transactions={accountTxns} 
                            showFullDetails={showFullDetails} 
                            isStatementView={true} 
                            selectedAccountName={selectedAccount.name} 
                        />
                        
                        {loadingTxns && <div className="text-center p-4 text-gray-500">Loading more transactions...</div>}
                        
                        {!loadingTxns && hasMoreTxns && accountTxns.length > 0 && (
                            <div className="text-center p-4 border-t border-gray-100">
                                <button 
                                    onClick={() => fetchAccountTransactions(selectedAccount.name, true)}
                                    className="px-4 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded text-sm font-medium"
                                >
                                    Load More
                                </button>
                            </div>
                        )}
                        {!loadingTxns && !hasMoreTxns && accountTxns.length > 0 && (
                            <div className="text-center p-4 border-t border-gray-100 text-sm text-gray-500">
                                All transactions loaded.
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-[calc(100vh-10rem)] gap-4">
            <div className="bg-white rounded-lg shadow border border-gray-200 flex flex-col h-full shrink-0">
                <div className="p-4 border-b border-gray-200 flex flex-col gap-4 bg-gray-50 rounded-t-lg shrink-0">
                    <div className="flex justify-between items-center">
                        <div className="flex items-center gap-3">
                            <h3 className="font-semibold text-lg text-gray-800">Accounts Directory</h3>
                            <select
                                value={selectedFY}
                                onChange={(e) => setSelectedFY(e.target.value)}
                                className="px-3 py-1.5 border border-blue-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm font-medium bg-blue-50 text-blue-800"
                            >
                                {fyOptions.length === 0 && <option value="">No Fiscal Years</option>}
                                {fyOptions.map(fy => <option key={fy.id} value={fy.id}>{fy.name}</option>)}
                            </select>
                        </div>
                        <div className="flex items-center gap-3">
                            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer mr-4">
                                <input 
                                    type="checkbox" 
                                    checked={showIgnored}
                                    onChange={(e) => setShowIgnored(e.target.checked)}
                                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                />
                                Include Ignored Accounts
                            </label>
                            <button 
                                onClick={handleVerifyAll}
                                disabled={verifying || paginatedAccounts.length === 0}
                                className="bg-green-600 hover:bg-green-700 text-white px-4 py-1.5 rounded text-sm font-medium transition disabled:opacity-50"
                            >
                                {verifying ? 'Processing...' : 'Verify Visible Page'}
                            </button>
                        </div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                        <input 
                            type="text" 
                            placeholder="Search by Name..." 
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full px-3 py-1.5 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm"
                        />
                        <select
                            value={selectedGroup}
                            onChange={(e) => setSelectedGroup(e.target.value)}
                            className="w-full px-3 py-1.5 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm"
                        >
                            <option value="">All Groups</option>
                            {uniqueGroups.map(g => <option key={g} value={g}>{g}</option>)}
                        </select>
                        <select
                            value={verificationStatus}
                            onChange={(e) => setVerificationStatus(e.target.value)}
                            className="w-full px-3 py-1.5 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm"
                        >
                            <option value="all">All Verification Status</option>
                            <option value="verified">Verified</option>
                            <option value="unverified">Unverified</option>
                        </select>
                        <input 
                            type="number" 
                            placeholder="Min Balance" 
                            value={minBalance}
                            onChange={(e) => setMinBalance(e.target.value)}
                            className="w-full px-3 py-1.5 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm"
                        />
                        <input 
                            type="number" 
                            placeholder="Max Balance" 
                            value={maxBalance}
                            onChange={(e) => setMaxBalance(e.target.value)}
                            className="w-full px-3 py-1.5 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm"
                        />
                    </div>
                </div>
                
                <div className="overflow-auto flex-1 relative">
                    {loadingAccounts ? (
                        <div className="flex justify-center items-center h-full text-gray-500">Loading accounts...</div>
                    ) : (
                        <table className="min-w-full divide-y divide-gray-200 text-sm">
                            <thead className="bg-white sticky top-0 shadow-sm z-10">
                                <tr>
                                    <th className="px-4 py-2 text-left font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap cursor-pointer hover:bg-gray-200" onClick={() => requestSort('name')}>Account Name{getSortIndicator('name')}</th>
                                    <th className="px-4 py-2 text-right font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap cursor-pointer hover:bg-gray-200" onClick={() => requestSort('openingBalance')}>Opening Bal{getSortIndicator('openingBalance')}</th>
                                    <th className="px-4 py-2 text-right font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap cursor-pointer hover:bg-gray-200" onClick={() => requestSort('totalDebit')}>Total Dr{getSortIndicator('totalDebit')}</th>
                                    <th className="px-4 py-2 text-right font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap cursor-pointer hover:bg-gray-200" onClick={() => requestSort('totalCredit')}>Total Cr{getSortIndicator('totalCredit')}</th>
                                    <th className="px-4 py-2 text-right font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap cursor-pointer hover:bg-gray-200" onClick={() => requestSort('closingBalance')}>Closing Bal{getSortIndicator('closingBalance')}</th>
                                    <th className="px-4 py-2 text-center font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap cursor-pointer hover:bg-gray-200" onClick={() => requestSort('verifiedBy')}>Verification{getSortIndicator('verifiedBy')}</th>
                                    <th className="px-4 py-2 text-center font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Action</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-100">
                                {paginatedAccounts.length === 0 ? (
                                    <tr>
                                        <td colSpan="7" className="px-4 py-6 text-center text-gray-500">
                                            No accounts found. {accounts.length > 0 && accounts[0].closingBalance === undefined && (
                                                <span className="block mt-2 text-red-500 font-bold">Have you synced Account Balances in the Import Center?</span>
                                            )}
                                        </td>
                                    </tr>
                                ) : (
                                    paginatedAccounts.map(acc => {
                                        const bal = getAccountBalance(acc);
                                        return (
                                        <tr 
                                            key={acc.id} 
                                            onClick={() => openAccountDetails(acc)}
                                            className="cursor-pointer hover:bg-blue-50 transition"
                                        >
                                            <td className="px-4 py-2 text-gray-900 font-medium whitespace-nowrap">
                                                {acc.name}
                                                <div className="text-xs text-gray-400 font-normal">{acc.group}</div>
                                            </td>
                                            <td className="px-4 py-2 text-right text-gray-700 whitespace-nowrap">
                                                {formatCurrency(bal.openingBalance)} <span className="text-xs font-semibold">{bal.openingBalanceType}</span>
                                            </td>
                                            <td className="px-4 py-2 text-right text-gray-700 whitespace-nowrap">{formatCurrency(bal.totalDebit)}</td>
                                            <td className="px-4 py-2 text-right text-gray-700 whitespace-nowrap">{formatCurrency(bal.totalCredit)}</td>
                                            <td className="px-4 py-2 text-right text-gray-900 font-bold whitespace-nowrap">
                                                {formatCurrency(bal.closingBalance)} <span className="text-xs">{bal.closingBalanceType}</span>
                                            </td>
                                            <td className="px-4 py-2 text-center whitespace-nowrap">
                                                {acc.verifiedBy ? (
                                                    <div className="inline-flex flex-col items-center">
                                                        <span className="bg-green-100 text-green-800 text-xs font-medium px-2.5 py-0.5 rounded-full">
                                                            ✓ Verified
                                                        </span>
                                                        <span className="text-[10px] text-gray-500 mt-1">{acc.verifiedBy}</span>
                                                        <span className="text-[10px] text-gray-400">{acc.verifiedAt}</span>
                                                    </div>
                                                ) : (
                                                    <span className="bg-yellow-100 text-yellow-800 text-xs font-medium px-2.5 py-0.5 rounded-full">
                                                        Pending
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-4 py-2 text-center whitespace-nowrap flex gap-2 justify-center">
                                                {!acc.verifiedBy && (
                                                    <button 
                                                        onClick={(e) => { e.stopPropagation(); handleVerify(acc.id); }}
                                                        className="text-blue-600 hover:text-blue-800 text-xs font-medium px-2 py-1 border border-blue-200 rounded hover:bg-blue-50 transition"
                                                    >
                                                        Verify
                                                    </button>
                                                )}
                                                <button
                                                    onClick={(e) => { 
                                                        e.stopPropagation(); 
                                                        const isIgnored = currentUser?.ignoredAccounts?.includes(acc.id);
                                                        handleIgnoreToggle(acc.id, isIgnored); 
                                                    }}
                                                    className="text-gray-600 hover:text-gray-800 text-xs font-medium px-2 py-1 border border-gray-200 rounded hover:bg-gray-100 transition"
                                                >
                                                    {currentUser?.ignoredAccounts?.includes(acc.id) ? 'Unignore' : 'Ignore'}
                                                </button>
                                            </td>
                                        </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    )}
                </div>

                <div className="flex justify-between items-center px-4 py-2 bg-gray-50 border-t border-gray-200 shrink-0">
                    <span className="text-sm text-gray-700">
                        Showing {sortedAccounts.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, sortedAccounts.length)} of {sortedAccounts.length} entries
                    </span>
                    <div className="flex gap-2 items-center">
                        <button 
                            disabled={currentPage === 1}
                            onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                            className="px-3 py-1 text-sm border rounded hover:bg-gray-200 disabled:opacity-50"
                        >
                            Previous
                        </button>
                        <span className="px-3 py-1 text-sm">Page {currentPage} of {totalPages === 0 ? 1 : totalPages}</span>
                        <button 
                            disabled={currentPage === totalPages || totalPages === 0}
                            onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                            className="px-3 py-1 text-sm border rounded hover:bg-gray-200 disabled:opacity-50"
                        >
                            Next
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
