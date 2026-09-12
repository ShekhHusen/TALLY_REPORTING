import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, writeBatch, doc, getDocs, query, getDoc } from 'firebase/firestore';
import { processMaster, processTransactions } from '../utils/parser';
import { fetchFiscalYears, getCurrentFYObject } from '../utils/fiscalYear';
import PushTransactionModal from './PushTransactionModal';
import { PlusCircle, UploadCloud, RefreshCw, AlertTriangle, Database } from 'lucide-react';

export default function ImportCenter({ setUpdateTrigger, currentUser }) {
    const [loadingMaster, setLoadingMaster] = useState(false);
    const [loadingTransactions, setLoadingTransactions] = useState(false);
    const [clearing, setClearing] = useState(false);
    const [showPushModal, setShowPushModal] = useState(false);
    
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

    const processAffectedAccounts = async (parsedTransactions, activeFY) => {
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
        for (const accName of affectedAccountNames) {
            const key = accName.toLowerCase().trim();
            if (!key) continue;

            if (existingAccounts.has(key)) {
                const docIds = existingAccounts.get(key);
                docIds.forEach(docId => {
                    // Tag only THIS fiscal year's account subcollection as unverified
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
                const newId = crypto.randomUUID();
                // 1. Root account document
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
                // 2. Active fiscal year subcollection document
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
                // Track so other references to the same new account name in this batch don't create duplicate docs
                existingAccounts.set(key, [newId]);
            }
        }

        const chunks = chunkArray(batchOps, 450);
        for (const chunk of chunks) {
            const batch = writeBatch(db);
            chunk.forEach(op => {
                if (op.type === 'update') batch.update(op.ref, op.data);
                else if (op.merge) batch.set(op.ref, op.data, { merge: true });
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

                    const affectedCount = await processAffectedAccounts(validTransactions, activeFY);

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
        <div className="p-4 sm:p-6 max-w-5xl mx-auto flex flex-col gap-5 sm:gap-6">
            
            {/* Top Control Bar */}
            <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-4 bg-white p-4 sm:p-5 rounded-2xl shadow-sm border border-gray-100">
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4 w-full sm:w-auto">
                    <label className="text-sm font-bold text-gray-700 whitespace-nowrap">Fiscal Year:</label>
                    <select
                        value={selectedFYId}
                        onChange={(e) => setSelectedFYId(e.target.value)}
                        className="w-full sm:w-auto px-4 py-2 sm:py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-bold bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer"
                    >
                        {fyOptions.length === 0 && <option value="">No Fiscal Years found</option>}
                        {fyOptions.map(fy => <option key={fy.id} value={fy.id}>{fy.name}</option>)}
                    </select>
                </div>
                <button 
                    type="button"
                    onClick={() => setShowPushModal(true)}
                    className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 sm:py-2 rounded-xl shadow-sm font-bold transition-colors flex justify-center items-center gap-2 text-sm"
                >
                    <PlusCircle size={18} />
                    Push Transaction
                </button>
            </div>

            {/* Import Cards Section */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                
                {/* Import Master */}
                <div className="bg-white p-5 sm:p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity pointer-events-none">
                        <Database size={80} />
                    </div>
                    <div className="flex items-center gap-3 mb-2 relative z-10">
                        <div className="p-2 bg-blue-50 rounded-xl text-blue-600">
                            <UploadCloud size={20} />
                        </div>
                        <h3 className="text-lg font-extrabold text-gray-900">Import Master (Ledgers)</h3>
                    </div>
                    <p className="text-sm text-gray-500 mb-6 font-medium relative z-10">Upload Master.json to import account details to Firestore.</p>
                    
                    <div className="mt-auto relative z-10 bg-gray-50 p-1 rounded-xl border border-gray-100">
                        <input 
                            type="file" 
                            accept=".json" 
                            disabled={loadingMaster}
                            onChange={(e) => handleFileUpload(e, 'master')}
                            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2.5 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-bold file:bg-blue-600 file:text-white hover:file:bg-blue-700 transition-colors disabled:opacity-50 cursor-pointer"
                        />
                    </div>
                    {loadingMaster && <p className="mt-3 text-sm text-blue-600 font-bold animate-pulse">Uploading to Firestore...</p>}
                </div>

                {/* Import Transactions */}
                <div className="bg-white p-5 sm:p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity pointer-events-none">
                        <Database size={80} />
                    </div>
                    <div className="flex items-center gap-3 mb-2 relative z-10">
                        <div className="p-2 bg-indigo-50 rounded-xl text-indigo-600">
                            <UploadCloud size={20} />
                        </div>
                        <h3 className="text-lg font-extrabold text-gray-900">Import Transactions</h3>
                    </div>
                    <p className="text-sm text-gray-500 mb-6 font-medium relative z-10">Upload Transactions.json to import vouchers to Firestore.</p>
                    
                    <div className="mt-auto relative z-10 bg-gray-50 p-1 rounded-xl border border-gray-100">
                        <input 
                            type="file" 
                            accept=".json" 
                            disabled={loadingTransactions}
                            onChange={(e) => handleFileUpload(e, 'transaction')}
                            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2.5 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-bold file:bg-indigo-600 file:text-white hover:file:bg-indigo-700 transition-colors disabled:opacity-50 cursor-pointer"
                        />
                    </div>
                    {loadingTransactions && <p className="mt-3 text-sm text-indigo-600 font-bold animate-pulse">Uploading to Firestore...</p>}
                </div>

            </div>

            {/* Actions Section */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 mt-2">
                
                {/* Sync Balances */}
                <div className="bg-gradient-to-br from-amber-50 to-orange-50 p-5 sm:p-6 rounded-2xl shadow-sm border border-amber-200 flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6 justify-between">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <RefreshCw size={18} className="text-amber-700" />
                            <h3 className="text-lg font-extrabold text-amber-900">Sync Balances</h3>
                        </div>
                        <p className="text-sm text-amber-800 font-medium opacity-90">Calculate and save closing balances based on transactions.</p>
                    </div>
                    <button 
                        onClick={syncAccountBalances}
                        disabled={clearing}
                        className="w-full sm:w-auto shrink-0 bg-amber-600 hover:bg-amber-700 text-white py-2.5 px-5 rounded-xl shadow-sm font-bold transition-all disabled:opacity-50"
                    >
                        {clearing ? 'Processing...' : `Sync Balances`}
                    </button>
                </div>

                {/* Danger Zone */}
                <div className="bg-gradient-to-br from-red-50 to-rose-50 p-5 sm:p-6 rounded-2xl shadow-sm border border-red-200 flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6 justify-between">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <AlertTriangle size={18} className="text-red-700" />
                            <h3 className="text-lg font-extrabold text-red-900">Danger Zone</h3>
                        </div>
                        <p className="text-sm text-red-800 font-medium opacity-90">Permanently delete all Accounts and Transactions data.</p>
                    </div>
                    <button 
                        onClick={clearAllData}
                        disabled={clearing}
                        className="w-full sm:w-auto shrink-0 bg-red-600 hover:bg-red-700 text-white py-2.5 px-5 rounded-xl shadow-sm font-bold transition-all disabled:opacity-50"
                    >
                        {clearing ? 'Clearing...' : 'Clear All Data'}
                    </button>
                </div>

            </div>

            <PushTransactionModal
                isOpen={showPushModal}
                onClose={() => setShowPushModal(false)}
                currentUser={currentUser}
                onSave={() => {
                    if (setUpdateTrigger) {
                        setUpdateTrigger(prev => prev + 1);
                    }
                }}
            />
        </div>
    );
}
