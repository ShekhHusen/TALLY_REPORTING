import React, { useState, useMemo } from 'react';
import { 
    Clock, 
    Calendar, 
    CheckCircle2, 
    Filter,
    ShieldCheck,
    AlertCircle
} from 'lucide-react';

const formatCurrency = (num) => {
    const formatted = new Intl.NumberFormat('en-IN', { 
        minimumFractionDigits: 2, 
        maximumFractionDigits: 2 
    }).format(Math.abs(num) || 0);
    return `Rs. ${num < 0 ? '-' : ''}${formatted}`;
};

export default function AccountAgingView({ 
    agingResult, 
    accountName, 
    asOfDate, 
    setAsOfDate 
}) {
    const [selectedSlabFilter, setSelectedSlabFilter] = useState('ALL');
    const [searchQuery, setSearchQuery] = useState('');

    const { summary, buckets = [], unpaidVouchers = [], isCreditor, reconciliation } = agingResult || {};

    // Filter unpaid vouchers by selected slab and search query
    const filteredVouchers = useMemo(() => {
        return unpaidVouchers.filter(v => {
            if (selectedSlabFilter !== 'ALL' && v.slabId !== selectedSlabFilter) {
                return false;
            }
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase();
                const matchVch = (v.voucherNo || '').toLowerCase().includes(q);
                const matchType = (v.type || '').toLowerCase().includes(q);
                const matchPart = (v.particulars || '').toLowerCase().includes(q);
                const matchNarration = (v.narration || '').toLowerCase().includes(q);
                if (!matchVch && !matchType && !matchPart && !matchNarration) {
                    return false;
                }
            }
            return true;
        });
    }, [unpaidVouchers, selectedSlabFilter, searchQuery]);

    const totalFilteredPending = useMemo(() => {
        return filteredVouchers.reduce((sum, v) => sum + v.pendingAmount, 0);
    }, [filteredVouchers]);

    return (
        <div className="flex flex-col h-full bg-slate-50/50">
            {/* Top Control Bar: Cutoff Date, Cross-Reconciliation & Slab Filter Pills */}
            <div className="p-2.5 sm:px-5 sm:py-2 bg-white border-b border-slate-200/80 shrink-0 flex flex-wrap items-center justify-between gap-2.5">
                <div className="flex flex-wrap items-center gap-2">
                    {/* As of Date picker */}
                    <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1 rounded-md border border-slate-200 text-xs font-medium text-slate-700">
                        <Calendar className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                        <span className="text-slate-500 font-semibold uppercase text-[10px]">As Of:</span>
                        <input
                            type="date"
                            value={asOfDate}
                            onChange={(e) => setAsOfDate && setAsOfDate(e.target.value)}
                            className="bg-transparent font-semibold text-slate-800 focus:outline-none cursor-pointer text-xs"
                        />
                    </div>

                    

                    {/* Search box within aging vouchers */}
                    <div className="relative">
                        <input
                            type="text"
                            placeholder="Search vouchers..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-32 sm:w-44 px-2.5 py-1 text-xs bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500 font-normal placeholder-slate-400"
                        />
                        {searchQuery && (
                            <button
                                onClick={() => setSearchQuery('')}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-semibold"
                            >
                                ×
                            </button>
                        )}
                    </div>
                </div>

                {/* Slabs Filter Pills */}
                <div className="flex items-center gap-1 flex-wrap">
                    <span className="text-[10px] font-semibold text-slate-400 uppercase flex items-center gap-1 mr-0.5">
                        <Filter className="w-3 h-3 text-slate-400" /> Filter:
                    </span>
                    <button
                        type="button"
                        onClick={() => setSelectedSlabFilter('ALL')}
                        className={`px-2 py-0.5 rounded text-xs font-semibold transition-all cursor-pointer ${
                            selectedSlabFilter === 'ALL'
                                ? 'bg-indigo-600 text-white shadow-2xs'
                                : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                        }`}
                    >
                        All ({unpaidVouchers.length})
                    </button>
                    {buckets.map(slab => (
                        <button
                            key={slab.id}
                            type="button"
                            onClick={() => setSelectedSlabFilter(slab.id)}
                            className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold transition-all cursor-pointer border ${
                                selectedSlabFilter === slab.id
                                    ? `${slab.badgeClass} ring-1 ring-indigo-400/50 shadow-2xs`
                                    : 'bg-white border-slate-200/80 text-slate-600 hover:bg-slate-50'
                            }`}
                        >
                            <span>{slab.label}</span>
                            <span className="text-[10px] opacity-75">({slab.count})</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Table Area: Unpaid Invoices */}
            <div className="flex-1 overflow-auto bg-white">
                <div className="overflow-x-auto min-w-full">
                    <table className="min-w-full divide-y divide-gray-200 text-xs sm:text-sm border-collapse">
                        <thead className="bg-slate-50 sticky top-0 z-10 border-b border-slate-200">
                            <tr>
                                <th className="w-8 px-2.5 py-2 text-center text-[10px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                                    #
                                </th>
                                <th className="px-3 py-2 text-left text-[10px] font-semibold text-slate-600 uppercase tracking-wider whitespace-nowrap">
                                    DATE
                                </th>
                                <th className="px-3 py-2 text-left text-[10px] font-semibold text-slate-600 uppercase tracking-wider whitespace-nowrap">
                                    VOUCHER NO
                                </th>
                                <th className="px-3 py-2 text-left text-[10px] font-semibold text-slate-600 uppercase tracking-wider whitespace-nowrap">
                                    TYPE
                                </th>
                                <th className="px-3 py-2 text-left text-[10px] font-semibold text-slate-600 uppercase tracking-wider whitespace-nowrap">
                                    PARTICULARS / NARRATION
                                </th>
                                <th className="px-3 py-2 text-right text-[10px] font-semibold text-slate-600 uppercase tracking-wider whitespace-nowrap">
                                    ORIGINAL AMT
                                </th>
                                <th className="px-3 py-2 text-right text-[10px] font-semibold text-slate-600 uppercase tracking-wider whitespace-nowrap">
                                    SETTLED
                                </th>
                                <th className="px-3 py-2 text-right text-[10px] font-semibold text-slate-600 uppercase tracking-wider whitespace-nowrap">
                                    PENDING DUE
                                </th>
                                <th className="px-3 py-2 text-center text-[10px] font-semibold text-slate-600 uppercase tracking-wider whitespace-nowrap">
                                    AGE
                                </th>
                                <th className="px-3 py-2 text-center text-[10px] font-semibold text-slate-600 uppercase tracking-wider whitespace-nowrap">
                                    SLAB
                                </th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-100">
                            {filteredVouchers.length === 0 ? (
                                <tr>
                                    <td colSpan={10} className="px-4 py-12 text-center text-slate-500">
                                        <div className="flex flex-col items-center justify-center gap-1.5 max-w-sm mx-auto">
                                            <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600">
                                                <CheckCircle2 className="w-5 h-5" />
                                            </div>
                                            <span className="text-sm font-bold text-slate-800">
                                                {reconciliation?.hasAdvance 
                                                    ? 'Account Has Advance Credit Balance'
                                                    : (unpaidVouchers.length === 0 ? 'No Pending Due Balances!' : 'No Vouchers Match Filter')}
                                            </span>
                                            <p className="text-xs text-slate-400 text-center">
                                                {reconciliation?.hasAdvance 
                                                    ? `${accountName || 'This account'} has an advance credit of ${formatCurrency(reconciliation.advanceAmount)} Cr. There are no unpaid overdue invoices.`
                                                    : (unpaidVouchers.length === 0 
                                                        ? `All invoices for ${accountName || 'this account'} have been fully cleared and settled.`
                                                        : 'Try resetting the slab filter or search query.')}
                                            </p>
                                            {selectedSlabFilter !== 'ALL' && (
                                                <button
                                                    onClick={() => setSelectedSlabFilter('ALL')}
                                                    className="mt-1.5 px-2.5 py-1 bg-indigo-50 text-indigo-700 text-xs font-semibold rounded-md hover:bg-indigo-100 cursor-pointer"
                                                >
                                                    Show All Slabs
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                filteredVouchers.map((vch, idx) => (
                                    <tr 
                                        key={vch.id || idx}
                                        className="hover:bg-slate-50/80 transition-colors text-slate-700"
                                    >
                                        <td className="px-2.5 py-2 text-center text-xs text-slate-400">
                                            {idx + 1}
                                        </td>
                                        <td className="px-3 py-2 whitespace-nowrap text-xs font-normal text-slate-600">
                                            {vch.date}
                                        </td>
                                        <td className="px-3 py-2 whitespace-nowrap text-xs font-semibold text-slate-800">
                                            {vch.voucherNo}
                                        </td>
                                        <td className="px-3 py-2 whitespace-nowrap text-xs">
                                            <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                                                {vch.type}
                                            </span>
                                        </td>
                                        <td className="px-3 py-2 text-xs max-w-xs truncate" title={vch.narration ? `${vch.particulars} | ${vch.narration}` : vch.particulars}>
                                            <span className="font-medium text-slate-800">{vch.particulars}</span>
                                            {vch.narration && (
                                                <span className="text-[10px] text-slate-400 block truncate font-normal">
                                                    {vch.narration}
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-3 py-2 whitespace-nowrap text-right font-mono text-xs text-slate-600">
                                            {formatCurrency(vch.originalAmount)}
                                        </td>
                                        <td className="px-3 py-2 whitespace-nowrap text-right font-mono text-xs text-emerald-600 font-medium">
                                            {vch.settledAmount > 0 ? formatCurrency(vch.settledAmount) : '-'}
                                        </td>
                                        <td className="px-3 py-2 whitespace-nowrap text-right font-mono text-xs font-bold text-rose-700">
                                            {formatCurrency(vch.pendingAmount)}
                                        </td>
                                        <td className="px-3 py-2 whitespace-nowrap text-center text-xs font-semibold font-mono text-slate-700">
                                            {vch.ageDays} d
                                        </td>
                                        <td className="px-3 py-2 whitespace-nowrap text-center">
                                            <span className={`inline-block px-1.5 py-0.2 rounded-full text-[10px] font-semibold border ${vch.badgeClass}`}>
                                                {vch.slabLabel}
                                            </span>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                        {filteredVouchers.length > 0 && (
                            <tfoot className="bg-slate-50 font-semibold border-t border-slate-200 text-xs">
                                <tr>
                                    <td colSpan={5} className="px-3 py-2 text-left text-slate-600 uppercase tracking-wide text-[11px] font-bold">
                                        Total Outstanding ({filteredVouchers.length} Vouchers)
                                    </td>
                                    <td className="px-3 py-2 text-right font-mono text-xs text-slate-600 font-medium">
                                        {formatCurrency(filteredVouchers.reduce((s, v) => s + v.originalAmount, 0))}
                                    </td>
                                    <td className="px-3 py-2 text-right font-mono text-xs text-emerald-600 font-medium">
                                        {formatCurrency(filteredVouchers.reduce((s, v) => s + v.settledAmount, 0))}
                                    </td>
                                    <td className="px-3 py-2 text-right font-mono text-xs font-bold text-rose-700">
                                        {formatCurrency(totalFilteredPending)}
                                    </td>
                                    <td colSpan={2} className="px-3 py-2 text-center text-[10px] text-slate-500 font-normal">
                                        Filter: {selectedSlabFilter}
                                    </td>
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </div>
            </div>
        </div>
    );
}
