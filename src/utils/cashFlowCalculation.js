/**
 * cashFlowCalculation.js — Monthly & Channel Cash Flow Analysis & Reconciliation Engine
 * 
 * Aggregates account statement transactions into:
 * 1. Summary Inflow (Credits/Receipts), Outflow (Debits/Charges), and Net Flow.
 * 2. Chronological Monthly breakdown (Inflow, Outflow, Net, Running Balance).
 * 3. Payment Mode & Channel classification (Cash, Bank/Online, Adjustment/Journal).
 * 4. Cross-reconciliation with Account Closing Balance.
 */

const MONTH_NAMES = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

export function formatMonthKey(monthKey) {
    if (!monthKey || typeof monthKey !== 'string') return monthKey || '-';
    const parts = monthKey.split('-');
    if (parts.length < 2) return monthKey;
    const year = parts[0];
    const monthIdx = parseInt(parts[1], 10) - 1;
    const monthName = MONTH_NAMES[monthIdx] || parts[1];
    return `${monthName} ${year}`;
}

export function detectPaymentChannel(txn) {
    const type = (txn.type || '').toLowerCase();
    const debAcc = (txn.debitAccount || '').toLowerCase();
    const credAcc = (txn.creditAccount || '').toLowerCase();
    const narration = (txn.narration || '').toLowerCase();
    const particulars = (txn.particulars || '').toLowerCase();

    const textToScan = `${debAcc} ${credAcc} ${narration} ${particulars} ${type}`;

    if (/\bcash\b|cash-in-hand|petty cash/i.test(textToScan)) {
        return 'cash';
    }

    if (/\bbank\b|sbi|hdfc|icici|axis|pnb|kotak|bob|canara|union|rbi|rtgs|neft|imps|cheque|chq|upi|transfer/i.test(textToScan)) {
        return 'bank';
    }

    return 'adjustment';
}

