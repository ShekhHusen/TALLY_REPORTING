import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { db } from '../firebase';
import { collectionGroup, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { X, Plus, Trash2, Search, Download, ChevronLeft, ChevronRight, ArrowUpDown, Scale, AlertTriangle, CheckCircle2, ChevronDown } from 'lucide-react';
import * as XLSX from 'xlsx';

const PAGE_SIZE = 25;

export default function FYBalanceComparisonModal({ isOpen, onClose, allAccounts, fyOptions }) {
    // --- State ---
    const [selectedFYs, setSelectedFYs] = useState([]);
    const [fyBalancesMap, setFyBalancesMap] = useState({});
    const [loading, setLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterType, setFilterType] = useState('all');
    const [sortField, setSortField] = useState('name');
    const [sortDir, setSortDir] = useState('asc');
    const [currentPage, setCurrentPage] = useState(1);
    const [expandedCards, setExpandedCards] = useState({});

    // Initialize with last 2 FYs on mount / when fyOptions change
    useEffect(() => {
        if (!isOpen || selectedFYs.length > 0) return;
        if (fyOptions.length >= 2) {
            setSelectedFYs([fyOptions[fyOptions.length - 2].id, fyOptions[fyOptions.length - 1].id]);
        } else if (fyOptions.length === 1) {
            setSelectedFYs([fyOptions[0].id]);
        }
    }, [isOpen, fyOptions]);

    // Reset on close
    useEffect(() => {
        if (!isOpen) {
            setSearchQuery('');
            setFilterType('all');
            setCurrentPage(1);
            setExpandedCards({});
        }
    }, [isOpen]);

    // --- FY Handlers ---
    const handleAddFY = () => {
        const availableFYs = fyOptions.filter(fy => !selectedFYs.includes(fy.id));
        if (availableFYs.length > 0) {
            setSelectedFYs(prev => [...prev, availableFYs[0].id]);
        }
    };

    const handleRemoveFY = (index) => {
        if (selectedFYs.length <= 2) return;
        setSelectedFYs(prev => prev.filter((_, i) => i !== index));
    };

    const handleChangeFY = (index, newFyId) => {
        setSelectedFYs(prev => prev.map((fy, i) => i === index ? newFyId : fy));
    };

    const getFYName = (fyId) => {
        const fy = fyOptions.find(f => f.id === fyId);
        return fy ? fy.name : fyId;
    };

    // --- Data Fetching ---
    useEffect(() => {
        if (!isOpen || selectedFYs.length < 2) return;

        const fetchAllFYs = async () => {
            setLoading(true);
            try {
                // Build logical account ID mapping
                const accountDocIdToLogicalId = {};
                allAccounts.forEach(acc => {
                    const ids = acc.allDocIds && acc.allDocIds.length > 0 ? acc.allDocIds : [acc.id];
                    ids.forEach(id => { accountDocIdToLogicalId[id] = acc.id; });
                });

                // Try collectionGroup queries first for all selected FYs in parallel
                let newBalancesMap = {};
                let useFallback = false;

                try {
                    const snapshots = await Promise.all(
                        selectedFYs.map(fyId =>
                            getDocs(query(collectionGroup(db, 'fiscalYears'), where('fyId', '==', fyId)))
                        )
                    );

                    selectedFYs.forEach((fyId, index) => {
                        const bal = {};
                        snapshots[index].forEach(docSnap => {
                            const parentId = docSnap.ref.parent?.parent?.id;
                            const logicalId = parentId ? accountDocIdToLogicalId[parentId] : null;
                            if (logicalId && !bal[logicalId]) bal[logicalId] = docSnap.data();
                        });
                        newBalancesMap[fyId] = bal;
                    });
                } catch (indexErr) {
                    console.warn("collectionGroup query failed, using fallback chunked reads:", indexErr);
                    useFallback = true;
                }

                // Fallback: chunk reads per account
                if (useFallback) {
                    newBalancesMap = {};
                    selectedFYs.forEach(fyId => { newBalancesMap[fyId] = {}; });

                    const chunkSize = 100;
                    for (let i = 0; i < allAccounts.length; i += chunkSize) {
                        const chunk = allAccounts.slice(i, i + chunkSize);
                        const promises = chunk.map(async (acc) => {
                            const ids = acc.allDocIds && acc.allDocIds.length > 0 ? acc.allDocIds : [acc.id];
                            for (const fyId of selectedFYs) {
                                for (const docId of ids) {
                                    try {
                                        const fyDoc = await getDoc(doc(db, 'accounts', docId, 'fiscalYears', fyId));
                                        if (fyDoc.exists()) {
                                            newBalancesMap[fyId][acc.id] = fyDoc.data();
                                            break;
                                        }
                                    } catch (e) { /* skip */ }
                                }
                            }
                        });
                        await Promise.all(promises);
                    }
                }

                setFyBalancesMap(newBalancesMap);
            } catch (err) {
                console.error("Error fetching FY comparison data:", err);
            } finally {
                setLoading(false);
            }
        };

        fetchAllFYs();
    }, [isOpen, selectedFYs, allAccounts]);

    // --- Comparison Logic ---
    const comparisonData = useMemo(() => {
        if (selectedFYs.length < 2 || Object.keys(fyBalancesMap).length === 0) return [];

        const uniqueAccountIds = new Set();
        selectedFYs.forEach(fyId => {
            Object.keys(fyBalancesMap[fyId] || {}).forEach(id => uniqueAccountIds.add(id));
        });

        return Array.from(uniqueAccountIds).map(accId => {
            const acc = allAccounts.find(a => a.id === accId);

            // Per-FY data
            const fyData = {};
            selectedFYs.forEach(fyId => {
                const data = (fyBalancesMap[fyId] || {})[accId] || {};
                fyData[fyId] = {
                    opening: data.openingBalance || 0,
                    openingType: data.openingBalanceType || '',
                    totalDebit: data.totalDebit || 0,
                    totalCredit: data.totalCredit || 0,
                    closing: data.closingBalance || 0,
                    closingType: data.closingBalanceType || '',
                    exists: !!(fyBalancesMap[fyId] || {})[accId],
                };
            });

            // Continuity checks between consecutive FY pairs
            const continuityChecks = [];
            for (let i = 0; i < selectedFYs.length - 1; i++) {
                const prevFY = fyData[selectedFYs[i]];
                const nextFY = fyData[selectedFYs[i + 1]];

                // Signed comparison: Dr positive, Cr negative
                const closingSigned = (prevFY.closingType === 'Cr' ? -1 : 1) * prevFY.closing;
                const openingSigned = (nextFY.openingType === 'Cr' ? -1 : 1) * nextFY.opening;
                const diff = closingSigned - openingSigned;

                continuityChecks.push({
                    prevFyId: selectedFYs[i],
                    nextFyId: selectedFYs[i + 1],
                    diff: Math.abs(diff),
                    diffType: diff > 0 ? 'Dr' : (diff < 0 ? 'Cr' : ''),
                    hasMismatch: Math.abs(diff) > 0.01,
                });
            }

            const hasMismatch = continuityChecks.some(c => c.hasMismatch);
            const existsInAll = selectedFYs.every(fyId => fyData[fyId].exists);

            return {
                accId,
                name: acc?.name || 'Unknown',
                group: acc?.group || '',
                fyData,
                continuityChecks,
                hasMismatch,
                existsInAll,
                missingInFYs: selectedFYs.filter(fyId => !fyData[fyId].exists),
            };
        });
    }, [fyBalancesMap, selectedFYs, allAccounts]);

    // --- Summary KPIs ---
    const summary = useMemo(() => {
        const totalAccounts = comparisonData.length;
        const mismatchCount = comparisonData.filter(d => d.hasMismatch).length;
        const matchedCount = totalAccounts - mismatchCount;
        const totalMismatchAmount = comparisonData
            .filter(d => d.hasMismatch)
            .reduce((sum, d) => sum + d.continuityChecks.reduce((s, c) => s + c.diff, 0), 0);
        const partialCount = comparisonData.filter(d => !d.existsInAll).length;

        return { totalAccounts, mismatchCount, matchedCount, totalMismatchAmount, partialCount };
    }, [comparisonData]);

    // --- Filtering, Searching, Sorting ---
    const filteredData = useMemo(() => {
        let data = comparisonData;

        // Search
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            data = data.filter(d =>
                d.name.toLowerCase().includes(q) || d.group.toLowerCase().includes(q)
            );
        }

        // Filter
        if (filterType === 'mismatch') data = data.filter(d => d.hasMismatch);
        else if (filterType === 'matched') data = data.filter(d => !d.hasMismatch);
        else if (filterType === 'partial') data = data.filter(d => !d.existsInAll);

        // Sort
        data = [...data].sort((a, b) => {
            let valA, valB;
            if (sortField === 'name') {
                valA = a.name.toLowerCase();
                valB = b.name.toLowerCase();
            } else if (sortField === 'group') {
                valA = a.group.toLowerCase();
                valB = b.group.toLowerCase();
            } else if (sortField === 'mismatch') {
                valA = a.hasMismatch ? 1 : 0;
                valB = b.hasMismatch ? 1 : 0;
            } else {
                valA = a.name.toLowerCase();
                valB = b.name.toLowerCase();
            }
            if (valA < valB) return sortDir === 'asc' ? -1 : 1;
            if (valA > valB) return sortDir === 'asc' ? 1 : -1;
            return 0;
        });

        return data;
    }, [comparisonData, searchQuery, filterType, sortField, sortDir]);

    // --- Pagination ---
    const totalPages = Math.ceil(filteredData.length / PAGE_SIZE);
    const paginatedData = filteredData.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

    useEffect(() => { setCurrentPage(1); }, [searchQuery, filterType, selectedFYs]);

    // --- Sort handler ---
    const handleSort = (field) => {
        if (sortField === field) {
            setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDir('asc');
        }
    };

    // --- Format helpers ---
    const formatBal = (val, type) => {
        if (!val && val !== 0) return '-';
        const formatted = Number(val).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        return type ? `${formatted} ${type}` : formatted;
    };

    const formatDrCr = (debit, credit) => {
        const dr = Number(debit || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const cr = Number(credit || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        return `${dr} / ${cr}`;
    };

    // --- Excel Export ---
    const handleExport = () => {
        if (filteredData.length === 0) return;

        const headers = ['Account Name', 'Group'];
        selectedFYs.forEach((fyId, idx) => {
            const name = getFYName(fyId);
            headers.push(`${name} Opening`, `${name} Open Type`, `${name} Debit`, `${name} Credit`, `${name} Closing`, `${name} Close Type`);
            if (idx < selectedFYs.length - 1) {
                headers.push(`Diff ${getFYName(fyId)} → ${getFYName(selectedFYs[idx + 1])}`);
                headers.push(`Diff Type`);
                headers.push(`Mismatch?`);
            }
        });

        const rows = filteredData.map(row => {
            const r = [row.name, row.group];
            selectedFYs.forEach((fyId, idx) => {
                const d = row.fyData[fyId];
                r.push(d.opening, d.openingType, d.totalDebit, d.totalCredit, d.closing, d.closingType);
                if (idx < selectedFYs.length - 1) {
                    const check = row.continuityChecks[idx];
                    r.push(check.diff, check.diffType, check.hasMismatch ? 'YES' : 'NO');
                }
            });
            return r;
        });

        const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'FY Comparison');
        XLSX.writeFile(wb, `FY_Balance_Comparison_${new Date().toISOString().slice(0, 10)}.xlsx`);
    };

    // --- Mobile card toggle ---
    const toggleCard = (accId) => {
        setExpandedCards(prev => ({ ...prev, [accId]: !prev[accId] }));
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4">
            <div className="bg-white w-full h-full sm:max-w-[95vw] sm:max-h-[92vh] sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">

                {/* === Header === */}
                <div className="flex items-center justify-between px-4 sm:px-5 py-3 sm:py-4 border-b border-gray-100 bg-gradient-to-r from-indigo-50 to-purple-50 shrink-0">
                    <div className="flex items-center gap-2 sm:gap-3">
                        <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-indigo-100 flex items-center justify-center">
                            <Scale className="w-5 h-5 text-indigo-600" />
                        </div>
                        <div>
                            <h2 className="text-base sm:text-lg font-extrabold text-gray-900 tracking-tight">FY Balance Comparison</h2>
                            <p className="text-[11px] sm:text-xs text-gray-500">Continuity check: Previous FY Closing = Next FY Opening</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-200/70 rounded-xl transition-colors text-gray-500 hover:text-gray-800 cursor-pointer">
                        <X size={22} />
                    </button>
                </div>

                {/* === FY Selectors === */}
                <div className="flex flex-wrap items-center gap-2 sm:gap-3 px-4 sm:px-5 py-3 border-b border-gray-100 bg-white shrink-0">
                    {selectedFYs.map((fyId, idx) => (
                        <div key={idx} className="flex items-center gap-1">
                            <select
                                value={fyId}
                                onChange={(e) => handleChangeFY(idx, e.target.value)}
                                className="px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs sm:text-sm font-bold bg-blue-50 text-blue-700 cursor-pointer hover:bg-blue-100 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                                {fyOptions.map(fy => (
                                    <option key={fy.id} value={fy.id} disabled={selectedFYs.includes(fy.id) && fy.id !== fyId}>
                                        {fy.name}
                                    </option>
                                ))}
                            </select>
                            {selectedFYs.length > 2 && (
                                <button
                                    onClick={() => handleRemoveFY(idx)}
                                    className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                                    title="Remove FY"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                </button>
                            )}
                            {idx < selectedFYs.length - 1 && (
                                <span className="text-gray-300 text-xs font-bold mx-1">→</span>
                            )}
                        </div>
                    ))}

                    {/* Add FY Button */}
                    {fyOptions.filter(fy => !selectedFYs.includes(fy.id)).length > 0 && (
                        <button
                            onClick={handleAddFY}
                            className="flex items-center gap-1 px-3 py-1.5 bg-indigo-50 border border-indigo-200 rounded-lg text-xs sm:text-sm font-bold text-indigo-700 hover:bg-indigo-100 transition-colors cursor-pointer"
                        >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Add FY</span>
                        </button>
                    )}
                </div>

                {/* === Summary KPIs === */}
                {!loading && comparisonData.length > 0 && (
                    <div className="flex flex-wrap gap-2 sm:gap-3 px-4 sm:px-5 py-3 border-b border-gray-100 bg-gray-50/50 shrink-0">
                        <div className="flex items-center gap-2 px-3 py-2 bg-white rounded-xl border border-gray-100 shadow-xs">
                            <span className="text-[11px] text-gray-500 font-medium">Total</span>
                            <span className="text-sm font-extrabold text-gray-900">{summary.totalAccounts}</span>
                        </div>
                        <div className="flex items-center gap-2 px-3 py-2 bg-green-50 rounded-xl border border-green-100 shadow-xs">
                            <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                            <span className="text-[11px] text-green-700 font-medium">Matched</span>
                            <span className="text-sm font-extrabold text-green-700">{summary.matchedCount}</span>
                        </div>
                        <div className="flex items-center gap-2 px-3 py-2 bg-red-50 rounded-xl border border-red-100 shadow-xs">
                            <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                            <span className="text-[11px] text-red-700 font-medium">Mismatch</span>
                            <span className="text-sm font-extrabold text-red-700">{summary.mismatchCount}</span>
                        </div>
                        {summary.partialCount > 0 && (
                            <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 rounded-xl border border-amber-100 shadow-xs">
                                <span className="text-[11px] text-amber-700 font-medium">Partial</span>
                                <span className="text-sm font-extrabold text-amber-700">{summary.partialCount}</span>
                            </div>
                        )}
                        {summary.totalMismatchAmount > 0 && (
                            <div className="flex items-center gap-2 px-3 py-2 bg-red-50 rounded-xl border border-red-100 shadow-xs">
                                <span className="text-[11px] text-red-700 font-medium">Total Diff</span>
                                <span className="text-sm font-extrabold text-red-700">
                                    ₹{summary.totalMismatchAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                </span>
                            </div>
                        )}
                    </div>
                )}

                {/* === Toolbar: Search, Filter, Export === */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 px-4 sm:px-5 py-2.5 border-b border-gray-100 bg-white shrink-0">
                    {/* Search */}
                    <div className="relative flex-1 min-w-0">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Search account name or group..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-gray-50"
                        />
                    </div>

                    <div className="flex items-center gap-2">
                        {/* Filter */}
                        <select
                            value={filterType}
                            onChange={(e) => setFilterType(e.target.value)}
                            className="px-3 py-2 border border-gray-200 rounded-lg text-xs sm:text-sm font-bold bg-white cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                            <option value="all">All ({summary.totalAccounts})</option>
                            <option value="mismatch">⚠ Mismatch ({summary.mismatchCount})</option>
                            <option value="matched">✓ Matched ({summary.matchedCount})</option>
                            <option value="partial">◐ Partial ({summary.partialCount})</option>
                        </select>

                        {/* Export */}
                        <button
                            onClick={handleExport}
                            disabled={filteredData.length === 0}
                            className="flex items-center gap-1.5 px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-xs sm:text-sm font-bold text-green-700 hover:bg-green-100 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <Download className="w-4 h-4" />
                            <span className="hidden sm:inline">Export Excel</span>
                        </button>
                    </div>
                </div>

                {/* === Content Area === */}
                <div className="flex-1 overflow-auto bg-gray-50/30">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center h-64 gap-3">
                            <div className="w-8 h-8 border-3 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
                            <span className="text-sm text-gray-500 font-medium">Loading FY data...</span>
                        </div>
                    ) : comparisonData.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-64 gap-2">
                            <Scale className="w-12 h-12 text-gray-300" />
                            <p className="text-sm text-gray-500">Select at least 2 fiscal years to compare</p>
                        </div>
                    ) : filteredData.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-64 gap-2">
                            <Search className="w-12 h-12 text-gray-300" />
                            <p className="text-sm text-gray-500">No accounts match your search/filter</p>
                        </div>
                    ) : (
                        <>
                            {/* Desktop Table */}
                            <div className="hidden md:block overflow-x-auto">
                                <table className="w-full text-xs border-collapse min-w-max">
                                    <thead className="sticky top-0 z-10">
                                        {/* First header row: FY group headers */}
                                        <tr className="bg-gray-100">
                                            <th rowSpan={2} className="px-3 py-2.5 text-left font-extrabold text-gray-700 border-b border-gray-200 sticky left-0 bg-gray-100 z-20 min-w-[180px]">
                                                <button onClick={() => handleSort('name')} className="flex items-center gap-1 cursor-pointer hover:text-indigo-600">
                                                    Account
                                                    <ArrowUpDown className="w-3 h-3" />
                                                </button>
                                            </th>
                                            {selectedFYs.map((fyId, idx) => (
                                                <React.Fragment key={fyId}>
                                                    <th colSpan={4} className="px-2 py-2 text-center font-extrabold text-indigo-700 bg-indigo-50/80 border-b border-gray-200 border-l border-indigo-100">
                                                        {getFYName(fyId)}
                                                    </th>
                                                    {idx < selectedFYs.length - 1 && (
                                                        <th rowSpan={2} className="px-2 py-2 text-center font-extrabold text-gray-500 bg-amber-50/60 border-b border-gray-200 border-l border-amber-100 min-w-[90px]">
                                                            <span className="text-[10px] block text-amber-600">DIFF</span>
                                                            <span className="text-[9px] block text-gray-400">{getFYName(fyId)} → {getFYName(selectedFYs[idx + 1])}</span>
                                                        </th>
                                                    )}
                                                </React.Fragment>
                                            ))}
                                        </tr>
                                        {/* Second header row: sub-columns per FY */}
                                        <tr className="bg-gray-50">
                                            {selectedFYs.map((fyId, idx) => (
                                                <React.Fragment key={`sub-${fyId}`}>
                                                    <th className="px-2 py-1.5 text-center font-bold text-gray-600 border-b border-gray-200 border-l border-gray-100 whitespace-nowrap">Opening</th>
                                                    <th className="px-2 py-1.5 text-center font-bold text-gray-600 border-b border-gray-200 whitespace-nowrap">Dr / Cr</th>
                                                    <th className="px-2 py-1.5 text-center font-bold text-gray-600 border-b border-gray-200 whitespace-nowrap">Closing</th>
                                                    <th className="px-2 py-1.5 text-center font-bold text-gray-600 border-b border-gray-200 whitespace-nowrap">Type</th>
                                                </React.Fragment>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {paginatedData.map((row, rowIdx) => (
                                            <tr
                                                key={row.accId}
                                                className={`border-b border-gray-100 transition-colors ${
                                                    row.hasMismatch ? 'bg-red-50/40 hover:bg-red-50/70' : 'hover:bg-gray-50'
                                                } ${rowIdx % 2 === 0 ? '' : 'bg-gray-50/30'}`}
                                            >
                                                {/* Account Name */}
                                                <td className="px-3 py-2 sticky left-0 bg-inherit z-10 border-r border-gray-100">
                                                    <div className="flex items-center gap-1.5">
                                                        {row.hasMismatch && <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />}
                                                        <div>
                                                            <div className="font-bold text-gray-900 text-xs leading-tight">{row.name}</div>
                                                            <div className="text-[10px] text-gray-400 leading-tight">{row.group}</div>
                                                        </div>
                                                    </div>
                                                </td>

                                                {/* Per-FY columns */}
                                                {selectedFYs.map((fyId, idx) => {
                                                    const d = row.fyData[fyId];
                                                    return (
                                                        <React.Fragment key={`data-${fyId}`}>
                                                            <td className={`px-2 py-2 text-right font-mono text-[11px] border-l ${!d.exists ? 'text-gray-300 italic' : 'text-gray-700'}`}>
                                                                {d.exists ? formatBal(d.opening, '') : '-'}
                                                            </td>
                                                            <td className={`px-2 py-2 text-right font-mono text-[11px] ${!d.exists ? 'text-gray-300 italic' : 'text-gray-600'}`}>
                                                                {d.exists ? formatDrCr(d.totalDebit, d.totalCredit) : '-'}
                                                            </td>
                                                            <td className={`px-2 py-2 text-right font-mono text-[11px] ${!d.exists ? 'text-gray-300 italic' : 'text-gray-700 font-bold'}`}>
                                                                {d.exists ? formatBal(d.closing, '') : '-'}
                                                            </td>
                                                            <td className={`px-2 py-2 text-center text-[11px] font-bold ${
                                                                d.closingType === 'Dr' ? 'text-blue-600' : d.closingType === 'Cr' ? 'text-orange-600' : 'text-gray-400'
                                                            }`}>
                                                                {d.exists ? (d.closingType || '-') : '-'}
                                                            </td>

                                                            {/* Diff column between consecutive FYs */}
                                                            {idx < selectedFYs.length - 1 && (() => {
                                                                const check = row.continuityChecks[idx];
                                                                return (
                                                                    <td className={`px-2 py-2 text-center border-l font-mono text-[11px] font-bold ${
                                                                        check.hasMismatch
                                                                            ? 'bg-red-50 text-red-700'
                                                                            : 'bg-green-50/50 text-green-700'
                                                                    }`}>
                                                                        {check.hasMismatch ? (
                                                                            <div>
                                                                                <span className="text-red-600">⚠ </span>
                                                                                {formatBal(check.diff, '')}
                                                                                {check.diffType && <span className="text-[9px] ml-0.5 text-red-500">{check.diffType}</span>}
                                                                            </div>
                                                                        ) : (
                                                                            <span className="text-green-600">✓</span>
                                                                        )}
                                                                    </td>
                                                                );
                                                            })()}
                                                        </React.Fragment>
                                                    );
                                                })}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Mobile Card View */}
                            <div className="md:hidden px-3 py-2 space-y-2">
                                {paginatedData.map(row => (
                                    <div
                                        key={row.accId}
                                        className={`rounded-xl border overflow-hidden ${
                                            row.hasMismatch ? 'border-red-200 bg-red-50/30' : 'border-gray-200 bg-white'
                                        }`}
                                    >
                                        {/* Card Header */}
                                        <button
                                            onClick={() => toggleCard(row.accId)}
                                            className="w-full flex items-center justify-between px-3 py-2.5 cursor-pointer"
                                        >
                                            <div className="flex items-center gap-2 min-w-0">
                                                {row.hasMismatch && <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />}
                                                {!row.hasMismatch && <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />}
                                                <div className="text-left min-w-0">
                                                    <div className="font-bold text-sm text-gray-900 truncate">{row.name}</div>
                                                    <div className="text-[10px] text-gray-400">{row.group}</div>
                                                </div>
                                            </div>
                                            <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${expandedCards[row.accId] ? 'rotate-180' : ''}`} />
                                        </button>

                                        {/* Card Body */}
                                        {expandedCards[row.accId] && (
                                            <div className="px-3 pb-3 space-y-2 border-t border-gray-100">
                                                {selectedFYs.map((fyId, idx) => {
                                                    const d = row.fyData[fyId];
                                                    return (
                                                        <React.Fragment key={fyId}>
                                                            <div className="mt-2">
                                                                <div className="text-[11px] font-extrabold text-indigo-700 mb-1">{getFYName(fyId)}</div>
                                                                {d.exists ? (
                                                                    <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[11px]">
                                                                        <div className="text-gray-500">Opening</div>
                                                                        <div className="text-right font-mono font-bold">{formatBal(d.opening, d.openingType)}</div>
                                                                        <div className="text-gray-500">Debit / Credit</div>
                                                                        <div className="text-right font-mono">{formatDrCr(d.totalDebit, d.totalCredit)}</div>
                                                                        <div className="text-gray-500">Closing</div>
                                                                        <div className="text-right font-mono font-bold">{formatBal(d.closing, d.closingType)}</div>
                                                                    </div>
                                                                ) : (
                                                                    <div className="text-[11px] text-gray-400 italic">Not present in this FY</div>
                                                                )}
                                                            </div>

                                                            {/* Diff badge between FYs */}
                                                            {idx < selectedFYs.length - 1 && (() => {
                                                                const check = row.continuityChecks[idx];
                                                                return (
                                                                    <div className={`flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[11px] font-bold ${
                                                                        check.hasMismatch ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                                                                    }`}>
                                                                        {check.hasMismatch ? (
                                                                            <>
                                                                                <AlertTriangle className="w-3 h-3" />
                                                                                <span>Diff: {formatBal(check.diff, check.diffType)}</span>
                                                                            </>
                                                                        ) : (
                                                                            <>
                                                                                <CheckCircle2 className="w-3 h-3" />
                                                                                <span>Matched ✓</span>
                                                                            </>
                                                                        )}
                                                                    </div>
                                                                );
                                                            })()}
                                                        </React.Fragment>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </div>

                {/* === Pagination Footer === */}
                {filteredData.length > PAGE_SIZE && (
                    <div className="flex items-center justify-between px-4 sm:px-5 py-2.5 border-t border-gray-100 bg-white shrink-0">
                        <span className="text-xs text-gray-500">
                            Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filteredData.length)} of {filteredData.length}
                        </span>
                        <div className="flex items-center gap-1.5">
                            <button
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
                                className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
                            >
                                <ChevronLeft className="w-4 h-4" />
                            </button>
                            <span className="text-xs font-bold text-gray-700 px-2">
                                {currentPage} / {totalPages}
                            </span>
                            <button
                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                disabled={currentPage === totalPages}
                                className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
                            >
                                <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
