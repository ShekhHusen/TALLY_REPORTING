import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, writeBatch, doc, getDocs, query, deleteDoc, setDoc, getDoc } from 'firebase/firestore';
import { processMaster, processTransactions } from '../utils/parser';
import { fetchFiscalYears, getCurrentFYObject } from '../utils/fiscalYear';

export default function ImportCenter({ setUpdateTrigger }) {
    const [loadingMaster, setLoadingMaster] = useState(false);
    const [loadingTransactions, setLoadingTransactions] = useState(false);
    const [clearing, setClearing] = useState(false);
    
    const [selectedFYId, setSelectedFYId] = useState('');
    const [fyOptions, setFyOptions] = useState([]);
    
    useEffect(() => {
        const loadFYs = async () => {
            const fys = await fetchFiscalYears();
            setFyOptions(fys);
            const current = getCurrentFYObject(fys);
            if (current) setSelectedFYId(current.id);
            else if (fys.length > 0) setSelectedFYId(fys[0].id);
        };
        loadFYs();
    }, []);

    const chunkArray = (arr, size) => {
        const chunked = [];
        for (let i = 0; i < arr.length; i += size) {
            chunked.push(arr.slice(i, i + size));
        }
        return chunked;
    };

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

    const processAffectedAccounts = async (parsedTransactions) => {
        const affectedAccountNames = new Set();
        parsedTransactions.forEach(t => {
            // Use allDebitAccounts/allCreditAccounts arrays to capture ALL accounts
            // (not just primary), important for multi-ledger journal vouchers
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

        const snap = await getDocs(query(collection(db, 'accounts')));
        const existingAccounts = new Map();
        snap.forEach(d => {
            const data = d.data();
            existingAccounts.set((data.name || '').toLowerCase(), d);
        });

        const batchOps = [];
        for (const accName of affectedAccountNames) {
            const key = accName.toLowerCase();
            if (existingAccounts.has(key)) {
                const existingDoc = existingAccounts.get(key);
                batchOps.push({
                    type: 'update',
                    ref: existingDoc.ref,
                    data: { verifiedBy: null, verifiedAt: null }
                });
            } else {
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
                        verifiedAt: null,
                        isNewAutoCreated: true
                    }
                });
            }
        }

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
        
        const activeFY = fyOptions.find(f => f.id === selectedFYId);
        if (!activeFY) {
            alert("Please select a Fiscal Year first. If none exist, ask Admin to create one.");
            return;
        }
        
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

                    const fyBatchOps = parsedAccounts.map(acc => ({
                        ref: doc(db, 'accounts', acc.id, 'fiscalYears', activeFY.id),
                        data: {
                            fyId: activeFY.id,
                            fyName: activeFY.name,
                            openingBalance: acc.openingBalance,
                            openingBalanceType: acc.openingBalanceType,
                            totalDebit: 0,
                            totalCredit: 0,
                            closingBalance: acc.openingBalance,
                            closingBalanceType: acc.openingBalanceType
                        }
                    }));
                    const fyChunks = chunkArray(fyBatchOps, 450);
                    for (const chunk of fyChunks) {
                        const batch = writeBatch(db);
                        chunk.forEach(op => batch.set(op.ref, op.data, { merge: true }));
                        await batch.commit();
                    }

                    alert(`Successfully imported ${parsedAccounts.length} accounts to Firestore (FY: ${activeFY.name}).`);
                    setLoadingMaster(false);
                    setUpdateTrigger(prev => prev + 1);
                } else {
                    setLoadingTransactions(true);
                    const parsedTransactions = processTransactions(json);
                    
                    // Validation: Only keep transactions within the FY range
                    const validTransactions = parsedTransactions.filter(txn => {
                        return txn.date >= activeFY.startDate && txn.date <= activeFY.endDate;
                    });
                    
                    const invalidCount = parsedTransactions.length - validTransactions.length;
                    
                    if (validTransactions.length === 0) {
                        alert(`No valid transactions found for ${activeFY.name} (${activeFY.startDate} to ${activeFY.endDate}). All ${invalidCount} were skipped.`);
                        setLoadingTransactions(false);
                        return;
                    }
                    
                    const chunks = chunkArray(validTransactions, 450);
                    for (const chunk of chunks) {
                        const batch = writeBatch(db);
                        chunk.forEach(txn => {
                            const ref = doc(db, 'transactions', txn.id);
                            batch.set(ref, txn);
                        });
                        await batch.commit();
                    }

                    const affectedCount = await processAffectedAccounts(validTransactions);

                    let msg = `Successfully imported ${validTransactions.length} transactions.`;
                    if (invalidCount > 0) {
                        msg += `\nSkipped ${invalidCount} transactions that were outside the ${activeFY.name} period.`;
                    }
                    msg += `\n${affectedCount} affected accounts processed.`;
                    
                    alert(msg);
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
            chunk.forEach(d => batch.delete(d.ref));
            await batch.commit();
        }
    };

    const syncAccountBalances = async () => {
        const activeFY = fyOptions.find(f => f.id === selectedFYId);
        if (!activeFY) return;
        
        if (!window.confirm(`This will calculate closing balances for all accounts based on transactions in ${activeFY.name}. Proceed?`)) return;
        
        try {
            setClearing(true);
            const startStr = activeFY.startDate;
            const endStr = activeFY.endDate;
            
            const accSnap = await getDocs(collection(db, 'accounts'));
            const accList = [];
            accSnap.forEach(d => accList.push({ ...d.data(), ref: d.ref, id: d.id }));
            
            const txnSnap = await getDocs(collection(db, 'transactions'));
            const txns = [];
            txnSnap.forEach(d => {
                const t = d.data();
                if (t.date && t.date >= startStr && t.date <= endStr) {
                    txns.push(t);
                }
            });
            
            const fyDocs = await Promise.all(accList.map(acc => getDoc(doc(db, 'accounts', acc.id, 'fiscalYears', activeFY.id))));
            
            const batchOps = [];
            const fyBatchOps = [];
            
            accList.forEach((acc, index) => {
                const accName = (acc.name || '').toLowerCase();
                let totalDebit = 0;
                let totalCredit = 0;
                
                txns.forEach(t => {
                    // Use allDebitEntries/allCreditEntries for accurate per-account amounts
                    // This correctly handles multi-ledger journal vouchers
                    const debitEntries = t.allDebitEntries || [];
                    const creditEntries = t.allCreditEntries || [];
                    
                    if (debitEntries.length > 0) {
                        debitEntries.forEach(entry => {
                            if (entry.name && entry.name.toLowerCase() === accName) {
                                totalDebit += parseFloat(entry.amount || 0);
                            }
                        });
                    } else if (t.debitAccount && t.debitAccount.toLowerCase() === accName) {
                        // Fallback for old data without allDebitEntries
                        totalDebit += parseFloat(t.debitAmount || 0);
                    }
                    
                    if (creditEntries.length > 0) {
                        creditEntries.forEach(entry => {
                            if (entry.name && entry.name.toLowerCase() === accName) {
                                totalCredit += parseFloat(entry.amount || 0);
                            }
                        });
                    } else if (t.creditAccount && t.creditAccount.toLowerCase() === accName) {
                        // Fallback for old data without allCreditEntries
                        totalCredit += parseFloat(t.creditAmount || 0);
                    }
                });
                
                const fyDoc = fyDocs[index];
                const fyData = fyDoc.exists() ? fyDoc.data() : { openingBalance: 0, openingBalanceType: '' };
                const ob = parseFloat(fyData.openingBalance || 0);
                const obSigned = fyData.openingBalanceType === 'Cr' ? -ob : ob;
                const closingSigned = obSigned + totalDebit - totalCredit;
                
                let closingBalanceType = closingSigned < 0 ? 'Cr' : (closingSigned > 0 ? 'Dr' : '');
                let closingBalance = Math.abs(closingSigned);
                
                batchOps.push({
                    ref: acc.ref,
                    data: { totalDebit, totalCredit, closingBalance, closingBalanceType }
                });
                
                fyBatchOps.push({
                    ref: doc(db, 'accounts', acc.id, 'fiscalYears', activeFY.id),
                    data: {
                        totalDebit,
                        totalCredit,
                        closingBalance,
                        closingBalanceType,
                        fyId: activeFY.id,
                        fyName: activeFY.name
                    }
                });
            });
            
            const chunks = chunkArray(batchOps, 450);
            for (const chunk of chunks) {
                const batch = writeBatch(db);
                chunk.forEach(op => batch.update(op.ref, op.data));
                await batch.commit();
            }
            
            const fyChunks = chunkArray(fyBatchOps, 450);
            for (const chunk of fyChunks) {
                const batch = writeBatch(db);
                chunk.forEach(op => batch.set(op.ref, op.data, { merge: true }));
                await batch.commit();
            }
            
            alert(`Account balances synced successfully for ${activeFY.name}!`);
        } catch (err) {
            alert(`Error syncing balances: ${err.message}`);
            console.error(err);
        } finally {
            setClearing(false);
        }
    };

    const handleCarryForward = async () => {
        alert("This feature has been removed as it requires specific mapping for dynamic FYs. Please use Master Import for new FYs.");
        // We can add it back later if needed, but since FYs are dynamic now, 
        // we'd need a dropdown to select the target FY instead of hardcoded 'nextFY' logic.
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

    const activeFYName = fyOptions.find(f => f.id === selectedFYId)?.name || 'Unknown FY';

    return (
        <div className="p-6 max-w-4xl mx-auto">
            <h2 className="text-2xl font-bold mb-6 text-gray-800">Import Center</h2>
            
            <div className="mb-6 flex items-center gap-4">
                <label className="text-sm font-semibold text-gray-700">Fiscal Year for Import:</label>
                <select
                    value={selectedFYId}
                    onChange={(e) => setSelectedFYId(e.target.value)}
                    className="px-3 py-1.5 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm font-medium bg-white"
                >
                    {fyOptions.length === 0 && <option value="">No Fiscal Years found</option>}
                    {fyOptions.map(fy => <option key={fy.id} value={fy.id}>{fy.name}</option>)}
                </select>
            </div>

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
                    <p className="text-sm text-yellow-700 mb-4">Calculate and save closing balances for all accounts based on transactions. Do this after importing.</p>
                    <button 
                        onClick={syncAccountBalances}
                        disabled={clearing}
                        className="bg-yellow-600 hover:bg-yellow-700 text-white py-2 px-4 rounded shadow font-medium transition disabled:opacity-50"
                    >
                        {clearing ? 'Processing...' : `Sync Balances (${activeFYName})`}
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
