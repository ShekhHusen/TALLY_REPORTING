import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { 
    X, Search, Calculator, ArrowUpRight, ArrowDownRight, Scale, 
    ChevronDown, ChevronRight, AlertCircle, Sparkles, Filter, 
    CheckCircle2, ArrowUpDown, ArrowUp, ArrowDown, RefreshCw, Layers
} from 'lucide-react';

const formatCurrency = (amount) => {
    return Number(amount || 0).toLocaleString('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
};

export default function AccountDeltaModal({ isOpen, onClose, transactions = [], activeFY }) {
    const [searchQuery, setSearchQuery] = useState('');
    const [filterType, setFilterType] = useState('all'); // 'all', 'new', 'existing', 'debit', 'credit'
    const [sortField, setSortField] = useState('netDelta'); // 'name', 'deltaDebit', 'deltaCredit', 'netDelta', 'currentBal', 'projectedBal', 'txnCount'
    const [sortDir, setSortDir] = useState('desc'); // 'asc', 'desc'
    const [expandedAccounts, setExpandedAccounts] = useState(new Set());
    
    // Firestore state
    const [loadingBalances, setLoadingBalances] = useState(false);
    const [firestoreAccounts, setFirestoreAccounts] = useState(new Map()); // lowercase name -> { id, name, group, fyData }

    // Step 1: Locally aggregate per-account delta from transactions
    const rawAccountDeltas = useMemo(() => {
        if (!Array.isArray(transactions) || transactions.length === 0) return [];

        const accountMap = new Map(); // lowercase trimmed -> account delta object

        transactions.forEach(t => {
            const debitEntries = t.allDebitEntries || [];
            const creditEntries = t.allCreditEntries || [];

            if (debitEntries.length > 0) {
                debitEntries.forEach(entry => {
                    const rawName = entry.name || '';
                    const key = rawName.toLowerCase().trim();
                    if (!key || key === '-') return;

                    if (!accountMap.has(key)) {
                        accountMap.set(key, {
                            key,
                            name: rawName,
                            deltaDebit: 0,
                            deltaCredit: 0,
                            vouchers: []
                        });
                    }
                    const item = accountMap.get(key);
                    const amt = parseFloat(entry.amount || 0);
                    item.deltaDebit += amt;
                    item.vouchers.push({
                        date: t.date,
                        voucherNo: t.voucherNo || '-',
                        type: t.type || 'Voucher',
                        entryType: 'Debit',
                        amount: amt,
                        narration: t.narration || ''
                    });
                });
            } else if (t.debitAccount && t.debitAccount !== '-') {
                const key = t.debitAccount.toLowerCase().trim();
                if (key) {
                    if (!accountMap.has(key)) {
                        accountMap.set(key, {
                            key,
                            name: t.debitAccount,
                            deltaDebit: 0,
                            deltaCredit: 0,
                            vouchers: []
                        });
                    }
                    const item = accountMap.get(key);
                    const amt = parseFloat(t.debitAmount || 0);
                    item.deltaDebit += amt;
                    item.vouchers.push({
                        date: t.date,
                        voucherNo: t.voucherNo || '-',
                        type: t.type || 'Voucher',
                        entryType: 'Debit',
                        amount: amt,
                        narration: t.narration || ''
                    });
                }
            }

            if (creditEntries.length > 0) {
                creditEntries.forEach(entry => {
                    const rawName = entry.name || '';
                    const key = rawName.toLowerCase().trim();
                    if (!key || key === '-') return;

                    if (!accountMap.has(key)) {
                        accountMap.set(key, {
                            key,
                            name: rawName,
                            deltaCredit: 0,
                            deltaDebit: 0,
                            vouchers: []
                        });
                    }
                    const item = accountMap.get(key);
                    const amt = parseFloat(entry.amount || 0);
                    item.deltaCredit += amt;
                    item.vouchers.push({
                        date: t.date,
                        voucherNo: t.voucherNo || '-',
                        type: t.type || 'Voucher',
                        entryType: 'Credit',
                        amount: amt,
                        narration: t.narration || ''
                    });
                });
            } else if (t.creditAccount && t.creditAccount !== '-') {
                const key = t.creditAccount.toLowerCase().trim();
                if (key) {
                    if (!accountMap.has(key)) {
                        accountMap.set(key, {
                            key,
                            name: t.creditAccount,
                            deltaCredit: 0,
                            deltaDebit: 0,
                            vouchers: []
                        });
                    }
                    const item = accountMap.get(key);
                    const amt = parseFloat(t.creditAmount || 0);
                    item.deltaCredit += amt;
                    item.vouchers.push({
                        date: t.date,
                        voucherNo: t.voucherNo || '-',
                        type: t.type || 'Voucher',
                        entryType: 'Credit',
                        amount: amt,
                        narration: t.narration || ''
                    });
                }
            }
        });

        return Array.from(accountMap.values());
    }, [transactions]);

    // Step 2: Fetch Firestore accounts and FY balances for affected accounts when modal is open
    useEffect(() => {
        if (!isOpen || rawAccountDeltas.length === 0) return;

        let isMounted = true;

        const loadFirestoreData = async () => {
            try {
                setLoadingBalances(true);
                const accSnap = await getDocs(collection(db, 'accounts'));
                const existingMap = new Map();

                accSnap.forEach(d => {
                    const data = d.data();
                    const key = (data.name || '').toLowerCase().trim();
                    if (key) {
                        existingMap.set(key, {
                            id: d.id,
                            name: data.name,
                            group: data.group || '',
                            openingBalance: data.openingBalance || 0,
                            openingBalanceType: data.openingBalanceType || ''
                        });
                    }
                });

                // Find only the affected accounts that exist in Firestore
                const affectedExisting = [];
                rawAccountDeltas.forEach(item => {
                    if (existingMap.has(item.key)) {
                        affectedExisting.push({
                            key: item.key,
                            acc: existingMap.get(item.key)
                        });
                    }
                });

                // Fetch FY documents for affected accounts
                const fyDocsMap = new Map();
                if (activeFY?.id && affectedExisting.length > 0) {
                    const fyPromises = affectedExisting.map(async ({ key, acc }) => {
                        try {
                            const fyDoc = await getDoc(doc(db, 'accounts', acc.id, 'fiscalYears', activeFY.id));
                            if (fyDoc.exists()) {
                                fyDocsMap.set(key, fyDoc.data());
                            }
                        } catch (e) {
                            console.error(`Error fetching FY doc for ${acc.name}:`, e);
                        }
                    });
                    await Promise.all(fyPromises);
                }

                if (isMounted) {
                    const mergedMap = new Map();
                    existingMap.forEach((acc, key) => {
                        mergedMap.set(key, {
                            ...acc,
                            fyData: fyDocsMap.get(key) || null
                        });
                    });
                    setFirestoreAccounts(mergedMap);
                }
            } catch (err) {
                console.error("Error loading Firestore balances for delta preview:", err);
            } finally {
                if (isMounted) setLoadingBalances(false);
            }
        };

        loadFirestoreData();

        return () => {
            isMounted = false;
        };
    }, [isOpen, rawAccountDeltas, activeFY?.id]);

    // Step 3: Combine delta calculations with Firestore existing/projected balances
    const calculatedAccounts = useMemo(() => {
        return rawAccountDeltas.map(item => {
            const fsAcc = firestoreAccounts.get(item.key);
            const isNew = !fsAcc;
            const fyData = fsAcc?.fyData;

            // Current balances from Firestore
            const ob = parseFloat(fyData?.openingBalance ?? fsAcc?.openingBalance ?? 0);
            const obType = fyData?.openingBalanceType || fsAcc?.openingBalanceType || '';
            const currentTotalDebit = parseFloat(fyData?.totalDebit || 0);
            const currentTotalCredit = parseFloat(fyData?.totalCredit || 0);

            let currentClosingBalance = 0;
            let currentClosingBalanceType = '';

            if (fyData && fyData.closingBalance !== undefined) {
                currentClosingBalance = parseFloat(fyData.closingBalance || 0);
                currentClosingBalanceType = fyData.closingBalanceType || '';
            } else if (!isNew) {
                const obSigned = obType === 'Cr' ? -ob : ob;
                const currentSigned = obSigned + currentTotalDebit - currentTotalCredit;
                currentClosingBalance = Math.abs(currentSigned);
                currentClosingBalanceType = currentSigned < 0 ? 'Cr' : (currentSigned > 0 ? 'Dr' : '');
            }

            // Net Delta
            const netDeltaSigned = item.deltaDebit - item.deltaCredit;
            const netDeltaType = netDeltaSigned > 0 ? 'Dr' : (netDeltaSigned < 0 ? 'Cr' : '');
            const netDelta = Math.abs(netDeltaSigned);

            // Projected balances (following the exact logic in syncBalancesForImportedAccounts)
            const projectedTotalDebit = currentTotalDebit + item.deltaDebit;
            const projectedTotalCredit = currentTotalCredit + item.deltaCredit;

            const obSigned = obType === 'Cr' ? -ob : ob;
            const projectedSigned = obSigned + projectedTotalDebit - projectedTotalCredit;

            const projectedClosingBalanceType = projectedSigned < 0 ? 'Cr' : (projectedSigned > 0 ? 'Dr' : '');
            const projectedClosingBalance = Math.abs(projectedSigned);

            return {
                key: item.key,
                name: fsAcc?.name || item.name,
                group: fsAcc?.group || '',
                isNew,
                vouchers: item.vouchers,
                txnCount: item.vouchers.length,
                currentClosingBalance,
                currentClosingBalanceType,
                deltaDebit: item.deltaDebit,
                deltaCredit: item.deltaCredit,
                netDeltaSigned,
                netDelta,
                netDeltaType,
                projectedClosingBalance,
                projectedClosingBalanceType
            };
        });
    }, [rawAccountDeltas, firestoreAccounts]);

    // KPI Summary Metrics
    const summary = useMemo(() => {
        let totalDebit = 0;
        let totalCredit = 0;
        let newAccountsCount = 0;

        calculatedAccounts.forEach(acc => {
            totalDebit += acc.deltaDebit;
            totalCredit += acc.deltaCredit;
            if (acc.isNew) newAccountsCount++;
        });

        const netMovementSigned = totalDebit - totalCredit;
        const netMovementType = netMovementSigned > 0 ? 'Dr' : (netMovementSigned < 0 ? 'Cr' : '');

        return {
            totalAccounts: calculatedAccounts.length,
            totalDebit,
            totalCredit,
            netMovement: Math.abs(netMovementSigned),
            netMovementType,
            newAccountsCount,
            existingAccountsCount: calculatedAccounts.length - newAccountsCount
        };
    }, [calculatedAccounts]);

    // Filter & Search
    const filteredAccounts = useMemo(() => {
        let result = calculatedAccounts;

        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase().trim();
            result = result.filter(a => 
                a.name.toLowerCase().includes(q) || 
                (a.group && a.group.toLowerCase().includes(q))
            );
        }

        if (filterType === 'new') {
            result = result.filter(a => a.isNew);
        } else if (filterType === 'existing') {
            result = result.filter(a => !a.isNew);
        } else if (filterType === 'debit') {
            result = result.filter(a => a.netDeltaSigned > 0);
        } else if (filterType === 'credit') {
            result = result.filter(a => a.netDeltaSigned < 0);
        }

        return result;
    }, [calculatedAccounts, searchQuery, filterType]);

    // Sorting
    const sortedAccounts = useMemo(() => {
        const sorted = [...filteredAccounts].sort((a, b) => {
            let cmp = 0;
            switch (sortField) {
                case 'name':
                    cmp = a.name.localeCompare(b.name);
                    break;
                case 'deltaDebit':
                    cmp = a.deltaDebit - b.deltaDebit;
                    break;
                case 'deltaCredit':
                    cmp = a.deltaCredit - b.deltaCredit;
                    break;
                case 'netDelta':
                    cmp = a.netDelta - b.netDelta;
                    break;
                case 'currentBal':
                    cmp = a.currentClosingBalance - b.currentClosingBalance;
                    break;
                case 'projectedBal':
                    cmp = a.projectedClosingBalance - b.projectedClosingBalance;
                    break;
                case 'txnCount':
                    cmp = a.txnCount - b.txnCount;
                    break;
                default:
                    cmp = a.netDelta - b.netDelta;
            }
            return sortDir === 'asc' ? cmp : -cmp;
        });
        return sorted;
    }, [filteredAccounts, sortField, sortDir]);

    const handleSort = (field) => {
        if (sortField === field) {
            setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDir('desc');
        }
    };

    const toggleExpand = (key) => {
        setExpandedAccounts(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };

    const toggleExpandAll = () => {
        if (expandedAccounts.size === sortedAccounts.length) {
            setExpandedAccounts(new Set());
        } else {
            setExpandedAccounts(new Set(sortedAccounts.map(a => a.key)));
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-xs p-0">
  <div className="bg-white w-full h-full max-w-none max-h-none rounded-none shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-teal-50 via-emerald-50 to-indigo-50">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-md">
                            <Calculator size={22} />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h2 className="text-lg sm:text-xl font-black text-gray-900">
                                    Account Balances Delta Preview
                                </h2>
                                <span className="bg-emerald-100 text-emerald-800 text-xs px-2.5 py-0.5 rounded-full font-bold">
                                    Local Calculation
                                </span>
                            </div>
                            <p className="text-xs text-gray-500 font-medium">
                                Projected balance movements for <strong className="text-gray-800">{activeFY?.name || 'Current FY'}</strong> based on imported transactions
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        {loadingBalances && (
                            <div className="flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg font-medium animate-pulse">
                                <RefreshCw size={13} className="animate-spin" />
                                <span>Fetching Firestore balances...</span>
                            </div>
                        )}
                        <button
                            onClick={onClose}
                            className="p-2 hover:bg-gray-200/70 rounded-xl transition-colors text-gray-500 hover:text-gray-800 cursor-pointer"
                            title="Close Popup"
                        >
                            <X size={22} />
                        </button>
                    </div>
                </div>

              

                {/* Filters & Search Toolbar */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 px-5 py-3 border-b border-gray-100 bg-white">
                    {/* Search Input */}
                    <div className="relative flex-1 max-w-md">
                        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Search affected accounts by name or group..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-3 py-1.5 border border-gray-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                        />
                        {searchQuery && (
                            <button
                                onClick={() => setSearchQuery('')}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                            >
                                <X size={14} />
                            </button>
                        )}
                    </div>

                    {/* Filter Pills */}
                    <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold">
                        <button
                            type="button"
                            onClick={() => setFilterType('all')}
                            className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                                filterType === 'all'
                                    ? 'bg-emerald-700 text-white shadow-xs'
                                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}
                        >
                            All ({calculatedAccounts.length})
                        </button>
                        {summary.newAccountsCount > 0 && (
                            <button
                                type="button"
                                onClick={() => setFilterType('new')}
                                className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer flex items-center gap-1 ${
                                    filterType === 'new'
                                        ? 'bg-rose-600 text-white shadow-xs'
                                        : 'bg-rose-50 text-rose-700 hover:bg-rose-100'
                                }`}
                            >
                                <AlertCircle size={12} />
                                New ({summary.newAccountsCount})
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={() => setFilterType('existing')}
                            className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                                filterType === 'existing'
                                    ? 'bg-indigo-600 text-white shadow-xs'
                                    : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
                            }`}
                        >
                            Existing ({summary.existingAccountsCount})
                        </button>
                        <button
                            type="button"
                            onClick={() => setFilterType('debit')}
                            className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                                filterType === 'debit'
                                    ? 'bg-blue-600 text-white shadow-xs'
                                    : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                            }`}
                        >
                            Net Dr
                        </button>
                        <button
                            type="button"
                            onClick={() => setFilterType('credit')}
                            className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                                filterType === 'credit'
                                    ? 'bg-amber-600 text-white shadow-xs'
                                    : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                            }`}
                        >
                            Net Cr
                        </button>

                        <button
                            type="button"
                            onClick={toggleExpandAll}
                            className="ml-auto text-xs text-gray-500 hover:text-gray-800 font-bold px-2 py-1 hover:bg-gray-100 rounded-md transition-colors cursor-pointer"
                        >
                            {expandedAccounts.size === sortedAccounts.length && sortedAccounts.length > 0
                                ? 'Collapse All'
                                : 'Expand All'}
                        </button>
                    </div>
                </div>

                {/* Table Area */}
                <div className="flex-1 overflow-auto bg-gray-50/30">
                    <table className="w-full text-left border-collapse text-xs sm:text-sm">
                        <thead className="bg-gray-100/90 sticky top-0 z-20 backdrop-blur-xs shadow-2xs">
                            <tr className="border-b border-gray-200 text-gray-700">
                                <th className="px-3 py-2.5 w-8"></th>
                                <th className="px-3 py-2.5 font-bold w-12 text-center text-gray-500">#</th>

                                {/* Account Name */}
                                <th className="px-4 py-2.5 font-bold">
                                    <button
                                        type="button"
                                        onClick={() => handleSort('name')}
                                        className="flex items-center gap-1 hover:text-emerald-700 transition-colors cursor-pointer"
                                    >
                                        <span>Account / Ledger Name</span>
                                        {sortField === 'name' ? (
                                            sortDir === 'asc' ? <ArrowUp size={13} className="text-emerald-600" /> : <ArrowDown size={13} className="text-emerald-600" />
                                        ) : (
                                            <ArrowUpDown size={12} className="text-gray-400 opacity-60" />
                                        )}
                                    </button>
                                </th>

                                {/* Vouchers count */}
                                <th className="px-3 py-2.5 font-bold text-center w-24">
                                    <button
                                        type="button"
                                        onClick={() => handleSort('txnCount')}
                                        className="inline-flex items-center gap-1 hover:text-emerald-700 transition-colors cursor-pointer"
                                    >
                                        <span>Vouchers</span>
                                        {sortField === 'txnCount' ? (
                                            sortDir === 'asc' ? <ArrowUp size={13} className="text-emerald-600" /> : <ArrowDown size={13} className="text-emerald-600" />
                                        ) : (
                                            <ArrowUpDown size={12} className="text-gray-400 opacity-60" />
                                        )}
                                    </button>
                                </th>

                                {/* Current Balance */}
                                <th className="px-3 py-2.5 font-bold text-right">
                                    <button
                                        type="button"
                                        onClick={() => handleSort('currentBal')}
                                        className="inline-flex items-center gap-1 hover:text-emerald-700 transition-colors cursor-pointer ml-auto"
                                    >
                                        <span>Current Closing</span>
                                        {sortField === 'currentBal' ? (
                                            sortDir === 'asc' ? <ArrowUp size={13} className="text-emerald-600" /> : <ArrowDown size={13} className="text-emerald-600" />
                                        ) : (
                                            <ArrowUpDown size={12} className="text-gray-400 opacity-60" />
                                        )}
                                    </button>
                                </th>

                                {/* Delta Debit */}
                                <th className="px-3 py-2.5 font-bold text-right text-blue-700">
                                    <button
                                        type="button"
                                        onClick={() => handleSort('deltaDebit')}
                                        className="inline-flex items-center gap-1 hover:text-blue-900 transition-colors cursor-pointer ml-auto"
                                    >
                                        <span>Delta Debit (+)</span>
                                        {sortField === 'deltaDebit' ? (
                                            sortDir === 'asc' ? <ArrowUp size={13} className="text-blue-700" /> : <ArrowDown size={13} className="text-blue-700" />
                                        ) : (
                                            <ArrowUpDown size={12} className="text-blue-400 opacity-60" />
                                        )}
                                    </button>
                                </th>

                                {/* Delta Credit */}
                                <th className="px-3 py-2.5 font-bold text-right text-amber-700">
                                    <button
                                        type="button"
                                        onClick={() => handleSort('deltaCredit')}
                                        className="inline-flex items-center gap-1 hover:text-amber-900 transition-colors cursor-pointer ml-auto"
                                    >
                                        <span>Delta Credit (-)</span>
                                        {sortField === 'deltaCredit' ? (
                                            sortDir === 'asc' ? <ArrowUp size={13} className="text-amber-700" /> : <ArrowDown size={13} className="text-amber-700" />
                                        ) : (
                                            <ArrowUpDown size={12} className="text-amber-400 opacity-60" />
                                        )}
                                    </button>
                                </th>

                                {/* Net Delta */}
                                <th className="px-3 py-2.5 font-bold text-right text-purple-700">
                                    <button
                                        type="button"
                                        onClick={() => handleSort('netDelta')}
                                        className="inline-flex items-center gap-1 hover:text-purple-900 transition-colors cursor-pointer ml-auto"
                                    >
                                        <span>Net Delta</span>
                                        {sortField === 'netDelta' ? (
                                            sortDir === 'asc' ? <ArrowUp size={13} className="text-purple-700" /> : <ArrowDown size={13} className="text-purple-700" />
                                        ) : (
                                            <ArrowUpDown size={12} className="text-purple-400 opacity-60" />
                                        )}
                                    </button>
                                </th>

                                {/* Projected Balance */}
                                <th className="px-4 py-2.5 font-bold text-right text-emerald-800 bg-emerald-50/60">
                                    <button
                                        type="button"
                                        onClick={() => handleSort('projectedBal')}
                                        className="inline-flex items-center gap-1 hover:text-emerald-950 transition-colors cursor-pointer ml-auto"
                                    >
                                        <span>Projected New Closing</span>
                                        {sortField === 'projectedBal' ? (
                                            sortDir === 'asc' ? <ArrowUp size={13} className="text-emerald-700" /> : <ArrowDown size={13} className="text-emerald-700" />
                                        ) : (
                                            <ArrowUpDown size={12} className="text-emerald-500 opacity-60" />
                                        )}
                                    </button>
                                </th>
                            </tr>
                        </thead>

                        <tbody className="divide-y divide-gray-100 bg-white">
                            {sortedAccounts.map((acc, index) => {
                                const isExpanded = expandedAccounts.has(acc.key);

                                return (
                                    <React.Fragment key={acc.key}>
                                        <tr 
                                            onClick={() => toggleExpand(acc.key)}
                                            className={`hover:bg-emerald-50/30 transition-colors cursor-pointer ${
                                                acc.isNew ? 'bg-rose-50/20' : ''
                                            } ${isExpanded ? 'bg-emerald-50/40' : ''}`}
                                        >
                                            {/* Expand Icon */}
                                            <td className="px-2 py-3 text-center text-gray-400">
                                                {isExpanded ? (
                                                    <ChevronDown size={16} className="text-emerald-600" />
                                                ) : (
                                                    <ChevronRight size={16} />
                                                )}
                                            </td>

                                            {/* Index */}
                                            <td className="px-3 py-3 text-center text-gray-400 font-mono text-xs">
                                                {index + 1}
                                            </td>

                                            {/* Account Name */}
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-bold text-gray-900">
                                                        {acc.name}
                                                    </span>
                                                    {acc.isNew ? (
                                                        <span className="bg-rose-100 text-rose-800 text-[10px] font-black px-1.5 py-0.5 rounded uppercase tracking-wide">
                                                            New Ledger
                                                        </span>
                                                    ) : (
                                                        <span className="text-[10px] text-gray-400 font-semibold">
                                                            {acc.group || 'Existing'}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>

                                            {/* Vouchers Badge */}
                                            <td className="px-3 py-3 text-center">
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-gray-100 text-gray-700">
                                                    <Layers size={11} />
                                                    {acc.txnCount}
                                                </span>
                                            </td>

                                            {/* Current Balance */}
                                            <td className="px-3 py-3 text-right font-mono text-xs sm:text-sm">
                                                {acc.isNew ? (
                                                    <span className="text-gray-400 italic">0.00 (New)</span>
                                                ) : (
                                                    <span className="font-semibold text-gray-700">
                                                        {formatCurrency(acc.currentClosingBalance)}{' '}
                                                        <span className={`text-[10px] font-bold px-1 py-0.2 rounded ml-0.5 ${
                                                            acc.currentClosingBalanceType === 'Dr' ? 'bg-blue-100 text-blue-800' : 
                                                            acc.currentClosingBalanceType === 'Cr' ? 'bg-amber-100 text-amber-800' : 'text-gray-400'
                                                        }`}>
                                                            {acc.currentClosingBalanceType || '-'}
                                                        </span>
                                                    </span>
                                                )}
                                            </td>

                                            {/* Delta Debit */}
                                            <td className="px-3 py-3 text-right font-mono text-xs sm:text-sm font-bold text-blue-700">
                                                {acc.deltaDebit > 0 ? `+ ₹ ${formatCurrency(acc.deltaDebit)}` : '-'}
                                            </td>

                                            {/* Delta Credit */}
                                            <td className="px-3 py-3 text-right font-mono text-xs sm:text-sm font-bold text-amber-700">
                                                {acc.deltaCredit > 0 ? `- ₹ ${formatCurrency(acc.deltaCredit)}` : '-'}
                                            </td>

                                            {/* Net Delta */}
                                            <td className="px-3 py-3 text-right font-mono text-xs sm:text-sm font-extrabold text-purple-900">
                                                ₹ {formatCurrency(acc.netDelta)}{' '}
                                                {acc.netDeltaType && (
                                                    <span className={`text-[10px] font-bold px-1 py-0.2 rounded ml-0.5 ${
                                                        acc.netDeltaType === 'Dr' ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'
                                                    }`}>
                                                        {acc.netDeltaType}
                                                    </span>
                                                )}
                                            </td>

                                            {/* Projected Closing */}
                                            <td className="px-4 py-3 text-right font-mono text-xs sm:text-sm font-black text-emerald-800 bg-emerald-50/40">
                                                ₹ {formatCurrency(acc.projectedClosingBalance)}{' '}
                                                {acc.projectedClosingBalanceType && (
                                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ml-0.5 shadow-2xs ${
                                                        acc.projectedClosingBalanceType === 'Dr' 
                                                            ? 'bg-blue-600 text-white' 
                                                            : 'bg-amber-600 text-white'
                                                    }`}>
                                                        {acc.projectedClosingBalanceType}
                                                    </span>
                                                )}
                                            </td>
                                        </tr>

                                        {/* Expandable Breakdown Row */}
                                        {isExpanded && (
                                            <tr className="bg-gray-50/80 border-b border-gray-200">
                                                <td colSpan={9} className="px-6 py-3">
                                                    <div className="bg-white rounded-xl p-3 border border-gray-200 shadow-xs">
                                                        <div className="flex items-center justify-between pb-2 mb-2 border-b border-gray-100">
                                                            <div className="flex items-center gap-2">
                                                                <Layers size={14} className="text-emerald-600" />
                                                                <span className="font-bold text-gray-800 text-xs uppercase tracking-wider">
                                                                    Vouchers Affecting {acc.name} ({acc.vouchers.length})
                                                                </span>
                                                            </div>
                                                            <span className="text-[11px] text-gray-500 font-medium">
                                                                Breakdown of Debits & Credits from import file
                                                            </span>
                                                        </div>

                                                        <div className="max-h-48 overflow-auto">
                                                            <table className="w-full text-xs">
                                                                <thead className="bg-gray-50 text-gray-500 sticky top-0">
                                                                    <tr>
                                                                        <th className="px-2 py-1.5 text-left">Date</th>
                                                                        <th className="px-2 py-1.5 text-left">Type</th>
                                                                        <th className="px-2 py-1.5 text-left">Voucher No</th>
                                                                        <th className="px-2 py-1.5 text-center">Entry</th>
                                                                        <th className="px-2 py-1.5 text-right">Amount (₹)</th>
                                                                        <th className="px-2 py-1.5 text-left">Narration</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody className="divide-y divide-gray-100">
                                                                    {acc.vouchers.map((vch, vIdx) => (
                                                                        <tr key={vIdx} className="hover:bg-gray-50/50">
                                                                            <td className="px-2 py-1 font-mono text-gray-600">{vch.date || '-'}</td>
                                                                            <td className="px-2 py-1 font-semibold text-gray-800">{vch.type}</td>
                                                                            <td className="px-2 py-1 font-mono text-gray-600">{vch.voucherNo}</td>
                                                                            <td className="px-2 py-1 text-center">
                                                                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                                                                    vch.entryType === 'Debit'
                                                                                        ? 'bg-blue-100 text-blue-800'
                                                                                        : 'bg-amber-100 text-amber-800'
                                                                                }`}>
                                                                                    {vch.entryType}
                                                                                </span>
                                                                            </td>
                                                                            <td className={`px-2 py-1 text-right font-mono font-bold ${
                                                                                vch.entryType === 'Debit' ? 'text-blue-700' : 'text-amber-700'
                                                                            }`}>
                                                                                ₹ {formatCurrency(vch.amount)}
                                                                            </td>
                                                                            <td className="px-2 py-1 text-gray-500 max-w-xs truncate" title={vch.narration}>
                                                                                {vch.narration || '-'}
                                                                            </td>
                                                                        </tr>
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                );
                            })}

                            {sortedAccounts.length === 0 && (
                                <tr>
                                    <td colSpan={9} className="text-center py-12 text-gray-400">
                                        <div className="flex flex-col items-center justify-center gap-2">
                                            <AlertCircle size={32} className="text-gray-300" />
                                            <p className="font-bold text-gray-500 text-sm">No accounts found</p>
                                            <p className="text-xs text-gray-400">
                                                {searchQuery ? `No accounts match "${searchQuery}"` : 'No accounts were affected by transactions'}
                                            </p>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

            </div>
        </div>
    );
}
