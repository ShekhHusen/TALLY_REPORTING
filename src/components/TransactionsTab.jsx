import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, getDocs, query, where, orderBy, limit, startAfter } from 'firebase/firestore';
import TransactionTable from './TransactionTable';
import AccountSearchDropdown from './AccountSearchDropdown';
import { fetchFiscalYears, getCurrentFYObject } from '../utils/fiscalYear';

export default function TransactionsTab({ updateTrigger, allowedAccount }) {
    // Dropdown Data
    const [transactions, setTransactions] = useState([]);
    const [loadingData, setLoadingData] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);

    const [fyOptions, setFyOptions] = useState([]);
    const [selectedFYId, setSelectedFYId] = useState('');

    // Input States
    const [inputStartDate, setInputStartDate] = useState('');
    const [inputEndDate, setInputEndDate] = useState('');
    const [inputAccountName, setInputAccountName] = useState('');
    const [inputVoucherType, setInputVoucherType] = useState('');

    // Pagination state
    const [lastVisible, setLastVisible] = useState(null);
    const [hasMore, setHasMore] = useState(true);
    const limitCount = 50;
    
    // Toggle state
    const [showFullDetails, setShowFullDetails] = useState(false);

    // Initial Data Fetch
    useEffect(() => {
        const fetchInitialData = async () => {
            setLoadingData(true);
            try {
                // Fetch FYs
                const fys = await fetchFiscalYears();
                setFyOptions(fys);
                const current = getCurrentFYObject(fys);
                if (current) {
                    setSelectedFYId(current.id);
                }

                // Default to Yesterday
                const yesterday = new Date();
                yesterday.setDate(yesterday.getDate() - 1);
                const yyyy = yesterday.getFullYear();
                const mm = String(yesterday.getMonth() + 1).padStart(2, '0');
                const dd = String(yesterday.getDate()).padStart(2, '0');
                const yesterdayStr = `${yyyy}-${mm}-${dd}`;
                
                setInputStartDate(yesterdayStr);
                setInputEndDate(yesterdayStr);

                await fetchTransactions(yesterdayStr, yesterdayStr, '', '', false);
            } catch (error) {
                console.error("Error fetching initial data:", error);
            }
            setLoadingData(false);
        };
        fetchInitialData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [updateTrigger]);

    const fetchTransactions = async (startDate, endDate, accountName, voucherType, isLoadMore = false) => {
        if (isLoadMore) {
            setLoadingMore(true);
        } else {
            setLoadingData(true);
        }

        try {
            let txnsRef = collection(db, 'transactions');
            // Build query constraints dynamically
            let constraints = [orderBy("date", "desc"), limit(limitCount)];
            
            if (startDate) {
                constraints.push(where("date", ">=", startDate));
            }
            if (endDate) {
                constraints.push(where("date", "<=", endDate));
            }
            if (voucherType) {
                constraints.push(where("type", "==", voucherType));
            }

            if (isLoadMore && lastVisible) {
                constraints.push(startAfter(lastVisible));
            }

            let q = query(txnsRef, ...constraints);

            const snap = await getDocs(q);
            
            let fetched = [];
            snap.forEach(d => fetched.push({ id: d.id, ...d.data() }));

            // Client side filtering for account name if specified, because Firestore OR queries (debitAccount == X OR creditAccount == X) 
            // are limited, especially with other inequalities.
            const targetAccount = allowedAccount || accountName;
            if (targetAccount) {
                const lowerTarget = targetAccount.toLowerCase();
                fetched = fetched.filter(t => {
                    if ((t.debitAccount && t.debitAccount.toLowerCase() === lowerTarget) || 
                        (t.creditAccount && t.creditAccount.toLowerCase() === lowerTarget)) {
                        return true;
                    }
                    if (t.allDebitAccounts && t.allDebitAccounts.some(n => n.toLowerCase() === lowerTarget)) return true;
                    if (t.allCreditAccounts && t.allCreditAccounts.some(n => n.toLowerCase() === lowerTarget)) return true;
                    return false;
                });
            }

            if (isLoadMore) {
                setTransactions(prev => [...prev, ...fetched]);
            } else {
                setTransactions(fetched);
            }

            setLastVisible(snap.docs[snap.docs.length - 1]);
            setHasMore(snap.docs.length === limitCount);

        } catch (error) {
            console.error("Error fetching transactions:", error);
            alert("Error fetching transactions. You might need to build a Firestore index. Check console for the link.");
        }

        setLoadingData(false);
        setLoadingMore(false);
    };

    const handleFYChange = (e) => {
        const newFYId = e.target.value;
        setSelectedFYId(newFYId);
        if (newFYId) {
            const activeFY = fyOptions.find(f => f.id === newFYId);
            if (activeFY) {
                setInputStartDate(activeFY.startDate);
                setInputEndDate(activeFY.endDate);
            }
        } else {
            setInputStartDate('');
            setInputEndDate('');
        }
    };

    const handleSearch = () => {
        fetchTransactions(inputStartDate, inputEndDate, inputAccountName, inputVoucherType, false);
    };

    const handleClear = () => {
        setSelectedFYId('');
        setInputStartDate('');
        setInputEndDate('');
        setInputAccountName('');
        setInputVoucherType('');
        
        // Default to Yesterday again
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yyyy = yesterday.getFullYear();
        const mm = String(yesterday.getMonth() + 1).padStart(2, '0');
        const dd = String(yesterday.getDate()).padStart(2, '0');
        const yesterdayStr = `${yyyy}-${mm}-${dd}`;
        
        fetchTransactions(yesterdayStr, yesterdayStr, '', '', false);
    };

    if (loadingData) {
        return (
            <div className="h-[calc(100vh-12rem)] flex flex-col items-center justify-center bg-white rounded-lg shadow border border-gray-200">
                <div className="text-xl font-semibold text-gray-500 animate-pulse">Loading Database...</div>
                <p className="text-sm text-gray-400 mt-2">Caching transactions for instant search</p>
            </div>
        );
    }

    return (
        <div className="h-[calc(100vh-12rem)] flex flex-col bg-white rounded-lg shadow border border-gray-200">
            <div className="p-4 border-b border-gray-200 bg-gray-50 flex flex-col gap-4">
                <div className="flex justify-between items-center">
                    <h2 className="text-xl font-bold text-gray-800">All Transactions Directory</h2>
                    <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
                        <input 
                            type="checkbox" 
                            checked={showFullDetails}
                            onChange={(e) => setShowFullDetails(e.target.checked)}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        Show full details
                    </label>
                </div>
                
                <div className="flex flex-wrap items-end gap-4">
                    <div className="flex flex-col gap-1 w-40">
                        <label className="text-xs font-semibold text-gray-600">Fiscal Year</label>
                        <select
                            value={selectedFYId}
                            onChange={handleFYChange}
                            className="px-3 py-1.5 border border-blue-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm font-medium bg-blue-50 text-blue-800"
                        >
                            <option value="">All Years</option>
                            {fyOptions.map(fy => <option key={fy.id} value={fy.id}>{fy.name}</option>)}
                        </select>
                    </div>

                    {!allowedAccount && (
                        <div className="flex flex-col gap-1 w-64">
                            <label className="text-xs font-semibold text-gray-600">Account Name</label>
                            <AccountSearchDropdown
                                value={inputAccountName}
                                onChange={(val) => setInputAccountName(val)}
                                placeholder="Any Account..."
                            />
                        </div>
                    )}
                    
                    <div className="flex flex-col gap-1 w-48">
                        <label className="text-xs font-semibold text-gray-600">Voucher Type</label>
                        <input 
                            type="text"
                            value={inputVoucherType}
                            onChange={(e) => setInputVoucherType(e.target.value)}
                            placeholder="e.g. Sales, Receipt..."
                            className="px-3 py-1.5 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm"
                        />
                    </div>

                    <div className="flex flex-col gap-1 w-40">
                        <label className="text-xs font-semibold text-gray-600">From Date</label>
                        <input 
                            type="date" 
                            value={inputStartDate} 
                            onChange={(e) => setInputStartDate(e.target.value)}
                            className="px-3 py-1.5 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm"
                        />
                    </div>

                    <div className="flex flex-col gap-1 w-40">
                        <label className="text-xs font-semibold text-gray-600">To Date</label>
                        <input 
                            type="date" 
                            value={inputEndDate} 
                            onChange={(e) => setInputEndDate(e.target.value)}
                            className="px-3 py-1.5 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm"
                        />
                    </div>
                    
                    <button 
                        onClick={handleSearch}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-1.5 rounded text-sm font-medium transition h-[34px]"
                    >
                        Search
                    </button>
                    
                    <button 
                        onClick={handleClear}
                        className="text-sm text-gray-500 hover:text-gray-800 underline px-2 py-1.5 h-[34px]"
                    >
                        Clear Filters
                    </button>
                </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-0 relative">
                {transactions.length === 0 && !loadingData && !loadingMore ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400">
                        <svg className="w-12 h-12 mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                        <p>No transactions found matching your filters.</p>
                    </div>
                ) : (
                    <TransactionTable transactions={transactions} showFullDetails={showFullDetails} />
                )}
                {loadingMore && (
                    <div className="text-center p-4 text-gray-500 text-sm animate-pulse">Loading more...</div>
                )}
            </div>

            <div className="flex justify-between items-center px-4 py-2 bg-gray-50 border-t border-gray-200 shrink-0">
                <span className="text-sm text-gray-700">
                    Showing {transactions.length} entries
                </span>
                <div className="flex gap-2 items-center">
                    {hasMore && (
                        <button 
                            disabled={loadingMore}
                            onClick={() => fetchTransactions(inputStartDate, inputEndDate, inputAccountName, inputVoucherType, true)}
                            className="px-4 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 text-sm font-medium border border-blue-200 rounded disabled:opacity-50"
                        >
                            Load More
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
