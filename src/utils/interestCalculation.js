/**
 * Calculates interest statement rows and summary metrics for an account ledger.
 *
 * Algorithm matching user reference:
 * 1. Takes selected transactions, sorted by date ascending.
 * 2. Starts with initial balance / first transaction.
 * 3. Before each subsequent transaction, if date > previous date and running balance > 0:
 *    - Calculates days elapsed (Due Days).
 *    - Calculates per-day interest: Balance * (annualRate / 100) / daysBasis.
 *    - Calculates total interest for the period: perDayInterest * days.
 *    - Inserts an 'INTEREST' debit row that increases the balance.
 *    - Then applies the transaction (Debit increases balance, Credit decreases balance).
 * 4. After the last transaction, if endDate > last transaction date and running balance > 0:
 *    - Calculates days from last transaction date to endDate.
 *    - Inserts final 'INTEREST' debit row up to endDate.
 */

export const calculateDaysDifference = (startDateStr, endDateStr) => {
    if (!startDateStr || !endDateStr) return 0;
    // Normalize date strings (YYYY-MM-DD) to UTC midnight to avoid local timezone / daylight savings distortions
    const sParts = String(startDateStr).slice(0, 10).split('-').map(Number);
    const eParts = String(endDateStr).slice(0, 10).split('-').map(Number);

    let diffDays;
    if (sParts.length === 3 && eParts.length === 3 && !sParts.some(isNaN) && !eParts.some(isNaN)) {
        const utcStart = Date.UTC(sParts[0], sParts[1] - 1, sParts[2]);
        const utcEnd = Date.UTC(eParts[0], eParts[1] - 1, eParts[2]);
        diffDays = Math.round((utcEnd - utcStart) / (1000 * 60 * 60 * 24));
    } else {
        const start = new Date(startDateStr);
        const end = new Date(endDateStr);
        const diffTime = end.getTime() - start.getTime();
        diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
    }
    return diffDays > 0 ? diffDays : 0;
};

