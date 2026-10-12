import React, { useState, useEffect, useMemo, useRef } from 'react';
import { db } from '../firebase';
import { doc, getDoc, getDocs, collection, query, where, limit, startAfter, or, deleteDoc } from 'firebase/firestore';
import { fetchFiscalYears, getCurrentFYObject } from '../utils/fiscalYear';
import TransactionTable from './TransactionTable';
import EditTransactionModal from './EditTransactionModal';
import { deleteTransactionRecord } from '../utils/transactionOperations';
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from 'xlsx';
import { X, FileText, Download, ChevronUp, ChevronDown, Calculator, Calendar, CheckSquare, Square, Percent, AlertCircle } from 'lucide-react';
import { calculateAccountInterestStatement } from '../utils/interestCalculation';

const formatCurrency = (num) => {
    const formatted = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(num) || 0);
    return `Rs. ${num < 0 ? '-' : ''}${formatted}`;
};

export default function AccountStatementModal({ isOpen, onClose, accountName, account = null, initialMode = 'statement', initialFY = '', currentUser }) {
    const [fyOptions, setFyOptions] = useState([]);
    const [selectedFYs, setSelectedFYs] = useState(() => {
        if (initialFY && initialFY !== 'ALL') return [initialFY];
        return [];
    });
    const [fyDropdownOpen, setFyDropdownOpen] = useState(false);
    const fyDropdownRef = useRef(null);

    const [accountData, setAccountData] = useState(account || null);
    const [fyData, setFyData] = useState(null);
    const [latestFyData, setLatestFyData] = useState(null);
    const [rawTransactions, setRawTransactions] = useState([]);
    const [loadingTxns, setLoadingTxns] = useState(false);
    const [lastVisibleTxn, setLastVisibleTxn] = useState(null);
    const [hasMoreTxns, setHasMoreTxns] = useState(false);
    const [showFullDetails, setShowFullDetails] = useState(false);
    const [isSummaryCollapsed, setIsSummaryCollapsed] = useState(false);
    const [editingTxn, setEditingTxn] = useState(null);

    // --- Interest Calculation State ---
    const [viewMode, setViewMode] = useState(initialMode || 'statement');
    const [interestStartDate, setInterestStartDate] = useState('');
    const [interestEndDate, setInterestEndDate] = useState(new Date().toISOString().slice(0, 10));
    const [interestRate, setInterestRate] = useState(36);
    const [rateType, setRateType] = useState('yearly'); // 'yearly' | 'monthly'
    const [daysBasis, setDaysBasis] = useState(365); // 365 | 360
    const [includeOpeningBalance, setIncludeOpeningBalance] = useState(true);
    const [selectedTxnIds, setSelectedTxnIds] = useState(new Set());

    // Click-outside listener for FY Dropdown
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (fyDropdownRef.current && !fyDropdownRef.current.contains(event.target)) {
                setFyDropdownOpen(false);
            }
        };
        if (fyDropdownOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [fyDropdownOpen]);

    // Sync viewMode when modal opens with initialMode
    useEffect(() => {
        if (isOpen) {
            if (initialMode) setViewMode(initialMode);
            if (account) setAccountData(account);
            if (initialFY) {
                if (initialFY === 'ALL' && fyOptions.length > 0) {
                    setSelectedFYs(fyOptions.map(f => f.id));
                } else if (initialFY !== 'ALL') {
                    setSelectedFYs([initialFY]);
                }
            }
        }
    }, [isOpen, initialMode, account, initialFY, fyOptions]);

    // 1. Fetch Fiscal Years on mount or open
    useEffect(() => {
        if (!isOpen) return;
        const loadFYs = async () => {
            const fys = await fetchFiscalYears();
            setFyOptions(fys);
            if (initialFY) {
                if (initialFY === 'ALL') {
                    setSelectedFYs(fys.map(f => f.id));
                } else {
                    setSelectedFYs([initialFY]);
                }
            } else if (selectedFYs.length === 0) {
                const current = getCurrentFYObject(fys);
                if (current) {
                    setSelectedFYs([current.id]);
                } else if (fys.length > 0) {
                    setSelectedFYs([fys[0].id]);
                }
            }
        };
        loadFYs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, initialFY]);

    // Multi-FY helper actions
    const toggleFY = (fyId) => {
        setSelectedFYs(prev => {
            if (prev.includes(fyId)) {
                return prev.filter(id => id !== fyId);
            } else {
                return [...prev, fyId];
            }
        });
    };

    const selectAllFYs = () => {
        setSelectedFYs(fyOptions.map(f => f.id));
    };

    const clearAllFYs = () => {
        const current = getCurrentFYObject(fyOptions);
        if (current) {
            setSelectedFYs([current.id]);
        } else if (fyOptions.length > 0) {
            setSelectedFYs([fyOptions[0].id]);
        }
    };

    // Determine the earliest selected fiscal year (for opening balance)
    const earliestSelectedFY = useMemo(() => {
        if (!fyOptions || fyOptions.length === 0 || selectedFYs.length === 0) return null;
        const active = fyOptions.filter(f => selectedFYs.includes(f.id));
        if (active.length === 0) return null;
        return [...active].sort((a, b) => (a.startDate || '').localeCompare(b.startDate || ''))[0];
    }, [fyOptions, selectedFYs]);

    // Determine the latest selected fiscal year (for closing balance label)
    const latestSelectedFY = useMemo(() => {
        if (!fyOptions || fyOptions.length === 0 || selectedFYs.length === 0) return null;
        const active = fyOptions.filter(f => selectedFYs.includes(f.id));
        if (active.length === 0) return null;
        return [...active].sort((a, b) => (b.startDate || '').localeCompare(a.startDate || ''))[0];
    }, [fyOptions, selectedFYs]);

    // 2. Fetch Account document when accountName or account changes
    useEffect(() => {
        const effectiveName = accountName || account?.name;
        if (!isOpen || !effectiveName) return;

        const fetchAccountAndDocIds = async () => {
            try {
                let foundAcc = account || null;
                const lowerName = effectiveName.trim().toLowerCase();
                const matchedDocIds = account?.allDocIds && account.allDocIds.length > 0 
                    ? [...account.allDocIds] 
                    : (account?.id ? [account.id] : []);

                if (!foundAcc) {
                    const snap = await getDocs(collection(db, 'accounts'));
                    snap.forEach(d => {
                        const dName = (d.data().name || '').trim().toLowerCase();
                        if (dName === lowerName) {
                            matchedDocIds.push(d.id);
                            if (!foundAcc) {
                                foundAcc = { id: d.id, ...d.data() };
                            }
                        }
                    });
                }

                if (foundAcc) {
                    foundAcc.allDocIds = matchedDocIds;
                    setAccountData(foundAcc);
                } else {
                    setAccountData({ name: accountName, group: 'N/A' });
                }
            } catch (err) {
                console.error("Error fetching account info:", err);
            }
        };

        fetchAccountAndDocIds();
    }, [isOpen, accountName, account]);

    // Fetch FY opening balance from earliest selected FY and closing from latest
    // Fetch FY opening balance from earliest selected FY and closing from latest
    const fetchFYBalances = async () => {
        if (!accountData || !earliestSelectedFY) {
            setFyData(null);
            setLatestFyData(null);
            return;
        }

        try {
            const ids = accountData.allDocIds && accountData.allDocIds.length > 0 
                ? accountData.allDocIds 
                : (accountData.id ? [accountData.id] : []);

            // Fetch earliest FY data (for opening balance)
            let foundEarliestData = null;
            for (const docId of ids) {
                const fySnap = await getDoc(doc(db, 'accounts', docId, 'fiscalYears', earliestSelectedFY.id));
                if (fySnap.exists()) {
                    foundEarliestData = fySnap.data();
                    break;
                }
            }
            setFyData(foundEarliestData);

            // Fetch latest FY data (for closing balance display) - only if different from earliest
            if (latestSelectedFY && latestSelectedFY.id !== earliestSelectedFY.id) {
                let foundLatestData = null;
                for (const docId of ids) {
                    const fySnap = await getDoc(doc(db, 'accounts', docId, 'fiscalYears', latestSelectedFY.id));
                    if (fySnap.exists()) {
                        foundLatestData = fySnap.data();
                        break;
                    }
                }
                setLatestFyData(foundLatestData);
            } else {
                setLatestFyData(foundEarliestData);
            }
        } catch (err) {
            console.error("Error fetching FY balances:", err);
            setFyData(null);
            setLatestFyData(null);
        }
    };

    useEffect(() => {
        fetchFYBalances();
    }, [accountData, earliestSelectedFY, latestSelectedFY]);

    // 3. Fetch all raw transactions for this account from Firestore
    const fetchTransactions = async () => {
        const effectiveName = accountName || accountData?.name;
        if (!effectiveName) return;
        setLoadingTxns(true);
        try {
            const idsToSearch = (accountData?.allDocIds || (accountData?.id ? [accountData.id] : [])).slice(0, 10);
            
            let q;
            if (idsToSearch.length > 0) {
                q = query(
                    collection(db, 'transactions'),
                    where('involvedAccountIds', 'array-contains-any', idsToSearch)
                );
            } else {
                q = query(collection(db, 'transactions'), limit(0));
            }

            const snap = await getDocs(q);
            const txns = [];
            snap.forEach(d => txns.push({ id: d.id, ...d.data() }));

            setRawTransactions(txns);
            setHasMoreTxns(false);
        } catch (err) {
            console.error("Error fetching transactions for statement:", err);
        } finally {
            setLoadingTxns(false);
        }
    };

    useEffect(() => {
        if (isOpen && (accountName || accountData)) {
            fetchTransactions();
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, accountName, accountData?.id]);

    // 4. Filter transactions in memory by all selected fiscal years
    const transactions = useMemo(() => {
        if (!rawTransactions || rawTransactions.length === 0) return [];
        if (selectedFYs.length === 0) return [];

        // If all fiscal years in options are selected, return all raw transactions
        if (selectedFYs.length === fyOptions.length) {
            return [...rawTransactions].sort((a, b) => new Date(a.date) - new Date(b.date));
        }

        const activeFYObjs = fyOptions.filter(f => selectedFYs.includes(f.id));
        return rawTransactions.filter(t => {
            return activeFYObjs.some(fy => {
                const start = fy.startDate || '1900-01-01';
                const end = fy.endDate || '2100-12-31';
                return (t.fyId && t.fyId === fy.id) || (t.date >= start && t.date <= end);
            });
        }).sort((a, b) => new Date(a.date) - new Date(b.date));
    }, [rawTransactions, selectedFYs, fyOptions]);

    // Calculate accurate running balance and account-specific debit/credit amounts based on opening balance
    const processedTransactions = useMemo(() => {
        if (!transactions || transactions.length === 0) return [];

        const ob = parseFloat(fyData?.openingBalance || 0);
        const obType = fyData?.openingBalanceType || '';
        let runningVal = obType === 'Cr' ? -ob : ob;

        const accNameLower = (accountName || '').trim().toLowerCase();
        const sorted = [...transactions].sort((a, b) => new Date(a.date) - new Date(b.date));

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
    }, [transactions, fyData, accountName]);

    // Opening Balance row for Statement table display
    const openingBalanceRow = useMemo(() => {
        const ob = parseFloat(fyData?.openingBalance || 0);
        if (ob <= 0) return null;
        const obType = fyData?.openingBalanceType || 'Dr';
        const obSigned = obType === 'Cr' ? -ob : ob;
        return {
            id: 'ob_row',
            isOpeningRow: true,
            date: earliestSelectedFY?.startDate || '',
            type: 'Opening Balance',
            voucherNo: '-',
            debitAccount: '',
            creditAccount: '',
            accountDebitAmt: obType !== 'Cr' ? ob : 0,
            accountCreditAmt: obType === 'Cr' ? ob : 0,
            runningBalance: Math.abs(obSigned),
            runningBalanceType: obSigned < 0 ? 'Cr' : (obSigned > 0 ? 'Dr' : ''),
            particulars: `Opening Balance${earliestSelectedFY?.name ? ` (${earliestSelectedFY.name})` : ''}`,
            narration: '',
            enteredBy: '-',
        };
    }, [fyData, earliestSelectedFY]);

    // Combined display list with OB row prepended (used for Statement table only, NOT interest calc)
    const displayTransactions = useMemo(() => {
        if (!openingBalanceRow) return processedTransactions;
        return [openingBalanceRow, ...processedTransactions];
    }, [openingBalanceRow, processedTransactions]);

    // Live computed totals and closing balance for Statement View
    const computedTotals = useMemo(() => {
        if (processedTransactions.length > 0) {
            let deb = 0;
            let cred = 0;
            processedTransactions.forEach(t => {
                deb += t.accountDebitAmt || 0;
                cred += t.accountCreditAmt || 0;
            });
            return { totalDebit: deb, totalCredit: cred };
        }
        return {
            totalDebit: parseFloat(fyData?.totalDebit || 0),
            totalCredit: parseFloat(fyData?.totalCredit || 0)
        };
    }, [processedTransactions, fyData]);

    const computedClosingBalance = useMemo(() => {
        if (processedTransactions.length > 0) {
            const lastTxn = processedTransactions[processedTransactions.length - 1];
            return {
                amount: lastTxn.runningBalance,
                type: lastTxn.runningBalanceType
            };
        }
        // Use latest FY data for closing balance fallback (for multi-FY accuracy)
        const latestData = latestFyData || fyData;
        const cb = parseFloat(latestData?.closingBalance || 0);
        if (cb > 0) {
            return {
                amount: cb,
                type: latestData?.closingBalanceType || 'Dr'
            };
        }
        const ob = parseFloat(fyData?.openingBalance || 0);
        return {
            amount: ob,
            type: fyData?.openingBalanceType || (ob > 0 ? 'Dr' : '')
        };
    }, [processedTransactions, fyData, latestFyData]);

    // Initialize selectedTxnIds and interestStartDate when processedTransactions change
    useEffect(() => {
        if (processedTransactions.length > 0) {
            setSelectedTxnIds(new Set(processedTransactions.map(t => t.id)));
            if (!interestStartDate) {
                if (earliestSelectedFY?.startDate) {
                    setInterestStartDate(earliestSelectedFY.startDate);
                } else {
                    setInterestStartDate(processedTransactions[0].date);
                }
            }
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [processedTransactions]);

    const handleDelete = async (t) => {
        const ok = await deleteTransactionRecord(t);
        if (ok) {
            fetchTransactions();
            await fetchFYBalances();
        }
    };

    const handleTransactionSaved = async () => {
        fetchTransactions();
        await fetchFYBalances();
    };

    // Label helpers for multi-FY dropdown
    const fyButtonLabel = useMemo(() => {
        if (fyOptions.length === 0) return 'No FY';
        if (selectedFYs.length === 0) return 'Select FY';
        if (selectedFYs.length === fyOptions.length) return `All Fiscal Years (${fyOptions.length})`;
        if (selectedFYs.length === 1) {
            const fy = fyOptions.find(f => f.id === selectedFYs[0]);
            return fy?.name || selectedFYs[0];
        }
        return `${selectedFYs.length} FYs Selected`;
    }, [fyOptions, selectedFYs]);

    const selectedFYNames = useMemo(() => {
        if (selectedFYs.length === 0 || selectedFYs.length === fyOptions.length) {
            return 'All Fiscal Years';
        }
        return fyOptions.filter(f => selectedFYs.includes(f.id)).map(f => f.name).join(', ');
    }, [fyOptions, selectedFYs]);

    // --- Interest Calculation Engine Memo ---
    const interestResult = useMemo(() => {
        if (viewMode !== 'interest') {
            return { rows: [], summary: { initialPrincipal: 0, totalInterest: 0, totalPaid: 0, finalBalance: 0, finalBalanceType: '', totalDays: 0 } };
        }
        return calculateAccountInterestStatement({
            transactions: processedTransactions,
            selectedTxnIds,
            startDate: interestStartDate,
            endDate: interestEndDate,
            rate: interestRate,
            rateType,
            daysBasis,
            includeOpeningBalance,
            openingBalance: parseFloat(fyData?.openingBalance || 0),
            openingBalanceType: fyData?.openingBalanceType || 'Dr',
            accountName
        });
    }, [
        viewMode,
        processedTransactions,
        selectedTxnIds,
        interestStartDate,
        interestEndDate,
        interestRate,
        rateType,
        daysBasis,
        includeOpeningBalance,
        fyData,
        accountName
    ]);

    // Transaction selection toggles
    const toggleSelectTxn = (id) => {
        setSelectedTxnIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const selectAllTxns = () => {
        setSelectedTxnIds(new Set(processedTransactions.map(t => t.id)));
    };

    const deselectAllTxns = () => {
        setSelectedTxnIds(new Set());
    };

    // --- PDF Export ---
    const exportToPDF = () => {
        if (!accountName) return;
        const docPDF = new jsPDF();
        const fyName = selectedFYNames;

        if (viewMode === 'interest') {
            // Interest Calculation PDF
            docPDF.setFontSize(14);
            docPDF.text(`Interest Calculation Statement - ${accountName}`, 14, 15);
            
            docPDF.setFontSize(10);
            docPDF.text(`Account Group: ${accountData?.group || 'N/A'}`, 14, 22);
            docPDF.text(`Fiscal Years: ${selectedFYNames}`, 14, 28);
            docPDF.text(`Period: ${interestResult.rows[0]?.date || interestStartDate} to ${interestEndDate} (${interestResult.summary.totalDays} Days)`, 14, 34);
            docPDF.text(`Interest Rate: ${interestRate}% ${rateType === 'monthly' ? 'p.m.' : 'p.a.'} (Basis: ${daysBasis} Days)`, 14, 40);

            docPDF.text(`Principal Dr: ${formatCurrency(interestResult.summary.initialPrincipal)}`, 130, 22);
            docPDF.text(`Total Interest Dr: ${formatCurrency(interestResult.summary.totalInterest)}`, 130, 28);
            docPDF.text(`Net Balance Due: ${formatCurrency(interestResult.summary.finalBalance)} ${interestResult.summary.finalBalanceType}`, 130, 34);

            const tableColumn = ["Date", "Due Day", "Per Day Int", "Particulars", "Debit", "Credit", "Balance"];
            const tableRows = interestResult.rows.map(r => [
                r.date,
                r.dueDays ? `${r.dueDays} Days` : '',
                r.perDayInterest ? r.perDayInterest.toFixed(2) : '',
                r.particulars,
                r.debitAmount ? formatCurrency(r.debitAmount) : '',
                r.creditAmount ? formatCurrency(r.creditAmount) : '',
                `${formatCurrency(r.balance)} ${r.balanceType}`
            ]);

            autoTable(docPDF, {
                head: [tableColumn],
                body: tableRows,
                startY: 46,
                styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak' },
                headStyles: { fillColor: [79, 70, 229] },
                margin: { left: 14, right: 14 }
            });

            docPDF.save(`${accountName}_Interest_Statement_${interestEndDate}.pdf`);
            return;
        }

        // Standard Statement PDF
        const displayBalance = fyData || { openingBalance: 0, openingBalanceType: '', closingBalance: 0, closingBalanceType: '' };
        docPDF.setFontSize(14);
        docPDF.text(`Ledger Account Statement (${fyName})`, 14, 15);
        
        docPDF.setFontSize(10);
        docPDF.text(`Account Name: ${accountName}`, 14, 22);
        docPDF.text(`Account Group: ${accountData?.group || 'N/A'}`, 14, 28);
        docPDF.text(`Opening Balance: ${displayBalance.openingBalance || 0} ${displayBalance.openingBalanceType || ''}`, 130, 22);
        docPDF.text(`Closing Balance: ${displayBalance.closingBalance || 0} ${displayBalance.closingBalanceType || ''}`, 130, 28);
        
        const tableColumn = ["Date", "Particulars", "Vch Type", "Vch No", "Debit", "Credit", "Balance"];
        const tableRows = [];

        processedTransactions.forEach(t => {
            const isDebit = t.accountDebitAmt > 0 || (t.accountCreditAmt === 0 && (
                (t.debitAccount && t.debitAccount.toLowerCase() === accountName.toLowerCase()) ||
                (t.allDebitAccounts && t.allDebitAccounts.some(n => n.toLowerCase() === accountName.toLowerCase()))
            ));
            let particulars = isDebit ? `To ${t.creditAccount || '-'}` : `By ${t.debitAccount || '-'}`;
            
            if (showFullDetails && t.narration) {
                particulars += `\n[Narration: ${t.narration}]`;
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

        autoTable(docPDF, {
            head: [tableColumn],
            body: tableRows,
            startY: 35,
            styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak' },
            margin: { left: 14, right: 14 }
        });

        const safeFYFile = selectedFYs.length === 0 || selectedFYs.length === fyOptions.length ? 'All_FY' : selectedFYs.join('_');
        docPDF.save(`${accountName}_Statement_${safeFYFile}.pdf`);
    };

    // --- Excel Export ---
    const exportToExcel = () => {
        if (!accountName) return;
        const fyName = selectedFYs.length === 0 || selectedFYs.length === fyOptions.length 
            ? 'All_FY' 
            : fyOptions.filter(f => selectedFYs.includes(f.id)).map(f => f.name.replace(/[^a-zA-Z0-9]/g, '_')).join('_');

        if (viewMode === 'interest') {
            const formattedData = interestResult.rows.map(r => ({
                Date: r.date,
                DueDays: r.dueDays ? `${r.dueDays} DAYS` : '',
                PerDayInterest: r.perDayInterest ? parseFloat(r.perDayInterest.toFixed(2)) : null,
                Particulars: r.particulars,
                DebitAmount: r.debitAmount || null,
                CreditAmount: r.creditAmount || null,
                Balance: parseFloat(r.balance || 0),
                BalanceType: r.balanceType || ''
            }));

            const worksheet = XLSX.utils.json_to_sheet(formattedData);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Interest_Calculation");
            XLSX.writeFile(workbook, `${accountName}_Interest_Calculation_${interestEndDate}.xlsx`);
            return;
        }

        const formattedData = processedTransactions.map(t => {
            const isDebit = t.accountDebitAmt > 0 || (t.accountCreditAmt === 0 && (
                (t.debitAccount && t.debitAccount.toLowerCase() === accountName.toLowerCase()) ||
                (t.allDebitAccounts && t.allDebitAccounts.some(n => n.toLowerCase() === accountName.toLowerCase()))
            ));
            let particulars = isDebit ? `To ${t.creditAccount || '-'}` : `By ${t.debitAccount || '-'}`;
            
            return {
                Date: t.date,
                Particulars: particulars,
                VoucherType: t.type,
                VoucherNo: t.voucherNo,
                DebitAmount: t.accountDebitAmt || null,
                CreditAmount: t.accountCreditAmt || null,
                Balance: parseFloat(t.runningBalance || 0),
                BalanceType: t.runningBalanceType || '',
                Narration: t.narration || ''
            };
        });

        const worksheet = XLSX.utils.json_to_sheet(formattedData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Statement");
        XLSX.writeFile(workbook, `${accountName}_Statement_${fyName}.xlsx`);
    };

    const handleDeleteAccount = async () => {
        if (!window.confirm(`WARNING: Are you sure you want to completely delete the account "${accountName}" AND all of its transactions?\n\nThis action is irreversible!`)) {
            return;
        }

        setLoadingTxns(true);
        try {
            // Fetch all transactions involving this account across ALL FYs to delete them
            const idsToSearch = accountData?.allDocIds || [];
            let allTxns = [];
            
            if (idsToSearch.length > 0) {
                const q = query(
                    collection(db, 'transactions'),
                    where('involvedAccountIds', 'array-contains-any', idsToSearch)
                );
                const snap = await getDocs(q);
                snap.forEach(d => allTxns.push({ id: d.id, ...d.data() }));
            } else {
                const lowerName = accountName.trim().toLowerCase();
                const q = query(
                    collection(db, 'transactions'),
                    where('involvedAccountsLower', 'array-contains', lowerName)
                );
                const snap = await getDocs(q);
                snap.forEach(d => allTxns.push({ id: d.id, ...d.data() }));
            }

            // Delete transactions and recalculate balances for OTHER involved accounts
            for (const t of allTxns) {
                await deleteTransactionRecord(t, true);
            }

            // Delete the account document(s)
            if (idsToSearch.length > 0) {
                for (const docId of idsToSearch) {
                    await deleteDoc(doc(db, 'accounts', docId));
                }
            }

            alert("Account and all associated transactions successfully deleted.");
            onClose();
            // Need to trigger a global refresh? Usually closing modal and letting the parent fetch is enough.
        } catch (error) {
            console.error("Error deleting account:", error);
            alert("Failed to delete account: " + error.message);
        } finally {
            setLoadingTxns(false);
        }
    };

    if (!isOpen) return null;

    const displayBalance = fyData || {
        openingBalance: 0,
        openingBalanceType: '',
        totalDebit: 0,
        totalCredit: 0,
        closingBalance: 0,
        closingBalanceType: ''
    };

    return (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 sm:p-6">
            <div className="bg-white rounded-2xl shadow-2xl max-w-6xl w-full h-[90vh] flex flex-col overflow-hidden ring-1 ring-black/5">
                {/* Header Top Bar */}
                <div className="p-4 sm:px-6 sm:py-4 border-b border-slate-100 flex flex-col gap-3 sm:gap-4 shrink-0 bg-white z-20">
                    {/* Row 1: Back, View Mode Switcher, FY, and Actions */}
                    <div className="flex flex-wrap justify-between items-center w-full gap-2 sm:gap-4">
                        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                            <button
                                onClick={onClose}
                                className="flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors shrink-0 cursor-pointer"
                                title="Close"
                            >
                                <X className="w-4 h-4 sm:w-5 sm:h-5" strokeWidth={2.5} />
                            </button>

                            {/* Mode Switcher Tabs */}
                            <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200/80 shrink-0">
                                <button
                                    type="button"
                                    onClick={() => setViewMode('statement')}
                                    className={`px-3 py-1.5 rounded-md text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                                        viewMode === 'statement'
                                            ? 'bg-white text-indigo-700 shadow-xs'
                                            : 'text-slate-600 hover:text-slate-900'
                                    }`}
                                >
                                    Statement
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setViewMode('interest')}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                                        viewMode === 'interest'
                                            ? 'bg-indigo-600 text-white shadow-xs'
                                            : 'text-slate-600 hover:text-slate-900'
                                    }`}
                                >
                                    <Calculator className="w-3.5 h-3.5" />
                                    <span>Interest Calc</span>
                                </button>
                            </div>

                            {/* Multi-FY Selector Dropdown */}
                            <div className="relative" ref={fyDropdownRef}>
                                <button
                                    type="button"
                                    onClick={() => setFyDropdownOpen(prev => !prev)}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-xs sm:text-sm font-bold tracking-wide shadow-2xs transition-colors cursor-pointer border border-indigo-200/60"
                                    title="Select Fiscal Years"
                                >
                                    <Calendar className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                                    <span className="truncate max-w-[150px] sm:max-w-[200px]">{fyButtonLabel}</span>
                                    <ChevronDown className={`w-3.5 h-3.5 text-indigo-600 transition-transform shrink-0 ${fyDropdownOpen ? 'rotate-180' : ''}`} />
                                </button>

                                {fyDropdownOpen && (
                                    <div className="absolute left-0 mt-1.5 w-72 bg-white rounded-xl shadow-2xl border border-slate-200 p-2.5 z-50 animate-in fade-in zoom-in-95 duration-100">
                                        <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100 px-1">
                                            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                                                Select Fiscal Years
                                            </span>
                                            <div className="flex items-center gap-2">
                                                <button
                                                    type="button"
                                                    onClick={selectAllFYs}
                                                    className="text-xs font-bold text-indigo-600 hover:text-indigo-800 transition cursor-pointer"
                                                >
                                                    Select All
                                                </button>
                                                <span className="text-slate-300">|</span>
                                                <button
                                                    type="button"
                                                    onClick={clearAllFYs}
                                                    className="text-xs font-bold text-slate-500 hover:text-slate-700 transition cursor-pointer"
                                                >
                                                    Reset
                                                </button>
                                            </div>
                                        </div>

                                        <div className="max-h-60 overflow-y-auto space-y-1 pr-1">
                                            {fyOptions.map(fy => {
                                                const isChecked = selectedFYs.includes(fy.id);
                                                return (
                                                    <label
                                                        key={fy.id}
                                                        className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer transition-colors ${
                                                            isChecked ? 'bg-indigo-50 text-indigo-950 font-semibold' : 'hover:bg-slate-50 text-slate-700'
                                                        }`}
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            checked={isChecked}
                                                            onChange={() => toggleFY(fy.id)}
                                                            className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer shrink-0"
                                                        />
                                                        <div className="flex flex-col min-w-0 flex-1">
                                                            <span className="text-xs truncate">{fy.name}</span>
                                                            <span className="text-[10px] text-slate-400 font-normal">
                                                                {fy.startDate} to {fy.endDate}
                                                            </span>
                                                        </div>
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="flex items-center gap-2 sm:gap-3">
                            {viewMode === 'statement' && (
                                <label className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm font-semibold text-slate-600 cursor-pointer hover:text-slate-900 transition-colors">
                                    <input
                                        type="checkbox"
                                        checked={showFullDetails}
                                        onChange={(e) => setShowFullDetails(e.target.checked)}
                                        className="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 transition-all cursor-pointer"
                                    />
                                    <span>Full</span>
                                </label>
                            )}
                            <button
                                onClick={exportToPDF}
                                className="flex items-center justify-center w-8 h-8 sm:w-auto sm:px-3 sm:py-1.5 gap-1.5 bg-rose-100 hover:bg-rose-200 text-rose-700 rounded-lg text-sm font-bold transition-colors shrink-0 cursor-pointer"
                                title="Export PDF"
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                <span className="hidden sm:inline">PDF</span>
                            </button>
                            <button
                                onClick={exportToExcel}
                                className="flex items-center justify-center w-8 h-8 sm:w-auto sm:px-3 sm:py-1.5 gap-1.5 bg-emerald-100 hover:bg-emerald-200 text-emerald-700 rounded-lg text-sm font-bold transition-colors shrink-0 cursor-pointer"
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
                        onClick={() => setIsSummaryCollapsed(!isSummaryCollapsed)}
                    >
                        <div className="flex items-center gap-2 truncate flex-1 pr-4">
                            <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight truncate" title={accountName}>
                                {accountName}
                            </h2>
                            {viewMode === 'interest' && (
                                <span className="bg-indigo-100 text-indigo-800 text-xs px-2.5 py-0.5 rounded-full font-bold shrink-0">
                                    Interest Calculation
                                </span>
                            )}
                        </div>
                        <button 
                            className="flex items-center justify-center w-8 h-8 rounded-full text-slate-400 group-hover:text-indigo-600 transition-all shrink-0 cursor-pointer"
                        >
                            {!isSummaryCollapsed ? (
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" /></svg>
                            ) : (
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                            )}
                        </button>
                    </div>
                </div>

                {/* Summary Bento Grid */}
                {!isSummaryCollapsed && (
                    viewMode === 'statement' ? (
                        /* Statement Bento Grid */
                        <div className="p-4 sm:p-5 border-b border-slate-100 bg-slate-50/50 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 shrink-0 transition-all duration-300 ease-in-out">
                            {/* Info Card (Span 2) */}
                            <div className="lg:col-span-2 bg-white border border-slate-200/60 rounded-xl p-4 flex flex-col justify-center shadow-xs">
                                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                                    <div className="w-1.5 h-1.5 rounded-full bg-slate-300"></div> Account Details
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                                    <div className="flex flex-col">
                                        <span className="text-slate-500 font-medium text-[11px] uppercase tracking-wider mb-0.5">Group</span>
                                        <span className="text-slate-900 font-semibold truncate" title={accountData?.group}>{accountData?.group || '-'}</span>
                                    </div>
                                    <div className="flex flex-col sm:col-span-2">
                                        <span className="text-slate-500 font-medium text-[11px] uppercase tracking-wider mb-0.5">Address & Contact</span>
                                        <span className="text-slate-900 font-semibold truncate" title={accountData?.address ? `${accountData.address} ${accountData.contact ? `| ${accountData.contact}` : ''}` : '-'}>
                                            {accountData?.address || '-'} {accountData?.contact ? <span className="text-slate-400 font-normal mx-1">|</span> : ''} {accountData?.contact || ''}
                                        </span>
                                    </div>
                                </div>
                            </div>
                            {/* Debit & Credit Flow (Span 1) */}
                            <div className="bg-white border border-slate-200/60 rounded-xl p-4 flex flex-col justify-center shadow-xs">
                                <div className="flex justify-between items-end mb-2.5">
                                    <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                                        <div className="w-1.5 h-1.5 rounded-full bg-rose-400"></div> Total Debit
                                    </div>
                                    <div className="text-sm font-bold text-rose-600">{formatCurrency(computedTotals.totalDebit)}</div>
                                </div>
                                <div className="w-full h-px bg-slate-100 mb-2.5"></div>
                                <div className="flex justify-between items-end">
                                    <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-400"></div> Total Credit
                                    </div>
                                    <div className="text-sm font-bold text-emerald-600">{formatCurrency(computedTotals.totalCredit)}</div>
                                </div>
                            </div>
                            {/* Combined Balances (Span 1) */}
                            <div className="bg-gradient-to-br from-indigo-50 to-indigo-100/50 border border-indigo-200/60 rounded-xl p-4 flex flex-col justify-between shadow-xs relative overflow-hidden h-full">
                                <div className="relative z-10 flex justify-between items-end mb-2">
                                    <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                                        Opening{earliestSelectedFY?.name ? ` (${earliestSelectedFY.name})` : ''}
                                    </div>
                                    <div className="text-sm font-semibold text-slate-600">
                                        {formatCurrency(displayBalance.openingBalance)} <span className="text-xs font-normal ml-0.5">{displayBalance.openingBalanceType}</span>
                                    </div>
                                </div>
                                <div className="w-full h-px bg-indigo-200/50 mb-2 relative z-10"></div>
                                <div className="relative z-10 flex flex-col items-start mt-auto">
                                    <div className="text-[11px] font-bold text-indigo-600 uppercase tracking-wider mb-0.5 flex items-center gap-1.5">
                                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.8)]"></div> Closing{latestSelectedFY?.name ? ` (${latestSelectedFY.name})` : ''}
                                    </div>
                                    <div className="text-xl font-black text-indigo-950 tracking-tight leading-none mt-1">
                                        {formatCurrency(computedClosingBalance.amount)} <span className="text-sm font-bold text-indigo-600 ml-0.5">{computedClosingBalance.type}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        /* Interest Calculation Bento Grid */
                        <div className="p-4 sm:p-5 border-b border-slate-100 bg-slate-50/50 grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 shrink-0 transition-all duration-300 ease-in-out">
                            {/* Card 1: Principal & Payments */}
                            <div className="bg-white border border-slate-200/60 rounded-xl p-3 sm:p-4 shadow-xs">
                                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Principal Flow</div>
                                <div className="flex justify-between items-center text-xs sm:text-sm mb-1.5">
                                    <span className="text-slate-500">Debits (Principal):</span>
                                    <span className="font-bold text-slate-800">{formatCurrency(interestResult.summary.initialPrincipal)}</span>
                                </div>
                                <div className="flex justify-between items-center text-xs sm:text-sm">
                                    <span className="text-slate-500">Credits (Payments):</span>
                                    <span className="font-bold text-emerald-600">{formatCurrency(interestResult.summary.totalPaid)}</span>
                                </div>
                            </div>

                            {/* Card 2: Total Interest */}
                            <div className="bg-rose-50/70 border border-rose-200/80 rounded-xl p-3 sm:p-4 shadow-xs">
                                <div className="text-[11px] font-bold text-rose-700 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                                    <Percent className="w-3.5 h-3.5 text-rose-600" />
                                    <span>Total Interest</span>
                                </div>
                                <div className="text-lg sm:text-2xl font-black text-rose-600 tracking-tight mt-1">
                                    {formatCurrency(interestResult.summary.totalInterest)}
                                </div>
                                <div className="text-[10px] text-rose-700 font-medium mt-1">
                                    {interestResult.summary.totalDays} Days @ {interestRate}% {rateType === 'monthly' ? 'p.m.' : 'p.a.'}
                                </div>
                            </div>

                            {/* Card 3: Net Balance Due */}
                            <div className="bg-gradient-to-br from-indigo-50 to-indigo-100/60 border border-indigo-200/80 rounded-xl p-3 sm:p-4 shadow-xs">
                                <div className="text-[11px] font-bold text-indigo-700 uppercase tracking-wider mb-1">
                                    Net Balance Due
                                </div>
                                <div className="text-lg sm:text-2xl font-black text-indigo-950 tracking-tight mt-1">
                                    {formatCurrency(interestResult.summary.finalBalance)} <span className="text-sm font-bold text-indigo-700">{interestResult.summary.finalBalanceType}</span>
                                </div>
                                <div className="text-[10px] text-slate-500 font-medium mt-1">
                                    Principal + Interest - Paid
                                </div>
                            </div>

                            {/* Card 4: Rate & Selection Status */}
                            <div className="bg-white border border-slate-200/60 rounded-xl p-3 sm:p-4 shadow-xs flex flex-col justify-between">
                                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                                    Calculation Parameters
                                </div>
                                <div className="text-xs sm:text-sm font-semibold text-slate-700 mt-1">
                                    Rate: <span className="text-indigo-600 font-bold">{interestRate}% {rateType === 'monthly' ? 'Per Month' : 'Per Year'}</span>
                                </div>
                                <div className="text-[11px] text-slate-500 mt-1">
                                    FYs: <span className="font-bold text-indigo-700">{selectedFYNames}</span> ({transactions.length} txns)
                                </div>
                            </div>
                        </div>
                    )
                )}

                {/* Interest Calculation Parameter Control Bar (when viewMode === 'interest') */}
                {viewMode === 'interest' && (
                    <div className="px-4 sm:px-6 py-2.5 border-b border-slate-200 bg-slate-50/80 flex flex-col gap-2.5 shrink-0">
                        {/* Multi-FY Quick Selector Pills */}
                        <div className="flex flex-wrap items-center gap-1.5 pb-2 border-b border-slate-200/60">
                            <span className="text-[11px] font-bold text-slate-500 uppercase flex items-center gap-1 mr-1">
                                <Calendar className="w-3.5 h-3.5 text-indigo-600" />
                                Fiscal Years:
                            </span>
                            <button
                                type="button"
                                onClick={selectAllFYs}
                                className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                                    selectedFYs.length === fyOptions.length
                                        ? 'bg-indigo-600 text-white shadow-2xs'
                                        : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                                }`}
                            >
                                All FYs
                            </button>
                            {fyOptions.map(fy => {
                                const isChecked = selectedFYs.includes(fy.id);
                                return (
                                    <button
                                        key={fy.id}
                                        type="button"
                                        onClick={() => toggleFY(fy.id)}
                                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold transition-all cursor-pointer border ${
                                            isChecked
                                                ? 'bg-indigo-50 border-indigo-300 text-indigo-700 shadow-2xs ring-1 ring-indigo-200'
                                                : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                                        }`}
                                        title={`${fy.startDate} to ${fy.endDate}`}
                                    >
                                        <span className={`w-2 h-2 rounded-full ${isChecked ? 'bg-indigo-600' : 'bg-slate-300'}`} />
                                        <span>{fy.name}</span>
                                    </button>
                                );
                            })}
                            {selectedFYs.length > 1 && (
                                <span className="text-[11px] font-bold text-indigo-700 bg-indigo-100/70 border border-indigo-200 px-2.5 py-0.5 rounded-full ml-auto">
                                    {selectedFYs.length} FYs Active ({transactions.length} Txns)
                                </span>
                            )}
                        </div>

                        {/* Parameters inputs & Selection buttons */}
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                                {/* Start Date */}
                                <div className="flex items-center gap-1.5 bg-white px-2.5 py-1.5 rounded-lg border border-slate-200 shadow-2xs">
                                    <span className="text-[11px] font-bold text-slate-500 uppercase">Start:</span>
                                    <input
                                        type="date"
                                        value={interestStartDate}
                                        onChange={(e) => setInterestStartDate(e.target.value)}
                                        className="text-xs sm:text-sm font-bold text-slate-800 focus:outline-none cursor-pointer bg-transparent"
                                    />
                                </div>

                                {/* End Date */}
                                <div className="flex items-center gap-1.5 bg-white px-2.5 py-1.5 rounded-lg border border-slate-200 shadow-2xs">
                                    <span className="text-[11px] font-bold text-slate-500 uppercase">End:</span>
                                    <input
                                        type="date"
                                        value={interestEndDate}
                                        onChange={(e) => setInterestEndDate(e.target.value)}
                                        className="text-xs sm:text-sm font-bold text-slate-800 focus:outline-none cursor-pointer bg-transparent"
                                    />
                                </div>

                                {/* Interest Rate & Type */}
                                <div className="flex items-center gap-1 bg-white px-2.5 py-1.5 rounded-lg border border-slate-200 shadow-2xs">
                                    <span className="text-[11px] font-bold text-slate-500 uppercase">Rate:</span>
                                    <input
                                        type="number"
                                        step="0.1"
                                        min="0"
                                        value={interestRate}
                                        onChange={(e) => setInterestRate(e.target.value)}
                                        className="w-14 sm:w-16 text-xs sm:text-sm font-bold text-slate-800 focus:outline-none bg-transparent"
                                    />
                                    <select
                                        value={rateType}
                                        onChange={(e) => setRateType(e.target.value)}
                                        className="text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-1 rounded focus:outline-none cursor-pointer border-0"
                                    >
                                        <option value="yearly">% p.a. (Yearly)</option>
                                        <option value="monthly">% p.m. (Monthly)</option>
                                    </select>
                                </div>

                                {/* Basis */}
                                <select
                                    value={daysBasis}
                                    onChange={(e) => setDaysBasis(Number(e.target.value))}
                                    className="bg-white text-xs font-bold text-slate-700 px-2.5 py-2 rounded-lg border border-slate-200 shadow-2xs focus:outline-none cursor-pointer"
                                >
                                    <option value={365}>365 Days / Yr</option>
                                    <option value={360}>360 Days / Yr</option>
                                </select>

                                {/* Include FY Opening Balance Checkbox */}
                                {fyData?.openingBalance && parseFloat(fyData.openingBalance) > 0 && (
                                    <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 bg-white px-2.5 py-1.5 rounded-lg border border-slate-200 shadow-2xs cursor-pointer hover:bg-slate-50">
                                        <input
                                            type="checkbox"
                                            checked={includeOpeningBalance}
                                            onChange={(e) => setIncludeOpeningBalance(e.target.checked)}
                                            className="w-3.5 h-3.5 text-indigo-600 rounded cursor-pointer"
                                        />
                                        <span>Include FY OB ({earliestSelectedFY ? `${earliestSelectedFY.name}: ` : ''}{formatCurrency(fyData.openingBalance)} {fyData.openingBalanceType})</span>
                                    </label>
                                )}
                            </div>

                            {/* Transaction selection controls */}
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-slate-500 font-medium">
                                    <span className="font-bold text-slate-800">{selectedTxnIds.size}</span> / {processedTransactions.length} txns
                                </span>
                                <button
                                    type="button"
                                    onClick={selectAllTxns}
                                    className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-bold border border-slate-200 shadow-2xs transition-colors cursor-pointer"
                                >
                                    Select All
                                </button>
                                <button
                                    type="button"
                                    onClick={deselectAllTxns}
                                    className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-bold border border-slate-200 shadow-2xs transition-colors cursor-pointer"
                                >
                                    Clear
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Content Table Area */}
                <div className="flex-1 overflow-auto p-0 bg-white">
                    {viewMode === 'statement' ? (
                        /* Standard Statement View */
                        <>
                            <TransactionTable 
                                transactions={displayTransactions} 
                                showFullDetails={showFullDetails} 
                                isStatementView={true} 
                                selectedAccountName={accountName}
                                onDeleteTransaction={handleDelete}
                                onEditTransaction={(t) => setEditingTxn(t)}
                            />
                            
                            {loadingTxns && (
                                <div className="flex items-center justify-center p-12 text-sm font-bold text-gray-400 gap-3">
                                    <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                                    Loading statement...
                                </div>
                            )}
                            
                            {!loadingTxns && hasMoreTxns && transactions.length > 0 && (
                                <div className="text-center p-8 border-t border-gray-100">
                                    <button 
                                        onClick={() => fetchTransactions(true)}
                                        className="px-6 py-2.5 bg-white hover:bg-gray-50 text-gray-700 rounded-full text-sm font-bold border border-gray-200 shadow-sm transition-colors cursor-pointer"
                                    >
                                        Load More Transactions
                                    </button>
                                </div>
                            )}
                        </>
                    ) : (
                        /* Interest Calculation View (Matching User Reference Sheet Exactly) */
                        <div className="overflow-x-auto min-w-full">
                            <table className="min-w-full divide-y divide-gray-200 text-sm border-collapse">
                                <thead className="bg-slate-100 sticky top-0 z-10 border-b border-slate-200">
                                    <tr>
                                        <th className="w-10 px-3 py-3 text-center text-[11px] font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                                            ✓
                                        </th>
                                        <th className="px-4 py-3 text-left text-[11px] font-bold text-slate-600 uppercase tracking-wider whitespace-nowrap">
                                            DATE
                                        </th>
                                        <th className="px-4 py-3 text-center text-[11px] font-bold text-slate-600 uppercase tracking-wider whitespace-nowrap">
                                            DUE DAY
                                        </th>
                                        <th className="px-4 py-3 text-right text-[11px] font-bold text-slate-600 uppercase tracking-wider whitespace-nowrap">
                                            PER DAY INTEREST
                                        </th>
                                        <th className="px-4 py-3 text-left text-[11px] font-bold text-slate-600 uppercase tracking-wider whitespace-nowrap">
                                            PARTICULARS
                                        </th>
                                        <th className="px-4 py-3 text-right text-[11px] font-bold text-slate-600 uppercase tracking-wider whitespace-nowrap">
                                            DR. AMOUNT
                                        </th>
                                        <th className="px-4 py-3 text-right text-[11px] font-bold text-slate-600 uppercase tracking-wider whitespace-nowrap">
                                            CR. AMOUNT
                                        </th>
                                        <th className="px-4 py-3 text-right text-[11px] font-bold text-slate-600 uppercase tracking-wider whitespace-nowrap">
                                            BALANCE
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-100">
                                    {interestResult.rows.length === 0 ? (
                                        <tr>
                                            <td colSpan={8} className="px-4 py-12 text-center text-slate-500">
                                                {selectedFYs.length === 0 ? (
                                                    <div className="flex flex-col items-center justify-center gap-2">
                                                        <Calendar className="w-8 h-8 text-indigo-400" />
                                                        <span className="font-bold text-slate-700 text-sm">No Fiscal Years Selected</span>
                                                        <span className="text-xs text-slate-400">Please select at least one fiscal year above to view transactions and calculate interest.</span>
                                                        <button
                                                            type="button"
                                                            onClick={selectAllFYs}
                                                            className="mt-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition cursor-pointer"
                                                        >
                                                            Select All Fiscal Years
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <span>No transactions available or selected for interest calculation.</span>
                                                )}
                                            </td>
                                        </tr>
                                    ) : (
                                        interestResult.rows.map((r, idx) => {
                                            if (r.isInterestRow) {
                                                // Interest calculation line item (highlighted in rose/red)
                                                return (
                                                    <tr 
                                                        key={r.id || idx} 
                                                        className="bg-rose-50/70 hover:bg-rose-100/60 transition-colors border-l-4 border-l-rose-500"
                                                    >
                                                        <td className="px-3 py-2.5 text-center">
                                                            <span className="text-[10px] font-extrabold text-rose-600 bg-rose-200/80 px-1.5 py-0.5 rounded">
                                                                INT
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-2.5 whitespace-nowrap font-bold text-rose-900 text-xs sm:text-sm">
                                                            {r.date}
                                                        </td>
                                                        <td className="px-4 py-2.5 whitespace-nowrap text-center">
                                                            <span className="font-extrabold text-rose-600 bg-rose-100 px-2 py-0.5 rounded text-xs tracking-wider">
                                                                {r.dueDays} DAYS
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-2.5 whitespace-nowrap text-right font-mono font-bold text-rose-600 text-xs sm:text-sm">
                                                            {r.perDayInterest ? r.perDayInterest.toFixed(2) : '-'}
                                                        </td>
                                                        <td className="px-4 py-2.5 whitespace-nowrap">
                                                            <span className="font-black text-rose-600 tracking-wide text-xs sm:text-sm">
                                                                {r.particulars}
                                                            </span>
                                                            {r.isFinalInterestRow && (
                                                                <span className="text-[10px] ml-1.5 text-rose-500 font-semibold italic">
                                                                    (Till End Date)
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td className="px-4 py-2.5 whitespace-nowrap text-right font-mono font-extrabold text-rose-600 text-xs sm:text-sm">
                                                            {r.debitAmount ? formatCurrency(r.debitAmount) : '-'}
                                                        </td>
                                                        <td className="px-4 py-2.5 whitespace-nowrap text-right text-gray-400">
                                                            -
                                                        </td>
                                                        <td className="px-4 py-2.5 whitespace-nowrap text-right font-mono font-black text-slate-900 text-xs sm:text-sm">
                                                            {formatCurrency(r.balance)} <span className="text-xs font-semibold text-slate-500">{r.balanceType}</span>
                                                        </td>
                                                    </tr>
                                                );
                                            }

                                            // Regular transaction row / Opening row
                                            const isSelected = r.id === 'ob_row' ? includeOpeningBalance : selectedTxnIds.has(r.id);

                                            return (
                                                <tr 
                                                    key={r.id || idx}
                                                    className={`transition-colors ${
                                                        !isSelected 
                                                            ? 'bg-slate-50/60 text-slate-400 hover:bg-slate-100/60' 
                                                            : 'hover:bg-slate-50/80 text-gray-900'
                                                    }`}
                                                >
                                                    <td className="px-3 py-2.5 text-center">
                                                        {r.id === 'ob_row' ? (
                                                            <span className="text-[10px] font-bold text-slate-400">OB</span>
                                                        ) : (
                                                            <input
                                                                type="checkbox"
                                                                checked={selectedTxnIds.has(r.id)}
                                                                onChange={() => toggleSelectTxn(r.id)}
                                                                className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                                                title={isSelected ? "Included in interest (Click to exclude)" : "Excluded from interest (Click to include)"}
                                                            />
                                                        )}
                                                    </td>
                                                    <td className={`px-4 py-2.5 whitespace-nowrap text-xs sm:text-sm ${!isSelected ? 'text-slate-400' : 'text-gray-900 font-medium'}`}>
                                                        {r.date}
                                                    </td>
                                                    <td className="px-4 py-2.5 whitespace-nowrap text-center text-gray-400 text-xs">
                                                        -
                                                    </td>
                                                    <td className="px-4 py-2.5 whitespace-nowrap text-right text-gray-400 text-xs">
                                                        -
                                                    </td>
                                                    <td className="px-4 py-2.5 whitespace-nowrap text-xs sm:text-sm">
                                                        <span className={!isSelected ? 'text-slate-400 font-medium' : 'text-gray-900 font-semibold'}>
                                                            {r.particulars}
                                                        </span>
                                                        {!isSelected && (
                                                            <span className="text-[10px] ml-2 text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded font-bold">
                                                                No Interest
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className={`px-4 py-2.5 whitespace-nowrap text-right font-mono text-xs sm:text-sm ${!isSelected ? 'text-slate-400' : 'text-gray-900 font-medium'}`}>
                                                        {r.debitAmount ? formatCurrency(r.debitAmount) : '-'}
                                                    </td>
                                                    <td className={`px-4 py-2.5 whitespace-nowrap text-right font-mono text-xs sm:text-sm ${!isSelected ? 'text-slate-400' : 'text-emerald-600 font-bold'}`}>
                                                        {r.creditAmount ? formatCurrency(r.creditAmount) : '-'}
                                                    </td>
                                                    <td className={`px-4 py-2.5 whitespace-nowrap text-right font-mono text-xs sm:text-sm ${!isSelected ? 'text-slate-400' : 'text-slate-900 font-bold'}`}>
                                                        {formatCurrency(r.balance)} <span className="text-xs font-normal text-slate-400">{r.balanceType}</span>
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                                {interestResult.rows.length > 0 && (
                                    <tfoot className="bg-slate-100 font-bold border-t-2 border-slate-300">
                                        <tr>
                                            <td colSpan={2} className="px-4 py-3 text-left text-slate-700 uppercase tracking-wider text-xs">
                                                Total Summary
                                            </td>
                                            <td className="px-4 py-3 text-center text-xs text-rose-700 font-extrabold">
                                                {interestResult.summary.totalDays} Days
                                            </td>
                                            <td className="px-4 py-3 text-right text-xs text-slate-400">
                                                -
                                            </td>
                                            <td className="px-4 py-3 text-left text-xs text-slate-600">
                                                Interest Charged: {formatCurrency(interestResult.summary.totalInterest)}
                                            </td>
                                            <td className="px-4 py-3 text-right font-mono text-xs sm:text-sm text-slate-900 font-extrabold">
                                                {formatCurrency(interestResult.summary.initialPrincipal + interestResult.summary.totalInterest)}
                                            </td>
                                            <td className="px-4 py-3 text-right font-mono text-xs sm:text-sm text-emerald-600 font-extrabold">
                                                {formatCurrency(interestResult.summary.totalPaid)}
                                            </td>
                                            <td className="px-4 py-3 text-right font-mono text-sm sm:text-base text-indigo-950 font-black">
                                                {formatCurrency(interestResult.summary.finalBalance)} <span className="text-xs font-bold text-indigo-700">{interestResult.summary.finalBalanceType}</span>
                                            </td>
                                        </tr>
                                    </tfoot>
                                )}
                            </table>
                        </div>
                    )}
                </div>

                {/* Edit Transaction Modal */}
                <EditTransactionModal 
                    isOpen={Boolean(editingTxn)} 
                    onClose={() => setEditingTxn(null)} 
                    transaction={editingTxn} 
                    currentUser={currentUser} 
                    onSaveSuccess={handleTransactionSaved} 
                />
            </div>
        </div>
    );
}
