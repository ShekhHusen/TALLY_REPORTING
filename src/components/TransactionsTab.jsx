import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Filter, X, ChevronUp, ChevronDown, Search } from 'lucide-react';
import { db } from '../firebase';
import { collection, getDocs, query, where, orderBy, limit, startAfter } from 'firebase/firestore';
import TransactionTable from './TransactionTable';
import AccountSearchDropdown from './AccountSearchDropdown';
import { fetchFiscalYears, getCurrentFYObject } from '../utils/fiscalYear';
import { deleteTransactionRecord } from '../utils/transactionOperations';

export default function TransactionsTab({ updateTrigger, allowedAccount, currentUser, setUpdateTrigger }) {
    // Dropdown Data
    const [transactions, setTransactions] = useState([]);
    const [loadingData, setLoadingData] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);

    const handleDeleteTransaction = async (t) => {
        const ok = await deleteTransactionRecord(t);
        if (ok) {
            fetchTransactions(inputStartDate, inputEndDate, inputAccountName, inputVoucherType, false);
            if (setUpdateTrigger) setUpdateTrigger(prev => prev + 1);
        }
    };

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
    const [showMobileFilters, setShowMobileFilters] = useState(false);

    let activeFilterCount = 0;
    if (inputAccountName) activeFilterCount++;
    if (inputVoucherType) activeFilterCount++;
    if (showFullDetails) activeFilterCount++;

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

            // Client side filtering for account name if specified
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
        setShowFullDetails(false);
        
        // Default to Yesterday again
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yyyy = yesterday.getFullYear();
        const mm = String(yesterday.getMonth() + 1).padStart(2, '0');
        const dd = String(yesterday.getDate()).padStart(2, '0');
        const yesterdayStr = `${yyyy}-${mm}-${dd}`;
        
        setInputStartDate(yesterdayStr);
        setInputEndDate(yesterdayStr);
        fetchTransactions(yesterdayStr, yesterdayStr, '', '', false);
    };

    if (loadingData && transactions.length === 0) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center bg-white rounded-lg shadow border border-gray-200">
                <div className="text-xl font-semibold text-gray-500 animate-pulse">Loading Database...</div>
                <p className="text-sm text-gray-400 mt-2">Caching transactions for instant search</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col min-h-0 flex-1 gap-3 sm:gap-4">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col flex-1 min-h-0 overflow-hidden">
                <div className="p-4 sm:p-5 border-b border-gray-100 flex flex-col gap-4 sm:gap-5 bg-white rounded-t-2xl shrink-0 relative z-20">
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 sm:gap-4">
                        {/* Left: Fiscal Year Selector */}
                        <div className="shrink-0 w-full sm:w-auto">
                            <select
                                value={selectedFYId}
                                onChange={handleFYChange}
                                className="w-full sm:w-auto px-3 py-2 sm:px-4 sm:py-2 border-0 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs sm:text-sm font-bold bg-blue-50 text-blue-700 cursor-pointer shadow-sm hover:bg-blue-100 transition-colors"
                            >
                                <option value="">All Years</option>
                                {fyOptions.map(fy => <option key={fy.id} value={fy.id}>{fy.name}</option>)}
                            </select>
                        </div>

                        {/* Center: Dates & Search */}
                        <div className="flex-1 flex gap-2 w-full min-w-0 sm:justify-center">
                            <div className="flex flex-col flex-1 sm:max-w-36">
                                <input 
                                    type="date" 
                                    value={inputStartDate} 
                                    onChange={(e) => setInputStartDate(e.target.value)}
                                    title="From Date"
                                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs sm:text-sm font-medium text-gray-800 transition-colors"
                                />
                            </div>
                            <div className="flex flex-col flex-1 sm:max-w-36">
                                <input 
                                    type="date" 
                                    value={inputEndDate} 
                                    onChange={(e) => setInputEndDate(e.target.value)}
                                    title="To Date"
                                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs sm:text-sm font-medium text-gray-800 transition-colors"
                                />
                            </div>
                        </div>

                        {/* Right: Actions */}
                        <div className="shrink-0 w-full sm:w-auto flex gap-2">
                            <button
                                type="button"
                                onClick={handleSearch}
                                className="flex-1 sm:flex-none flex justify-center items-center gap-2 px-4 py-2 bg-blue-600 border border-transparent rounded-lg text-sm font-bold text-white hover:bg-blue-700 transition shadow-sm"
                            >
                                <Search className="w-4 h-4" />
                                <span className="hidden sm:inline">Search</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setShowMobileFilters(prev => !prev)}
                                className="flex-1 sm:flex-none flex justify-center items-center gap-2 px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-bold text-gray-800 hover:bg-gray-100 transition shadow-sm"
                            >
                                <Filter className="w-4 h-4 text-blue-600" />
                                <span>Filters</span>
                                {activeFilterCount > 0 && (
                                    <span className="bg-blue-600 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold ml-1">
                                        {activeFilterCount}
                                    </span>
                                )}
                                {showMobileFilters ? <ChevronUp className="w-4 h-4 text-gray-400 ml-1 hidden sm:block" /> : <ChevronDown className="w-4 h-4 text-gray-400 ml-1 hidden sm:block" />}
                            </button>
                        </div>
                    </div>

                    {/* Filter Popup / Modal */}
                    {showMobileFilters && createPortal(
                        <div className="fixed inset-0 z-[100] flex items-center justify-center sm:p-4">
                            {/* Backdrop */}
                            <div 
                                className="fixed inset-0 bg-black/50 transition-opacity"
                                onClick={() => setShowMobileFilters(false)}
                            ></div>
                            {/* Modal Content */}
                            <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl z-[101] flex flex-col w-full max-w-lg max-h-[85vh] absolute bottom-0 sm:relative sm:bottom-auto">
                                {/* Header */}
                                <div className="flex justify-between items-center px-5 py-4 border-b border-gray-100 shrink-0">
                                    <h3 className="font-extrabold text-gray-900 text-lg flex items-center gap-2">
                                        <Filter size={18} className="text-blue-600" /> Filters & Options
                                    </h3>
                                    <button onClick={() => setShowMobileFilters(false)} className="p-1.5 bg-gray-100 text-gray-500 hover:bg-gray-200 rounded-full transition">
                                        <X size={20} />
                                    </button>
                                </div>
                                
                                {/* Scrollable Body */}
                                <div className="p-5 flex-1 overflow-y-auto flex flex-col gap-4">
                                    {/* Account Name */}
                                    {!allowedAccount && (
                                        <div className="flex flex-col gap-1">
                                            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Account Name</label>
                                            <AccountSearchDropdown
                                                value={inputAccountName}
                                                onChange={(val) => setInputAccountName(val)}
                                                placeholder="Search Any Account..."
                                            />
                                        </div>
                                    )}
                                    
                                    {/* Voucher Type */}
                                    <div className="flex flex-col gap-1">
                                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Voucher Type</label>
                                        <input 
                                            type="text"
                                            value={inputVoucherType}
                                            onChange={(e) => setInputVoucherType(e.target.value)}
                                            placeholder="e.g. Sales, Receipt..."
                                            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:bg-white font-medium"
                                        />
                                    </div>

                                    {/* Dates */}
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="flex flex-col gap-1">
                                            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">From Date</label>
                                            <input 
                                                type="date" 
                                                value={inputStartDate}
                                                onChange={(e) => setInputStartDate(e.target.value)}
                                                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:bg-white font-medium"
                                            />
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">To Date</label>
                                            <input 
                                                type="date" 
                                                value={inputEndDate}
                                                onChange={(e) => setInputEndDate(e.target.value)}
                                                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:bg-white font-medium"
                                            />
                                        </div>
                                    </div>

                                    {/* Toggles */}
                                    <div className="flex flex-col gap-3 py-3 border-y border-gray-100 my-1">
                                        <label className="flex items-center justify-between text-sm text-gray-800 font-semibold cursor-pointer group">
                                            <span>Show full details</span>
                                            <input 
                                                type="checkbox" 
                                                checked={showFullDetails}
                                                onChange={(e) => setShowFullDetails(e.target.checked)}
                                                className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 bg-gray-50 cursor-pointer"
                                            />
                                        </label>
                                    </div>
                                </div>

                                {/* Action buttons */}
                                <div className="flex flex-col gap-2 p-5 pt-3 border-t border-gray-100 bg-white shrink-0 pb-safe sm:rounded-b-2xl">
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => {
                                                handleClear();
                                                setShowMobileFilters(false);
                                            }}
                                            className="flex-[1] py-3 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl text-sm font-bold transition"
                                        >
                                            Clear
                                        </button>
                                        <button
                                            onClick={() => {
                                                handleSearch();
                                                setShowMobileFilters(false);
                                            }}
                                            className="flex-[2] py-3 bg-gray-900 hover:bg-gray-800 text-white rounded-xl text-sm font-bold shadow-md transition"
                                        >
                                            Apply & Search
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>,
                        document.body
                    )}
                </div>
                
                <div className="overflow-auto flex-1 relative">
                    {transactions.length === 0 && !loadingData && !loadingMore ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400">
                            <svg className="w-12 h-12 mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                            <p>No transactions found matching your filters.</p>
                        </div>
                    ) : (
                        <TransactionTable 
                            transactions={transactions} 
                            showFullDetails={showFullDetails} 
                            onDeleteTransaction={handleDeleteTransaction}
                        />
                    )}
                    {loadingMore && (
                        <div className="text-center p-4 text-gray-500 text-sm animate-pulse">Loading more...</div>
                    )}
                </div>

                <div className="flex justify-between items-center px-4 py-2 sm:px-6 sm:py-3 bg-gray-50 border-t border-gray-100 shrink-0 rounded-b-2xl">
                    <span className="text-xs sm:text-sm font-medium text-gray-500">
                        Showing <strong className="text-gray-900">{transactions.length}</strong> entries
                    </span>
                    <div className="flex gap-2 items-center">
                        {hasMore && (
                            <button 
                                disabled={loadingMore}
                                onClick={() => fetchTransactions(inputStartDate, inputEndDate, inputAccountName, inputVoucherType, true)}
                                className="px-4 py-1.5 sm:px-5 sm:py-2 bg-white hover:bg-gray-50 text-gray-700 text-xs sm:text-sm font-bold border border-gray-200 rounded-lg disabled:opacity-50 transition shadow-sm"
                            >
                                {loadingMore ? 'Loading...' : 'Load More'}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
