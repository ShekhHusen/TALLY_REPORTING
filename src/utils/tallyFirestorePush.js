/**
 * tallyFirestorePush.js — Firestore Push Logic for Tally-synced Vouchers
 *
 * Reuses proven ImportCenter patterns for:
 *  - Affected account detection & auto-creation
 *  - Batch transaction writes (450-chunk)
 *  - Incremental balance delta sync (Option A)
 *  - Smart deduplication (skip balance delta for already-existing transactions)
 *  - System metadata update
 *
 * All data fetched stays LOCAL in tallyService.js cache.
 * This module ONLY handles the push-to-Firestore step.
 */

import { db } from '../firebase';
import {
    collection, writeBatch, doc, getDocs, query, getDoc, setDoc
} from 'firebase/firestore';

// ─────────────────────────────────────────────────────────
// Utility
// ─────────────────────────────────────────────────────────

function chunkArray(arr, size) {
    const chunked = [];
    for (let i = 0; i < arr.length; i += size) {
        chunked.push(arr.slice(i, i + size));
    }
    return chunked;
}

// ─────────────────────────────────────────────────────────
// Step 1: Filter Transactions by Fiscal Year Date Range
// ─────────────────────────────────────────────────────────

/**
 * Filter transactions to only those within the FY date range.
 * @param {Array} transactions - Tally-fetched voucher array
 * @param {{ startDate: string, endDate: string }} activeFY
 * @returns {{ valid: Array, skippedCount: number }}
 */
export function filterTransactionsByFY(transactions, activeFY) {
    if (!activeFY || !activeFY.startDate || !activeFY.endDate) {
        return { valid: transactions, skippedCount: 0 };
    }
    const valid = transactions.filter(txn =>
        txn.date && txn.date >= activeFY.startDate && txn.date <= activeFY.endDate
    );
    return { valid, skippedCount: transactions.length - valid.length };
}

// ─────────────────────────────────────────────────────────
// Step 2: Detect & Create Affected Accounts
// ─────────────────────────────────────────────────────────

/**
 * Process all accounts referenced in the transactions:
 *  - Existing accounts → tag FY subcollection as unverified
 *  - New accounts → auto-create root doc + FY subcollection doc
 *
 * Returns the existingAccounts map for involvedAccountIds linking.
 *
 * @param {Array} transactions
 * @param {{ id: string, name: string }} activeFY
 * @param {Function} onProgress - optional callback (statusText)
 * @returns {Promise<{ affectedAccountNames: Set, existingAccounts: Map }>}
 */
