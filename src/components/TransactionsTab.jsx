import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import { collection, getDocs } from 'firebase/firestore';
import TransactionTable from './TransactionTable';
import { fetchFiscalYears, getCurrentFYObject } from '../utils/fiscalYear';

export default function TransactionsTab({ updateTrigger, allowedAccount }) {
    // Dropdown Data
    const [allTransactions, setAllTransactions] = useState([]);
    const [allAccounts, setAllAccounts] = useState([]);
    const [loadingData, setLoadingData] = useState(true);

    const [fyOptions, setFyOptions] = useState([]);
    const [selectedFYId, setSelectedFYId] = useState('');

    // Input States
    const [inputStartDate, setInputStartDate] = useState('');
    const [inputEndDate, setInputEndDate] = useState('');
    const [inputAccountName, setInputAccountName] = useState('');
    const [inputVoucherType, setInputVoucherType] = useState('');

    // Applied Filters (Updated on Search)
    const [appliedFilters, setAppliedFilters] = useState({
        startDate: '',
        endDate: '',
        accountName: '',
        voucherType: ''
    });
    
    // Pagination state
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 50;
    
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
                let initialStart = '';
                let initialEnd = '';
                if (current) {
                    setSelectedFYId(current.id);
                    initialStart = current.startDate;
                    initialEnd = current.endDate;
                }
                
                setInputStartDate(initialStart);
                setInputEndDate(initialEnd);
                setAppliedFilters(prev => ({
                    ...prev,
                    startDate: initialStart,
                    endDate: initialEnd
                }));

                const accSnap = await getDocs(collection(db, 'accounts'));
                const accs = [];
                accSnap.forEach(d => accs.push(d.data().name));
                accs.sort((a, b) => a.localeCompare(b));
                setAllAccounts(accs);

                const txnsSnap = await getDocs(collection(db, 'transactions'));
                const txns = [];
                txnsSnap.forEach(d => txns.push({ id: d.id, ...d.data() }));
                
                // Pre-sort by date descending
                txns.sort((a, b) => new Date(b.date) - new Date(a.date));
                setAllTransactions(txns);
                
            } catch (error) {
                console.error("Error fetching initial data:", error);
            }
            setLoadingData(false);
        };
        fetchInitialData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [updateTrigger]);

    // Handle FY Dropdown changes AFTER initial load
    const handleFYChange = (e) => {
        const newFYId = e.target.value;
        setSelectedFYId(newFYId);
        if (newFYId) {
            const activeFY = fyOptions.find(f => f.id === newFYId);
            if (activeFY) {
                setInputStartDate(activeFY.startDate);
                setInputEndDate(activeFY.endDate);
                setAppliedFilters(prev => ({
                    ...prev,
                    startDate: activeFY.startDate,
                    endDate: activeFY.endDate
                }));
            }
        } else {
            setInputStartDate('');
            setInputEndDate('');
            setAppliedFilters(prev => ({
                ...prev,
                startDate: '',
                endDate: ''
            }));
        }
        setCurrentPage(1);
    };

    const uniqueVoucherTypes = useMemo(() => {
        const types = new Set();
        allTransactions.forEach(t => { if (t.type) types.add(t.type); });
        return Array.from(types).sort();
    }, [allTransactions]);

    const handleSearch = () => {
        setAppliedFilters({
            startDate: inputStartDate,
            endDate: inputEndDate,
            accountName: inputAccountName,
            voucherType: inputVoucherType
        });
        setCurrentPage(1);
    };

    const handleClear = () => {
        setSelectedFYId('');
        setInputStartDate('');
        setInputEndDate('');
        setInputAccountName('');
        setInputVoucherType('');
        setAppliedFilters({
            startDate: '',
            endDate: '',
            accountName: '',
            voucherType: ''
        });
        setCurrentPage(1);
    };

    // Client-Side Filtering based on appliedFilters
    const filteredTransactions = useMemo(() => {
        let result = allTransactions;
        
        const targetAccount = allowedAccount || appliedFilters.accountName;
        if (targetAccount) {
            const lowerTarget = targetAccount.toLowerCase();
            result = result.filter(t => 
                (t.debitAccount && t.debitAccount.toLowerCase() === lowerTarget) || 
                (t.creditAccount && t.creditAccount.toLowerCase() === lowerTarget)
            );
        }

        if (appliedFilters.startDate) {
            result = result.filter(t => t.date >= appliedFilters.startDate);
        }
        if (appliedFilters.endDate) {
            result = result.filter(t => t.date <= appliedFilters.endDate);
        }

        if (appliedFilters.voucherType) {
            result = result.filter(t => t.type === appliedFilters.voucherType);
        }

        return result;
    }, [allTransactions, allowedAccount, appliedFilters]);

    const paginatedTransactions = useMemo(() => {
        const startIndex = (currentPage - 1) * itemsPerPage;
        return filteredTransactions.slice(startIndex, startIndex + itemsPerPage);
    }, [filteredTransactions, currentPage]);

    const totalPages = Math.ceil(filteredTransactions.length / itemsPerPage);

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
                            <input 
                                type="text"
                                list="allAccountsList"
                                value={inputAccountName}
                                onChange={(e) => setInputAccountName(e.target.value)}
                                placeholder="Any Account..."
                                className="px-3 py-1.5 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm"
                            />
                            <datalist id="allAccountsList">
                                {allAccounts.map(acc => <option key={acc} value={acc} />)}
                            </datalist>
                        </div>
                    )}
                    
                    <div className="flex flex-col gap-1 w-48">
                        <label className="text-xs font-semibold text-gray-600">Voucher Type</label>
                        <input 
                            type="text"
                            list="allVoucherTypes"
                            value={inputVoucherType}
                            onChange={(e) => setInputVoucherType(e.target.value)}
                            placeholder="Any Type..."
                            className="px-3 py-1.5 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm"
                        />
                        <datalist id="allVoucherTypes">
                            {uniqueVoucherTypes.map(type => <option key={type} value={type} />)}
                        </datalist>
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
                {paginatedTransactions.length === 0 ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400">
                        <svg className="w-12 h-12 mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                        <p>No transactions found matching your filters.</p>
                    </div>
                ) : (
                    <TransactionTable transactions={paginatedTransactions} showFullDetails={showFullDetails} />
                )}
            </div>

            <div className="flex justify-between items-center px-4 py-2 bg-gray-50 border-t border-gray-200 shrink-0">
                <span className="text-sm text-gray-700">
                    Showing {filteredTransactions.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, filteredTransactions.length)} of {filteredTransactions.length} entries
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
    );
}
