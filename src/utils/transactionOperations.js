import { db } from '../firebase';
import { doc, getDoc, setDoc, deleteDoc, collection, getDocs } from 'firebase/firestore';
import { fetchFiscalYears, getCurrentFYObject } from './fiscalYear';

export async function deleteTransactionRecord(t, skipConfirmAndAlert = false) {
    if (!t || !t.id) {
        if (!skipConfirmAndAlert) alert("Cannot delete transaction: missing ID.");
        return false;
    }
    
    if (!skipConfirmAndAlert) {
        const confirmMsg = `Are you sure you want to delete transaction ${t.voucherNo ? `(No: ${t.voucherNo})` : ''} dated ${t.date}?\n\nThis will permanently delete the transaction and automatically recalculate the account balances.`;
        if (!window.confirm(confirmMsg)) {
            return false;
        }
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

        if (!skipConfirmAndAlert) alert("Transaction deleted and account balance recalculated successfully.");
        return true;
    } catch (error) {
        console.error("Error deleting transaction:", error);
        if (!skipConfirmAndAlert) alert("Failed to delete transaction: " + error.message);
        return false;
    }
}

export async function updateTransactionRecord(oldTxn, newTxnData, currentUser) {
    if (!oldTxn || !oldTxn.id) {
        alert("Cannot update transaction: missing ID.");
        return false;
    }

    try {
        // 1. Fetch accounts to build map: lowerName -> [docIds...]
        const snap = await getDocs(collection(db, 'accounts'));
        const accDocsMap = new Map();
        snap.forEach(d => {
            const name = d.data()?.name ? d.data().name.trim().toLowerCase() : '';
            if (name) {
                if (!accDocsMap.has(name)) accDocsMap.set(name, [d.id]);
                else accDocsMap.get(name).push(d.id);
            }
        });

        // 2. Identify OLD affected accounts and amounts
        const oldDebitEntries = oldTxn.allDebitEntries && oldTxn.allDebitEntries.length > 0 
            ? oldTxn.allDebitEntries 
            : (oldTxn.debitAccount ? [{ name: oldTxn.debitAccount, amount: parseFloat(oldTxn.debitAmount || 0) }] : []);
            
        const oldCreditEntries = oldTxn.allCreditEntries && oldTxn.allCreditEntries.length > 0 
            ? oldTxn.allCreditEntries 
            : (oldTxn.creditAccount ? [{ name: oldTxn.creditAccount, amount: parseFloat(oldTxn.creditAmount || 0) }] : []);

        const oldAffectedMap = new Map();
        oldDebitEntries.forEach(e => {
            if (!e.name) return;
            const k = e.name.trim().toLowerCase();
            const curr = oldAffectedMap.get(k) || { debit: 0, credit: 0 };
            curr.debit += parseFloat(e.amount || 0);
            oldAffectedMap.set(k, curr);
        });
        oldCreditEntries.forEach(e => {
            if (!e.name) return;
            const k = e.name.trim().toLowerCase();
            const curr = oldAffectedMap.get(k) || { debit: 0, credit: 0 };
            curr.credit += parseFloat(e.amount || 0);
            oldAffectedMap.set(k, curr);
        });

        // 3. Identify NEW affected accounts and amounts
        const newDebitEntries = newTxnData.allDebitEntries && newTxnData.allDebitEntries.length > 0 
            ? newTxnData.allDebitEntries 
            : (newTxnData.debitAccount ? [{ name: newTxnData.debitAccount, amount: parseFloat(newTxnData.debitAmount || 0) }] : []);
            
        const newCreditEntries = newTxnData.allCreditEntries && newTxnData.allCreditEntries.length > 0 
            ? newTxnData.allCreditEntries 
            : (newTxnData.creditAccount ? [{ name: newTxnData.creditAccount, amount: parseFloat(newTxnData.creditAmount || 0) }] : []);

        const newAffectedMap = new Map();
        newDebitEntries.forEach(e => {
            if (!e.name) return;
            const k = e.name.trim().toLowerCase();
            const curr = newAffectedMap.get(k) || { debit: 0, credit: 0 };
            curr.debit += parseFloat(e.amount || 0);
            newAffectedMap.set(k, curr);
        });
        newCreditEntries.forEach(e => {
            if (!e.name) return;
            const k = e.name.trim().toLowerCase();
            const curr = newAffectedMap.get(k) || { debit: 0, credit: 0 };
            curr.credit += parseFloat(e.amount || 0);
            newAffectedMap.set(k, curr);
        });

        // 4. Fetch Fiscal Years
        const allFys = await fetchFiscalYears();
        let oldFY = allFys.find(fy => oldTxn.date >= fy.startDate && oldTxn.date <= fy.endDate);
        if (!oldFY) oldFY = getCurrentFYObject(allFys);

        let newFY = allFys.find(fy => newTxnData.date >= fy.startDate && newTxnData.date <= fy.endDate);
        if (!newFY) newFY = getCurrentFYObject(allFys);

        // Helper to adjust an account's FY balances
        const applyDeltaToAccount = async (accountKey, fyObj, deltaDebit, deltaCredit) => {
            if (!fyObj || (deltaDebit === 0 && deltaCredit === 0)) return;
            const docIds = accDocsMap.get(accountKey) || [];
            if (docIds.length === 0) return;

            let fyData = {};
            for (const docId of docIds) {
                const fyDoc = await getDoc(doc(db, 'accounts', docId, 'fiscalYears', fyObj.id));
                if (fyDoc.exists()) {
                    fyData = fyDoc.data();
                    break;
                }
            }

            const newTotalDebit = Math.max(0, (fyData.totalDebit || 0) + deltaDebit);
            const newTotalCredit = Math.max(0, (fyData.totalCredit || 0) + deltaCredit);

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
                await setDoc(doc(db, 'accounts', docId, 'fiscalYears', fyObj.id), updatePayload, { merge: true });
            }
        };

        // If transaction stays in SAME FY:
        if (oldFY && newFY && oldFY.id === newFY.id) {
            const allInvolvedKeys = new Set([...oldAffectedMap.keys(), ...newAffectedMap.keys()]);
            for (const k of allInvolvedKeys) {
                const oldVals = oldAffectedMap.get(k) || { debit: 0, credit: 0 };
                const newVals = newAffectedMap.get(k) || { debit: 0, credit: 0 };
                const netDeltaDebit = newVals.debit - oldVals.debit;
                const netDeltaCredit = newVals.credit - oldVals.credit;
                await applyDeltaToAccount(k, oldFY, netDeltaDebit, netDeltaCredit);
            }
        } else {
            // Transaction moved to DIFFERENT FY:
            if (oldFY) {
                for (const [k, oldVals] of oldAffectedMap.entries()) {
                    await applyDeltaToAccount(k, oldFY, -oldVals.debit, -oldVals.credit);
                }
            }
            if (newFY) {
                for (const [k, newVals] of newAffectedMap.entries()) {
                    await applyDeltaToAccount(k, newFY, newVals.debit, newVals.credit);
                }
            }
        }

        // 5. Compute involved accounts & doc IDs for updated transaction
        const newDebitNames = newDebitEntries.map(e => (e.name || '').trim()).filter(Boolean);
        const newCreditNames = newCreditEntries.map(e => (e.name || '').trim()).filter(Boolean);
        const allDebitAccounts = [...new Set(newDebitNames)];
        const allCreditAccounts = [...new Set(newCreditNames)];

        const involvedAccountsLower = [...new Set([
            ...allDebitAccounts.map(n => n.toLowerCase()),
            ...allCreditAccounts.map(n => n.toLowerCase())
        ])];

        const involvedDocIds = new Set();
        involvedAccountsLower.forEach(k => {
            const ids = accDocsMap.get(k) || [];
            ids.forEach(id => involvedDocIds.add(id));
        });

        // 6. Update the Firestore transaction document
        const updateDocPayload = {
            date: newTxnData.date,
            type: newTxnData.type,
            voucherNo: newTxnData.voucherNo || '',
            debitAccount: newTxnData.debitAccount || (allDebitAccounts[0] || ''),
            creditAccount: newTxnData.creditAccount || (allCreditAccounts[0] || ''),
            debitAmount: parseFloat(newTxnData.debitAmount || 0),
            creditAmount: parseFloat(newTxnData.creditAmount || 0),
            allDebitAccounts,
            allCreditAccounts,
            allDebitEntries: newDebitEntries,
            allCreditEntries: newCreditEntries,
            involvedAccountsLower,
            involvedAccountIds: Array.from(involvedDocIds),
            narration: newTxnData.narration || '',
            lastModifiedBy: currentUser?.name || 'Admin',
            lastModifiedAt: new Date().toISOString()
        };

        await setDoc(doc(db, 'transactions', oldTxn.id), updateDocPayload, { merge: true });

        alert("Transaction updated and balances recalculated successfully!");
        return true;
    } catch (error) {
        console.error("Error updating transaction:", error);
        alert("Failed to update transaction: " + error.message);
        return false;
    }
}
