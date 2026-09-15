import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import { collection, writeBatch, doc, getDocs, query, getDoc } from 'firebase/firestore';
import { processMaster, processTransactions } from '../utils/parser';
import { fetchFiscalYears, getCurrentFYObject } from '../utils/fiscalYear';
import PushTransactionModal from './PushTransactionModal';
import AccountDeltaModal from './AccountDeltaModal';
import { PlusCircle, UploadCloud, RefreshCw, AlertTriangle, Database, Eye, X, Search, ChevronDown, ChevronUp, ArrowUpDown, ArrowUp, ArrowDown, Filter, RotateCcw, Layers, Package, Calculator } from 'lucide-react';

export default function ImportCenter({ setUpdateTrigger, currentUser }) {
    const [loadingMaster, setLoadingMaster] = useState(false);
    const [loadingTransactions, setLoadingTransactions] = useState(false);
    const [clearing, setClearing] = useState(false);
    const [showPushModal, setShowPushModal] = useState(false);
    
    const [selectedFYId, setSelectedFYId] = useState('');
    const [fyOptions, setFyOptions] = useState([]);
    
    // Test Import Preview states
    const [previewOpen, setPreviewOpen] = useState(false);
    const [previewData, setPreviewData] = useState([]);
    const [previewType, setPreviewType] = useState(''); // 'master' or 'transaction'
    const [previewSearch, setPreviewSearch] = useState('');
    const [previewPage, setPreviewPage] = useState(1);
    const [expandedRows, setExpandedRows] = useState(new Set());
    const PREVIEW_PAGE_SIZE = 50;
    
    // Save to Firebase from Preview states
    const [savingPreview, setSavingPreview] = useState(false);
    const [saveStatusText, setSaveStatusText] = useState('');
    const [hasCachedTxn, setHasCachedTxn] = useState(false);
    const [hasCachedMaster, setHasCachedMaster] = useState(false);

    // New account detection states
    const [existingAccountNames, setExistingAccountNames] = useState(null); // null = not fetched, Set = fetched
    const [loadingAccounts, setLoadingAccounts] = useState(false);
    
    // Delta Preview Modal state
    const [deltaModalOpen, setDeltaModalOpen] = useState(false);

    useEffect(() => {
        try {
            setHasCachedTxn(Boolean(localStorage.getItem('testImport_transactions')));
            setHasCachedMaster(Boolean(localStorage.getItem('testImport_master')));
        } catch {
            // ignore
        }
    }, [previewOpen]);
    
    // Transaction preview sort & filter states
    const [txnSortField, setTxnSortField] = useState('');  // 'date', 'type', 'voucherNo'
    const [txnSortDir, setTxnSortDir] = useState('asc');    // 'asc' or 'desc'
    const [txnFilterDate, setTxnFilterDate] = useState('');   // selected date value
    const [txnFilterType, setTxnFilterType] = useState('');   // selected voucher type
    const [txnFilterVchNo, setTxnFilterVchNo] = useState(''); // vch no search text
    const [txnFilterMulti, setTxnFilterMulti] = useState(''); // '' (all), 'multi', 'single'
    const [txnFilterNewAcct, setTxnFilterNewAcct] = useState(false); // filter: only txns with new accounts

    const handleTxnSort = (field) => {
        if (txnSortField === field) {
            if (txnSortDir === 'asc') {
                setTxnSortDir('desc');
            } else {
                setTxnSortField('');
                setTxnSortDir('asc');
            }
        } else {
            setTxnSortField(field);
            setTxnSortDir('asc');
        }
        setPreviewPage(1);
    };

    const resetTxnFilters = () => {
        setTxnSortField('');
        setTxnSortDir('asc');
        setTxnFilterDate('');
        setTxnFilterType('');
        setTxnFilterVchNo('');
        setTxnFilterMulti('');
        setTxnFilterNewAcct(false);
        setPreviewPage(1);
    };

    const uniqueVoucherTypes = useMemo(() => {
        if (previewType !== 'transaction' || !Array.isArray(previewData)) return [];
        const set = new Set();
        previewData.forEach(t => {
            if (t.type) set.add(t.type);
        });
        return Array.from(set).sort();
    }, [previewData, previewType]);

    const multiEntryCount = useMemo(() => {
        if (previewType !== 'transaction' || !Array.isArray(previewData)) return 0;
        return previewData.filter(t => (t.allDebitEntries?.length > 1 || t.allCreditEntries?.length > 1 || ((t.allDebitEntries?.length || 0) + (t.allCreditEntries?.length || 0) > 2))).length;
    }, [previewData, previewType]);

    // Fetch existing account names from Firestore for new-account detection
    const fetchExistingAccountNames = async () => {
        try {
            setLoadingAccounts(true);
            const snap = await getDocs(query(collection(db, 'accounts')));
            const names = new Set();
            snap.forEach(d => {
                const data = d.data();
                const name = (data.name || '').toLowerCase().trim();
                if (name) names.add(name);
            });
            setExistingAccountNames(names);
        } catch (err) {
            console.error('Error fetching existing accounts for preview:', err);
            setExistingAccountNames(new Set());
        } finally {
            setLoadingAccounts(false);
        }
    };

    // Compute set of NEW account names (present in transactions but not in Firestore)
    const newAccountNames = useMemo(() => {
        if (previewType !== 'transaction' || !Array.isArray(previewData) || existingAccountNames === null) return new Set();
        const newNames = new Set();
        previewData.forEach(t => {
            const allAccounts = [
                ...(t.allDebitAccounts || []),
                ...(t.allCreditAccounts || []),
            ];
            // Fallback for transactions without allDebitAccounts/allCreditAccounts arrays
            if (allAccounts.length === 0) {
                if (t.debitAccount && t.debitAccount !== '-') allAccounts.push(t.debitAccount);
                if (t.creditAccount && t.creditAccount !== '-') allAccounts.push(t.creditAccount);
            }
            allAccounts.forEach(name => {
                if (name && name !== '-' && !existingAccountNames.has(name.toLowerCase().trim())) {
                    newNames.add(name);
                }
            });
        });
        return newNames;
    }, [previewData, previewType, existingAccountNames]);

    const isNewAccount = (name) => {
        if (!name || name === '-' || existingAccountNames === null) return false;
        return !existingAccountNames.has(name.toLowerCase().trim());
    };

    // Count of transactions that contain at least one new account
    const newAcctTxnCount = useMemo(() => {
        if (previewType !== 'transaction' || !Array.isArray(previewData) || newAccountNames.size === 0) return 0;
        return previewData.filter(t => {
            const allAccounts = [
                ...(t.allDebitAccounts || []),
                ...(t.allCreditAccounts || []),
            ];
            if (allAccounts.length === 0) {
                if (t.debitAccount && t.debitAccount !== '-') allAccounts.push(t.debitAccount);
                if (t.creditAccount && t.creditAccount !== '-') allAccounts.push(t.creditAccount);
            }
            return allAccounts.some(name => name && name !== '-' && isNewAccount(name));
        }).length;
    }, [previewData, previewType, newAccountNames]);

    // Count of unique affected accounts in transaction preview for Delta Calculation
    const affectedAccountsCount = useMemo(() => {
        if (previewType !== 'transaction' || !Array.isArray(previewData)) return 0;
        const set = new Set();
        previewData.forEach(t => {
            const debitEntries = t.allDebitEntries || [];
            const creditEntries = t.allCreditEntries || [];
            if (debitEntries.length > 0) {
                debitEntries.forEach(entry => {
                    const key = (entry.name || '').toLowerCase().trim();
                    if (key && key !== '-') set.add(key);
                });
            } else if (t.debitAccount && t.debitAccount !== '-') {
                set.add(t.debitAccount.toLowerCase().trim());
            }
            if (creditEntries.length > 0) {
                creditEntries.forEach(entry => {
                    const key = (entry.name || '').toLowerCase().trim();
                    if (key && key !== '-') set.add(key);
                });
            } else if (t.creditAccount && t.creditAccount !== '-') {
                set.add(t.creditAccount.toLowerCase().trim());
            }
        });
        return set.size;
    }, [previewData, previewType]);
    
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

    const handleTestImport = (e, type) => {
        const file = e.target.files[0];
        if (!file) return;
        
        const activeFY = fyOptions.find(f => f.id === selectedFYId);
        if (!activeFY) {
            alert("Please select a Fiscal Year first.");
            e.target.value = '';
            return;
        }
        
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const json = decodeFile(event.target.result);
                let parsed;
                
                if (type === 'master') {
                    parsed = processMaster(json);
                    // Save to localStorage
                    localStorage.setItem('testImport_master', JSON.stringify(parsed));
                    localStorage.setItem('testImport_master_fy', JSON.stringify(activeFY));
                } else {
                    const allParsed = processTransactions(json);
                    // Filter by FY date range like actual import does
                    const valid = allParsed.filter(txn => txn.date >= activeFY.startDate && txn.date <= activeFY.endDate);
                    const skipped = allParsed.length - valid.length;
                    parsed = valid;
                    // Save to localStorage
                    localStorage.setItem('testImport_transactions', JSON.stringify(valid));
                    localStorage.setItem('testImport_transactions_fy', JSON.stringify(activeFY));
                    if (skipped > 0) {
                        parsed._skippedCount = skipped;
                        parsed._totalCount = allParsed.length;
                    }
                }
                
                setPreviewData(parsed);
                setPreviewType(type);
                setPreviewSearch('');
                setPreviewPage(1);
                setExpandedRows(new Set());
                setTxnSortField('');
                setTxnSortDir('asc');
                setTxnFilterDate('');
                setTxnFilterType('');
                setTxnFilterVchNo('');
                setTxnFilterMulti('');
                setTxnFilterNewAcct(false);
                setPreviewOpen(true);
                // Fetch existing accounts for new-account detection in transaction preview
                if (type === 'transaction') fetchExistingAccountNames();
            } catch (err) {
                alert(`Error parsing file: ${err.message}`);
                console.error(err);
            }
        };
        reader.readAsArrayBuffer(file);
        e.target.value = ''; // Reset input so same file can be selected again
    };

    const openCachedPreview = (type) => {
        try {
            const key = type === 'master' ? 'testImport_master' : 'testImport_transactions';
            const raw = localStorage.getItem(key);
            if (!raw) {
                alert(`No cached ${type} preview found in localStorage.`);
                return;
            }
            const data = JSON.parse(raw);
            setPreviewData(data);
            setPreviewType(type);
            setPreviewSearch('');
            setPreviewPage(1);
            setExpandedRows(new Set());
            setTxnSortField('');
            setTxnSortDir('asc');
            setTxnFilterDate('');
            setTxnFilterType('');
            setTxnFilterVchNo('');
            setTxnFilterMulti('');
            setTxnFilterNewAcct(false);
            setPreviewOpen(true);
            if (type === 'transaction') fetchExistingAccountNames();
        } catch (e) {
            alert("Error loading preview from cache: " + e.message);
        }
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

        return affectedAccountNames;
    };

    const syncBalancesForImportedAccounts = async (parsedTransactions, activeFY) => {
        // Step 1: Locally calculate per-account debit/credit from imported transactions
        const accountDeltas = new Map(); // lowercase name -> { debit, credit }
        
        parsedTransactions.forEach(t => {
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

        // Step 2: Fetch only affected accounts from Firestore
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

        // Step 3: Fetch FY docs for affected accounts only
        const fyDocs = await Promise.all(
            affectedAccounts.map(acc => getDoc(doc(db, 'accounts', acc.id, 'fiscalYears', activeFY.id)))
        );

        const batchOps = [];
        const fyBatchOps = [];

        // Step 4: Calculate updated balances (existing + delta)
        affectedAccounts.forEach((acc, index) => {
            const delta = accountDeltas.get(acc.key);
            const fyDoc = fyDocs[index];
            const fyData = fyDoc.exists() ? fyDoc.data() : { openingBalance: 0, openingBalanceType: '' };
            
            const newTotalDebit = (fyData.totalDebit || 0) + delta.debit;
            const newTotalCredit = (fyData.totalCredit || 0) + delta.credit;
            
            // Recalculate closing from opening + updated totals
            const ob = parseFloat(fyData.openingBalance || 0);
            const obSigned = fyData.openingBalanceType === 'Cr' ? -ob : ob;
            const closingSigned = obSigned + newTotalDebit - newTotalCredit;
            
            let closingBalanceType = closingSigned < 0 ? 'Cr' : (closingSigned > 0 ? 'Dr' : '');
            let closingBalance = Math.abs(closingSigned);
            
            batchOps.push({
                ref: acc.ref,
                data: { totalDebit: newTotalDebit, totalCredit: newTotalCredit, closingBalance, closingBalanceType }
            });
            
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

        // Step 5: Batch write updates
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

        return affectedAccounts.length;
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

                    const affectedAccountNames = await processAffectedAccounts(validTransactions, activeFY);
                    
                    setLoadingTransactions(true); // Ensure loading is still true
                    const syncedCount = await syncBalancesForImportedAccounts(validTransactions, activeFY);

                    let msg = `Successfully imported ${validTransactions.length} transactions.`;
                    if (invalidCount > 0) {
                        msg += `\nSkipped ${invalidCount} transactions that were outside the ${activeFY.name} period.`;
                    }
                    msg += `\n${affectedAccountNames.size} affected accounts processed.`;
                    msg += `\n${syncedCount} account balances auto-synced.`;
                    
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

    const handleSavePreviewToFirebase = async () => {
        if (!previewData || previewData.length === 0) {
            alert("No preview data available to save.");
            return;
        }

        const activeFY = fyOptions.find(f => f.id === selectedFYId);
        if (!activeFY) {
            alert("Please select a Fiscal Year first. If none exist, ask Admin to create one.");
            return;
        }

        if (previewType === 'transaction') {
            const validTransactions = previewData.filter(txn => {
                return txn.date >= activeFY.startDate && txn.date <= activeFY.endDate;
            });
            const invalidCount = previewData.length - validTransactions.length;

            if (validTransactions.length === 0) {
                alert(`No valid transactions found for ${activeFY.name} (${activeFY.startDate} to ${activeFY.endDate}). All ${invalidCount} were outside the FY range.`);
                return;
            }

            const confirmMsg = `Are you sure you want to save ${validTransactions.length} transactions to Firestore for ${activeFY.name} (${activeFY.startDate} to ${activeFY.endDate})?` +
                (invalidCount > 0 ? `\n\nNote: ${invalidCount} transactions outside this Fiscal Year range will be skipped.` : '');
            
            if (!window.confirm(confirmMsg)) return;

            try {
                setSavingPreview(true);
                setSaveStatusText('Preparing batches...');

                const chunks = chunkArray(validTransactions, 450);
                for (let i = 0; i < chunks.length; i++) {
                    setSaveStatusText(`Saving transactions: batch ${i + 1} of ${chunks.length}...`);
                    const batch = writeBatch(db);
                    chunks[i].forEach(txn => {
                        const ref = doc(db, 'transactions', txn.id);
                        batch.set(ref, txn);
                    });
                    await batch.commit();
                }

                setSaveStatusText('Processing affected accounts & balances...');
                const affectedAccountNames = await processAffectedAccounts(validTransactions, activeFY);
                
                setSaveStatusText('Syncing balances for affected accounts...');
                const syncedCount = await syncBalancesForImportedAccounts(validTransactions, activeFY);

                let msg = `Successfully saved ${validTransactions.length} transactions to Firestore (FY: ${activeFY.name})!`;
                if (invalidCount > 0) {
                    msg += `\nSkipped ${invalidCount} transactions that were outside the ${activeFY.name} period.`;
                }
                msg += `\n${affectedAccountNames.size} affected accounts updated.`;
                msg += `\n${syncedCount} account balances auto-synced.`;

                alert(msg);
                setPreviewOpen(false);
                if (setUpdateTrigger) {
                    setUpdateTrigger(prev => prev + 1);
                }
            } catch (err) {
                alert(`Error saving transactions to Firestore: ${err.message}`);
                console.error(err);
            } finally {
                setSavingPreview(false);
                setSaveStatusText('');
            }
        } else if (previewType === 'master') {
            const confirmMsg = `Are you sure you want to save ${previewData.length} accounts to Firestore for ${activeFY.name}?`;
            if (!window.confirm(confirmMsg)) return;

            try {
                setSavingPreview(true);
                setSaveStatusText('Saving accounts to Firestore...');

                const chunks = chunkArray(previewData, 450);
                for (let i = 0; i < chunks.length; i++) {
                    setSaveStatusText(`Saving accounts: batch ${i + 1} of ${chunks.length}...`);
                    const batch = writeBatch(db);
                    chunks[i].forEach(acc => {
                        const ref = doc(db, 'accounts', acc.id);
                        batch.set(ref, acc);
                    });
                    await batch.commit();
                }

                const fyBatchOps = previewData.map(acc => ({
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
                for (let i = 0; i < fyChunks.length; i++) {
                    setSaveStatusText(`Updating FY balances: batch ${i + 1} of ${fyChunks.length}...`);
                    const batch = writeBatch(db);
                    fyChunks[i].forEach(op => batch.set(op.ref, op.data, { merge: true }));
                    await batch.commit();
                }

                alert(`Successfully imported ${previewData.length} accounts to Firestore (FY: ${activeFY.name})!`);
                setPreviewOpen(false);
                if (setUpdateTrigger) {
                    setUpdateTrigger(prev => prev + 1);
                }
            } catch (err) {
                alert(`Error saving accounts to Firestore: ${err.message}`);
                console.error(err);
            } finally {
                setSavingPreview(false);
                setSaveStatusText('');
            }
        }
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
                    <p className="text-sm text-gray-500 mb-4 font-medium relative z-10">Upload Master.json to import account details to Firestore.</p>
                    
                    {/* Test Master Button */}
                    <div className="relative z-10 mb-3 flex flex-col gap-1.5">
                        <label className="flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-xl border-2 border-dashed border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-sm cursor-pointer transition-all">
                            <Eye size={16} />
                            Test Master (Preview)
                            <input
                                type="file"
                                accept=".json"
                                onChange={(e) => handleTestImport(e, 'master')}
                                className="hidden"
                            />
                        </label>
                        {hasCachedMaster && (
                            <button
                                type="button"
                                onClick={() => openCachedPreview('master')}
                                className="text-xs text-emerald-700 hover:text-emerald-800 font-bold flex items-center justify-center gap-1 py-1 px-2 rounded-lg bg-emerald-50/70 hover:bg-emerald-100/70 transition-colors cursor-pointer"
                                title="Open previously tested master data"
                            >
                                <Eye size={12} />
                                View Cached Test Preview
                            </button>
                        )}
                    </div>
                    
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
                    <p className="text-sm text-gray-500 mb-4 font-medium relative z-10">Upload Transactions.json to import vouchers to Firestore.</p>
                    
                    {/* Test Transaction Button */}
                    <div className="relative z-10 mb-3 flex flex-col gap-1.5">
                        <label className="flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-xl border-2 border-dashed border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-sm cursor-pointer transition-all">
                            <Eye size={16} />
                            Test Transaction (Preview)
                            <input
                                type="file"
                                accept=".json"
                                onChange={(e) => handleTestImport(e, 'transaction')}
                                className="hidden"
                            />
                        </label>
                        {hasCachedTxn && (
                            <button
                                type="button"
                                onClick={() => openCachedPreview('transaction')}
                                className="text-xs text-emerald-700 hover:text-emerald-800 font-bold flex items-center justify-center gap-1 py-1 px-2 rounded-lg bg-emerald-50/70 hover:bg-emerald-100/70 transition-colors cursor-pointer"
                                title="Open previously tested transactions"
                            >
                                <Eye size={12} />
                                View Cached Test Preview
                            </button>
                        )}
                    </div>
                    
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


            {/* Test Import Preview Modal */}
            {previewOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-2 sm:p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-h-[95vh] flex flex-col overflow-hidden">
                        {/* Modal Header */}
                        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-gray-100 bg-gradient-to-r from-emerald-50 to-teal-50">
                            
                            <div>
                                <h2 className="text-lg sm:text-xl font-extrabold text-gray-900 flex items-center gap-2">
                                    <Eye size={22} className="text-emerald-600" />
                                    {previewType === 'master' ? 'Test Master Preview' : 'Test Transaction Preview'}
                                </h2>
                            
                            </div>
                            
                            {/* Stats Bar */}
                        <div className="flex flex-wrap items-center gap-3 px-4 sm:px-5 py-3 bg-gray-50 border-b border-gray-100 text-sm">
                            <span className="bg-emerald-100 text-emerald-800 px-3 py-1 rounded-lg font-bold">
                                Total: {previewData.length} {previewType === 'master' ? 'Accounts' : 'Transactions'}
                            </span>
                            {previewType === 'transaction' && previewData._skippedCount > 0 && (
                                <span className="bg-amber-100 text-amber-800 px-3 py-1 rounded-lg font-bold">
                                    Skipped (Out of FY): {previewData._skippedCount}
                                </span>
                            )}
                            <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-lg font-bold">
                                FY: {activeFYName}
                            </span>
                            <span className="bg-gray-200 text-gray-700 px-3 py-1 rounded-lg font-bold">
                                Saved to localStorage ✓
                            </span>
                            
                            {previewType === 'transaction' && (txnFilterDate || txnFilterType || txnFilterVchNo || txnFilterMulti || txnSortField) && (
                                <button
                                    type="button"
                                    onClick={resetTxnFilters}
                                    className="inline-flex items-center gap-1.5 bg-amber-100 hover:bg-amber-200 text-amber-900 px-3 py-1 rounded-lg font-bold text-xs transition-colors cursor-pointer ml-auto"
                                    title="Clear all column filters and sorting"
                                >
                                    <RotateCcw size={13} />
                                    Reset Filters & Sort
                                </button>
                            )}
                        </div>



                            <div className="flex items-center gap-2">
                                {previewType === 'transaction' && (
                                    <button
                                        type="button"
                                        onClick={() => setDeltaModalOpen(true)}
                                        className="inline-flex items-center gap-1.5 bg-white border border-emerald-300 hover:bg-emerald-50 text-emerald-800 px-3 py-2 rounded-xl font-bold text-xs sm:text-sm shadow-2xs hover:shadow-xs transition-all cursor-pointer"
                                        title="View locally calculated changes for affected accounts"
                                    >
                                        <Calculator size={15} className="text-emerald-600" />
                                        <span className="hidden sm:inline">Account Deltas</span>
                                        <span className="bg-emerald-100 text-emerald-800 text-[11px] font-black px-1.5 py-0.5 rounded-full">
                                            {affectedAccountsCount}
                                        </span>
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={handleSavePreviewToFirebase}
                                    disabled={savingPreview || previewData.length === 0}
                                    className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white px-3.5 py-2 rounded-xl font-bold text-xs sm:text-sm shadow-sm hover:shadow transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                                    title="Save previewed data directly to Firebase Firestore"
                                >
                                    {savingPreview ? (
                                        <>
                                            <RefreshCw size={14} className="animate-spin" />
                                            <span className="hidden sm:inline">{saveStatusText || 'Saving...'}</span>
                                            <span className="sm:hidden">Saving...</span>
                                        </>
                                    ) : (
                                        <>
                                            <UploadCloud size={15} />
                                            <span>Save to Firebase</span>
                                        </>
                                    )}
                                </button>
                                <button 
                                    onClick={() => !savingPreview && setPreviewOpen(false)}
                                    disabled={savingPreview}
                                    className="p-2 hover:bg-gray-100 rounded-xl transition-colors disabled:opacity-40 cursor-pointer"
                                >
                                    <X size={22} className="text-gray-500" />
                                </button>
                            </div>
                        </div>

                        

                        {/* Search Bar */}
                        <div className="px-4 sm:px-5 py-3 border-b border-gray-100">
                            <div className="relative">
                                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                <input
                                    type="text"
                                    placeholder={previewType === 'master' ? 'Search by name, group, address...' : 'Search by date, voucher no, account, narration...'}
                                    value={previewSearch}
                                    onChange={(e) => { setPreviewSearch(e.target.value); setPreviewPage(1); }}
                                    className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                                />
                            </div>
                        </div>
            
                        {/* Table Content */}
                        <div className="flex-1 overflow-auto">
                            {previewType === 'master' ? (() => {
                                const filtered = previewData.filter(acc => {
                                    if (!previewSearch) return true;
                                    const q = previewSearch.toLowerCase();
                                    return (acc.name || '').toLowerCase().includes(q) ||
                                           (acc.group || '').toLowerCase().includes(q) ||
                                           (acc.address || '').toLowerCase().includes(q) ||
                                           (acc.contact || '').toLowerCase().includes(q);
                                });
                                const totalPages = Math.ceil(filtered.length / PREVIEW_PAGE_SIZE);
                                const paged = filtered.slice((previewPage - 1) * PREVIEW_PAGE_SIZE, previewPage * PREVIEW_PAGE_SIZE);
                                
                                return (
                                    <>
                                        <table className="w-full text-sm">
                                            <thead className="bg-gray-50 sticky top-0 z-10">
                                                <tr>
                                                    <th className="text-left px-4 py-3 font-bold text-gray-600 border-b">#</th>
                                                    <th className="text-left px-4 py-3 font-bold text-gray-600 border-b">Account Name</th>
                                                    <th className="text-left px-4 py-3 font-bold text-gray-600 border-b">Group</th>
                                                    <th className="text-right px-4 py-3 font-bold text-gray-600 border-b">Opening Balance</th>
                                                    <th className="text-center px-4 py-3 font-bold text-gray-600 border-b">Type</th>
                                                    <th className="text-left px-4 py-3 font-bold text-gray-600 border-b hidden lg:table-cell">Address</th>
                                                    <th className="text-left px-4 py-3 font-bold text-gray-600 border-b hidden lg:table-cell">Contact</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {paged.map((acc, i) => (
                                                    <tr key={acc.id || i} className="border-b border-gray-50 hover:bg-emerald-50/50 transition-colors">
                                                        <td className="px-4 py-2.5 text-gray-400 font-medium">{(previewPage - 1) * PREVIEW_PAGE_SIZE + i + 1}</td>
                                                        <td className="px-4 py-2.5 font-bold text-gray-900">{acc.name || '-'}</td>
                                                        <td className="px-4 py-2.5 text-gray-600">{acc.group || '-'}</td>
                                                        <td className="px-4 py-2.5 text-right font-mono font-bold text-gray-800">
                                                            {acc.openingBalance ? Number(acc.openingBalance).toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '0.00'}
                                                        </td>
                                                        <td className="px-4 py-2.5 text-center">
                                                            {acc.openingBalanceType ? (
                                                                <span className={`px-2 py-0.5 rounded-md text-xs font-bold ${acc.openingBalanceType === 'Dr' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                                                                    {acc.openingBalanceType}
                                                                </span>
                                                            ) : '-'}
                                                        </td>
                                                        <td className="px-4 py-2.5 text-gray-500 text-xs hidden lg:table-cell max-w-[200px] truncate" title={acc.address}>{acc.address || '-'}</td>
                                                        <td className="px-4 py-2.5 text-gray-500 text-xs hidden lg:table-cell">{acc.contact || '-'}</td>
                                                    </tr>
                                                ))}
                                                {paged.length === 0 && (
                                                    <tr><td colSpan="7" className="text-center py-10 text-gray-400 font-medium">No matching accounts found</td></tr>
                                                )}
                                            </tbody>
                                        </table>
                                        {/* Pagination */}
                                        {totalPages > 1 && (
                                            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50 sticky bottom-0">
                                                <span className="text-sm text-gray-500 font-medium">
                                                    Showing {(previewPage - 1) * PREVIEW_PAGE_SIZE + 1}-{Math.min(previewPage * PREVIEW_PAGE_SIZE, filtered.length)} of {filtered.length}
                                                </span>
                                                <div className="flex gap-2">
                                                    <button 
                                                        onClick={() => setPreviewPage(p => Math.max(1, p - 1))}
                                                        disabled={previewPage === 1}
                                                        className="px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-sm font-bold disabled:opacity-40 hover:bg-gray-50 transition-colors"
                                                    >
                                                        ← Prev
                                                    </button>
                                                    <span className="px-3 py-1.5 text-sm font-bold text-gray-600">
                                                        Page {previewPage} / {totalPages}
                                                    </span>
                                                    <button 
                                                        onClick={() => setPreviewPage(p => Math.min(totalPages, p + 1))}
                                                        disabled={previewPage === totalPages}
                                                        className="px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-sm font-bold disabled:opacity-40 hover:bg-gray-50 transition-colors"
                                                    >
                                                        Next →
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </>
                                );
                            })() : (() => {
                                const filtered = previewData.filter(txn => {
                                    if (previewSearch) {
                                        const q = previewSearch.toLowerCase();
                                        const matchesGlobal = (txn.date || '').toLowerCase().includes(q) ||
                                               (txn.type || '').toLowerCase().includes(q) ||
                                               (txn.voucherNo || '').toLowerCase().includes(q) ||
                                               (txn.debitAccount || '').toLowerCase().includes(q) ||
                                               (txn.creditAccount || '').toLowerCase().includes(q) ||
                                               (txn.narration || '').toLowerCase().includes(q) ||
                                               (txn.allDebitAccounts || []).some(a => a.toLowerCase().includes(q)) ||
                                               (txn.allCreditAccounts || []).some(a => a.toLowerCase().includes(q));
                                        if (!matchesGlobal) return false;
                                    }
                                    if (txnFilterDate) {
                                        if (!(txn.date || '').toLowerCase().includes(txnFilterDate.toLowerCase())) return false;
                                    }
                                    if (txnFilterType) {
                                        if ((txn.type || '').toLowerCase() !== txnFilterType.toLowerCase()) return false;
                                    }
                                    if (txnFilterVchNo) {
                                        if (!(txn.voucherNo || '').toLowerCase().includes(txnFilterVchNo.toLowerCase())) return false;
                                    }
                                    if (txnFilterMulti === 'multi') {
                                        const isMulti = (txn.allDebitEntries && txn.allDebitEntries.length > 1) || 
                                                        (txn.allCreditEntries && txn.allCreditEntries.length > 1) || 
                                                        ((txn.allDebitEntries?.length || 0) + (txn.allCreditEntries?.length || 0) > 2);
                                        if (!isMulti) return false;
                                    } else if (txnFilterMulti === 'single') {
                                        const isMulti = (txn.allDebitEntries && txn.allDebitEntries.length > 1) || 
                                                        (txn.allCreditEntries && txn.allCreditEntries.length > 1) || 
                                                        ((txn.allDebitEntries?.length || 0) + (txn.allCreditEntries?.length || 0) > 2);
                                        if (isMulti) return false;
                                    }
                                    if (txnFilterNewAcct) {
                                        const allAccounts = [
                                            ...(txn.allDebitAccounts || []),
                                            ...(txn.allCreditAccounts || []),
                                        ];
                                        if (allAccounts.length === 0) {
                                            if (txn.debitAccount && txn.debitAccount !== '-') allAccounts.push(txn.debitAccount);
                                            if (txn.creditAccount && txn.creditAccount !== '-') allAccounts.push(txn.creditAccount);
                                        }
                                        if (!allAccounts.some(name => name && name !== '-' && isNewAccount(name))) {
                                            return false;
                                        }
                                    }
                                    return true;
                                });

                                const sorted = [...filtered].sort((a, b) => {
                                    if (!txnSortField) return 0;
                                    const valA = a[txnSortField] || '';
                                    const valB = b[txnSortField] || '';
                                    let cmp = 0;
                                    if (txnSortField === 'voucherNo') {
                                        cmp = String(valA).localeCompare(String(valB), undefined, { numeric: true, sensitivity: 'base' });
                                    } else {
                                        cmp = String(valA).localeCompare(String(valB));
                                    }
                                    return txnSortDir === 'asc' ? cmp : -cmp;
                                });

                                const totalPages = Math.ceil(sorted.length / PREVIEW_PAGE_SIZE);
                                const paged = sorted.slice((previewPage - 1) * PREVIEW_PAGE_SIZE, previewPage * PREVIEW_PAGE_SIZE);
                                
                                const toggleExpand = (id) => {
                                    setExpandedRows(prev => {
                                        const next = new Set(prev);
                                        if (next.has(id)) next.delete(id);
                                        else next.add(id);
                                        return next;
                                    });
                                };
                                
                                return (
                                    <>
                                        <table className="w-full text-sm">
                                            <thead className="bg-gray-50 sticky top-0 z-10 shadow-xs">
                                                <tr>
                                                    <th className="text-left px-3 py-2.5 font-bold text-gray-600 border-b w-8"></th>
                                                    <th className="text-left px-3 py-2.5 font-bold text-gray-600 border-b">#</th>
                                                    
                                                    {/* Date Header with Sort */}
                                                    <th className="text-left px-3 py-2.5 font-bold text-gray-600 border-b">
                                                        <button 
                                                            type="button"
                                                            onClick={() => handleTxnSort('date')}
                                                            className="flex items-center gap-1.5 hover:text-emerald-700 transition-colors cursor-pointer group"
                                                            title="Click to sort by Date"
                                                        >
                                                            <span>Date</span>
                                                            {txnSortField === 'date' ? (
                                                                txnSortDir === 'asc' ? <ArrowUp size={14} className="text-emerald-600 font-bold" /> : <ArrowDown size={14} className="text-emerald-600 font-bold" />
                                                            ) : (
                                                                <ArrowUpDown size={13} className="text-gray-400 opacity-60 group-hover:opacity-100" />
                                                            )}
                                                        </button>
                                                    </th>

                                                    {/* Type Header with Sort */}
                                                    <th className="text-left px-3 py-2.5 font-bold text-gray-600 border-b">
                                                        <button 
                                                            type="button"
                                                            onClick={() => handleTxnSort('type')}
                                                            className="flex items-center gap-1.5 hover:text-emerald-700 transition-colors cursor-pointer group"
                                                            title="Click to sort by Voucher Type"
                                                        >
                                                            <span>Type</span>
                                                            {txnSortField === 'type' ? (
                                                                txnSortDir === 'asc' ? <ArrowUp size={14} className="text-emerald-600 font-bold" /> : <ArrowDown size={14} className="text-emerald-600 font-bold" />
                                                            ) : (
                                                                <ArrowUpDown size={13} className="text-gray-400 opacity-60 group-hover:opacity-100" />
                                                            )}
                                                        </button>
                                                    </th>

                                                    {/* Vch No Header with Sort */}
                                                    <th className="text-left px-3 py-2.5 font-bold text-gray-600 border-b hidden sm:table-cell">
                                                        <button 
                                                            type="button"
                                                            onClick={() => handleTxnSort('voucherNo')}
                                                            className="flex items-center gap-1.5 hover:text-emerald-700 transition-colors cursor-pointer group"
                                                            title="Click to sort by Voucher Number"
                                                        >
                                                            <span>Vch No</span>
                                                            {txnSortField === 'voucherNo' ? (
                                                                txnSortDir === 'asc' ? <ArrowUp size={14} className="text-emerald-600 font-bold" /> : <ArrowDown size={14} className="text-emerald-600 font-bold" />
                                                            ) : (
                                                                <ArrowUpDown size={13} className="text-gray-400 opacity-60 group-hover:opacity-100" />
                                                            )}
                                                        </button>
                                                    </th>

                                                    <th className="text-left px-3 py-2.5 font-bold text-gray-600 border-b min-w-[180px]">Debit A/c</th>
                                                    <th className="text-right px-3 py-2.5 font-bold text-gray-600 border-b whitespace-nowrap">Debit ₹</th>
                                                    <th className="text-left px-3 py-2.5 font-bold text-gray-600 border-b min-w-[180px]">Credit A/c</th>
                                                    <th className="text-right px-3 py-2.5 font-bold text-gray-600 border-b whitespace-nowrap">Credit ₹</th>
                                                    <th className="text-left px-3 py-2.5 font-bold text-gray-600 border-b hidden xl:table-cell">Narration</th>
                                                </tr>

                                                {/* Filter Row */}
                                                <tr className="bg-emerald-50/40 border-b border-gray-200 text-xs">
                                                    <th className="px-2 py-1.5 text-center text-gray-400 font-normal">
                                                        <Filter size={12} className="inline-block" />
                                                    </th>
                                                    <th className="px-2 py-1.5"></th>
                                                    
                                                    {/* Date Filter Input */}
                                                    <th className="px-2 py-1.5">
                                                        <input
                                                            type="text"
                                                            placeholder="Filter date..."
                                                            value={txnFilterDate}
                                                            onChange={(e) => { setTxnFilterDate(e.target.value); setPreviewPage(1); }}
                                                            className="w-full min-w-[95px] px-2 py-1 bg-white border border-gray-200 rounded-md text-xs font-normal text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                                        />
                                                    </th>

                                                    {/* Type Filter Select */}
                                                    <th className="px-2 py-1.5">
                                                        <select
                                                            value={txnFilterType}
                                                            onChange={(e) => { setTxnFilterType(e.target.value); setPreviewPage(1); }}
                                                            className="w-full min-w-[90px] px-1.5 py-1 bg-white border border-gray-200 rounded-md text-xs font-medium text-gray-800 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
                                                        >
                                                            <option value="">All Types</option>
                                                            {uniqueVoucherTypes.map(t => (
                                                                <option key={t} value={t}>{t}</option>
                                                            ))}
                                                        </select>
                                                    </th>

                                                    {/* Vch No Filter Input */}
                                                    <th className="px-2 py-1.5 hidden sm:table-cell">
                                                        <input
                                                            type="text"
                                                            placeholder="Filter vch..."
                                                            value={txnFilterVchNo}
                                                            onChange={(e) => { setTxnFilterVchNo(e.target.value); setPreviewPage(1); }}
                                                            className="w-full min-w-[85px] px-2 py-1 bg-white border border-gray-200 rounded-md text-xs font-normal text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                                        />
                                                    </th>

                                                    <th className="px-2 py-1.5"></th>
                                                    <th className="px-2 py-1.5"></th>
                                                    <th className="px-2 py-1.5"></th>
                                                    <th className="px-2 py-1.5"></th>
                                                    <th className="px-2 py-1.5 hidden xl:table-cell text-right">
                                                        {(txnFilterDate || txnFilterType || txnFilterVchNo || txnFilterMulti || txnSortField) && (
                                                            <button
                                                                type="button"
                                                                onClick={resetTxnFilters}
                                                                className="inline-flex items-center gap-1 text-xs font-bold text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 px-2 py-0.5 rounded transition-colors cursor-pointer"
                                                                title="Reset column filters & sort"
                                                            >
                                                                <RotateCcw size={11} />
                                                                Reset
                                                            </button>
                                                        )}
                                                    </th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {paged.map((txn, i) => {
                                                    const hasInventory = Boolean(txn.inventory && txn.inventory.length > 0);
                                                    const hasDetails = hasInventory;
                                                    const isExpanded = expandedRows.has(txn.id);

                                                    return (
                                                        <React.Fragment key={txn.id || i}>
                                                            <tr className={`border-b border-gray-50 hover:bg-emerald-50/50 transition-colors ${hasDetails ? 'cursor-pointer' : ''}`}
                                                                onClick={() => hasDetails && toggleExpand(txn.id)}>
                                                                <td className="px-3 py-2.5 text-gray-400 align-top">
                                                                    {hasDetails && (isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
                                                                </td>
                                                                <td className="px-3 py-2.5 text-gray-400 font-medium align-top">{(previewPage - 1) * PREVIEW_PAGE_SIZE + i + 1}</td>
                                                                <td className="px-3 py-2.5 font-medium text-gray-800 whitespace-nowrap align-top">{txn.date || '-'}</td>
                                                                <td className="px-3 py-2.5 align-top">
                                                                    <span className="px-2 py-0.5 rounded-md text-xs font-bold bg-blue-100 text-blue-700 whitespace-nowrap inline-block">
                                                                        {txn.type || '-'}
                                                                    </span>
                                                                </td>
                                                                <td className="px-3 py-2.5 text-gray-600 hidden sm:table-cell align-top whitespace-nowrap">{txn.voucherNo || '-'}</td>
                                                                
                                                                {/* Debit A/c: Multiple accounts with amounts or single account */}
                                                                <td className="px-3 py-2.5 align-top min-w-[190px] max-w-[280px]">
                                                                    {txn.allDebitEntries && txn.allDebitEntries.length > 1 ? (
                                                                        <div className="space-y-1.5">
                                                                            <div className="flex items-center gap-1 text-[10px] font-extrabold text-red-700 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded w-fit">
                                                                                <Layers size={11} className="text-red-600" />
                                                                                <span>{txn.allDebitEntries.length} Debit A/cs</span>
                                                                            </div>
                                                                            <div className="space-y-1">
                                                                                {txn.allDebitEntries.map((e, idx) => (
                                                                                    <div key={idx} className="flex items-center justify-between gap-1.5 text-xs bg-red-50/40 border border-red-100 rounded px-2 py-1">
                                                                                        <span className="font-semibold text-gray-900 truncate flex items-center gap-1.5" title={e.name}>
                                                                                            <span className="truncate">{e.name}</span>
                                                                                            {isNewAccount(e.name) && (
                                                                                                <span className="bg-rose-100 text-rose-700 text-[9px] px-1 py-0.5 rounded uppercase font-extrabold tracking-wide shrink-0" title="This account will be created during import">NEW</span>
                                                                                            )}
                                                                                        </span>
                                                                                        <span className="font-mono font-bold text-red-700 whitespace-nowrap ml-1 shrink-0 text-[11px]">
                                                                                            ₹{Number(e.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                                                                        </span>
                                                                                    </div>
                                                                                ))}
                                                                            </div>
                                                                        </div>
                                                                    ) : (
                                                                        <span className="font-bold text-gray-900 truncate flex items-center gap-1.5" title={txn.debitAccount}>
                                                                            <span className="truncate">{txn.debitAccount || '-'}</span>
                                                                            {isNewAccount(txn.debitAccount) && (
                                                                                <span className="bg-rose-100 text-rose-700 text-[9px] px-1 py-0.5 rounded uppercase font-extrabold tracking-wide shrink-0" title="This account will be created during import">NEW</span>
                                                                            )}
                                                                        </span>
                                                                    )}
                                                                </td>
                                                                
                                                                {/* Debit ₹ */}
                                                                <td className="px-3 py-2.5 text-right font-mono font-bold text-red-700 align-top whitespace-nowrap">
                                                                    <div>{txn.debitAmount ? Number(txn.debitAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '-'}</div>
                                                                    {txn.allDebitEntries && txn.allDebitEntries.length > 1 && (
                                                                        <span className="text-[10px] font-medium text-gray-400 block mt-0.5 font-sans">Total Dr</span>
                                                                    )}
                                                                </td>
                                                                
                                                                {/* Credit A/c: Multiple accounts with amounts or single account */}
                                                                <td className="px-3 py-2.5 align-top min-w-[190px] max-w-[280px]">
                                                                    {txn.allCreditEntries && txn.allCreditEntries.length > 1 ? (
                                                                        <div className="space-y-1.5">
                                                                            <div className="flex items-center gap-1 text-[10px] font-extrabold text-green-700 bg-green-50 border border-green-200 px-1.5 py-0.5 rounded w-fit">
                                                                                <Layers size={11} className="text-green-600" />
                                                                                <span>{txn.allCreditEntries.length} Credit A/cs</span>
                                                                            </div>
                                                                            <div className="space-y-1">
                                                                                {txn.allCreditEntries.map((e, idx) => (
                                                                                    <div key={idx} className="flex items-center justify-between gap-1.5 text-xs bg-green-50/40 border border-green-100 rounded px-2 py-1">
                                                                                        <span className="font-semibold text-gray-900 truncate flex items-center gap-1.5" title={e.name}>
                                                                                            <span className="truncate">{e.name}</span>
                                                                                            {isNewAccount(e.name) && (
                                                                                                <span className="bg-rose-100 text-rose-700 text-[9px] px-1 py-0.5 rounded uppercase font-extrabold tracking-wide shrink-0" title="This account will be created during import">NEW</span>
                                                                                            )}
                                                                                        </span>
                                                                                        <span className="font-mono font-bold text-green-700 whitespace-nowrap ml-1 shrink-0 text-[11px]">
                                                                                            ₹{Number(e.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                                                                        </span>
                                                                                    </div>
                                                                                ))}
                                                                            </div>
                                                                        </div>
                                                                    ) : (
                                                                        <span className="font-bold text-gray-900 truncate flex items-center gap-1.5" title={txn.creditAccount}>
                                                                            <span className="truncate">{txn.creditAccount || '-'}</span>
                                                                            {isNewAccount(txn.creditAccount) && (
                                                                                <span className="bg-rose-100 text-rose-700 text-[9px] px-1 py-0.5 rounded uppercase font-extrabold tracking-wide shrink-0" title="This account will be created during import">NEW</span>
                                                                            )}
                                                                        </span>
                                                                    )}
                                                                </td>
                                                                
                                                                {/* Credit ₹ */}
                                                                <td className="px-3 py-2.5 text-right font-mono font-bold text-green-700 align-top whitespace-nowrap">
                                                                    <div>{txn.creditAmount ? Number(txn.creditAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '-'}</div>
                                                                    {txn.allCreditEntries && txn.allCreditEntries.length > 1 && (
                                                                        <span className="text-[10px] font-medium text-gray-400 block mt-0.5 font-sans">Total Cr</span>
                                                                    )}
                                                                </td>

                                                                <td className="px-3 py-2.5 text-gray-500 text-xs hidden xl:table-cell max-w-[200px] truncate align-top" title={txn.narration}>{txn.narration || '-'}</td>
                                                            </tr>
                                                            {/* Expanded Details - Inventory Only */}
                                                            {isExpanded && hasDetails && (
                                                                <tr className="bg-purple-50/40 border-b border-purple-100">
                                                                    <td colSpan="10" className="px-4 sm:px-6 py-3">
                                                                        <div className="bg-white rounded-xl p-3 sm:p-4 border border-purple-100 shadow-xs">
                                                                            <div className="flex items-center justify-between gap-2 mb-2.5 pb-2 border-b border-gray-100">
                                                                                <p className="font-extrabold text-xs text-purple-900 flex items-center gap-1.5">
                                                                                    <Package size={14} className="text-purple-600" />
                                                                                    Inventory Details ({txn.inventory.length} {txn.inventory.length === 1 ? 'item' : 'items'})
                                                                                </p>
                                                                                {txn.narration && (
                                                                                    <p className="text-xs text-gray-500 italic max-w-md truncate" title={txn.narration}>
                                                                                        <span className="font-semibold text-gray-700 not-italic mr-1">Narration:</span>
                                                                                        "{txn.narration}"
                                                                                    </p>
                                                                                )}
                                                                            </div>
                                                                            <div className="overflow-x-auto">
                                                                                <table className="w-full text-xs">
                                                                                    <thead>
                                                                                        <tr className="text-gray-500 font-bold border-b border-gray-100 bg-gray-50/70">
                                                                                            <th className="text-left py-1.5 px-3 w-10">#</th>
                                                                                            <th className="text-left py-1.5 px-3">Item Name</th>
                                                                                            <th className="text-center py-1.5 px-3">Quantity</th>
                                                                                            <th className="text-right py-1.5 px-3">Rate</th>
                                                                                            <th className="text-right py-1.5 px-3">Amount</th>
                                                                                        </tr>
                                                                                    </thead>
                                                                                    <tbody className="divide-y divide-gray-50">
                                                                                        {txn.inventory.map((inv, ii) => (
                                                                                            <tr key={ii} className="hover:bg-purple-50/30 transition-colors">
                                                                                                <td className="py-1.5 px-3 text-gray-400 font-medium">{ii + 1}</td>
                                                                                                <td className="py-1.5 px-3 font-semibold text-gray-800">{inv.itemName || '-'}</td>
                                                                                                <td className="py-1.5 px-3 text-center font-mono text-gray-700">{inv.qty || '-'}</td>
                                                                                                <td className="py-1.5 px-3 text-right font-mono text-gray-700">{inv.rate ? `₹${inv.rate}` : '-'}</td>
                                                                                                <td className="py-1.5 px-3 text-right font-mono font-bold text-purple-700">
                                                                                                    ₹{Number(inv.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                                                                                </td>
                                                                                            </tr>
                                                                                        ))}
                                                                                    </tbody>
                                                                                </table>
                                                                            </div>
                                                                        </div>
                                                                    </td>
                                                                </tr>
                                                            )}
                                                        </React.Fragment>
                                                    );
                                                })}
                                                {paged.length === 0 && (
                                                    <tr>
                                                        <td colSpan="10" className="text-center py-12 text-gray-400 font-medium">
                                                            <div className="flex flex-col items-center justify-center gap-2">
                                                                <p>No matching transactions found</p>
                                                                {(txnFilterDate || txnFilterType || txnFilterVchNo || txnFilterMulti || previewSearch || txnSortField) && (
                                                                    <button
                                                                        type="button"
                                                                        onClick={resetTxnFilters}
                                                                        className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
                                                                    >
                                                                        <RotateCcw size={12} />
                                                                        Reset All Filters
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )}
                                            </tbody>
                                        </table>
                                        {/* Pagination */}
                                        {totalPages > 1 && (
                                            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50 sticky bottom-0">
                                                <span className="text-sm text-gray-500 font-medium">
                                                    Showing {(previewPage - 1) * PREVIEW_PAGE_SIZE + 1}-{Math.min(previewPage * PREVIEW_PAGE_SIZE, sorted.length)} of {sorted.length}
                                                </span>
                                                <div className="flex gap-2">
                                                    <button 
                                                        onClick={() => setPreviewPage(p => Math.max(1, p - 1))}
                                                        disabled={previewPage === 1}
                                                        className="px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-sm font-bold disabled:opacity-40 hover:bg-gray-50 transition-colors"
                                                    >
                                                        ← Prev
                                                    </button>
                                                    <span className="px-3 py-1.5 text-sm font-bold text-gray-600">
                                                        Page {previewPage} / {totalPages}
                                                    </span>
                                                    <button 
                                                        onClick={() => setPreviewPage(p => Math.min(totalPages, p + 1))}
                                                        disabled={previewPage === totalPages}
                                                        className="px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-sm font-bold disabled:opacity-40 hover:bg-gray-50 transition-colors"
                                                    >
                                                        Next →
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </>
                                );
                            })()}
                        </div>

                        
                    </div>
                </div>
            )}

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

            <AccountDeltaModal
                isOpen={deltaModalOpen}
                onClose={() => setDeltaModalOpen(false)}
                transactions={previewType === 'transaction' ? previewData : []}
                activeFY={fyOptions.find(f => f.id === selectedFYId)}
            />
        </div>
    );
}