export const calculateAccountInterestStatement = ({
    transactions = [],
    selectedTxnIds = null, // Set or Array of selected IDs. If null, include all
    startDate = '',
    endDate = '',
    rate = 36,
    rateType = 'yearly', // 'yearly' (% p.a.) or 'monthly' (% p.m.)
    daysBasis = 365,
    includeOpeningBalance = false,
    openingBalance = 0,
    openingBalanceType = 'Dr',
    accountName = ''
}) => {
    // 1. Calculate effective annual percentage rate
    const numRate = parseFloat(rate) || 0;
    const annualRate = rateType === 'monthly' ? numRate * 12 : numRate;
    const numDaysBasis = parseInt(daysBasis, 10) || 365;

    // 2. Sort all transactions by date ascending (keep all transactions visible)
    const accNameLower = (accountName || '').trim().toLowerCase();
    const sortedTxns = [...transactions].sort((a, b) => new Date(a.date) - new Date(b.date));

    const rows = [];
    let ledgerBalance = 0; // true running balance of the ledger (Dr positive, Cr negative)
    let interestBearingBalance = 0; // balance on which interest accrues
    let currentDateStr = startDate || '';

    // Track summary metrics
    let totalInterestAmount = 0;
    let totalDebitAmount = 0;
    let totalCreditAmount = 0;

    // 3. Handle optional Opening Balance
    if (includeOpeningBalance && openingBalance > 0) {
        const obSigned = openingBalanceType === 'Cr' ? -openingBalance : openingBalance;
        ledgerBalance = obSigned;
        interestBearingBalance = obSigned;
        if (openingBalanceType === 'Cr') totalCreditAmount += openingBalance;
        else totalDebitAmount += openingBalance;

        rows.push({
            id: 'ob_row',
            isInterestRow: false,
            isOpeningRow: true,
            isSelected: true,
            date: startDate || (sortedTxns.length > 0 ? sortedTxns[0].date : ''),
            dueDays: null,
            perDayInterest: null,
            particulars: 'Opening Balance',
            voucherType: 'OB',
            voucherNo: '-',
            debitAmount: openingBalanceType === 'Dr' ? openingBalance : null,
            creditAmount: openingBalanceType === 'Cr' ? openingBalance : null,
            balance: Math.abs(ledgerBalance),
            balanceType: ledgerBalance < 0 ? 'Cr' : 'Dr'
        });

        if (!currentDateStr && sortedTxns.length > 0) {
            currentDateStr = sortedTxns[0].date;
        }
    }

    // 4. Process each transaction sequentially
    for (let i = 0; i < sortedTxns.length; i++) {
        const txn = sortedTxns[i];
        const txnDateStr = txn.date;
        const isSelected = !selectedTxnIds || (selectedTxnIds.has ? selectedTxnIds.has(txn.id) : selectedTxnIds.includes(txn.id));

        // Resolve debit/credit for target account
        let debAmt = 0;
        let credAmt = 0;

        if (txn.accountDebitAmt !== undefined || txn.accountCreditAmt !== undefined) {
            debAmt = parseFloat(txn.accountDebitAmt || 0);
            credAmt = parseFloat(txn.accountCreditAmt || 0);
        } else {
            if (txn.allDebitEntries && txn.allDebitEntries.length > 0) {
                debAmt = txn.allDebitEntries
                    .filter(e => e.name && e.name.trim().toLowerCase() === accNameLower)
                    .reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);
            } else if (txn.debitAccount && txn.debitAccount.trim().toLowerCase() === accNameLower) {
                debAmt = parseFloat(txn.debitAmount || 0);
            }

            if (txn.allCreditEntries && txn.allCreditEntries.length > 0) {
                credAmt = txn.allCreditEntries
                    .filter(e => e.name && e.name.trim().toLowerCase() === accNameLower)
                    .reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);
            } else if (txn.creditAccount && txn.creditAccount.trim().toLowerCase() === accNameLower) {
                credAmt = parseFloat(txn.creditAmount || 0);
            }

            if (debAmt === 0 && credAmt === 0) {
                debAmt = parseFloat(txn.debitAmount || 0);
                credAmt = parseFloat(txn.creditAmount || 0);
            }
        }

        // Determine friendly particulars
        let particulars = txn.particulars || txn.narration || '';
        if (!particulars) {
            if (debAmt > 0) particulars = txn.creditAccount ? `To ${txn.creditAccount}` : 'DEBIT';
            else if (credAmt > 0) particulars = txn.debitAccount ? `By ${txn.debitAccount}` : 'PAID';
            else particulars = txn.type || 'TXN';
        }

        if (isSelected) {
            // If this is the very first selected row and we haven't set currentDateStr yet
            if (!currentDateStr) {
                currentDateStr = txnDateStr;
            }

            // Check if interest should accrue prior to this transaction on interestBearingBalance
            if (interestBearingBalance > 0 && txnDateStr > currentDateStr) {
                const days = calculateDaysDifference(currentDateStr, txnDateStr);
                if (days > 0) {
                    const perDayInt = (interestBearingBalance * (annualRate / 100)) / numDaysBasis;
                    const periodInt = Math.round(perDayInt * days * 100) / 100;

                    ledgerBalance = Math.round((ledgerBalance + periodInt) * 100) / 100;
                    interestBearingBalance = Math.round((interestBearingBalance + periodInt) * 100) / 100;
                    totalInterestAmount = Math.round((totalInterestAmount + periodInt) * 100) / 100;

                    rows.push({
                        id: `interest_${i}_${txn.id}`,
                        isInterestRow: true,
                        date: txnDateStr,
                        dueDays: days,
                        perDayInterest: perDayInt,
                        particulars: 'INTEREST',
                        voucherType: 'INT',
                        voucherNo: '-',
                        debitAmount: periodInt,
                        creditAmount: null,
                        balance: Math.round(Math.abs(ledgerBalance) * 100) / 100,
                        balanceType: ledgerBalance < 0 ? 'Cr' : 'Dr'
                    });
                }
            }

            // Apply the selected transaction to both ledger and interest-bearing balances
            if (debAmt > 0) {
                ledgerBalance += debAmt;
                interestBearingBalance += debAmt;
                totalDebitAmount += debAmt;
            }
            if (credAmt > 0) {
                ledgerBalance -= credAmt;
                interestBearingBalance -= credAmt;
                totalCreditAmount += credAmt;
            }

            ledgerBalance = Math.round(ledgerBalance * 100) / 100;
            interestBearingBalance = Math.round(interestBearingBalance * 100) / 100;

            rows.push({
                id: txn.id,
                transaction: txn,
                isInterestRow: false,
                isSelected: true,
                date: txnDateStr,
                dueDays: null,
                perDayInterest: null,
                particulars: particulars,
                voucherType: txn.type || '-',
                voucherNo: txn.voucherNo || '-',
                debitAmount: debAmt > 0 ? debAmt : null,
                creditAmount: credAmt > 0 ? credAmt : null,
                balance: Math.round(Math.abs(ledgerBalance) * 100) / 100,
                balanceType: ledgerBalance < 0 ? 'Cr' : (ledgerBalance > 0 ? 'Dr' : '')
            });

            currentDateStr = txnDateStr;
        } else {
            // Unselected transaction: Do NOT calculate interest on it, but KEEP its principal in ledger balance!
            if (debAmt > 0) {
                ledgerBalance += debAmt;
                totalDebitAmount += debAmt;
            }
            if (credAmt > 0) {
                ledgerBalance -= credAmt;
                totalCreditAmount += credAmt;
            }

            ledgerBalance = Math.round(ledgerBalance * 100) / 100;

            rows.push({
                id: txn.id,
                transaction: txn,
                isInterestRow: false,
                isSelected: false,
                date: txnDateStr,
                dueDays: null,
                perDayInterest: null,
                particulars: particulars,
                voucherType: txn.type || '-',
                voucherNo: txn.voucherNo || '-',
                debitAmount: debAmt > 0 ? debAmt : null,
                creditAmount: credAmt > 0 ? credAmt : null,
                balance: Math.round(Math.abs(ledgerBalance) * 100) / 100,
                balanceType: ledgerBalance < 0 ? 'Cr' : (ledgerBalance > 0 ? 'Dr' : '')
            });
        }
    }

    // 5. Final interest period from last transaction date to endDate
    const effectiveEndDate = endDate || new Date().toISOString().slice(0, 10);
    if (interestBearingBalance > 0 && currentDateStr && effectiveEndDate > currentDateStr) {
        const finalDays = calculateDaysDifference(currentDateStr, effectiveEndDate);
        if (finalDays > 0) {
            const perDayInt = (interestBearingBalance * (annualRate / 100)) / numDaysBasis;
            const periodInt = Math.round(perDayInt * finalDays * 100) / 100;

            ledgerBalance = Math.round((ledgerBalance + periodInt) * 100) / 100;
            interestBearingBalance = Math.round((interestBearingBalance + periodInt) * 100) / 100;
            totalInterestAmount = Math.round((totalInterestAmount + periodInt) * 100) / 100;

            rows.push({
                id: `interest_final_${effectiveEndDate}`,
                isInterestRow: true,
                isFinalInterestRow: true,
                date: effectiveEndDate,
                dueDays: finalDays,
                perDayInterest: perDayInt,
                particulars: 'INTEREST',
                voucherType: 'INT',
                voucherNo: '-',
                debitAmount: periodInt,
                creditAmount: null,
                balance: Math.round(Math.abs(ledgerBalance) * 100) / 100,
                balanceType: ledgerBalance < 0 ? 'Cr' : 'Dr'
            });
        }
    }

    // 6. Summary metrics
    const summary = {
        initialPrincipal: Math.round(totalDebitAmount * 100) / 100,
        totalInterest: Math.round(totalInterestAmount * 100) / 100,
        totalPaid: Math.round(totalCreditAmount * 100) / 100,
        finalBalance: Math.round(Math.abs(ledgerBalance) * 100) / 100,
        finalBalanceType: ledgerBalance < 0 ? 'Cr' : (ledgerBalance > 0 ? 'Dr' : ''),
        effectiveAnnualRate: annualRate,
        daysBasis: numDaysBasis,
        totalDays: calculateDaysDifference(
            rows.length > 0 ? rows[0].date : startDate,
            effectiveEndDate
        )
    };

    return { rows, summary };
};