export async function processAffectedAccounts(transactions, activeFY, onProgress) {
    if (onProgress) onProgress('Detecting affected accounts...');

    // Collect all unique account names from transactions
    const affectedAccountNames = new Set();
    transactions.forEach(t => {
        if (t.allDebitAccounts && t.allDebitAccounts.length > 0) {
            t.allDebitAccounts.forEach(name => { if (name && name !== '-') affectedAccountNames.add(name); });
        } else if (t.debitAccount && t.debitAccount !== '-') {
            affectedAccountNames.add(t.debitAccount);
        }
        if (t.allCreditAccounts && t.allCreditAccounts.length > 0) {
            t.allCreditAccounts.forEach(name => { if (name && name !== '-') affectedAccountNames.add(name); });
        } else if (t.creditAccount && t.creditAccount !== '-') {
            affectedAccountNames.add(t.creditAccount);
        }
    });

    // Fetch existing accounts from Firestore
    const snap = await getDocs(query(collection(db, 'accounts')));
    const existingAccounts = new Map(); // lowercase name -> array of doc IDs
    snap.forEach(d => {
        const data = d.data();
        const key = (data.name || '').toLowerCase().trim();
        if (!key) return;
        if (!existingAccounts.has(key)) {
            existingAccounts.set(key, []);
        }
        existingAccounts.get(key).push(d.id);
    });

    const batchOps = [];
    let newAccountCount = 0;

    for (const accName of affectedAccountNames) {
        const key = accName.toLowerCase().trim();
        if (!key) continue;

        if (existingAccounts.has(key)) {
            // Existing account → tag FY subcollection as unverified
            const docIds = existingAccounts.get(key);
            docIds.forEach(docId => {
                batchOps.push({
                    type: 'set',
                    ref: doc(db, 'accounts', docId, 'fiscalYears', activeFY.id),
                    data: {
                        fyId: activeFY.id,
                        fyName: activeFY.name,
                        verifiedBy: null,
                        verifiedAt: null
                    },
                    merge: true
                });
            });
        } else {
            // New account → create root doc + FY subcollection doc
            const newId = crypto.randomUUID();
            newAccountCount++;

            // Root account document
            batchOps.push({
                type: 'set',
                ref: doc(db, 'accounts', newId),
                data: {
                    id: newId,
                    name: accName,
                    group: '',
                    openingBalance: 0,
                    openingBalanceType: '',
                    address: '',
                    contact: '',
                    isNewAutoCreated: true
                },
                merge: false
            });

            // FY subcollection doc
            batchOps.push({
                type: 'set',
                ref: doc(db, 'accounts', newId, 'fiscalYears', activeFY.id),
                data: {
                    fyId: activeFY.id,
                    fyName: activeFY.name,
                    openingBalance: 0,
                    openingBalanceType: '',
                    totalDebit: 0,
                    totalCredit: 0,
                    closingBalance: 0,
                    closingBalanceType: '',
                    verifiedBy: null,
                    verifiedAt: null
                },
                merge: false
            });

            // Track so duplicate name references don't create extra docs
            existingAccounts.set(key, [newId]);
        }
    }

    if (onProgress) onProgress(`Processing ${affectedAccountNames.size} accounts (${newAccountCount} new)...`);

    // Batch write
    const chunks = chunkArray(batchOps, 450);
    for (const chunk of chunks) {
        const batch = writeBatch(db);
        chunk.forEach(op => {
            if (op.merge) batch.set(op.ref, op.data, { merge: true });
            else batch.set(op.ref, op.data);
        });
        await batch.commit();
    }

    return { affectedAccountNames, existingAccounts, newAccountCount };
}

// ─────────────────────────────────────────────────────────
// Step 3: Prepare & Save Transactions
// ─────────────────────────────────────────────────────────

/**
 * Add involvedAccountIds and involvedAccountsLower to each transaction,
 * then batch-write to Firestore.
 *
 * Returns counts of new and updated transactions.
 *
 * @param {Array} transactions
 * @param {Map} existingAccounts - lowercase name -> [docIds]
 * @param {Function} onProgress
 * @returns {Promise<{ newCount: number, updatedCount: number }>}
 */
