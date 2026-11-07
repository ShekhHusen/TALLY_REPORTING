/**
 * agingCalculation.js — FIFO Bill-wise Aging & Reconciliation Engine
 * 
 * 1. Accurately determines account orientation (Debtor vs Creditor) using accountGroup and Closing Balance.
 * 2. Uses pure account-specific debits and credits (t.accountDebitAmt, t.accountCreditAmt).
 * 3. Incorporates opening balance according to orientation.
 * 4. Applies FIFO settlement: oldest charges are cleared first by total payments.
 * 5. Reconciles Total Outstanding against the Account Closing Balance.
 */

export const AGING_SLABS = [
    { id: '0_30', label: '0 - 30 Days', min: 0, max: 30, color: 'emerald', badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
    { id: '31_60', label: '31 - 60 Days', min: 31, max: 60, color: 'blue', badgeClass: 'bg-blue-100 text-blue-800 border-blue-200' },
    { id: '61_90', label: '61 - 90 Days', min: 61, max: 90, color: 'amber', badgeClass: 'bg-amber-100 text-amber-800 border-amber-200' },
    { id: '91_180', label: '91 - 180 Days', min: 91, max: 180, color: 'orange', badgeClass: 'bg-orange-100 text-orange-800 border-orange-200' },
    { id: '180_plus', label: '180+ Days', min: 181, max: Infinity, color: 'rose', badgeClass: 'bg-rose-100 text-rose-800 border-rose-200' },
];

export function getSlabForDays(days) {
    if (days <= 30) return AGING_SLABS[0];
    if (days <= 60) return AGING_SLABS[1];
    if (days <= 90) return AGING_SLABS[2];
    if (days <= 180) return AGING_SLABS[3];
    return AGING_SLABS[4];
}

/**
 * Computes FIFO Bill-wise Aging and cross-reconciles with Closing Balance
 */
export function calculateAccountAging({
    transactions = [],
    openingBalance = 0,
    openingBalanceType = 'Dr',
    openingDate = '',
    asOfDate = new Date().toISOString().slice(0, 10),
    accountGroup = '',
    closingBalance = null // { amount: number, type: 'Dr' | 'Cr' }
}) {
    const obAmt = Math.abs(parseFloat(openingBalance || 0));
    const obType = (openingBalanceType || '').trim();

    // 1. Determine Account Orientation (Debtor vs Creditor)
    // Heuristic: Check account group first. If group has 'creditor' / 'supplier' / 'payable', it's Creditor.
    // If group has 'debtor' / 'customer' / 'receivable', it's Debtor.
    // Otherwise fallback to closingBalance type (Cr = Creditor, Dr = Debtor).
    let isCreditor = false;
    if (accountGroup && /creditor|supplier|payable/i.test(accountGroup)) {
        isCreditor = true;
    } else if (accountGroup && /debtor|customer|receivable/i.test(accountGroup)) {
        isCreditor = false;
    } else if (closingBalance?.type === 'Cr') {
        isCreditor = true;
    } else if (closingBalance?.type === 'Dr') {
        isCreditor = false;
    } else if (obType === 'Cr' && obAmt > 0) {
        isCreditor = true;
    }

    const sortedTxns = [...transactions].sort((a, b) => new Date(a.date) - new Date(b.date));

    // Bills are charges owed by party:
    // For Debtors: Opening Dr + Debit transactions (Sales, charges)
    // For Creditors: Opening Cr + Credit transactions (Purchases, expenses)
    const bills = [];
    let totalPaymentsPool = 0;

    // 2. Incorporate Opening Balance
    if (obAmt > 0) {
        if (!isCreditor) {
            // Debtor expectation:
            if (obType === 'Dr' || obType === '') {
                bills.push({
                    id: 'ob_bill',
                    isOpening: true,
                    date: openingDate || (sortedTxns[0]?.date || asOfDate),
                    voucherNo: 'Opening Balance',
                    type: 'Opening Balance',
                    originalAmount: obAmt,
                    settledAmount: 0,
                    pendingAmount: obAmt,
                    particulars: 'Opening Balance (Dr)',
                    narration: 'Carry-forward balance from previous fiscal year',
                });
            } else {
                // Customer has opening credit (advance payment)
                totalPaymentsPool += obAmt;
            }
        } else {
            // Creditor expectation:
            if (obType === 'Cr' || obType === '') {
                bills.push({
                    id: 'ob_bill',
                    isOpening: true,
                    date: openingDate || (sortedTxns[0]?.date || asOfDate),
                    voucherNo: 'Opening Balance',
                    type: 'Opening Balance',
                    originalAmount: obAmt,
                    settledAmount: 0,
                    pendingAmount: obAmt,
                    particulars: 'Opening Balance (Cr)',
                    narration: 'Carry-forward balance from previous fiscal year',
                });
            } else {
                // Supplier has opening debit (advance paid by us)
                totalPaymentsPool += obAmt;
            }
        }
    }

    // 3. Process transactions strictly using account-specific amounts
    sortedTxns.forEach((t) => {
        const deb = parseFloat(t.accountDebitAmt !== undefined ? t.accountDebitAmt : 0) || 0;
        const cred = parseFloat(t.accountCreditAmt !== undefined ? t.accountCreditAmt : 0) || 0;

        if (!isCreditor) {
            // Debtor: Debits are Bills, Credits are Payments
            if (deb > 0) {
                bills.push({
                    id: t.id || `bill_${bills.length}`,
                    isOpening: false,
                    date: t.date,
                    voucherNo: t.voucherNo || '-',
                    type: t.type || 'Voucher',
                    originalAmount: deb,
                    settledAmount: 0,
                    pendingAmount: deb,
                    particulars: t.particulars || t.creditAccount || t.narration || 'Sales / Charge',
                    narration: t.narration || '',
                });
            }
            if (cred > 0) {
                totalPaymentsPool += cred;
            }
        } else {
            // Creditor: Credits are Bills, Debits are Payments
            if (cred > 0) {
                bills.push({
                    id: t.id || `bill_${bills.length}`,
                    isOpening: false,
                    date: t.date,
                    voucherNo: t.voucherNo || '-',
                    type: t.type || 'Voucher',
                    originalAmount: cred,
                    settledAmount: 0,
                    pendingAmount: cred,
                    particulars: t.particulars || t.debitAccount || t.narration || 'Purchase / Bill',
                    narration: t.narration || '',
                });
            }
            if (deb > 0) {
                totalPaymentsPool += deb;
            }
        }
    });

    // 4. FIFO Settlement: Deduct payments starting from oldest bills
    let remainingPayment = totalPaymentsPool;
    for (let i = 0; i < bills.length; i++) {
        if (remainingPayment <= 0.005) break;

        const bill = bills[i];
        if (remainingPayment >= bill.pendingAmount) {
            bill.settledAmount += bill.pendingAmount;
            remainingPayment -= bill.pendingAmount;
            bill.pendingAmount = 0;
        } else {
            bill.settledAmount += remainingPayment;
            bill.pendingAmount -= remainingPayment;
            remainingPayment = 0;
        }
    }

    // 5. Age in Days & Slab Buckets
    const targetDateObj = new Date(asOfDate);
    const unpaidVouchers = [];
    const bucketTotals = { '0_30': 0, '31_60': 0, '61_90': 0, '91_180': 0, '180_plus': 0 };
    const bucketCounts = { '0_30': 0, '31_60': 0, '61_90': 0, '91_180': 0, '180_plus': 0 };

    let totalOutstanding = 0;
    let weightedDaysSum = 0;

    bills.forEach((bill) => {
        if (bill.pendingAmount > 0.005) {
            const billDateObj = new Date(bill.date);
            const diffTime = targetDateObj - billDateObj;
            const ageDays = Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)));
            const slab = getSlabForDays(ageDays);

            const enrichedBill = {
                ...bill,
                ageDays,
                slabId: slab.id,
                slabLabel: slab.label,
                badgeClass: slab.badgeClass,
            };

            unpaidVouchers.push(enrichedBill);
            bucketTotals[slab.id] += bill.pendingAmount;
            bucketCounts[slab.id] += 1;
            totalOutstanding += bill.pendingAmount;
            weightedDaysSum += bill.pendingAmount * ageDays;
        }
    });

    // Sort unpaid vouchers by oldest first
    unpaidVouchers.sort((a, b) => b.ageDays - a.ageDays);

    const weightedAvgDays = totalOutstanding > 0 ? Math.round(weightedDaysSum / totalOutstanding) : 0;

    const buckets = AGING_SLABS.map((slab) => {
        const amount = bucketTotals[slab.id] || 0;
        const count = bucketCounts[slab.id] || 0;
        const percentage = totalOutstanding > 0 ? ((amount / totalOutstanding) * 100).toFixed(1) : '0.0';
        return {
            ...slab,
            amount: Math.round(amount * 100) / 100,
            count,
            percentage,
        };
    });

    // 6. Cross-Reconciliation with Statement Closing Balance
    const targetClosingAmount = closingBalance ? Math.abs(parseFloat(closingBalance.amount || 0)) : Math.round(totalOutstanding * 100) / 100;
    const targetClosingType = closingBalance?.type || (isCreditor ? 'Cr' : 'Dr');

    const expectedOutstanding = (
        (!isCreditor && targetClosingType === 'Dr') ||
        (isCreditor && targetClosingType === 'Cr')
    ) ? targetClosingAmount : 0;

    const diff = Math.abs(totalOutstanding - expectedOutstanding);
    const isReconciled = diff < 0.05;

    return {
        isCreditor,
        asOfDate,
        summary: {
            totalBilled: bills.reduce((sum, b) => sum + b.originalAmount, 0),
            totalSettled: totalPaymentsPool - remainingPayment,
            unallocatedAdvance: remainingPayment,
            totalOutstanding: Math.round(totalOutstanding * 100) / 100,
            unpaidBillsCount: unpaidVouchers.length,
            weightedAvgDays,
            oldestBillDays: unpaidVouchers.length > 0 ? unpaidVouchers[0].ageDays : 0,
        },
        reconciliation: {
            statementClosingBalance: targetClosingAmount,
            statementClosingType: targetClosingType,
            reportOutstanding: Math.round(totalOutstanding * 100) / 100,
            reportType: isCreditor ? 'Cr' : 'Dr',
            difference: Math.round(diff * 100) / 100,
            isReconciled,
            hasAdvance: remainingPayment > 0.05 || expectedOutstanding === 0,
            advanceAmount: remainingPayment > 0.05 ? remainingPayment : (expectedOutstanding === 0 ? targetClosingAmount : 0),
        },
        buckets,
        unpaidVouchers,
    };
}
