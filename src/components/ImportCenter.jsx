import React, { useState } from 'react';
import { db } from '../firebase';
import { collection, writeBatch, doc, getDocs, query, deleteDoc } from 'firebase/firestore';
import { processMaster, processTransactions } from '../utils/parser';

export default function ImportCenter({ setUpdateTrigger }) {
    const [loadingMaster, setLoadingMaster] = useState(false);
    const [loadingTransactions, setLoadingTransactions] = useState(false);
    const [clearing, setClearing] = useState(false);
    
    // Chunk array helper for Firestore batch commits (limit is 500)
    const chunkArray = (arr, size) => {
        const chunked = [];
        for (let i = 0; i < arr.length; i += size) {
            chunked.push(arr.slice(i, i + size));
        }
        return chunked;
    };

    // Helper to decode uploaded file (handles UTF-16LE Tally exports)
    const decodeFile = (buffer) => {
        const uint8Array = new Uint8Array(buffer);
        
        let isUTF16LE = false;
        if (uint8Array.length >= 2 && uint8Array[0] === 0xFF && uint8Array[1] === 0xFE) {
            isUTF16LE = true;
        } else if (uint8Array.length > 1 && uint8Array[1] === 0 && uint8Array[0] !== 0) {
            isUTF16LE = true;
        }

        const decoder = new TextDecoder(isUTF16LE ? 'utf-16le' : 'utf-8');
        let text = decoder.decode(buffer);

        const firstBrace = text.indexOf('{');
        const firstBracket = text.indexOf('[');
        let firstIdx = -1;
        if (firstBrace !== -1 && firstBracket !== -1) firstIdx = Math.min(firstBrace, firstBracket);
        else if (firstBrace !== -1) firstIdx = firstBrace;
        else if (firstBracket !== -1) firstIdx = firstBracket;
        
        if (firstIdx > 0) text = text.substring(firstIdx);
        return JSON.parse(text);
    };

    // Un-verify only the accounts that appear in the imported transactions
    // Also auto-create accounts that don't exist in Firestore yet
    const processAffectedAccounts = async (parsedTransactions) => {
        // Collect all unique account names from the imported transactions
        const affectedAccountNames = new Set();
        parsedTransactions.forEach(t => {
            if (t.debitAccount && t.debitAccount !== '-') affectedAccountNames.add(t.debitAccount);
            if (t.creditAccount && t.creditAccount !== '-') affectedAccountNames.add(t.creditAccount);
        });

        // Fetch all existing accounts from Firestore
        const snap = await getDocs(query(collection(db, 'accounts')));
        const existingAccounts = new Map(); // name (lowercase) -> doc
        snap.forEach(d => {
            const data = d.data();
            existingAccounts.set((data.name || '').toLowerCase(), d);
        });

        const batchOps = []; // array of {ref, data} for batch operations

        for (const accName of affectedAccountNames) {
            const key = accName.toLowerCase();
            if (existingAccounts.has(key)) {
                // Account exists — un-verify it
                const existingDoc = existingAccounts.get(key);
                batchOps.push({
                    type: 'update',
                    ref: existingDoc.ref,
                    data: { verifiedBy: null, verifiedAt: null }
                });
            } else {
                // Account does NOT exist — auto-create it
                const newId = crypto.randomUUID();
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
                        verifiedBy: null,
                        verifiedAt: null
                    }
                });
            }
        }

        // Execute batch operations
        const chunks = chunkArray(batchOps, 450);
        for (const chunk of chunks) {
            const batch = writeBatch(db);
            chunk.forEach(op => {
                if (op.type === 'update') batch.update(op.ref, op.data);
                else batch.set(op.ref, op.data);
            });
            await batch.commit();
        }

        return affectedAccountNames.size;
    };

    const handleFileUpload = (e, type) => {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const json = decodeFile(event.target.result);

                if (type === 'master') {
                    setLoadingMaster(true);
                    const parsedAccounts = processMaster(json);
                    
                    const chunks = chunkArray(parsedAccounts, 450);
                    for (const chunk of chunks) {
                        const batch = writeBatch(db);
                        chunk.forEach(acc => {
                            const ref = doc(db, 'accounts', acc.id);
                            batch.set(ref, acc);
                        });
                        await batch.commit();
                    }
                    alert(`Successfully imported ${parsedAccounts.length} accounts to Firestore.`);
                    setLoadingMaster(false);
                    setUpdateTrigger(prev => prev + 1);
                } else {
                    setLoadingTransactions(true);
                    const parsedTransactions = processTransactions(json);
                    
                    const chunks = chunkArray(parsedTransactions, 450);
                    for (const chunk of chunks) {
                        const batch = writeBatch(db);
                        chunk.forEach(txn => {
                            const ref = doc(db, 'transactions', txn.id);
                            batch.set(ref, txn);
                        });
                        await batch.commit();
                    }

                    // Un-verify only affected accounts + auto-create missing ones
                    const affectedCount = await processAffectedAccounts(parsedTransactions);

                    alert(`Successfully imported ${parsedTransactions.length} transactions.\n${affectedCount} affected accounts processed (un-verified or auto-created).`);
                    setLoadingTransactions(false);
                    setUpdateTrigger(prev => prev + 1);
                }
            } catch (err) {
                alert(`Error during import: ${err.message}`);
                console.error(err);
                if(type === 'master') setLoadingMaster(false);
                else setLoadingTransactions(false);
            }
        };
        reader.readAsArrayBuffer(file);
    };

    const deleteCollection = async (collectionName) => {
        const snap = await getDocs(query(collection(db, collectionName)));
        const docs = [];
        snap.forEach(d => docs.push(d));

        const chunks = chunkArray(docs, 450);
        for (const chunk of chunks) {
            const batch = writeBatch(db);
            chunk.forEach(d => {
                batch.delete(d.ref);
            });
            await batch.commit();
        }
    };

    const syncAccountBalances = async () => {
        if (!window.confirm("This will calculate the total debit, credit, and closing balances for all accounts based on current transactions. Proceed?")) return;
        
        try {
            setClearing(true); // Reusing this state for loading
            
            // 1. Fetch all accounts
            const accSnap = await getDocs(collection(db, 'accounts'));
            const accList = [];
            accSnap.forEach(d => accList.push({ ...d.data(), ref: d.ref }));
            
            // 2. Fetch all transactions
            const txnSnap = await getDocs(collection(db, 'transactions'));
            const txns = [];
            txnSnap.forEach(d => txns.push(d.data()));
            
            // 3. Calculate for each account
            const batchOps = [];
            accList.forEach(acc => {
                const accName = (acc.name || '').toLowerCase();
                let totalDebit = 0;
                let totalCredit = 0;
                
                txns.forEach(t => {
                    if (t.debitAccount && t.debitAccount.toLowerCase() === accName) {
                        totalDebit += parseFloat(t.debitAmount || 0);
                    }
                    if (t.creditAccount && t.creditAccount.toLowerCase() === accName) {
                        totalCredit += parseFloat(t.creditAmount || 0);
                    }
                });
                
                const obSigned = acc.openingBalanceType === 'Cr' ? -parseFloat(acc.openingBalance || 0) : parseFloat(acc.openingBalance || 0);
                const closingSigned = obSigned + totalDebit - totalCredit;
                
                let closingBalanceType = closingSigned < 0 ? 'Cr' : (closingSigned > 0 ? 'Dr' : '');
                let closingBalance = Math.abs(closingSigned);
                
                batchOps.push({
                    ref: acc.ref,
                    data: {
                        totalDebit,
                        totalCredit,
                        closingBalance,
                        closingBalanceType
                    }
                });
            });
            
            // 4. Update Firestore in batches
            const chunks = chunkArray(batchOps, 450);
            for (const chunk of chunks) {
                const batch = writeBatch(db);
                chunk.forEach(op => {
                    batch.update(op.ref, op.data);
                });
                await batch.commit();
            }
            
            alert("Account balances synced successfully!");
        } catch (err) {
            alert(`Error syncing balances: ${err.message}`);
            console.error(err);
        } finally {
            setClearing(false);
        }
    };

    const clearAllData = async () => {
        if(!window.confirm("Are you sure you want to clear all imported Accounts and Transactions data from Firestore? This action cannot be undone.")) return;
        
        try {
            setClearing(true);
            await deleteCollection('accounts');
            await deleteCollection('transactions');
            alert("All data cleared from Firestore successfully.");
            setUpdateTrigger(prev => prev + 1);
        } catch (err) {
            alert(`Error clearing data: ${err.message}`);
            console.error(err);
        } finally {
            setClearing(false);
        }
    };

    return (
        <div className="p-6 max-w-4xl mx-auto">
            <h2 className="text-2xl font-bold mb-6 text-gray-800">Import Center</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                
                <div className="bg-white p-6 rounded-lg shadow border border-gray-200">
                    <h3 className="text-lg font-semibold mb-2 text-gray-800">Import Master (Ledgers)</h3>
                    <p className="text-sm text-gray-500 mb-4">Upload Master.json to import account details to Firestore.</p>
                    <input 
                        type="file" 
                        accept=".json" 
                        disabled={loadingMaster}
                        onChange={(e) => handleFileUpload(e, 'master')}
                        className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 disabled:opacity-50"
                    />
                    {loadingMaster && <p className="mt-3 text-sm text-blue-600 font-medium animate-pulse">Uploading to Firestore...</p>}
                </div>

                <div className="bg-white p-6 rounded-lg shadow border border-gray-200">
                    <h3 className="text-lg font-semibold mb-2 text-gray-800">Import Transactions (Vouchers)</h3>
                    <p className="text-sm text-gray-500 mb-4">Upload Transactions.json to import vouchers to Firestore.</p>
                    <input 
                        type="file" 
                        accept=".json" 
                        disabled={loadingTransactions}
                        onChange={(e) => handleFileUpload(e, 'transaction')}
                        className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 disabled:opacity-50"
                    />
                    {loadingTransactions && <p className="mt-3 text-sm text-blue-600 font-medium animate-pulse">Uploading to Firestore...</p>}
                </div>

            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-yellow-50 p-6 rounded-lg shadow border border-yellow-200 text-center">
                    <h3 className="text-lg font-semibold text-yellow-800 mb-2">Sync Balances</h3>
                    <p className="text-sm text-yellow-700 mb-4">Calculate and save closing balances for all accounts based on transactions. Do this after importing to enable Balance filters.</p>
                    <button 
                        onClick={syncAccountBalances}
                        disabled={clearing}
                        className="bg-yellow-600 hover:bg-yellow-700 text-white py-2 px-4 rounded shadow font-medium transition disabled:opacity-50"
                    >
                        {clearing ? 'Processing...' : 'Sync Account Balances'}
                    </button>
                </div>

                <div className="bg-red-50 p-6 rounded-lg shadow border border-red-200 text-center">
                    <h3 className="text-lg font-semibold text-red-700 mb-2">Danger Zone</h3>
                    <p className="text-sm text-red-600 mb-4">This will permanently delete all Accounts and Transactions data from Firestore.</p>
                    <button 
                        onClick={clearAllData}
                        disabled={clearing}
                        className="bg-red-600 hover:bg-red-700 text-white py-2 px-4 rounded shadow font-medium transition disabled:opacity-50"
                    >
                        {clearing ? 'Clearing...' : 'Clear All Data'}
                    </button>
                </div>
            </div>
        </div>
    );
}