export async function batchSaveTransactions(transactions, existingAccounts, onProgress) {
    if (onProgress) onProgress('Checking for existing transactions...');

    // Detect which transactions already exist in Firestore (for dedup)
    const existingTxnIds = new Set();
    const txnSnap = await getDocs(collection(db, 'transactions'));
    txnSnap.forEach(d => existingTxnIds.add(d.id));

    // Prepare transactions: add involvedAccountIds & involvedAccountsLower
    transactions.forEach(txn => {
        const ids = new Set();
        const allNames = [...(txn.allDebitAccounts || []), ...(txn.allCreditAccounts || [])];

        // Fallback for simple 2-entry vouchers
        if (allNames.length === 0) {
            if (txn.debitAccount && txn.debitAccount !== '-') allNames.push(txn.debitAccount);
            if (txn.creditAccount && txn.creditAccount !== '-') allNames.push(txn.creditAccount);
        }

        allNames.forEach(name => {
            const key = (name || '').toLowerCase().trim();
            if (existingAccounts.has(key)) {
                existingAccounts.get(key).forEach(id => ids.add(id));
            }
        });

        txn.involvedAccountIds = Array.from(ids);

        // Add involvedAccountsLower if not present
        if (!txn.involvedAccountsLower) {
            txn.involvedAccountsLower = [...new Set(
                allNames.map(n => (n || '').toLowerCase().trim()).filter(Boolean)
            )];
        }
    });

    // Split into new vs existing
    const newTransactions = transactions.filter(t => !existingTxnIds.has(t.id));
    const updatedTransactions = transactions.filter(t => existingTxnIds.has(t.id));

    // Batch write ALL (set = create or overwrite)
    const chunks = chunkArray(transactions, 450);
    for (let i = 0; i < chunks.length; i++) {
        if (onProgress) onProgress(`Saving transactions: batch ${i + 1} of ${chunks.length}...`);
        const batch = writeBatch(db);
        chunks[i].forEach(txn => {
            const ref = doc(db, 'transactions', txn.id);
            batch.set(ref, txn);
        });
        await batch.commit();
    }

    return {
        newCount: newTransactions.length,
        updatedCount: updatedTransactions.length,
        newTransactions // needed for incremental balance delta
    };
}

// ─────────────────────────────────────────────────────────
// Step 4: Sync Account Balances (Option A — Incremental Delta)
// ─────────────────────────────────────────────────────────

/**
 * Apply incremental balance delta ONLY for newly added transactions
 * (not for existing/updated ones, to prevent double-counting).
 *
 * @param {Array} newTransactions - only truly new transactions
 * @param {{ id: string, name: string }} activeFY
 * @param {Function} onProgress
 * @returns {Promise<number>} count of accounts whose balances were updated
 */
export async function syncBalancesIncremental(newTransactions, activeFY, onProgress) {
    if (!newTransactions || newTransactions.length === 0) return 0;

    if (onProgress) onProgress('Calculating balance deltas...');

    // Calculate per-account debit/credit delta from new transactions only
    const accountDeltas = new Map(); // lowercase name -> { debit, credit }

    newTransactions.forEach(t => {
        const debitEntries = t.allDebitEntries || [];
        const creditEntries = t.allCreditEntries || [];

        if (debitEntries.length > 0) {
            debitEntries.forEach(entry => {
                const key = (entry.name || '').toLowerCase().trim();
                if (!key || key === '-') return;
                if (!accountDeltas.has(key)) accountDeltas.set(key, { debit: 0, credit: 0 });
                accountDeltas.get(key).debit += parseFloat(entry.amount || 0);
            });
        } else if (t.debitAccount && t.debitAccount !== '-') {
            const key = t.debitAccount.toLowerCase().trim();
            if (key) {
                if (!accountDeltas.has(key)) accountDeltas.set(key, { debit: 0, credit: 0 });
                accountDeltas.get(key).debit += parseFloat(t.debitAmount || 0);
            }
        }

        if (creditEntries.length > 0) {
            creditEntries.forEach(entry => {
                const key = (entry.name || '').toLowerCase().trim();
                if (!key || key === '-') return;
                if (!accountDeltas.has(key)) accountDeltas.set(key, { debit: 0, credit: 0 });
                accountDeltas.get(key).credit += parseFloat(entry.amount || 0);
            });
        } else if (t.creditAccount && t.creditAccount !== '-') {
            const key = t.creditAccount.toLowerCase().trim();
            if (key) {
                if (!accountDeltas.has(key)) accountDeltas.set(key, { debit: 0, credit: 0 });
                accountDeltas.get(key).credit += parseFloat(t.creditAmount || 0);
            }
        }
    });

    if (accountDeltas.size === 0) return 0;

    if (onProgress) onProgress(`Syncing balances for ${accountDeltas.size} accounts...`);

    // Fetch affected accounts from Firestore
    const accSnap = await getDocs(collection(db, 'accounts'));
    const affectedAccounts = [];
    accSnap.forEach(d => {
        const data = d.data();
        const key = (data.name || '').toLowerCase().trim();
        if (accountDeltas.has(key)) {
            affectedAccounts.push({ ...data, ref: d.ref, id: d.id, key });
        }
    });

    if (affectedAccounts.length === 0) return 0;

    // Fetch FY docs for affected accounts
    const fyDocs = await Promise.all(
        affectedAccounts.map(acc => getDoc(doc(db, 'accounts', acc.id, 'fiscalYears', activeFY.id)))
    );

    const fyBatchOps = [];

    affectedAccounts.forEach((acc, index) => {
        const delta = accountDeltas.get(acc.key);
        if (!delta) return;

        const fyDoc = fyDocs[index];
        const fyData = fyDoc.exists() ? fyDoc.data() : { openingBalance: 0, openingBalanceType: '' };

        const newTotalDebit = (fyData.totalDebit || 0) + delta.debit;
        const newTotalCredit = (fyData.totalCredit || 0) + delta.credit;

        // Recalculate closing from opening + updated totals
        const ob = parseFloat(fyData.openingBalance || 0);
        const obSigned = fyData.openingBalanceType === 'Cr' ? -ob : ob;
        const closingSigned = obSigned + newTotalDebit - newTotalCredit;

        const closingBalanceType = closingSigned < 0 ? 'Cr' : (closingSigned > 0 ? 'Dr' : '');
        const closingBalance = Math.abs(closingSigned);

        fyBatchOps.push({
            ref: doc(db, 'accounts', acc.id, 'fiscalYears', activeFY.id),
            data: {
                totalDebit: newTotalDebit,
                totalCredit: newTotalCredit,
                closingBalance,
                closingBalanceType,
                fyId: activeFY.id,
                fyName: activeFY.name
            }
        });
    });

    // Batch write FY updates
    const fyChunks = chunkArray(fyBatchOps, 450);
    for (const chunk of fyChunks) {
        const batch = writeBatch(db);
        chunk.forEach(op => batch.set(op.ref, op.data, { merge: true }));
        await batch.commit();
    }

    return affectedAccounts.length;
}

