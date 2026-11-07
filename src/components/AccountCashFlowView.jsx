import React from 'react';
import { 
    TrendingUp, 
    TrendingDown, 
    ArrowDownLeft, 
    ArrowUpRight, 
    Landmark, 
    FileText, 
    Calendar, 
    DollarSign, 
    Activity, 
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

export default function AccountCashFlowView({ 
    cashFlowResult
}) {
    const { 
        summary = {}, 
        monthlyBreakdown = [], 
        channelSummary = [],
        reconciliation
    } = cashFlowResult || {};

    const netFlowIsPositive = (summary.netFlow || 0) >= 0;
    const hasOpeningBalance = summary.openingBalance !== undefined && summary.openingBalance > 0;

    return (
        <div className="flex flex-col h-full bg-slate-50/50">

            {/* Monthly Timeline Table */}
            <div className="flex-1 overflow-auto bg-white">
                <div className="overflow-x-auto min-w-full">
                    <table className="min-w-full divide-y divide-gray-200 text-xs sm:text-sm border-collapse">
                        <thead className="bg-slate-50 sticky top-0 z-10 border-b border-slate-200">
                            <tr>
                                <th className="px-3 py-2 text-left text-[10px] font-semibold text-slate-600 uppercase tracking-wider whitespace-nowrap">
                                    MONTH
                                </th>
                                <th className="px-3 py-2 text-center text-[10px] font-semibold text-slate-600 uppercase tracking-wider whitespace-nowrap">
                                    VOUCHERS
                                </th>
                                <th className="px-3 py-2 text-right text-[10px] font-semibold text-slate-600 uppercase tracking-wider whitespace-nowrap">
                                    INFLOW (CR)
                                </th>
                                <th className="px-3 py-2 text-right text-[10px] font-semibold text-slate-600 uppercase tracking-wider whitespace-nowrap">
                                    OUTFLOW (DR)
                                </th>
                                <th className="px-3 py-2 text-right text-[10px] font-semibold text-slate-600 uppercase tracking-wider whitespace-nowrap">
                                    NET FLOW
                                </th>
                                <th className="px-3 py-2 text-center text-[10px] font-semibold text-slate-600 uppercase tracking-wider whitespace-nowrap">
                                    STATUS
                                </th>
                                <th className="px-3 py-2 text-right text-[10px] font-semibold text-slate-600 uppercase tracking-wider whitespace-nowrap">
                                    RUNNING BALANCE
                                </th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-100">
                            {/* Top Row: Opening Balance */}
                            {hasOpeningBalance && (
                                <tr className="bg-indigo-50/50 hover:bg-indigo-50/80 transition-colors border-b border-indigo-100 text-slate-800 font-medium">
                                    <td className="px-3 py-2 whitespace-nowrap font-bold text-indigo-950 text-xs">
                                        <div className="flex items-center gap-1.5">
                                            <span className="w-1.5 h-1.5 rounded-full bg-indigo-600" />
                                            <span>Opening Balance</span>
                                        </div>
                                    </td>
                                    <td className="px-3 py-2 whitespace-nowrap text-center text-xs font-mono text-slate-400">
                                        -
                                    </td>
                                    <td className="px-3 py-2 whitespace-nowrap text-right font-mono text-xs font-semibold text-emerald-700">
                                        {summary.openingBalanceType === 'Cr' ? formatCurrency(summary.openingBalance) : '-'}
                                    </td>
                                    <td className="px-3 py-2 whitespace-nowrap text-right font-mono text-xs font-semibold text-rose-700">
                                        {summary.openingBalanceType !== 'Cr' ? formatCurrency(summary.openingBalance) : '-'}
                                    </td>
                                    <td className="px-3 py-2 whitespace-nowrap text-right font-mono text-xs text-slate-400">
                                        -
                                    </td>
                                    <td className="px-3 py-2 whitespace-nowrap text-center">
                                        <span className="inline-flex items-center px-1.5 py-0.2 rounded-full text-[10px] font-semibold bg-indigo-100 text-indigo-800 border border-indigo-200">
                                            Opening
                                        </span>
                                    </td>
                                    <td className="px-3 py-2 whitespace-nowrap text-right font-mono text-xs font-bold text-indigo-950">
                                        {formatCurrency(summary.openingBalance)} <span className="text-[10px] font-normal text-slate-500">{summary.openingBalanceType}</span>
                                    </td>
                                </tr>
                            )}

                            {monthlyBreakdown.length === 0 && !hasOpeningBalance ? (
                                <tr>
                                    <td colSpan={7} className="px-4 py-12 text-center text-slate-500">
                                        <div className="flex flex-col items-center justify-center gap-1.5">
                                            <Calendar className="w-8 h-8 text-slate-300" />
                                            <span className="font-semibold text-slate-700 text-sm">No Monthly Cash Flow Records</span>
                                            <span className="text-xs text-slate-400">Transactions for the selected fiscal years will appear here month by month.</span>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                monthlyBreakdown.map((m, idx) => {
                                    const isNetPositive = m.netFlow >= 0;
                                    return (
                                        <tr 
                                            key={m.monthKey || idx}
                                            className="hover:bg-slate-50/80 transition-colors text-slate-700"
                                        >
                                            <td className="px-3 py-2 whitespace-nowrap font-semibold text-slate-800 text-xs">
                                                {m.label}
                                            </td>
                                            <td className="px-3 py-2 whitespace-nowrap text-center text-xs font-normal text-slate-500 font-mono">
                                                {m.txnCount}
                                            </td>
                                            <td className="px-3 py-2 whitespace-nowrap text-right font-mono text-xs font-semibold text-emerald-600">
                                                {m.inflow > 0 ? formatCurrency(m.inflow) : '-'}
                                            </td>
                                            <td className="px-3 py-2 whitespace-nowrap text-right font-mono text-xs font-semibold text-rose-600">
                                                {m.outflow > 0 ? formatCurrency(m.outflow) : '-'}
                                            </td>
                                            <td className={`px-3 py-2 whitespace-nowrap text-right font-mono text-xs font-bold ${
                                                isNetPositive ? 'text-emerald-700' : 'text-rose-700'
                                            }`}>
                                                {isNetPositive ? '+' : ''}{formatCurrency(m.netFlow)}
                                            </td>
                                            <td className="px-3 py-2 whitespace-nowrap text-center">
                                                <span className={`inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full text-[10px] font-semibold border ${
                                                    isNetPositive 
                                                        ? 'bg-emerald-100 text-emerald-800 border-emerald-200' 
                                                        : 'bg-rose-100 text-rose-800 border-rose-200'
                                                }`}>
                                                    {isNetPositive ? (
                                                        <>
                                                            <ArrowDownLeft className="w-2.5 h-2.5 text-emerald-600" />
                                                            Surplus
                                                        </>
                                                    ) : (
                                                        <>
                                                            <ArrowUpRight className="w-2.5 h-2.5 text-rose-600" />
                                                            Deficit
                                                        </>
                                                    )}
                                                </span>
                                            </td>
                                            <td className="px-3 py-2 whitespace-nowrap text-right font-mono text-xs font-bold text-slate-800">
                                                {formatCurrency(m.runningBalance)} <span className="text-[10px] font-normal text-slate-500">{m.runningBalanceType}</span>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                        {(monthlyBreakdown.length > 0 || hasOpeningBalance) && (
                            <tfoot className="bg-slate-50 font-semibold border-t border-slate-200 text-xs">
                                <tr>
                                    <td className="px-3 py-2 text-left text-slate-600 uppercase tracking-wide text-[11px] font-bold">
                                        Total ({monthlyBreakdown.length} Months)
                                    </td>
                                    <td className="px-3 py-2 text-center text-xs font-mono text-slate-600">
                                        {summary.txnCount || 0}
                                    </td>
                                    <td className="px-3 py-2 text-right font-mono text-xs font-bold text-emerald-700">
                                        {formatCurrency(summary.totalInflow || 0)}
                                    </td>
                                    <td className="px-3 py-2 text-right font-mono text-xs font-bold text-rose-700">
                                        {formatCurrency(summary.totalOutflow || 0)}
                                    </td>
                                    <td className={`px-3 py-2 text-right font-mono text-xs font-bold ${
                                        netFlowIsPositive ? 'text-emerald-700' : 'text-rose-700'
                                    }`}>
                                        {netFlowIsPositive ? '+' : ''}{formatCurrency(summary.netFlow || 0)}
                                    </td>
                                    <td className="px-3 py-2 text-center text-[10px] text-slate-500 font-normal">
                                        {netFlowIsPositive ? 'Net Surplus' : 'Net Deficit'}
                                    </td>
                                    <td className="px-3 py-2 text-right font-mono text-xs font-bold text-slate-800">
                                        {formatCurrency(summary.closingBalance || 0)} <span className="text-[10px] font-normal text-slate-500">{summary.closingBalanceType}</span>
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
