import React, { useState, useMemo, useEffect } from 'react';
import { db } from '../firebase';
import { collection, doc, writeBatch, getDocs, query, where, limit, startAfter, or, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import TransactionTable from './TransactionTable';
import AccountSearchDropdown from './AccountSearchDropdown';
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from 'xlsx';
import { fetchFiscalYears, getCurrentFYObject } from '../utils/fiscalYear';
import EditAccountModal from './EditAccountModal';
import FollowUpModal from './FollowUpModal';
import { Pencil, ClipboardList, Filter, ChevronDown, ChevronUp, Eye, Check, CheckCircle2, MoreVertical, X } from 'lucide-react';
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

    useEffect(() => {
        const loadFYs = async () => {
            const fys = await fetchFiscalYears();
            setFyOptions(fys);
            const current = getCurrentFYObject(fys);
            if (current) {
                setSelectedFY(current.id);
                setDetailFY(current.id);
            } else if (fys.length > 0) {
                setSelectedFY(fys[0].id);
                setDetailFY(fys[0].id);
            }
        };
        loadFYs();
    }, []);
    const [accountTxns, setAccountTxns] = useState([]);
    const [loadingTxns, setLoadingTxns] = useState(false);
    const [lastVisibleTxn, setLastVisibleTxn] = useState(null);
    const [hasMoreTxns, setHasMoreTxns] = useState(true);
    const [showFullDetails, setShowFullDetails] = useState(false);

    // All data state
    const [allAccounts, setAllAccounts] = useState([]);
    const [currentPage, setCurrentPage] = useState(1);
    const pageSize = 15;

    useEffect(() => {
        const loadAllAccounts = async () => {
            setLoadingAccounts(true);
            try {
                const snap = await getDocs(collection(db, 'accounts'));
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
                console.error("Error fetching all accounts:", err);
            }
            setLoadingAccounts(false);
        };
        loadAllAccounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [updateTrigger]);

    useEffect(() => {
        const fetchAllFYBalances = async () => {
            if (allAccounts.length === 0 || !selectedFY) {
                setFyBalances({});
                return;
            }
            setLoadingAccounts(true);
            setFyBalances({});
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
            setLoadingAccounts(false);
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
        } else if (!showIgnored) {
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
                limit(50)
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
            setHasMoreTxns(snap.docs.length === 50);

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
            <div className="flex flex-col min-h-0 md:h-[calc(100vh-10rem)] gap-4">
                <div className="bg-white rounded-lg shadow border border-gray-200 flex flex-col h-full">
                    {/* Header */}
                    <div className="p-3 sm:p-4 border-b border-gray-200 bg-gray-50 rounded-t-lg shrink-0 flex flex-col sm:flex-row gap-3 sm:gap-4 justify-between items-start sm:items-center">
                        <div className="flex flex-wrap items-center gap-2 sm:gap-4">
                            <button 
                                onClick={() => setView('directory')}
                                className="px-3 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded font-medium text-sm transition"
                            >
                                ← Back to Accounts
                            </button>
                            <select
                                value={detailFY}
                                onChange={(e) => { setDetailFY(e.target.value); setAccountTxns([]); setLastVisibleTxn(null); }}
                                className="px-3 py-1.5 border border-blue-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm font-medium bg-blue-50 text-blue-800"
                            >
                                {fyOptions.length === 0 && <option value="">No Fiscal Years</option>}
                                {fyOptions.map(fy => <option key={fy.id} value={fy.id}>{fy.name}</option>)}
                            </select>
                            <h3 className="font-semibold text-base sm:text-xl text-gray-800">
                                {selectedAccount.name}
                            </h3>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
                                <input 
                                    type="checkbox" 
                                    checked={showFullDetails}
                                    onChange={(e) => setShowFullDetails(e.target.checked)}
                                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                />
                                Show full details
                            </label>
                            <button 
                                onClick={exportToPDF}
                                className="bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded text-sm font-medium transition"
                            >
                                Export PDF
                            </button>
                            <button 
                                onClick={exportToExcel}
                                className="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded text-sm font-medium transition"
                            >
                                Export Excel
                            </button>
                        </div>
                    </div>

                    {/* Account Summary & Details Block */}
                    <div className="p-4 border-b border-gray-200 bg-white grid grid-cols-1 md:grid-cols-2 gap-4 shrink-0">
                        <div>
                            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Account Details</h4>
                            <div className="text-sm text-gray-700 grid grid-cols-2 gap-2">
                                <div className="font-medium">Group:</div>
                                <div>{selectedAccount.group || '-'}</div>
                                <div className="font-medium">Address:</div>
                                <div>{selectedAccount.address || '-'}</div>
                                <div className="font-medium">Contact:</div>
                                <div>{selectedAccount.contact || '-'}</div>
                            </div>
                        </div>
                        <div>
                            {(() => {
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
                                    <>
                                        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                                            Balance Summary <span className="text-[10px] text-blue-500 normal-case ml-1">({displayBalance.fyName || 'Selected FY'})</span>
                                        </h4>
                                        <div className="text-sm text-gray-700 grid grid-cols-2 gap-2">
                                            <div className="font-medium">Opening Balance:</div>
                                            <div className="text-right">{formatCurrency(displayBalance.openingBalance)} {displayBalance.openingBalanceType}</div>
                                            <div className="font-medium">Total Debit:</div>
                                            <div className="text-right text-red-600">{formatCurrency(displayBalance.totalDebit)}</div>
                                            <div className="font-medium">Total Credit:</div>
                                            <div className="text-right text-green-600">{formatCurrency(displayBalance.totalCredit)}</div>
                                            <div className="font-medium text-gray-900 border-t pt-1 mt-1">Closing Balance:</div>
                                            <div className="text-right font-bold text-gray-900 border-t pt-1 mt-1">{formatCurrency(displayBalance.closingBalance)} {displayBalance.closingBalanceType}</div>
                                        </div>
                                    </>
                                );
                            })()}
                        </div>
                    </div>

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
        <div className="flex flex-col min-h-0 md:h-[calc(100vh-10rem)] gap-3 sm:gap-4">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col flex-1 min-h-0 overflow-hidden">
                <div className="p-4 sm:p-5 border-b border-gray-100 flex flex-col gap-4 sm:gap-5 bg-white rounded-t-2xl shrink-0 relative z-20">
                    <div className="flex items-center justify-between gap-3 flex-wrap sm:flex-nowrap">
                        <div className="flex items-center gap-3 sm:gap-4">
                            <h3 className="font-extrabold text-lg sm:text-xl text-gray-900 tracking-tight">Accounts Directory</h3>
                            <select
                                value={selectedFY}
                                onChange={(e) => setSelectedFY(e.target.value)}
                                className="px-3 py-1.5 sm:px-4 sm:py-2 border-0 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs sm:text-sm font-bold bg-blue-50 text-blue-700 cursor-pointer shadow-sm hover:bg-blue-100 transition-colors"
                            >
                                {fyOptions.length === 0 && <option value="">No Fiscal Years</option>}
                                {fyOptions.map(fy => <option key={fy.id} value={fy.id}>{fy.name}</option>)}
                            </select>
                        </div>

                        {/* Desktop header action buttons */}
                        <div className="hidden md:flex items-center gap-2 sm:gap-3">
                            <label className="flex items-center gap-2 text-xs sm:text-sm font-bold text-gray-600 cursor-pointer mr-2 hover:text-gray-900 transition-colors">
                                <input 
                                    type="checkbox" 
                                    checked={showIgnored}
                                    onChange={(e) => setShowIgnored(e.target.checked)}
                                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 bg-gray-50"
                                />
                                Include Ignored
                            </label>
                            <button
                                type="button"
                                onClick={() => setSkipZeroClosingBalance(prev => !prev)}
                                className={`px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg text-xs sm:text-sm transition-colors border shadow-sm ${
                                    skipZeroClosingBalance
                                        ? 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100 font-bold'
                                        : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50 hover:text-gray-900 font-bold'
                                }`}
                                title="Toggle to skip accounts with 0 closing balance"
                            >
                                {skipZeroClosingBalance ? '✓ Skip 0 Balances' : 'Skip 0 Balances'}
                            </button>
                            <button 
                                onClick={handleVerifyAll}
                                disabled={verifying || paginatedAccounts.length === 0}
                                className="bg-green-600 hover:bg-green-700 text-white px-4 py-1.5 sm:px-5 sm:py-2 rounded-lg text-xs sm:text-sm font-bold transition-all shadow-sm disabled:opacity-50"
                            >
                                {verifying ? 'Processing...' : 'Verify Visible Page'}
                            </button>
                        </div>

                        {/* Mobile Filter Toggle Button */}
                        <button
                            type="button"
                            onClick={() => setShowMobileFilters(prev => !prev)}
                            className="md:hidden flex items-center gap-2 px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-bold text-gray-800 hover:bg-gray-100 transition shadow-sm"
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
                    
                    {/* Desktop Filters (Always visible on md+, 6 columns) */}
                    <div className="hidden md:grid md:grid-cols-6 gap-3">
                        <AccountSearchDropdown
                            value={searchTerm}
                            onChange={(val) => setSearchTerm(val)}
                            placeholder="Search account name..."
                        />
                        <select
                            value={selectedGroup}
                            onChange={(e) => setSelectedGroup(e.target.value)}
                            className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium text-gray-800 transition-colors"
                        >
                            <option value="">All Groups</option>
                            {uniqueGroups.map(g => <option key={g} value={g}>{g}</option>)}
                        </select>
                        <select
                            value={verificationStatus}
                            onChange={(e) => setVerificationStatus(e.target.value)}
                            className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium text-gray-800 transition-colors"
                        >
                            <option value="all">All Verification Status</option>
                            <option value="verified">Verified</option>
                            <option value="unverified">Unverified</option>
                            <option value="ignored">Ignored</option>
                        </select>
                        <input 
                            type="number" 
                            placeholder="Min Balance" 
                            value={minBalance}
                            onChange={(e) => setMinBalance(e.target.value)}
                            className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium text-gray-800 transition-colors placeholder-gray-400"
                        />
                        <input 
                            type="number" 
                            placeholder="Max Balance" 
                            value={maxBalance}
                            onChange={(e) => setMaxBalance(e.target.value)}
                            className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium text-gray-800 transition-colors placeholder-gray-400"
                        />
                        <div className="flex gap-2">
                            <button
                                onClick={handleAccountSearch}
                                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-bold transition-all shadow-sm flex-1"
                            >
                                Search
                            </button>
                            {(searchTerm || selectedGroup || minBalance || maxBalance || verificationStatus !== 'all' || skipZeroClosingBalance || showIgnored) && (
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
                                    className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-bold transition-colors"
                                    title="Reset all filters"
                                >
                                    Reset
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Mobile Filters Section (< md screens) */}
                    <div className="flex flex-col gap-2 md:hidden relative z-50">
                        {/* Always visible Account Search bar on mobile */}
                        <AccountSearchDropdown
                            value={searchTerm}
                            onChange={(val) => setSearchTerm(val)}
                            placeholder="Search account name..."
                        />

                        {/* Bottom Sheet for advanced filters on mobile */}
                        {showMobileFilters && (
                            <>
                                {/* Backdrop */}
                                <div 
                                    className="fixed inset-0 bg-black/40 z-40 md:hidden transition-opacity"
                                    onClick={() => setShowMobileFilters(false)}
                                ></div>
                                {/* Sheet */}
                                <div className="fixed inset-x-0 bottom-0 bg-white rounded-t-2xl shadow-xl z-50 p-5 pb-safe flex flex-col gap-4 md:hidden max-h-[85vh] overflow-y-auto">
                                    <div className="flex justify-between items-center mb-1 border-b border-gray-100 pb-3">
                                        <h3 className="font-extrabold text-gray-900 text-lg flex items-center gap-2">
                                            <Filter size={18} className="text-blue-600" /> Filters & Sort
                                        </h3>
                                        <button onClick={() => setShowMobileFilters(false)} className="p-1.5 bg-gray-100 text-gray-500 hover:bg-gray-200 rounded-full">
                                            <X size={20} />
                                        </button>
                                    </div>
                                    
                                    {/* Group & Verification Status in 2 columns */}
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

                                    {/* Sort controls for mobile */}
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
                                                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white text-gray-800 font-bold shadow-sm"
                                            >
                                                {sortConfig.direction === 'ascending' ? 'Ascending ↑' : 'Descending ↓'}
                                            </button>
                                        </div>
                                    </div>

                                    {/* Toggles */}
                                    <div className="flex flex-col gap-3 py-3 border-y border-gray-100 my-1">
                                        <label className="flex items-center justify-between text-sm text-gray-800 font-semibold cursor-pointer">
                                            <span>Include Ignored Accounts</span>
                                            <input 
                                                type="checkbox" 
                                                checked={showIgnored}
                                                onChange={(e) => setShowIgnored(e.target.checked)}
                                                className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 bg-gray-50"
                                            />
                                        </label>
                                        <label className="flex items-center justify-between text-sm text-gray-800 font-semibold cursor-pointer">
                                            <span>Skip 0 Balances</span>
                                            <input 
                                                type="checkbox" 
                                                checked={skipZeroClosingBalance}
                                                onChange={(e) => setSkipZeroClosingBalance(e.target.checked)}
                                                className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 bg-gray-50"
                                            />
                                        </label>
                                    </div>

                                    {/* Action buttons */}
                                    <div className="flex flex-col gap-2 mt-2">
                                        <button 
                                            onClick={() => { handleVerifyAll(); setShowMobileFilters(false); }}
                                            disabled={verifying || paginatedAccounts.length === 0}
                                            className="w-full bg-green-600 hover:bg-green-700 text-white py-3.5 rounded-xl text-sm font-bold shadow-sm disabled:opacity-50 transition"
                                        >
                                            {verifying ? 'Processing...' : 'Verify Visible Page'}
                                        </button>
                                        
                                        <div className="flex gap-2">
                                            {(searchTerm || selectedGroup || minBalance || maxBalance || verificationStatus !== 'all' || skipZeroClosingBalance || showIgnored) && (
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
                                                    className="flex-1 py-3 bg-red-50 text-red-600 rounded-xl text-sm font-bold"
                                                >
                                                    Reset Filters
                                                </button>
                                            )}
                                            <button
                                                onClick={() => setShowMobileFilters(false)}
                                                className="flex-[2] py-3 bg-gray-900 text-white rounded-xl text-sm font-bold shadow-md"
                                            >
                                                Apply & Close
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </div>
                
                <div className="overflow-auto flex-1 relative">
                    {loadingAccounts ? (
                        <div className="flex justify-center items-center h-full text-gray-500">Loading accounts...</div>
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

                <div className="flex flex-col sm:flex-row justify-between items-center gap-4 sm:gap-2 px-4 py-4 sm:py-2 bg-white sm:bg-gray-50 border-t border-gray-200 shrink-0">
                    <span className="text-xs sm:text-sm text-gray-500 sm:text-gray-700 font-bold sm:font-medium w-full sm:w-auto text-center sm:text-left">
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
                            className="flex-1 sm:flex-none py-3 sm:py-1.5 px-4 sm:px-3 bg-gray-100 sm:bg-white text-gray-700 font-bold sm:font-medium rounded-xl sm:rounded border border-gray-200 sm:border-gray-300 disabled:opacity-40 transition"
                        >
                            ← Prev
                        </button>
                        <span className="text-sm font-bold text-gray-800 px-2 sm:px-2 whitespace-nowrap">
                            <span className="sm:hidden">Pg </span>{currentPage} <span className="text-gray-400">/ {totalPages}</span>
                        </span>
                        <button 
                            disabled={!hasNextPage || loadingAccounts}
                            onClick={() => setCurrentPage(p => p + 1)}
                            className="flex-1 sm:flex-none py-3 sm:py-1.5 px-4 sm:px-3 bg-blue-100 sm:bg-white text-blue-700 sm:text-gray-700 font-bold sm:font-medium rounded-xl sm:rounded border border-blue-200 sm:border-gray-300 disabled:opacity-40 transition"
                        >
                            Next →
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
