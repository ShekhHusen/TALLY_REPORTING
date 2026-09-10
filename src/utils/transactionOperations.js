import { db } from '../firebase';
import { doc, getDoc, setDoc, deleteDoc, collection, getDocs } from 'firebase/firestore';
import { fetchFiscalYears, getCurrentFYObject } from './fiscalYear';

export async function deleteTransactionRecord(t) {
    if (!t || !t.id) {
        alert("Cannot delete transaction: missing ID.");
        return false;
    }
    
    const confirmMsg = `Are you sure you want to delete transaction ${t.voucherNo ? `(No: ${t.voucherNo})` : ''} dated ${t.date}?\n\nThis will permanently delete the transaction and automatically recalculate the account balances.`;
    if (!window.confirm(confirmMsg)) {
        return false;
    }

    try {
        // 1. Delete transaction document
        await deleteDoc(doc(db, 'transactions', t.id));

        // 2. Identify all affected accounts & amounts
        const debitEntries = t.allDebitEntries && t.allDebitEntries.length > 0 
            ? t.allDebitEntries 
            : (t.debitAccount ? [{ name: t.debitAccount, amount: parseFloat(t.debitAmount || 0) }] : []);
            
        const creditEntries = t.allCreditEntries && t.allCreditEntries.length > 0 
            ? t.allCreditEntries 
            : (t.creditAccount ? [{ name: t.creditAccount, amount: parseFloat(t.creditAmount || 0) }] : []);

        const affectedAccountsMap = new Map(); // key: lowerName -> { name, debit, credit }

        debitEntries.forEach(e => {
            if (!e.name) return;
            const k = e.name.trim().toLowerCase();
            const curr = affectedAccountsMap.get(k) || { name: e.name, debit: 0, credit: 0 };
            curr.debit += parseFloat(e.amount || 0);
            affectedAccountsMap.set(k, curr);
        });

        creditEntries.forEach(e => {
            if (!e.name) return;
            const k = e.name.trim().toLowerCase();
            const curr = affectedAccountsMap.get(k) || { name: e.name, debit: 0, credit: 0 };
            curr.credit += parseFloat(e.amount || 0);
            affectedAccountsMap.set(k, curr);
        });

        // 3. Find Fiscal Year for transaction date
        const allFys = await fetchFiscalYears();
        let targetFY = allFys.find(fy => t.date >= fy.startDate && t.date <= fy.endDate);
        if (!targetFY) targetFY = getCurrentFYObject(allFys);

        if (targetFY && affectedAccountsMap.size > 0) {
            // Fetch accounts to get all doc IDs case-insensitively
            const snap = await getDocs(collection(db, 'accounts'));
            const accDocsMap = new Map();
            snap.forEach(d => {
                const name = d.data()?.name ? d.data().name.trim().toLowerCase() : '';
                if (name) {
                    if (!accDocsMap.has(name)) accDocsMap.set(name, [d.id]);
                    else accDocsMap.get(name).push(d.id);
                }
            });

            for (const [key, totals] of affectedAccountsMap.entries()) {
                const docIds = accDocsMap.get(key) || [];
                if (docIds.length > 0) {
                    let fyData = {};
                    for (const docId of docIds) {
                        const fyDoc = await getDoc(doc(db, 'accounts', docId, 'fiscalYears', targetFY.id));
                        if (fyDoc.exists()) {
                            fyData = fyDoc.data();
                            break;
                        }
                    }

                    const newTotalDebit = Math.max(0, (fyData.totalDebit || 0) - totals.debit);
                    const newTotalCredit = Math.max(0, (fyData.totalCredit || 0) - totals.credit);
                    
                    const openingType = fyData.openingBalanceType || 'Dr';
                    const openingVal = (openingType === 'Cr' ? -1 : 1) * parseFloat(fyData.openingBalance || 0);
                    const newClosingVal = openingVal + newTotalDebit - newTotalCredit;

                    const newClosingBalance = Math.abs(newClosingVal);
                    const newClosingBalanceType = newClosingVal < 0 ? 'Cr' : (newClosingVal > 0 ? 'Dr' : '');

                    const updatePayload = {
                        totalDebit: newTotalDebit,
                        totalCredit: newTotalCredit,
                        closingBalance: newClosingBalance,
                        closingBalanceType: newClosingBalanceType,
                        verifiedBy: null,
                        verifiedAt: null
                    };

                    for (const docId of docIds) {
                        await setDoc(doc(db, 'accounts', docId, 'fiscalYears', targetFY.id), updatePayload, { merge: true });
                    }
                }
            }
        }

        alert("Transaction deleted and account balance recalculated successfully.");
        return true;
    } catch (error) {
        console.error("Error deleting transaction:", error);
        alert("Failed to delete transaction: " + error.message);
        return false;
    }
}
