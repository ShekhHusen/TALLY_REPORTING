import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { db } from '../firebase';
import { collection, doc, writeBatch, getDocs, query, where, limit, startAfter, or, getDoc, setDoc, updateDoc, collectionGroup } from 'firebase/firestore';
import TransactionTable from './TransactionTable';
import AccountSearchDropdown from './AccountSearchDropdown';
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from 'xlsx';
import { fetchFiscalYears, getCurrentFYObject } from '../utils/fiscalYear';
import EditAccountModal from './EditAccountModal';
import FollowUpModal from './FollowUpModal';
import { Pencil, ClipboardList, Filter, ChevronDown, ChevronUp, Eye, EyeOff, Check, CheckCircle2, MoreVertical, X } from 'lucide-react';
import { deleteTransactionRecord } from '../utils/transactionOperations';

const formatCurrency = (num) => {
    const formatted = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(num) || 0);
    return `Rs. ${num < 0 ? '-' : ''}${formatted}`;
};

export default function AccountsTab({ updateTrigger, setUpdateTrigger, allowedAccount, currentUser, setCurrentUser }) {
    // Top level views: 'directory' | 'details'
    const [view, setView] = useState('directory');
    const [showIgnored, setShowIgnored] = useState(false);
    
    // ----------- DIRECTORY VIEW STATE -----------
    const [fyOptions, setFyOptions] = useState([]);
    const [selectedFY, setSelectedFY] = useState('');
    const [fyBalances, setFyBalances] = useState({});
    const [loadingAccounts, setLoadingAccounts] = useState(false);
    
    // Filters
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedGroup, setSelectedGroup] = useState("");
    const [minBalance, setMinBalance] = useState("");
    const [maxBalance, setMaxBalance] = useState("");
    const [verificationStatus, setVerificationStatus] = useState("all"); 
    const [skipZeroClosingBalance, setSkipZeroClosingBalance] = useState(false);
    const [showMobileFilters, setShowMobileFilters] = useState(false);

    const activeFilterCount = useMemo(() => {
        let count = 0;
        if (searchTerm) count++;
        if (selectedGroup) count++;
        if (verificationStatus !== 'all') count++;
        if (minBalance !== "") count++;
        if (maxBalance !== "") count++;
        if (skipZeroClosingBalance) count++;
        if (showIgnored) count++;
        return count;
    }, [searchTerm, selectedGroup, verificationStatus, minBalance, maxBalance, skipZeroClosingBalance, showIgnored]);
    
    // Sorting
    const [sortConfig, setSortConfig] = useState({ key: 'name', direction: 'ascending' });
    const [verifying, setVerifying] = useState(false);

    // Modal states for Edit Account & Follow-ups
    const [editModalOpen, setEditModalOpen] = useState(false);
    const [editingAccount, setEditingAccount] = useState(null);
    const [followUpModalOpen, setFollowUpModalOpen] = useState(false);
    const [followUpAccount, setFollowUpAccount] = useState(null);

    const handleOpenEdit = (acc) => {
        setEditingAccount(acc);
        setEditModalOpen(true);
    };

    const handleOpenFollowUp = (acc) => {
        setFollowUpAccount(acc);
        setFollowUpModalOpen(true);
    };

    const handleAccountSave = (updatedData) => {
        if (editingAccount && updatedData) {
            setFyBalances(prev => ({
                ...prev,
                [editingAccount.id]: {
                    ...(prev[editingAccount.id] || {}),
                    openingBalance: updatedData.openingBalance,
                    openingBalanceType: updatedData.openingBalanceType,
                    closingBalance: updatedData.closingBalance,
                    closingBalanceType: updatedData.closingBalanceType,
                    verifiedBy: null,
                    verifiedAt: null
                }
            }));
            if (setUpdateTrigger) {
                setUpdateTrigger(prev => prev + 1);
            }
        }
    };

    // ----------- DETAILS VIEW STATE -----------
    const [selectedAccount, setSelectedAccount] = useState(null);
    const [detailFY, setDetailFY] = useState('');
    const [detailFYData, setDetailFYData] = useState(null);

    // FY and Account loading are now handled in the parallel initData useEffect below
    const [accountTxns, setAccountTxns] = useState([]);
    const [loadingTxns, setLoadingTxns] = useState(false);
    const [lastVisibleTxn, setLastVisibleTxn] = useState(null);
    const [hasMoreTxns, setHasMoreTxns] = useState(true);
    const [showFullDetails, setShowFullDetails] = useState(false);
    const [isSummaryExpanded, setIsSummaryExpanded] = useState(true);

    // All data state
    const [allAccounts, setAllAccounts] = useState([]);
    const [currentPage, setCurrentPage] = useState(1);
    const pageSize = 10;

    useEffect(() => {
        const initData = async () => {
            setLoadingAccounts(true);
            try {
                // Fetch both FYs and Accounts in parallel
                const [fys, snap] = await Promise.all([
                    fetchFiscalYears(),
                    getDocs(collection(db, 'accounts'))
                ]);

                // Process FYs
                setFyOptions(fys);
                let currentFyId = selectedFY;
                // Set initial FY only if it hasn't been set yet
                if (!currentFyId) {
                    const current = getCurrentFYObject(fys);
                    currentFyId = current ? current.id : (fys.length > 0 ? fys[0].id : '');
                    if (currentFyId) {
                        setSelectedFY(currentFyId);
                        setDetailFY(currentFyId);
                    }
                }

                // Process Accounts
                const accMap = new Map();
                snap.forEach(d => {
                    const data = d.data();
                    const name = (data.name || '').trim();
                    if (!name) return;
                    const key = name.toLowerCase();

                    if (!accMap.has(key)) {
                        accMap.set(key, {
                            id: d.id,
                            ...data,
                            name,
                            allDocIds: [d.id]
                        });
                    } else {
                        const existing = accMap.get(key);
                        const allDocIds = [...new Set([...(existing.allDocIds || [existing.id]), d.id])];
                        const preferCurrent = existing.isNewAutoCreated && !data.isNewAutoCreated;
                        accMap.set(key, {
                            ...(preferCurrent ? data : existing),
                            id: preferCurrent ? d.id : existing.id,
                            name: existing.name || name,
                            group: data.group || existing.group || '',
                            openingBalance: (data.openingBalance !== undefined && data.openingBalance !== 0) ? data.openingBalance : (existing.openingBalance || 0),
                            openingBalanceType: data.openingBalanceType || existing.openingBalanceType || '',
                            address: data.address || existing.address || '',
                            contact: data.contact || existing.contact || '',
                            verifiedBy: data.verifiedBy || existing.verifiedBy || null,
                            verifiedAt: data.verifiedAt || existing.verifiedAt || null,
                            isNewAutoCreated: existing.isNewAutoCreated && data.isNewAutoCreated,
                            allDocIds
                        });
                    }
                });
                const accs = Array.from(accMap.values());
                accs.sort((a, b) => a.name.localeCompare(b.name));
                setAllAccounts(accs);
            } catch (err) {
                console.error("Error loading initial data:", err);
            }
            // Not setting setLoadingAccounts(false) here because fetchAllFYBalances will trigger next and handle it
        };
        initData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [updateTrigger]);

    useEffect(() => {
        const fetchAllFYBalances = async () => {
            if (allAccounts.length === 0 || !selectedFY) {
                // Do not clear fyBalances here to keep previous data cached during transition
                return;
            }
            setLoadingAccounts(true);
            
            try {
                // Try optimized collectionGroup query
                const q = query(
                    collectionGroup(db, 'fiscalYears'),
                    where('fyId', '==', selectedFY)
                );
                const snap = await getDocs(q);
                
                // Map physical docIds back to our merged logical account IDs
                const accountDocIdToLogicalId = {};
                allAccounts.forEach(acc => {
                    const ids = acc.allDocIds && acc.allDocIds.length > 0 ? acc.allDocIds : [acc.id];
                    ids.forEach(id => {
                        accountDocIdToLogicalId[id] = acc.id;
                    });
                });

                const finalBalances = {};
                snap.forEach(docSnap => {
                    const parentRef = docSnap.ref.parent?.parent;
                    if (parentRef) {
                        const logicalId = accountDocIdToLogicalId[parentRef.id];
                        // If we haven't already set a balance for this logical account, set it
                        if (logicalId && !finalBalances[logicalId]) {
                            finalBalances[logicalId] = docSnap.data();
                        }
                    }
                });
                
                setFyBalances(finalBalances);
            } catch (error) {
                console.warn("CollectionGroup query failed (likely missing index). Falling back to chunked reads.", error);
                
                // Fallback to legacy chunked approach
                const balances = {};
                const chunkSize = 100;
                for (let i = 0; i < allAccounts.length; i += chunkSize) {
                    const chunk = allAccounts.slice(i, i + chunkSize);
                    const promises = chunk.map(async (acc) => {
                        try {
                            const ids = acc.allDocIds && acc.allDocIds.length > 0 ? acc.allDocIds : [acc.id];
                            for (const docId of ids) {
                                const fyDoc = await getDoc(doc(db, 'accounts', docId, 'fiscalYears', selectedFY));
                                if (fyDoc.exists()) {
                                    balances[acc.id] = fyDoc.data();
                                    break;
                                }
                            }
                        } catch (e) {
                            console.error(`Error fetching FY data for ${acc.name}:`, e);
                        }
                    });
                    await Promise.all(promises);
                }
                setFyBalances(balances);
            } finally {
                setLoadingAccounts(false);
            }
        };
        fetchAllFYBalances();
    }, [selectedFY, allAccounts]);

    // When any filter or FY changes, reset to page 1
    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, selectedGroup, minBalance, maxBalance, verificationStatus, showIgnored, skipZeroClosingBalance, selectedFY]);

    const handleAccountSearch = () => {
        setCurrentPage(1);
    };

    const isAccountIgnored = (acc) => {
        const ignoredList = currentUser?.ignoredAccounts || [];
        if (ignoredList.includes(acc.id)) return true;
        if (acc.allDocIds && acc.allDocIds.some(id => ignoredList.includes(id))) return true;
        return false;
    };

    const getAccountBalance = (acc) => {
        const fyData = fyBalances[acc.id];
        if (fyData) {
            return {
                ...acc,
                openingBalance: fyData.openingBalance ?? 0,
                openingBalanceType: fyData.openingBalanceType ?? '',
                totalDebit: fyData.totalDebit ?? 0,
                totalCredit: fyData.totalCredit ?? 0,
                closingBalance: fyData.closingBalance ?? 0,
                closingBalanceType: fyData.closingBalanceType ?? '',
                verifiedBy: fyData.verifiedBy || null,
                verifiedAt: fyData.verifiedAt || null
            };
        }
        return {
            ...acc,
            openingBalance: 0,
            openingBalanceType: '',
            totalDebit: 0,
            totalCredit: 0,
            closingBalance: 0,
            closingBalanceType: '',
            verifiedBy: null,
            verifiedAt: null
        };
    };

    const uniqueGroups = useMemo(() => {
        const groups = new Set();
        allAccounts.forEach(a => {
            if (selectedFY && !fyBalances[a.id]) return;
            if (a.group) groups.add(a.group);
        });
        return Array.from(groups).sort();
    }, [allAccounts, selectedFY, fyBalances]);

    const filteredAccounts = useMemo(() => {
        let result = allAccounts;
        
        // When a fiscal year is selected, only show accounts that exist in this fiscal year
        if (selectedFY) {
            result = result.filter(a => !!fyBalances[a.id]);
        }

        if (allowedAccount) {
            result = result.filter(a => a.name.toLowerCase() === allowedAccount.toLowerCase());
        }
        
        if (verificationStatus === 'ignored') {
            result = result.filter(a => isAccountIgnored(a));
        } else if (showIgnored) {
            // showIgnored ON = show ONLY ignored accounts
            result = result.filter(a => isAccountIgnored(a));
        } else {
            // Default: hide ignored accounts
            result = result.filter(a => !isAccountIgnored(a));
        }

        if (skipZeroClosingBalance) {
            result = result.filter(a => {
                const bal = getAccountBalance(a);
                return Math.abs(bal.closingBalance || 0) > 0.0001;
            });
        }

        if (searchTerm) {
            const lowerTerm = searchTerm.toLowerCase().trim();
            result = result.filter(a => a.name.toLowerCase().includes(lowerTerm));
        }
        
        if (selectedGroup) {
            result = result.filter(a => a.group === selectedGroup);
        }

        if (verificationStatus === 'verified') {
            result = result.filter(a => !!fyBalances[a.id]?.verifiedBy);
        } else if (verificationStatus === 'unverified') {
            result = result.filter(a => !fyBalances[a.id]?.verifiedBy);
        }
        if (minBalance !== "") {
            result = result.filter(a => ((fyBalances[a.id]?.closingBalance) || 0) >= parseFloat(minBalance));
        }
        if (maxBalance !== "") {
            result = result.filter(a => ((fyBalances[a.id]?.closingBalance) || 0) <= parseFloat(maxBalance));
        }

        return result;
    }, [allAccounts, selectedFY, fyBalances, allowedAccount, showIgnored, skipZeroClosingBalance, searchTerm, selectedGroup, verificationStatus, minBalance, maxBalance, currentUser?.ignoredAccounts]);

    const sortedAccounts = useMemo(() => {
        const sorted = [...filteredAccounts].sort((a, b) => {
            let valA = a[sortConfig.key];
            let valB = b[sortConfig.key];
            
            if (['openingBalance', 'totalDebit', 'totalCredit', 'closingBalance'].includes(sortConfig.key)) {
                valA = parseFloat(fyBalances[a.id]?.[sortConfig.key] || 0);
                valB = parseFloat(fyBalances[b.id]?.[sortConfig.key] || 0);
            } else if (sortConfig.key === 'verifiedBy') {
                valA = fyBalances[a.id]?.verifiedBy || '';
                valB = fyBalances[b.id]?.verifiedBy || '';
            } else {
                valA = (valA || '').toString().toLowerCase();
                valB = (valB || '').toString().toLowerCase();
            }

            if (valA < valB) return sortConfig.direction === 'ascending' ? -1 : 1;
            if (valA > valB) return sortConfig.direction === 'ascending' ? 1 : -1;
            return 0;
        });
        return sorted;
    }, [filteredAccounts, sortConfig, fyBalances]);

    const requestSort = (key) => {
        let direction = 'ascending';
        if (sortConfig.key === key && sortConfig.direction === 'ascending') {
            direction = 'descending';
        }
        setSortConfig({ key, direction });
    };

    const getSortIndicator = (key) => {
        if (sortConfig.key !== key) return ' ↕';
        return sortConfig.direction === 'ascending' ? ' ↑' : ' ↓';
    };

    const paginatedAccounts = useMemo(() => {
        const start = (currentPage - 1) * pageSize;
        return sortedAccounts.slice(start, start + pageSize);
    }, [sortedAccounts, currentPage]);

    const totalPages = Math.max(1, Math.ceil(sortedAccounts.length / pageSize));
    const hasNextPage = currentPage < totalPages;

    const handleVerify = async (acc) => {
        const userName = currentUser?.name || 'System';
        try {
            setVerifying(true);
            const now = new Date().toLocaleString('en-IN');
            const ids = acc.allDocIds && acc.allDocIds.length > 0 ? acc.allDocIds : [acc.id];
            
            for (const docId of ids) {
                const ref = doc(db, 'accounts', docId, 'fiscalYears', selectedFY);
                await setDoc(ref, {
                    verifiedBy: userName,
                    verifiedAt: now
                }, { merge: true });
            }
            
            // Update fyBalances locally to reflect immediately without needing a full refetch
            setFyBalances(prev => ({
                ...prev,
                [acc.id]: {
                    ...(prev[acc.id] || {}),
                    verifiedBy: userName,
                    verifiedAt: now
                }
            }));
        } catch (error) {
            console.error(error);
            alert("Error verifying account: " + error.message);
        } finally {
            setVerifying(false);
        }
    };

    const handleVerifyAll = async () => {
        const userName = currentUser?.name || 'System';
        const accountsToVerify = skipZeroClosingBalance
            ? paginatedAccounts.filter(acc => {
                const bal = getAccountBalance(acc);
                return Math.abs(bal.closingBalance || 0) > 0.0001;
            })
            : paginatedAccounts;

        if (accountsToVerify.length === 0) {
            alert("No eligible accounts to verify on this page.");
            return;
        }

        if(!window.confirm(`Are you sure you want to mark all ${accountsToVerify.length} accounts on this page as verified by ${userName}?`)) return;

        try {
            setVerifying(true);
            const now = new Date().toLocaleString('en-IN');
            const batch = writeBatch(db);
            const newBalances = { ...fyBalances };
            
            accountsToVerify.forEach(acc => {
                const ids = acc.allDocIds && acc.allDocIds.length > 0 ? acc.allDocIds : [acc.id];
                ids.forEach(docId => {
                    const ref = doc(db, 'accounts', docId, 'fiscalYears', selectedFY);
                    batch.set(ref, {
                        verifiedBy: userName,
                        verifiedAt: now
                    }, { merge: true });
                });
                
                newBalances[acc.id] = {
                    ...(newBalances[acc.id] || {}),
                    verifiedBy: userName,
                    verifiedAt: now
                };
            });
            await batch.commit();
            setFyBalances(newBalances);
        } catch (error) {
            console.error(error);
            alert("Error verifying accounts: " + error.message);
        } finally {
            setVerifying(false);
        }
    };

    const handleIgnoreToggle = async (acc, isCurrentlyIgnored) => {
        try {
            const userRef = doc(db, 'users', currentUser.uid);
            const ignoredList = currentUser.ignoredAccounts || [];
            const ids = acc.allDocIds && acc.allDocIds.length > 0 ? acc.allDocIds : [acc.id];
            const newList = isCurrentlyIgnored
                ? ignoredList.filter(id => !ids.includes(id))
                : [...new Set([...ignoredList, ...ids])];
                
            await updateDoc(userRef, { ignoredAccounts: newList });
            if (setCurrentUser) {
                setCurrentUser(prev => ({ ...prev, ignoredAccounts: newList }));
            }
        } catch (error) {
            console.error("Error updating ignore list:", error);
            alert("Error updating ignore list: " + error.message);
        }
    };

    const fetchAccountTransactions = async (accName, isLoadMore = false, fyId = detailFY) => {
        setLoadingTxns(true);
        try {
            const accNameLower = accName.toLowerCase();
            let q = query(
                collection(db, 'transactions'),
                or(
                    where('debitAccount', '==', accNameLower),
                    where('creditAccount', '==', accNameLower),
                    where('debitAccount', '==', accName), 
                    where('creditAccount', '==', accName)
                ),
                limit(10)
            );

            if (isLoadMore && lastVisibleTxn) {
                q = query(q, startAfter(lastVisibleTxn));
            }

            const snap = await getDocs(q);
            const txns = [];
            snap.forEach(d => txns.push({ id: d.id, ...d.data() }));

            const activeFY = fyOptions.find(f => f.id === fyId);
            const start = activeFY?.startDate || '1900-01-01';
            const end = activeFY?.endDate || '2100-12-31';

            const fyFilteredTxns = txns.filter(t => t.date >= start && t.date <= end);

            // Sort Oldest to Newest for Running Balance
            fyFilteredTxns.sort((a, b) => new Date(a.date) - new Date(b.date));

            // Merge with previous if load more
            const combinedTxns = isLoadMore ? [...accountTxns, ...fyFilteredTxns] : fyFilteredTxns;
            setAccountTxns(combinedTxns);
            setLastVisibleTxn(snap.docs[snap.docs.length - 1]);
            setHasMoreTxns(snap.docs.length === 10);

        } catch (err) {
            console.error("Error fetching transactions:", err);
            alert("Error fetching transactions. You might need to create a Firestore Index. Check console.");
        }
        setLoadingTxns(false);
    };

    // Calculate accurate running balance and account-specific debit/credit amounts based on opening balance
    const processedAccountTxns = useMemo(() => {
        if (!accountTxns || accountTxns.length === 0) return [];

        const fyData = detailFYData || (selectedAccount && fyBalances[selectedAccount.id]) || null;
        const ob = parseFloat(fyData?.openingBalance || 0);
        const obType = fyData?.openingBalanceType || '';
        let runningVal = obType === 'Cr' ? -ob : ob;

        const accNameLower = (selectedAccount?.name || '').trim().toLowerCase();
        const sorted = [...accountTxns].sort((a, b) => new Date(a.date) - new Date(b.date));

        return sorted.map(t => {
            let debAmt = 0;
            let credAmt = 0;

            if (t.allDebitEntries && t.allDebitEntries.length > 0) {
                debAmt = t.allDebitEntries
                    .filter(e => e.name && e.name.trim().toLowerCase() === accNameLower)
                    .reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);
            } else if (t.debitAccount && t.debitAccount.trim().toLowerCase() === accNameLower) {
                debAmt = parseFloat(t.debitAmount || 0);
            }

            if (t.allCreditEntries && t.allCreditEntries.length > 0) {
                credAmt = t.allCreditEntries
                    .filter(e => e.name && e.name.trim().toLowerCase() === accNameLower)
                    .reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);
            } else if (t.creditAccount && t.creditAccount.trim().toLowerCase() === accNameLower) {
                credAmt = parseFloat(t.creditAmount || 0);
            }

            runningVal = runningVal + debAmt - credAmt;

            return {
                ...t,
                accountDebitAmt: debAmt,
                accountCreditAmt: credAmt,
                runningBalance: Math.abs(runningVal),
                runningBalanceType: runningVal < 0 ? 'Cr' : (runningVal > 0 ? 'Dr' : '')
            };
        });
    }, [accountTxns, detailFYData, selectedAccount, fyBalances]);

    const handleDeleteStatementTransaction = async (t) => {
        const ok = await deleteTransactionRecord(t);
        if (ok && selectedAccount) {
            setAccountTxns([]);
            setLastVisibleTxn(null);
            fetchAccountTransactions(selectedAccount.name, false, detailFY);
            if (setUpdateTrigger) setUpdateTrigger(prev => prev + 1);
        }
    };

    const openAccountDetails = (acc) => {
        setSelectedAccount(acc);
        setDetailFY(selectedFY);
        setDetailFYData(fyBalances[acc.id] || null);
        setView('details');
        setAccountTxns([]);
        setLastVisibleTxn(null);
    };

    // Trigger fetch when selectedAccount or detailFY changes
    useEffect(() => {
        if (view === 'details' && selectedAccount && detailFY) {
            setAccountTxns([]);
            setLastVisibleTxn(null);
            fetchAccountTransactions(selectedAccount.name, false, detailFY);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [view, selectedAccount, detailFY]);

    useEffect(() => {
        if (view !== 'details' || !selectedAccount || !detailFY) return;
        const fetchFYData = async () => {
            try {
                const ids = selectedAccount.allDocIds && selectedAccount.allDocIds.length > 0 ? selectedAccount.allDocIds : [selectedAccount.id];
                let found = null;
                for (const docId of ids) {
                    const fyDoc = await getDoc(doc(db, 'accounts', docId, 'fiscalYears', detailFY));
                    if (fyDoc.exists()) {
                        found = fyDoc.data();
                        break;
                    }
                }
                setDetailFYData(found);
            } catch (e) {
                console.error(e);
                setDetailFYData(null);
            }
        };
        fetchFYData();
    }, [view, selectedAccount, detailFY]);


    const exportToPDF = () => {
        if (!selectedAccount) return;
        const displayBalance = detailFYData || {
            openingBalance: 0,
            openingBalanceType: '',
            closingBalance: 0,
            closingBalanceType: ''
        };
        const doc = new jsPDF();
        
        const activeFY = fyOptions.find(f => f.id === detailFY);
        const fyName = activeFY?.name || detailFY;
        
        doc.setFontSize(14);
        doc.text(`Ledger Account Statement (${fyName})`, 14, 15);
        
        doc.setFontSize(10);
        doc.text(`Account Name: ${selectedAccount.name}`, 14, 22);
        doc.text(`Account Group: ${selectedAccount.group || 'N/A'}`, 14, 28);
        doc.text(`Opening Balance: ${displayBalance.openingBalance || 0} ${displayBalance.openingBalanceType || ''}`, 130, 22);
        doc.text(`Closing Balance: ${displayBalance.closingBalance || 0} ${displayBalance.closingBalanceType || ''}`, 130, 28);
        
        const tableColumn = ["Date", "Particulars", "Vch Type", "Vch No", "Debit", "Credit", "Balance"];
        const tableRows = [];

        processedAccountTxns.forEach(t => {
            const isDebit = t.accountDebitAmt > 0 || (t.accountCreditAmt === 0 && (
                (t.debitAccount && t.debitAccount.toLowerCase() === selectedAccount.name.toLowerCase()) ||
                (t.allDebitAccounts && t.allDebitAccounts.some(n => n.toLowerCase() === selectedAccount.name.toLowerCase()))
            ));
            let particulars = isDebit ? `To ${t.creditAccount || '-'}` : `By ${t.debitAccount || '-'}`;
            
            if (showFullDetails) {
                if (t.narration) particulars += `\n[Narration: ${t.narration}]`;
                if (t.inventory && t.inventory.length > 0) {
                    const invStr = t.inventory.map(i => `${i.itemName} (${i.qty} @ ${i.rate})`).join(', ');
                    particulars += `\n[Inv: ${invStr}]`;
                }
            }

            const row = [
                t.date,
                particulars,
                t.type,
                t.voucherNo,
                t.accountDebitAmt ? formatCurrency(t.accountDebitAmt) : '',
                t.accountCreditAmt ? formatCurrency(t.accountCreditAmt) : '',
                `${formatCurrency(t.runningBalance)} ${t.runningBalanceType}`
            ];
            tableRows.push(row);
        });

        autoTable(doc, {
            head: [tableColumn],
            body: tableRows,
            startY: 35,
            styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak' },
            columnStyles: { 
                0: { cellWidth: 'wrap' }, // Date
                1: { cellWidth: 'auto' }, // Particulars (auto expands and wraps text)
                2: { cellWidth: 'wrap' }, // Vch Type
                3: { cellWidth: 'wrap' }, // Vch No
                4: { cellWidth: 'wrap', halign: 'right' }, // Debit
                5: { cellWidth: 'wrap', halign: 'right' }, // Credit
                6: { cellWidth: 'wrap', halign: 'right' }  // Balance
            },
            margin: { left: 14, right: 14 }
        });

        doc.save(`${selectedAccount.name}_Statement_FY${detailFY}.pdf`);
    };

    const exportToExcel = () => {
        if (!selectedAccount) return;
        
        const activeFY = fyOptions.find(f => f.id === detailFY);
        const fyName = activeFY?.name || detailFY;
        
        const formattedData = processedAccountTxns.map(t => {
            const isDebit = t.accountDebitAmt > 0 || (t.accountCreditAmt === 0 && (
                (t.debitAccount && t.debitAccount.toLowerCase() === selectedAccount.name.toLowerCase()) ||
                (t.allDebitAccounts && t.allDebitAccounts.some(n => n.toLowerCase() === selectedAccount.name.toLowerCase()))
            ));
            let particulars = isDebit ? `To ${t.creditAccount || '-'}` : `By ${t.debitAccount || '-'}`;
            
            let row = {
                Date: t.date,
                Particulars: particulars,
                VoucherType: t.type,
                VoucherNo: t.voucherNo,
                DebitAmount: t.accountDebitAmt || null,
                CreditAmount: t.accountCreditAmt || null,
                Balance: parseFloat(t.runningBalance || 0),
                BalanceType: t.runningBalanceType || ''
            };

            if (showFullDetails) {
                row.Narration = t.narration || '';
                let invStr = '';
                if (t.inventory && t.inventory.length > 0) {
                    invStr = t.inventory.map(i => `${i.itemName} (${i.qty} @ ${i.rate})`).join(', ');
                }
                row.Inventory = invStr;
            }
            return row;
        });

        const worksheet = XLSX.utils.json_to_sheet(formattedData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Statement");
        XLSX.writeFile(workbook, `${selectedAccount.name}_Statement_${fyName}.xlsx`);
    };

    if (view === 'details' && selectedAccount) {
        return (
            <div className="flex flex-col min-h-0 flex-1 gap-4">
                <div className="bg-white rounded-lg shadow border border-gray-200 flex flex-col h-full">
                    {/* Header Top Bar */}
                    <div className="p-4 sm:px-6 sm:py-4 border-b border-slate-100 flex flex-col gap-4 sm:gap-4 shrink-0 bg-white rounded-t-2xl z-20">
                        {/* Row 1: Back, FY, and Actions */}
                        <div className="flex justify-between items-center w-full">
                            <div className="flex items-center gap-2 sm:gap-3">
                                <button 
                                    onClick={() => setView('directory')}
                                    className="flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors shrink-0"
                                    title="Back to Accounts"
                                >
                                    <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                                </button>
                                
                                <select
                                    value={detailFY}
                                    onChange={(e) => { setDetailFY(e.target.value); setAccountTxns([]); setLastVisibleTxn(null); }}
                                    className="px-2 py-1.5 sm:px-3 sm:py-1.5 border-0 bg-indigo-100 text-indigo-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-xs sm:text-sm font-bold tracking-wide shadow-inner cursor-pointer shrink-0"
                                >
                                    {fyOptions.length === 0 && <option value="">No FY</option>}
                                    {fyOptions.map(fy => <option key={fy.id} value={fy.id}>{fy.name}</option>)}
                                </select>
                            </div>
                            
                            <div className="flex items-center gap-2 sm:gap-3">
                                <label className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm font-semibold text-slate-600 cursor-pointer hover:text-slate-900 transition-colors">
                                    <input 
                                        type="checkbox" 
                                        checked={showFullDetails}
                                        onChange={(e) => setShowFullDetails(e.target.checked)}
                                        className="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 transition-all cursor-pointer"
                                    />
                                    <span>Full</span>
                                </label>
                                <button 
                                    onClick={exportToPDF}
                                    className="flex items-center justify-center w-8 h-8 sm:w-auto sm:px-3 sm:py-1.5 gap-1.5 bg-rose-100 hover:bg-rose-200 text-rose-700 rounded-lg text-sm font-bold transition-colors shrink-0"
                                    title="Export PDF"
                                >
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                    <span className="hidden sm:inline">PDF</span>
                                </button>
                                <button 
                                    onClick={exportToExcel}
                                    className="flex items-center justify-center w-8 h-8 sm:w-auto sm:px-3 sm:py-1.5 gap-1.5 bg-emerald-100 hover:bg-emerald-200 text-emerald-700 rounded-lg text-sm font-bold transition-colors shrink-0"
                                    title="Export Excel"
                                >
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                    <span className="hidden sm:inline">Excel</span>
                                </button>
                            </div>
                        </div>

                        {/* Row 2: Account Name & Collapse Toggle */}
                        <div 
                            className="flex justify-between items-center w-full cursor-pointer group"
                            onClick={() => setIsSummaryExpanded(!isSummaryExpanded)}
                        >
                            <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight truncate flex-1 pr-4" title={selectedAccount.name}>
                                {selectedAccount.name}
                            </h2>
                            <button 
                                className="flex items-center justify-center w-8 h-8 rounded-full text-slate-400 group-hover:text-indigo-600 transition-all shrink-0"
                            >
                                {isSummaryExpanded ? (
                                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" /></svg>
                                ) : (
                                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                                )}
                            </button>
                        </div>
                    </div>

                    {/* Summary Bento Grid */}
                    {isSummaryExpanded && (() => {
                        const displayBalance = detailFYData || {
                            openingBalance: 0,
                            openingBalanceType: '',
                            totalDebit: 0,
                            totalCredit: 0,
                            closingBalance: 0,
                            closingBalanceType: '',
                            fyName: fyOptions.find(f => f.id === detailFY)?.name || 'Selected FY'
                        };
                        return (
                            <div className="p-4 sm:p-5 border-b border-slate-100 bg-slate-50/50 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 shrink-0 transition-all duration-300 ease-in-out">
                                {/* Info Card (Span 2) */}
                                <div className="lg:col-span-2 bg-white border border-slate-200/60 rounded-xl p-4 flex flex-col justify-center shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                                    <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                                        <div className="w-1.5 h-1.5 rounded-full bg-slate-300"></div> Account Details
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                                        <div className="flex flex-col">
                                            <span className="text-slate-500 font-medium text-[11px] uppercase tracking-wider mb-0.5">Group</span>
                                            <span className="text-slate-900 font-semibold truncate" title={selectedAccount.group}>{selectedAccount.group || '-'}</span>
                                        </div>
                                        <div className="flex flex-col sm:col-span-2">
                                            <span className="text-slate-500 font-medium text-[11px] uppercase tracking-wider mb-0.5">Address & Contact</span>
                                            <span className="text-slate-900 font-semibold truncate" title={selectedAccount.address ? `${selectedAccount.address} ${selectedAccount.contact ? `| ${selectedAccount.contact}` : ''}` : '-'}>
                                                {selectedAccount.address || '-'} {selectedAccount.contact ? <span className="text-slate-400 font-normal mx-1">|</span> : ''} {selectedAccount.contact || ''}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* Debit & Credit Flow (Span 1) */}
                                <div className="bg-white border border-slate-200/60 rounded-xl p-4 flex flex-col justify-center shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                                    <div className="flex justify-between items-end mb-2.5">
                                        <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                                            <div className="w-1.5 h-1.5 rounded-full bg-rose-400"></div> Total Debit
                                        </div>
                                        <div className="text-sm font-bold text-rose-600">{formatCurrency(displayBalance.totalDebit)}</div>
                                    </div>
                                    <div className="w-full h-px bg-slate-100 mb-2.5"></div>
                                    <div className="flex justify-between items-end">
                                        <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400"></div> Total Credit
                                        </div>
                                        <div className="text-sm font-bold text-emerald-600">{formatCurrency(displayBalance.totalCredit)}</div>
                                    </div>
                                </div>

                                {/* Combined Balances (Span 1) */}
                                <div className="bg-gradient-to-br from-indigo-50 to-indigo-100/50 border border-indigo-200/60 rounded-xl p-4 flex flex-col justify-between shadow-sm relative overflow-hidden h-full">
                                    <div className="absolute -right-4 -bottom-4 text-indigo-500/10 pointer-events-none">
                                        <svg className="w-24 h-24 transform rotate-12" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1.41 16.09V20h-2.67v-1.93c-1.71-.36-3.11-1.36-3.11-2.92v-.46h2.79v.48c0 .76.7 1.31 1.74 1.31 1.11 0 1.73-.57 1.73-1.36 0-.87-.59-1.28-1.92-1.61-1.98-.51-3.26-1.56-3.26-3.25 0-1.46 1.11-2.5 2.69-2.85V5.5h2.67v1.95c1.4.35 2.5 1.31 2.5 2.55v.52h-2.79v-.53c0-.68-.61-1.16-1.5-1.16-.94 0-1.47.51-1.47 1.25 0 .8.65 1.21 2.05 1.57 2.11.53 3.12 1.63 3.12 3.32 0 1.6-1.18 2.67-2.77 3.12z"/></svg>
                                    </div>
                                    <div className="relative z-10 flex justify-between items-end mb-2">
                                        <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                                            Opening
                                        </div>
                                        <div className="text-sm font-semibold text-slate-600">
                                            {formatCurrency(displayBalance.openingBalance)} <span className="text-xs font-normal ml-0.5">{displayBalance.openingBalanceType}</span>
                                        </div>
                                    </div>
                                    <div className="w-full h-px bg-indigo-200/50 mb-2 relative z-10"></div>
                                    <div className="relative z-10 flex flex-col items-start mt-auto">
                                        <div className="text-[11px] font-bold text-indigo-600 uppercase tracking-wider mb-0.5 flex items-center gap-1.5">
                                            <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.8)]"></div> Closing
                                        </div>
                                        <div className="text-xl font-black text-indigo-950 tracking-tight leading-none mt-1">
                                            {formatCurrency(displayBalance.closingBalance)} <span className="text-sm font-bold text-indigo-600 ml-0.5">{displayBalance.closingBalanceType}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })()}

                    <div className="overflow-auto flex-1 p-0">
                        <TransactionTable 
                            transactions={processedAccountTxns} 
                            showFullDetails={showFullDetails} 
                            isStatementView={true} 
                            selectedAccountName={selectedAccount.name} 
                            onDeleteTransaction={handleDeleteStatementTransaction}
                        />
                        
                        {loadingTxns && <div className="text-center p-4 text-gray-500">Loading more transactions...</div>}
                        
                        {!loadingTxns && hasMoreTxns && accountTxns.length > 0 && (
                            <div className="text-center p-4 border-t border-gray-100">
                                <button 
                                    onClick={() => fetchAccountTransactions(selectedAccount.name, true)}
                                    className="px-4 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded text-sm font-medium"
                                >
                                    Load More
                                </button>
                            </div>
                        )}
                        {!loadingTxns && !hasMoreTxns && accountTxns.length > 0 && (
                            <div className="text-center p-4 border-t border-gray-100 text-sm text-gray-500">
                                All transactions loaded.
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col min-h-0 flex-1 gap-3 sm:gap-4">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col flex-1 min-h-0 overflow-hidden">
                <div className="py-[5px] px-4 sm:px-5 border-b border-gray-100 flex flex-col gap-2 sm:gap-3 bg-white rounded-t-2xl shrink-0 relative z-20">
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 sm:gap-4">
                        {/* Mobile: Top Row (FY + Filter), Desktop: Just FY */}
                        <div className="flex items-center justify-between gap-3 sm:w-auto">
                            {/* Left: Fiscal Year Selector */}
                            <div className="shrink-0 flex-1 sm:flex-none">
                                <select
                                    value={selectedFY}
                                    onChange={(e) => setSelectedFY(e.target.value)}
                                    className="w-full sm:w-auto px-3 py-2 border-0 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs sm:text-sm font-bold bg-blue-50 text-blue-700 cursor-pointer shadow-sm hover:bg-blue-100 transition-colors"
                                >
                                    {fyOptions.length === 0 && <option value="">No Fiscal Years</option>}
                                    {fyOptions.map(fy => <option key={fy.id} value={fy.id}>{fy.name}</option>)}
                                </select>
                            </div>

                            {/* Right: Filter Toggle Button (Mobile) */}
                            <div className="shrink-0 sm:hidden">
                                <button
                                    type="button"
                                    onClick={() => setShowMobileFilters(prev => !prev)}
                                    className="flex justify-center items-center gap-1.5 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs font-bold text-gray-800 hover:bg-gray-100 transition shadow-sm"
                                >
                                    <Filter className="w-3.5 h-3.5 text-blue-600" />
                                    <span>Filters</span>
                                    {activeFilterCount > 0 && (
                                        <span className="bg-blue-600 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                                            {activeFilterCount}
                                        </span>
                                    )}
                                </button>
                            </div>
                        </div>

                        {/* Center: Search Box */}
                        <div className="flex-1 w-full min-w-0">
                            <AccountSearchDropdown
                                value={searchTerm}
                                onChange={(val) => setSearchTerm(val)}
                                placeholder="Search account name..."
                            />
                        </div>

                        {/* Right: Ignored Accounts Toggle + Filter Toggle Button (Desktop) */}
                        <div className="shrink-0 hidden sm:flex items-center gap-2">
                            {/* Ignored Accounts Toggle - Desktop Only */}
                            <button
                                type="button"
                                onClick={() => setShowIgnored(prev => !prev)}
                                className={`flex justify-center items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition shadow-sm border ${
                                    showIgnored 
                                        ? 'bg-amber-50 border-amber-300 text-amber-800 hover:bg-amber-100' 
                                        : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                                }`}
                            >
                                <EyeOff className="w-4 h-4" />
                                <span>Ignored</span>
                                {(() => {
                                    const ignoredCount = allAccounts.filter(a => isAccountIgnored(a) && (!selectedFY || !!fyBalances[a.id])).length;
                                    return ignoredCount > 0 ? (
                                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ml-0.5 ${
                                            showIgnored ? 'bg-amber-200 text-amber-900' : 'bg-gray-200 text-gray-700'
                                        }`}>
                                            {ignoredCount}
                                        </span>
                                    ) : null;
                                })()}
                            </button>
                            {/* Filter Button */}
                            <button
                                type="button"
                                onClick={() => setShowMobileFilters(prev => !prev)}
                                className="flex justify-center items-center gap-2 px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-bold text-gray-800 hover:bg-gray-100 transition shadow-sm"
                            >
                                <Filter className="w-4 h-4 text-blue-600" />
                                <span>Filters</span>
                                {activeFilterCount > 0 && (
                                    <span className="bg-blue-600 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold ml-1">
                                        {activeFilterCount}
                                    </span>
                                )}
                                {showMobileFilters ? <ChevronUp className="w-4 h-4 text-gray-400 ml-1" /> : <ChevronDown className="w-4 h-4 text-gray-400 ml-1" />}
                            </button>
                        </div>
                    </div>

                    {/* Filter Popup / Modal */}
                    {showMobileFilters && createPortal(
                        <div className="fixed inset-0 z-[100] flex items-center justify-center sm:p-4">
                            {/* Backdrop */}
                            <div 
                                className="fixed inset-0 bg-black/50 transition-opacity"
                                onClick={() => setShowMobileFilters(false)}
                            ></div>
                            {/* Modal Content */}
                            <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl z-[101] flex flex-col w-full max-w-lg max-h-[85vh] absolute bottom-0 sm:relative sm:bottom-auto">
                                {/* Header */}
                                <div className="flex justify-between items-center px-5 py-4 border-b border-gray-100 shrink-0">
                                    <h3 className="font-extrabold text-gray-900 text-lg flex items-center gap-2">
                                        <Filter size={18} className="text-blue-600" /> Filters & Sort
                                    </h3>
                                    <button onClick={() => setShowMobileFilters(false)} className="p-1.5 bg-gray-100 text-gray-500 hover:bg-gray-200 rounded-full transition">
                                        <X size={20} />
                                    </button>
                                </div>
                                
                                {/* Scrollable Body */}
                                <div className="p-5 flex-1 overflow-y-auto flex flex-col gap-4">
                                    {/* Group & Verification Status */}
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="flex flex-col gap-1">
                                            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Group</label>
                                            <select
                                                value={selectedGroup}
                                                onChange={(e) => setSelectedGroup(e.target.value)}
                                                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:bg-white font-medium"
                                            >
                                                <option value="">All Groups</option>
                                                {uniqueGroups.map(g => <option key={g} value={g}>{g}</option>)}
                                            </select>
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Status</label>
                                            <select
                                                value={verificationStatus}
                                                onChange={(e) => setVerificationStatus(e.target.value)}
                                                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:bg-white font-medium"
                                            >
                                                <option value="all">All</option>
                                                <option value="verified">Verified</option>
                                                <option value="unverified">Unverified</option>
                                                <option value="ignored">Ignored</option>
                                            </select>
                                        </div>
                                    </div>

                                    {/* Min & Max Balance */}
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="flex flex-col gap-1">
                                            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Min Bal</label>
                                            <input 
                                                type="number" 
                                                placeholder="0" 
                                                value={minBalance}
                                                onChange={(e) => setMinBalance(e.target.value)}
                                                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:bg-white font-medium"
                                            />
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Max Bal</label>
                                            <input 
                                                type="number" 
                                                placeholder="Any" 
                                                value={maxBalance}
                                                onChange={(e) => setMaxBalance(e.target.value)}
                                                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:bg-white font-medium"
                                            />
                                        </div>
                                    </div>

                                    {/* Sort controls */}
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="flex flex-col gap-1">
                                            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Sort By</label>
                                            <select
                                                value={sortConfig.key}
                                                onChange={(e) => setSortConfig(prev => ({ ...prev, key: e.target.value }))}
                                                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:bg-white font-medium"
                                            >
                                                <option value="name">Name</option>
                                                <option value="closingBalance">Closing Bal</option>
                                                <option value="openingBalance">Opening Bal</option>
                                                <option value="totalDebit">Total Dr</option>
                                                <option value="totalCredit">Total Cr</option>
                                                <option value="verifiedBy">Verified By</option>
                                            </select>
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Order</label>
                                            <button
                                                type="button"
                                                onClick={() => setSortConfig(prev => ({ ...prev, direction: prev.direction === 'ascending' ? 'descending' : 'ascending' }))}
                                                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white text-gray-800 font-bold shadow-sm hover:bg-gray-50 transition"
                                            >
                                                {sortConfig.direction === 'ascending' ? 'Ascending ↑' : 'Descending ↓'}
                                            </button>
                                        </div>
                                    </div>

                                    {/* Toggles */}
                                    <div className="flex flex-col gap-3 py-3 border-y border-gray-100 my-1">
                                        <label className="flex items-center justify-between text-sm text-gray-800 font-semibold cursor-pointer group">
                                            <span>Ignored Accounts</span>
                                            <input 
                                                type="checkbox" 
                                                checked={showIgnored}
                                                onChange={(e) => setShowIgnored(e.target.checked)}
                                                className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 bg-gray-50 cursor-pointer"
                                            />
                                        </label>
                                        <label className="flex items-center justify-between text-sm text-gray-800 font-semibold cursor-pointer group">
                                            <span>Skip 0 Balances</span>
                                            <input 
                                                type="checkbox" 
                                                checked={skipZeroClosingBalance}
                                                onChange={(e) => setSkipZeroClosingBalance(e.target.checked)}
                                                className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 bg-gray-50 cursor-pointer"
                                            />
                                        </label>
                                    </div>
                                </div>

                                {/* Action buttons */}
                                <div className="flex flex-col gap-2 p-5 pt-3 border-t border-gray-100 bg-white shrink-0 pb-safe sm:rounded-b-2xl">
                                    <div className="flex gap-2">
                                        {(searchTerm || selectedGroup || minBalance || maxBalance || verificationStatus !== 'all' || skipZeroClosingBalance || showIgnored) ? (
                                            <button
                                                onClick={() => {
                                                    setSearchTerm('');
                                                    setSelectedGroup('');
                                                    setMinBalance('');
                                                    setMaxBalance('');
                                                    setVerificationStatus('all');
                                                    setSkipZeroClosingBalance(false);
                                                    setShowIgnored(false);
                                                }}
                                                className="flex-[1] py-3 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl text-sm font-bold transition"
                                            >
                                                Clear
                                            </button>
                                        ) : (
                                            <div className="flex-[1]"></div>
                                        )}
                                        <button
                                            onClick={() => setShowMobileFilters(false)}
                                            className="flex-[2] py-3 bg-gray-900 hover:bg-gray-800 text-white rounded-xl text-sm font-bold shadow-md transition"
                                        >
                                            Apply & Close
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>,
                        document.body
                    )}
                </div>
                
                <div className="overflow-auto flex-1 relative">
                    {loadingAccounts ? (
                        <>
                            {/* Desktop Skeleton */}
                            <div className="hidden md:block">
                                <div className="min-w-full">
                                    {/* Skeleton Header */}
                                    <div className="flex bg-gray-50 border-b border-gray-200 px-4 py-3 gap-4">
                                        <div className="w-16 h-3 bg-gray-200 rounded animate-pulse"></div>
                                        <div className="flex-1 h-3 bg-gray-200 rounded animate-pulse"></div>
                                        <div className="w-20 h-3 bg-gray-200 rounded animate-pulse"></div>
                                        <div className="w-16 h-3 bg-gray-200 rounded animate-pulse"></div>
                                        <div className="w-16 h-3 bg-gray-200 rounded animate-pulse"></div>
                                        <div className="w-20 h-3 bg-gray-200 rounded animate-pulse"></div>
                                        <div className="w-20 h-3 bg-gray-200 rounded animate-pulse"></div>
                                        <div className="w-16 h-3 bg-gray-200 rounded animate-pulse"></div>
                                    </div>
                                    {/* Skeleton Rows */}
                                    {[...Array(7)].map((_, i) => (
                                        <div key={i} className="flex items-center px-4 py-3.5 gap-4 border-b border-gray-100" style={{ animationDelay: `${i * 80}ms` }}>
                                            <div className="w-16 flex gap-1.5 shrink-0">
                                                <div className="w-7 h-7 bg-gray-100 rounded animate-pulse"></div>
                                                <div className="w-7 h-7 bg-gray-100 rounded animate-pulse"></div>
                                            </div>
                                            <div className="flex-1 flex flex-col gap-1.5">
                                                <div className={`h-3.5 bg-gray-200 rounded animate-pulse`} style={{ width: `${45 + Math.random() * 35}%` }}></div>
                                                <div className="h-2.5 bg-gray-100 rounded animate-pulse w-20"></div>
                                            </div>
                                            <div className="w-20 h-3.5 bg-gray-100 rounded animate-pulse"></div>
                                            <div className="w-16 h-3.5 bg-gray-100 rounded animate-pulse"></div>
                                            <div className="w-16 h-3.5 bg-gray-100 rounded animate-pulse"></div>
                                            <div className="w-20 h-3.5 bg-gray-200 rounded animate-pulse"></div>
                                            <div className="w-20 h-3 bg-gray-100 rounded-full animate-pulse"></div>
                                            <div className="w-16 h-6 bg-gray-100 rounded animate-pulse"></div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            {/* Mobile Skeleton */}
                            <div className="block md:hidden divide-y divide-gray-100">
                                {[...Array(4)].map((_, i) => (
                                    <div key={i} className="p-4" style={{ animationDelay: `${i * 100}ms` }}>
                                        <div className="flex justify-between items-start mb-3">
                                            <div className="flex-1 flex flex-col gap-1.5">
                                                <div className="h-4 bg-gray-200 rounded animate-pulse" style={{ width: `${50 + Math.random() * 30}%` }}></div>
                                                <div className="h-2.5 bg-gray-100 rounded animate-pulse w-16"></div>
                                            </div>
                                            <div className="w-16 h-5 bg-gray-100 rounded animate-pulse ml-2"></div>
                                        </div>
                                        <div className="flex justify-between items-end mb-3">
                                            <div className="h-2.5 bg-gray-100 rounded animate-pulse w-20"></div>
                                            <div className="h-4 bg-gray-200 rounded animate-pulse w-28"></div>
                                        </div>
                                        <div className="flex justify-between items-center bg-gray-50 rounded-xl p-2.5 mb-3">
                                            <div className="flex flex-col gap-1">
                                                <div className="h-2 bg-gray-200 rounded animate-pulse w-12"></div>
                                                <div className="h-3 bg-gray-100 rounded animate-pulse w-20"></div>
                                            </div>
                                            <div className="flex flex-col gap-1 items-center">
                                                <div className="h-2 bg-gray-200 rounded animate-pulse w-10"></div>
                                                <div className="h-3 bg-gray-100 rounded animate-pulse w-16"></div>
                                            </div>
                                            <div className="flex flex-col gap-1 items-end">
                                                <div className="h-2 bg-gray-200 rounded animate-pulse w-10"></div>
                                                <div className="h-3 bg-gray-100 rounded animate-pulse w-16"></div>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-4 gap-1.5">
                                            {[...Array(4)].map((_, j) => (
                                                <div key={j} className="h-12 bg-gray-50 rounded-lg animate-pulse border border-gray-100"></div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </>
                    ) : (
                        <>
                            {/* Desktop Table View */}
                            <table className="hidden md:table min-w-full divide-y divide-gray-200 text-xs sm:text-sm">
                                <thead className="bg-white sticky top-0 shadow-sm z-10">
                                    <tr>
                                        <th className="px-3 py-2 text-center font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Menu</th>
                                        <th className="px-4 py-2 text-left font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap cursor-pointer hover:bg-gray-200" onClick={() => requestSort('name')}>Account Name{getSortIndicator('name')}</th>
                                        <th className="px-4 py-2 text-right font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap cursor-pointer hover:bg-gray-200" onClick={() => requestSort('openingBalance')}>Opening Bal{getSortIndicator('openingBalance')}</th>
                                        <th className="px-4 py-2 text-right font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap cursor-pointer hover:bg-gray-200" onClick={() => requestSort('totalDebit')}>Total Dr{getSortIndicator('totalDebit')}</th>
                                        <th className="px-4 py-2 text-right font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap cursor-pointer hover:bg-gray-200" onClick={() => requestSort('totalCredit')}>Total Cr{getSortIndicator('totalCredit')}</th>
                                        <th className="px-4 py-2 text-right font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap cursor-pointer hover:bg-gray-200" onClick={() => requestSort('closingBalance')}>Closing Bal{getSortIndicator('closingBalance')}</th>
                                        <th className="px-4 py-2 text-center font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap cursor-pointer hover:bg-gray-200" onClick={() => requestSort('verifiedBy')}>Verification{getSortIndicator('verifiedBy')}</th>
                                        <th className="px-4 py-2 text-center font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-100">
                                    {paginatedAccounts.length === 0 ? (
                                        <tr>
                                            <td colSpan="8" className="px-4 py-6 text-center text-gray-500">
                                                No accounts found{selectedFY ? ' for the selected fiscal year' : ''}. {allAccounts.length > 0 && Object.keys(fyBalances).length === 0 && (
                                                    <span className="block mt-2 text-red-500 font-bold">Please ensure Master or Transactions have been imported and Balances synced for this Fiscal Year in the Import Center.</span>
                                                )}
                                            </td>
                                        </tr>
                                    ) : (
                                        paginatedAccounts.map(acc => {
                                            const bal = getAccountBalance(acc);
                                            const isIgnored = isAccountIgnored(acc);
                                            return (
                                            <tr 
                                                key={acc.id} 
                                                onClick={() => openAccountDetails(acc)}
                                                className="cursor-pointer hover:bg-blue-50 transition"
                                            >
                                                <td className="px-3 py-2 text-center whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                                                    <div className="flex items-center justify-center gap-1.5">
                                                        <button 
                                                            type="button"
                                                            onClick={() => handleOpenEdit(acc)}
                                                            className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-100 rounded transition border border-blue-200"
                                                            title="Edit Account / Opening Balance"
                                                        >
                                                            <Pencil size={14} />
                                                        </button>
                                                        <button 
                                                            type="button"
                                                            onClick={() => handleOpenFollowUp(acc)}
                                                            className="p-1.5 text-purple-600 hover:text-purple-800 hover:bg-purple-100 rounded transition border border-purple-200"
                                                            title="Follow-ups"
                                                        >
                                                            <ClipboardList size={14} />
                                                        </button>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-2 text-gray-900 font-medium whitespace-nowrap">
                                                    {acc.name}
                                                    <div className="text-xs text-gray-400 font-normal">{acc.group}</div>
                                                </td>
                                                <td className="px-4 py-2 text-right text-gray-700 whitespace-nowrap">
                                                    {formatCurrency(bal.openingBalance)} <span className="text-xs font-semibold">{bal.openingBalanceType}</span>
                                                </td>
                                                <td className="px-4 py-2 text-right text-gray-700 whitespace-nowrap">{formatCurrency(bal.totalDebit)}</td>
                                                <td className="px-4 py-2 text-right text-gray-700 whitespace-nowrap">{formatCurrency(bal.totalCredit)}</td>
                                                <td className="px-4 py-2 text-right text-gray-900 font-bold whitespace-nowrap">
                                                    {formatCurrency(bal.closingBalance)} <span className="text-xs">{bal.closingBalanceType}</span>
                                                </td>
                                                <td className="px-4 py-2 text-center whitespace-nowrap">
                                                    {bal.verifiedBy ? (
                                                        <div className="inline-flex flex-col items-center">
                                                            <span className="bg-green-100 text-green-800 text-xs font-medium px-2.5 py-0.5 rounded-full">
                                                                ✓ Verified
                                                            </span>
                                                            <span className="text-[10px] text-gray-500 mt-1">{bal.verifiedBy}</span>
                                                            <span className="text-[10px] text-gray-400">{bal.verifiedAt}</span>
                                                        </div>
                                                    ) : (
                                                        <span className="bg-yellow-100 text-yellow-800 text-xs font-medium px-2.5 py-0.5 rounded-full">
                                                            Pending
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-2 text-center whitespace-nowrap flex gap-2 justify-center">
                                                    {!bal.verifiedBy && (
                                                        <button 
                                                            onClick={(e) => { e.stopPropagation(); handleVerify(acc); }}
                                                            className="text-blue-600 hover:text-blue-800 text-xs font-medium px-2 py-1 border border-blue-200 rounded hover:bg-blue-50 transition"
                                                        >
                                                            Verify
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={(e) => { 
                                                            e.stopPropagation(); 
                                                            handleIgnoreToggle(acc, isIgnored); 
                                                        }}
                                                        className={`text-xs font-medium px-2 py-1 border rounded transition ${
                                                            isIgnored 
                                                                ? 'text-green-700 border-green-300 hover:bg-green-50' 
                                                                : 'text-gray-600 border-gray-200 hover:bg-gray-100 hover:text-gray-800'
                                                        }`}
                                                    >
                                                        {isIgnored ? 'Unignore' : 'Ignore'}
                                                    </button>
                                                </td>
                                            </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>

                            {/* Mobile Card View */}
                            <div className="block md:hidden divide-y divide-gray-200">
                                {paginatedAccounts.length === 0 ? (
                                    <div className="p-6 text-center text-gray-500">
                                        <p className="font-medium text-xs">
                                            No accounts found{selectedFY ? ' for the selected fiscal year' : ''}.
                                        </p>
                                        {allAccounts.length > 0 && Object.keys(fyBalances).length === 0 && (
                                            <span className="block mt-2 text-xs text-red-500 font-bold">
                                                Please ensure Master or Transactions have been imported and Balances synced for this Fiscal Year in the Import Center.
                                            </span>
                                        )}
                                    </div>
                                ) : (
                                    paginatedAccounts.map(acc => {
                                        const bal = getAccountBalance(acc);
                                        const isIgnored = isAccountIgnored(acc);
                                        return (
                                            <div 
                                                key={acc.id} 
                                                className={`p-4 border-b border-gray-100 last:border-b-0 ${
                                                    isIgnored ? 'bg-gray-50 opacity-75' : 'bg-white'
                                                }`}
                                            >
                                                {/* Header: Name and Status */}
                                                <div className="flex justify-between items-start mb-3 gap-2">
                                                    <div className="flex-1 min-w-0">
                                                        <h4 className="font-extrabold text-gray-900 leading-tight truncate text-base">{acc.name}</h4>
                                                        <p className="text-xs text-gray-500 mt-1 truncate font-medium">{acc.group || '-'}</p>
                                                    </div>
                                                    <div className="flex items-center gap-1.5 shrink-0">
                                                        {bal.verifiedBy && (
                                                            <span className="bg-green-100 text-green-800 text-[10px] font-bold px-2 py-1 rounded flex items-center gap-1 border border-green-200">
                                                                <CheckCircle2 size={12} /> Verified
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Hero Balance */}
                                                <div className="flex justify-between items-end mb-3">
                                                    <span className="text-xs text-gray-400 font-bold uppercase tracking-wider">Closing Balance</span>
                                                    <div className="flex items-baseline gap-1.5">
                                                        <span className={`text-base font-bold leading-none tracking-tight ${
                                                            bal.closingBalanceType === 'Dr' ? 'text-blue-700' : bal.closingBalanceType === 'Cr' ? 'text-amber-700' : 'text-gray-800'
                                                        }`}>
                                                            {formatCurrency(bal.closingBalance)}
                                                        </span>
                                                        <span className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded ${
                                                            bal.closingBalanceType === 'Dr' ? 'bg-blue-100 text-blue-800' : bal.closingBalanceType === 'Cr' ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-600'
                                                        }`}>
                                                            {bal.closingBalanceType || '-'}
                                                        </span>
                                                    </div>
                                                </div>

                                                {/* Secondary Balances */}
                                                <div className="flex justify-between items-center bg-gray-50 border border-gray-100 rounded-xl p-2.5">
                                                    <div className="flex flex-col">
                                                        <span className="text-[10px] text-gray-400 font-bold uppercase mb-0.5">Opening</span>
                                                        <span className="text-xs text-gray-800 font-bold">{formatCurrency(bal.openingBalance)} <span className="text-[10px] font-semibold text-gray-500">{bal.openingBalanceType}</span></span>
                                                    </div>
                                                    <div className="flex flex-col items-center">
                                                        <span className="text-[10px] text-gray-400 font-bold uppercase mb-0.5">Debit</span>
                                                        <span className="text-xs text-red-600 font-bold">{formatCurrency(bal.totalDebit)}</span>
                                                    </div>
                                                    <div className="flex flex-col items-end">
                                                        <span className="text-[10px] text-gray-400 font-bold uppercase mb-0.5">Credit</span>
                                                        <span className="text-xs text-green-600 font-bold">{formatCurrency(bal.totalCredit)}</span>
                                                    </div>
                                                </div>

                                                {/* Actions in 1 Row */}
                                                <div className={`grid ${!bal.verifiedBy ? 'grid-cols-5' : 'grid-cols-4'} gap-1.5 mt-3`}>
                                                    <button
                                                        onClick={() => openAccountDetails(acc)}
                                                        className="flex flex-col items-center justify-center py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg transition border border-blue-100 shadow-sm"
                                                        title="View Statement"
                                                    >
                                                        <Eye size={16} className="mb-1" />
                                                        <span className="text-[9px] font-bold">Stmt</span>
                                                    </button>
                                                    
                                                    <button
                                                        onClick={() => handleOpenEdit(acc)}
                                                        className="flex flex-col items-center justify-center py-2 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-lg transition border border-gray-200 shadow-sm"
                                                        title="Edit Account"
                                                    >
                                                        <Pencil size={16} className="mb-1" />
                                                        <span className="text-[9px] font-bold">Edit</span>
                                                    </button>

                                                    <button
                                                        onClick={() => handleOpenFollowUp(acc)}
                                                        className="flex flex-col items-center justify-center py-2 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-lg transition border border-purple-100 shadow-sm"
                                                        title="Follow Up"
                                                    >
                                                        <ClipboardList size={16} className="mb-1" />
                                                        <span className="text-[9px] font-bold">Follow</span>
                                                    </button>

                                                    {!bal.verifiedBy && (
                                                        <button
                                                            onClick={() => handleVerify(acc)}
                                                            className="flex flex-col items-center justify-center py-2 bg-green-50 hover:bg-green-100 text-green-700 rounded-lg transition border border-green-200 shadow-sm"
                                                            title="Mark as Verified"
                                                        >
                                                            <Check size={16} className="mb-1" />
                                                            <span className="text-[9px] font-bold">Verify</span>
                                                        </button>
                                                    )}

                                                    <button
                                                        onClick={() => handleIgnoreToggle(acc, isIgnored)}
                                                        className={`flex flex-col items-center justify-center py-2 rounded-lg transition border shadow-sm ${
                                                            isIgnored 
                                                                ? 'bg-amber-50 text-amber-800 border-amber-200' 
                                                                : 'bg-gray-50 text-gray-600 hover:bg-gray-100 border-gray-200'
                                                        }`}
                                                        title={isIgnored ? 'Unignore Account' : 'Ignore Account'}
                                                    >
                                                        <X size={16} className="mb-1" />
                                                        <span className="text-[9px] font-bold">{isIgnored ? 'Unignore' : 'Ignore'}</span>
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </>
                    )}
                </div>

                <div className="flex flex-row justify-between items-center px-3 py-3 sm:py-2 bg-white sm:bg-gray-50 border-t border-gray-200 shrink-0">
                    {/* Desktop Showing */}
                    <span className="hidden sm:inline text-sm text-gray-700 font-medium w-auto text-left">
                        Showing {sortedAccounts.length === 0 ? 0 : (currentPage - 1) * pageSize + 1} - {Math.min(currentPage * pageSize, sortedAccounts.length)} of {sortedAccounts.length} accounts
                    </span>
                    <div className="flex w-full sm:w-auto gap-2 items-center justify-between sm:justify-end">
                        <button 
                            disabled={currentPage === 1 || loadingAccounts}
                            onClick={() => setCurrentPage(1)}
                            className="hidden sm:inline-flex px-2.5 py-1.5 bg-white hover:bg-gray-100 text-gray-700 text-xs font-bold border border-gray-300 rounded disabled:opacity-40 disabled:cursor-not-allowed transition"
                            title="First Page"
                        >
                            ««
                        </button>
                        <button 
                            disabled={currentPage === 1 || loadingAccounts}
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            className="shrink-0 py-1.5 px-2.5 sm:py-1.5 sm:px-3 bg-gray-100 sm:bg-white text-gray-700 text-xs sm:text-sm font-bold sm:font-medium rounded border border-gray-200 sm:border-gray-300 disabled:opacity-40 transition"
                        >
                            <span className="sm:hidden">← Prev.</span><span className="hidden sm:inline">← Prev</span>
                        </button>
                        
                        <div className="flex items-center justify-center text-[10px] sm:text-sm text-center truncate flex-1 sm:flex-none font-medium text-gray-600">
                            <span className="sm:hidden truncate mr-1">
                                {sortedAccounts.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}-{Math.min(currentPage * pageSize, sortedAccounts.length)} of {sortedAccounts.length}
                            </span>
                            <span className="sm:hidden text-gray-400 mr-1">•</span>
                            <span className="font-bold text-gray-800 whitespace-nowrap">
                                <span className="sm:hidden">Pg </span>{currentPage} <span className="text-gray-400">/ {totalPages}</span>
                            </span>
                        </div>

                        <button 
                            disabled={!hasNextPage || loadingAccounts}
                            onClick={() => setCurrentPage(p => p + 1)}
                            className="shrink-0 py-1.5 px-2.5 sm:py-1.5 sm:px-3 bg-blue-50 sm:bg-white text-blue-700 sm:text-gray-700 text-xs sm:text-sm font-bold sm:font-medium rounded border border-blue-200 sm:border-gray-300 disabled:opacity-40 transition"
                        >
                            <span className="sm:hidden">Next →</span><span className="hidden sm:inline">Next →</span>
                        </button>
                        <button 
                            disabled={!hasNextPage || loadingAccounts}
                            onClick={() => setCurrentPage(totalPages)}
                            className="hidden sm:inline-flex px-2.5 py-1.5 bg-white hover:bg-gray-100 text-gray-700 text-xs font-bold border border-gray-300 rounded disabled:opacity-40 transition"
                            title="Last Page"
                        >
                            »»
                        </button>
                    </div>
                </div>
            </div>

            <EditAccountModal
                isOpen={editModalOpen}
                onClose={() => { setEditModalOpen(false); setEditingAccount(null); }}
                account={editingAccount}
                fyOptions={fyOptions}
                selectedFY={selectedFY}
                onSave={handleAccountSave}
            />

            <FollowUpModal
                isOpen={followUpModalOpen}
                onClose={() => { setFollowUpModalOpen(false); setFollowUpAccount(null); }}
                account={followUpAccount}
                currentUser={currentUser}
            />
        </div>
    );
}