// ─────────────────────────────────────────────────────────
// Step 5: Update System Metadata
// ─────────────────────────────────────────────────────────

/**
 * Update system/metadata with latest transaction date and push timestamp.
 * @param {Array} transactions
 * @param {Object} currentUser
 */
export async function updateSystemMetadata(transactions, currentUser) {
    try {
        const txnDates = transactions.map(t => t.date).filter(Boolean).sort();
        const latestDate = txnDates[txnDates.length - 1] || new Date().toISOString().split('T')[0];
        await setDoc(doc(db, 'system', 'metadata'), {
            lastUpdatedDate: latestDate,
            updatedAt: new Date().toISOString(),
            updatedBy: currentUser?.name || 'Tally Sync'
        }, { merge: true });
    } catch (e) {
        console.warn('Could not update system metadata:', e);
    }
}

// ─────────────────────────────────────────────────────────
// Main Orchestrator: Full Push Pipeline
// ─────────────────────────────────────────────────────────

/**
 * Execute the complete Firestore push pipeline.
 *
 * @param {Object} params
 * @param {Array}  params.transactions - Tally-fetched voucher array (from cache)
 * @param {Object} params.activeFY - { id, name, startDate, endDate }
 * @param {Object} params.currentUser - { name, ... }
 * @param {Function} params.onProgress - callback(statusText)
 * @returns {Promise<Object>} result summary
 */