export function calculateAccountCashFlow({
    transactions = [],
    openingBalance = 0,
    openingBalanceType = 'Dr',
    openingDate = '',
    closingBalance = null
}) {
    const ob = parseFloat(openingBalance || 0);
    const obType = (openingBalanceType || '').trim();
    const initialRunningBalance = obType === 'Cr' ? -ob : ob;

    const sortedTxns = [...transactions].sort((a, b) => new Date(a.date) - new Date(b.date));

    const monthlyMap = new Map();
    const channelTotals = {
        cash: { inflow: 0, outflow: 0, count: 0 },
        bank: { inflow: 0, outflow: 0, count: 0 },
        adjustment: { inflow: 0, outflow: 0, count: 0 },
    };

    let totalInflow = 0;
    let totalOutflow = 0;

    sortedTxns.forEach((txn) => {
        const inflowAmt = parseFloat(txn.accountCreditAmt !== undefined ? txn.accountCreditAmt : 0) || 0;
        const outflowAmt = parseFloat(txn.accountDebitAmt !== undefined ? txn.accountDebitAmt : 0) || 0;

        totalInflow += inflowAmt;
        totalOutflow += outflowAmt;

        // Channel classification
        const channel = detectPaymentChannel(txn);
        channelTotals[channel].inflow += inflowAmt;
        channelTotals[channel].outflow += outflowAmt;
        channelTotals[channel].count += 1;

        // Monthly bucket
        const monthKey = txn.date ? txn.date.slice(0, 7) : 'Unknown';
        if (!monthlyMap.has(monthKey)) {
            monthlyMap.set(monthKey, {
                monthKey,
                label: formatMonthKey(monthKey),
                inflow: 0,
                outflow: 0,
                txnCount: 0,
                firstDate: txn.date,
                lastDate: txn.date,
            });
        }

        const bucket = monthlyMap.get(monthKey);
        bucket.inflow += inflowAmt;
        bucket.outflow += outflowAmt;
        bucket.txnCount += 1;
        bucket.lastDate = txn.date;
    });

    // Sort months chronologically
    const sortedMonthKeys = Array.from(monthlyMap.keys()).sort();
    let runningNet = initialRunningBalance;

    const monthlyBreakdown = sortedMonthKeys.map((monthKey) => {
        const item = monthlyMap.get(monthKey);
        const netMonthFlow = item.inflow - item.outflow;
        // In ledger running balance: Balance = Previous + Debits (Outflow) - Credits (Inflow)
        runningNet = runningNet + item.outflow - item.inflow;

        return {
            ...item,
            inflow: Math.round(item.inflow * 100) / 100,
            outflow: Math.round(item.outflow * 100) / 100,
            netFlow: Math.round(netMonthFlow * 100) / 100,
            runningBalance: Math.round(Math.abs(runningNet) * 100) / 100,
            runningBalanceType: runningNet < -0.005 ? 'Cr' : (runningNet > 0.005 ? 'Dr' : ''),
        };
    });

    const netFlowTotal = totalInflow - totalOutflow;
    const totalVolume = totalInflow + totalOutflow;

    const channelSummary = [
        {
            id: 'cash',
            label: 'Cash Flow',
            inflow: channelTotals.cash.inflow,
            outflow: channelTotals.cash.outflow,
            totalVolume: channelTotals.cash.inflow + channelTotals.cash.outflow,
            percentage: totalVolume > 0 ? (((channelTotals.cash.inflow + channelTotals.cash.outflow) / totalVolume) * 100).toFixed(1) : '0.0',
            count: channelTotals.cash.count,
            badgeClass: 'bg-amber-100 text-amber-800 border-amber-200',
        },
        {
            id: 'bank',
            label: 'Bank / Online Flow',
            inflow: channelTotals.bank.inflow,
            outflow: channelTotals.bank.outflow,
            totalVolume: channelTotals.bank.inflow + channelTotals.bank.outflow,
            percentage: totalVolume > 0 ? (((channelTotals.bank.inflow + channelTotals.bank.outflow) / totalVolume) * 100).toFixed(1) : '0.0',
            count: channelTotals.bank.count,
            badgeClass: 'bg-blue-100 text-blue-800 border-blue-200',
        },
        {
            id: 'adjustment',
            label: 'Sales / Bills / Adjustments',
            inflow: channelTotals.adjustment.inflow,
            outflow: channelTotals.adjustment.outflow,
            totalVolume: channelTotals.adjustment.inflow + channelTotals.adjustment.outflow,
            percentage: totalVolume > 0 ? (((channelTotals.adjustment.inflow + channelTotals.adjustment.outflow) / totalVolume) * 100).toFixed(1) : '0.0',
            count: channelTotals.adjustment.count,
            badgeClass: 'bg-purple-100 text-purple-800 border-purple-200',
        },
    ];

    let peakInflowMonth = null;
    let peakOutflowMonth = null;
    monthlyBreakdown.forEach((m) => {
        if (!peakInflowMonth || m.inflow > peakInflowMonth.inflow) peakInflowMonth = m;
        if (!peakOutflowMonth || m.outflow > peakOutflowMonth.outflow) peakOutflowMonth = m;
    });

    const reportFinalAmount = Math.round(Math.abs(runningNet) * 100) / 100;
    const reportFinalType = runningNet < -0.005 ? 'Cr' : (runningNet > 0.005 ? 'Dr' : '');

    const targetClosingAmount = closingBalance ? Math.abs(parseFloat(closingBalance.amount || 0)) : reportFinalAmount;
    const targetClosingType = closingBalance?.type || reportFinalType;

    const diff = Math.abs(reportFinalAmount - targetClosingAmount);
    const isReconciled = diff < 0.05 && (reportFinalType === targetClosingType || reportFinalAmount === 0);

    return {
        summary: {
            openingBalance: ob,
            openingBalanceType: obType,
            openingDate,
            totalInflow: Math.round(totalInflow * 100) / 100,
            totalOutflow: Math.round(totalOutflow * 100) / 100,
            netFlow: Math.round(netFlowTotal * 100) / 100,
            closingBalance: reportFinalAmount,
            closingBalanceType: reportFinalType,
            monthCount: monthlyBreakdown.length,
            txnCount: sortedTxns.length,
            peakInflowMonth: peakInflowMonth?.label || '-',
            peakInflowAmt: peakInflowMonth?.inflow || 0,
            peakOutflowMonth: peakOutflowMonth?.label || '-',
            peakOutflowAmt: peakOutflowMonth?.outflow || 0,
        },
        reconciliation: {
            statementClosingBalance: targetClosingAmount,
            statementClosingType: targetClosingType,
            reportClosingBalance: reportFinalAmount,
            reportClosingType: reportFinalType,
            difference: Math.round(diff * 100) / 100,
            isReconciled,
        },
        monthlyBreakdown,
        channelSummary,
    };
}