export async function executeFirestorePush({ transactions, activeFY, currentUser, onProgress }) {
    const progress = onProgress || (() => {});

    // Step 1: Filter by FY
    progress('Filtering transactions by Fiscal Year...');
    const { valid, skippedCount } = filterTransactionsByFY(transactions, activeFY);

    if (valid.length === 0) {
        throw new Error(
            `No valid transactions found for ${activeFY.name} (${activeFY.startDate} to ${activeFY.endDate}). ` +
            (skippedCount > 0 ? `All ${skippedCount} were outside the FY range.` : '')
        );
    }

    // Step 2: Process affected accounts (auto-create new ones)
    progress('Processing affected accounts...');
    const { affectedAccountNames, existingAccounts, newAccountCount } =
        await processAffectedAccounts(valid, activeFY, progress);

    // Step 3: Save transactions (with dedup detection)
    progress('Saving transactions to Firestore...');
    const { newCount, updatedCount, newTransactions } =
        await batchSaveTransactions(valid, existingAccounts, progress);

    // Step 4: Sync balances (incremental delta for NEW transactions only)
    progress('Syncing account balances...');
    const syncedAccountCount = await syncBalancesIncremental(newTransactions, activeFY, progress);

    // Step 5: Update system metadata
    progress('Updating system metadata...');
    await updateSystemMetadata(valid, currentUser);

    progress('Push complete!');

    return {
        totalPushed: valid.length,
        skippedCount,
        newTransactionCount: newCount,
        updatedTransactionCount: updatedCount,
        affectedAccountCount: affectedAccountNames.size,
        newAccountCount,
        syncedAccountCount,
        fyName: activeFY.name,
    };
}

/**
 * Pre-analyze push without executing it.
 * Returns summary info for the confirmation modal.
 *
 * @param {Array} transactions
 * @param {Object} activeFY
 * @returns {Promise<Object>} analysis summary
 */
export async function analyzePushPreview(transactions, activeFY) {
    const { valid, skippedCount } = filterTransactionsByFY(transactions, activeFY);

    if (valid.length === 0) {
        return {
            validCount: 0,
            skippedCount,
            newAccountNames: [],
            existingTxnCount: 0,
            newTxnCount: 0,
            voucherTypes: {},
        };
    }

    // Collect all account names from valid transactions
    const allAccountNames = new Set();
    valid.forEach(t => {
        [...(t.allDebitAccounts || []), ...(t.allCreditAccounts || [])].forEach(name => {
            if (name && name !== '-') allAccountNames.add(name);
        });
        // Fallback
        if ((!t.allDebitAccounts || t.allDebitAccounts.length === 0) && t.debitAccount && t.debitAccount !== '-') {
            allAccountNames.add(t.debitAccount);
        }
        if ((!t.allCreditAccounts || t.allCreditAccounts.length === 0) && t.creditAccount && t.creditAccount !== '-') {
            allAccountNames.add(t.creditAccount);
        }
    });

    // Check existing accounts in Firestore
    const accSnap = await getDocs(query(collection(db, 'accounts')));
    const existingAccountNamesSet = new Set();
    accSnap.forEach(d => {
        const name = (d.data().name || '').toLowerCase().trim();
        if (name) existingAccountNamesSet.add(name);
    });

    const newAccountNames = [];
    allAccountNames.forEach(name => {
        if (!existingAccountNamesSet.has(name.toLowerCase().trim())) {
            newAccountNames.push(name);
        }
    });

    // Check existing transactions in Firestore
    const txnSnap = await getDocs(collection(db, 'transactions'));
    const existingTxnIds = new Set();
    txnSnap.forEach(d => existingTxnIds.add(d.id));

    let existingTxnCount = 0;
    let newTxnCount = 0;
    valid.forEach(t => {
        if (existingTxnIds.has(t.id)) existingTxnCount++;
        else newTxnCount++;
    });

    // Voucher type breakdown
    const voucherTypes = {};
    valid.forEach(t => {
        const type = t.type || 'Unknown';
        voucherTypes[type] = (voucherTypes[type] || 0) + 1;
    });

    return {
        validCount: valid.length,
        skippedCount,
        newAccountNames,
        existingTxnCount,
        newTxnCount,
        voucherTypes,
    };
}
