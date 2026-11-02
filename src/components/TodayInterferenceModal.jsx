import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import { collection, getDocs, query, where, doc, getDoc } from 'firebase/firestore';
import { 
    X, Search, Zap, ArrowLeft, ArrowUpDown, ArrowUp, ArrowDown, 
    Calendar, RefreshCw, FileText, Download, CheckCircle2, ChevronRight,
    TrendingUp, TrendingDown, Layers, CreditCard
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { getCurrentFYObject } from '../utils/fiscalYear';

const formatCurrency = (amount) => {
    return Number(amount || 0).toLocaleString('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
};

const getTodayDateStr = () => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
};

const getYesterdayDateStr = () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yyyy = yesterday.getFullYear();
    const mm = String(yesterday.getMonth() + 1).padStart(2, '0');
    const dd = String(yesterday.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
};

export default function TodayInterferenceModal({ 
    isOpen, 
    onClose, 
    defaultStartDate = '', 
    defaultEndDate = '', 
    fyOptions = [], 
    currentUser 
}) {
    // Date states - defaults to the tab's currently selected dates
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    // Data states
    const [loading, setLoading] = useState(false);
    const [accountDataList, setAccountDataList] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedAccount, setSelectedAccount] = useState(null);

    // Sorting states
    const [sortField, setSortField] = useState('netDelta');
    const [sortDir, setSortDir] = useState('desc'); // 'asc' | 'desc'

    // Initialize dates when opened
    useEffect(() => {
        if (isOpen) {
            const initialStart = defaultStartDate || getTodayDateStr();
            const initialEnd = defaultEndDate || defaultStartDate || getTodayDateStr();
            setStartDate(initialStart);
            setEndDate(initialEnd);
            setSelectedAccount(null);
            setSearchQuery('');
        }
    }, [isOpen, defaultStartDate, defaultEndDate]);

    // Fetch and process data whenever dates change or modal opens
    useEffect(() => {
        if (!isOpen || !startDate || !endDate) return;

        let isMounted = true;

        const loadInterferenceData = async () => {
            setLoading(true);
            try {
                // 1. Identify active Fiscal Year for startDate
                let activeFY = null;
                if (fyOptions && fyOptions.length > 0) {
                    activeFY = fyOptions.find(f => startDate >= f.startDate && startDate <= f.endDate);
                    if (!activeFY) {
                        activeFY = getCurrentFYObject(fyOptions);
                    }
                }

                // 2. Fetch transactions within [startDate, endDate]
                const txnsQuery = query(
                    collection(db, 'transactions'),
                    where('date', '>=', startDate),
                    where('date', '<=', endDate)
                );
                const txnsSnap = await getDocs(txnsQuery);

                if (!isMounted) return;

                const periodTxns = [];
                txnsSnap.forEach(d => {
                    periodTxns.push({ id: d.id, ...d.data() });
                });

                // Sort period transactions chronologically
                periodTxns.sort((a, b) => (a.date || '').localeCompare(b.date || ''));

                if (periodTxns.length === 0) {
                    if (isMounted) {
                        setAccountDataList([]);
                        setLoading(false);
                    }
                    return;
                }

                // 3. Group period transactions by account
                const accountMap = new Map(); // key (lowercase) -> account object

                periodTxns.forEach(t => {
                    const debitEntries = t.allDebitEntries || [];
                    const creditEntries = t.allCreditEntries || [];

                    // Extract all debit ledger names & credit ledger names for particulars display
                    const debitLedgerNames = debitEntries.length > 0 
                        ? debitEntries.map(e => e.name).filter(Boolean).join(', ')
                        : (t.debitAccount && t.debitAccount !== '-' ? t.debitAccount : '');
                    const creditLedgerNames = creditEntries.length > 0 
                        ? creditEntries.map(e => e.name).filter(Boolean).join(', ')
                        : (t.creditAccount && t.creditAccount !== '-' ? t.creditAccount : '');

                    // Process Debit entries
                    if (debitEntries.length > 0) {
                        debitEntries.forEach(entry => {
                            const name = (entry.name || '').trim();
                            const key = name.toLowerCase();
                            if (!key || key === '-') return;

                            if (!accountMap.has(key)) {
                                accountMap.set(key, {
                                    key,
                                    name,
                                    periodDebit: 0,
                                    periodCredit: 0,
                                    vouchers: []
                                });
                            }
                            const acc = accountMap.get(key);
                            const amt = parseFloat(entry.amount || 0);
                            acc.periodDebit += amt;
                            acc.vouchers.push({
                                id: `${t.id}_dr_${entry.name}`,
                                txnId: t.id,
                                date: t.date,
                                voucherNo: t.voucherNo || '-',
                                type: t.type || 'Voucher',
                                entryType: 'Debit',
                                debit: amt,
                                credit: 0,
                                oppositeAccount: creditLedgerNames || 'Contra/Multiple',
                                narration: t.narration || ''
                            });
                        });
                    } else if (t.debitAccount && t.debitAccount !== '-') {
                        const name = t.debitAccount.trim();
                        const key = name.toLowerCase();
                        if (key) {
                            if (!accountMap.has(key)) {
                                accountMap.set(key, {
                                    key,
                                    name,
                                    periodDebit: 0,
                                    periodCredit: 0,
                                    vouchers: []
                                });
                            }
                            const acc = accountMap.get(key);
                            const amt = parseFloat(t.debitAmount || 0);
                            acc.periodDebit += amt;
                            acc.vouchers.push({
                                id: `${t.id}_dr`,
                                txnId: t.id,
                                date: t.date,
                                voucherNo: t.voucherNo || '-',
                                type: t.type || 'Voucher',
                                entryType: 'Debit',
                                debit: amt,
                                credit: 0,
                                oppositeAccount: t.creditAccount || 'Multiple',
                                narration: t.narration || ''
                            });
                        }
                    }

                    // Process Credit entries
                    if (creditEntries.length > 0) {
                        creditEntries.forEach(entry => {
                            const name = (entry.name || '').trim();
                            const key = name.toLowerCase();
                            if (!key || key === '-') return;

                            if (!accountMap.has(key)) {
                                accountMap.set(key, {
                                    key,
                                    name,
                                    periodDebit: 0,
                                    periodCredit: 0,
                                    vouchers: []
                                });
                            }
                            const acc = accountMap.get(key);
                            const amt = parseFloat(entry.amount || 0);
                            acc.periodCredit += amt;
                            acc.vouchers.push({
                                id: `${t.id}_cr_${entry.name}`,
                                txnId: t.id,
                                date: t.date,
                                voucherNo: t.voucherNo || '-',
                                type: t.type || 'Voucher',
                                entryType: 'Credit',
                                debit: 0,
                                credit: amt,
                                oppositeAccount: debitLedgerNames || 'Contra/Multiple',
                                narration: t.narration || ''
                            });
                        });
                    } else if (t.creditAccount && t.creditAccount !== '-') {
                        const name = t.creditAccount.trim();
                        const key = name.toLowerCase();
                        if (key) {
                            if (!accountMap.has(key)) {
                                accountMap.set(key, {
                                    key,
                                    name,
                                    periodDebit: 0,
                                    periodCredit: 0,
                                    vouchers: []
                                });
                            }
                            const acc = accountMap.get(key);
                            const amt = parseFloat(t.creditAmount || 0);
                            acc.periodCredit += amt;
                            acc.vouchers.push({
                                id: `${t.id}_cr`,
                                txnId: t.id,
                                date: t.date,
                                voucherNo: t.voucherNo || '-',
                                type: t.type || 'Voucher',
                                entryType: 'Credit',
                                debit: 0,
                                credit: amt,
                                oppositeAccount: t.debitAccount || 'Multiple',
                                narration: t.narration || ''
                            });
                        }
                    }
                });

                // 4. Fetch Account masters for matching IDs & groups
                const accSnap = await getDocs(collection(db, 'accounts'));
                const masterMap = new Map();
                accSnap.forEach(d => {
                    const data = d.data();
                    const name = (data.name || '').trim();
                    if (!name) return;
                    const key = name.toLowerCase();
                    if (!masterMap.has(key)) {
                        masterMap.set(key, {
                            id: d.id,
                            name,
                            group: data.group || '',
                            openingBalance: data.openingBalance || 0,
                            openingBalanceType: data.openingBalanceType || '',
                            allDocIds: [d.id]
                        });
                    } else {
                        const existing = masterMap.get(key);
                        existing.allDocIds.push(d.id);
                        if (!existing.group && data.group) existing.group = data.group;
                    }
                });

                // 5. For each affected account, determine Opening Balance before startDate
                const uniqueAccounts = Array.from(accountMap.values());
                const fyStartDate = activeFY ? activeFY.startDate : '1900-01-01';

                const calculatedList = await Promise.all(uniqueAccounts.map(async (item) => {
                    const master = masterMap.get(item.key);
                    const docId = master?.id;
                    const group = master?.group || 'General';

                    let fyOb = parseFloat(master?.openingBalance || 0);
                    let fyObType = master?.openingBalanceType || 'Dr';

                    // Fetch FY document if activeFY exists and account has docId
                    if (activeFY?.id && docId) {
                        try {
                            const ids = master?.allDocIds || [docId];
                            for (const id of ids) {
                                const fyDocSnap = await getDoc(doc(db, 'accounts', id, 'fiscalYears', activeFY.id));
                                if (fyDocSnap.exists()) {
                                    const fyData = fyDocSnap.data();
                                    fyOb = parseFloat(fyData.openingBalance || 0);
                                    fyObType = fyData.openingBalanceType || 'Dr';
                                    break;
                                }
                            }
                        } catch (err) {
                            console.error(`Error fetching FY balance for ${item.name}:`, err);
                        }
                    }

                    const fyObSigned = (fyObType === 'Cr' ? -1 : 1) * fyOb;

                    // Calculate transactions before startDate within the active FY
                    let preDebits = 0;
                    let preCredits = 0;

                    if (startDate > fyStartDate) {
                        try {
                            const qPrior = query(
                                collection(db, 'transactions'),
                                where('involvedAccountsLower', 'array-contains', item.key)
                            );
                            const priorSnap = await getDocs(qPrior);
                            priorSnap.forEach(docSnap => {
                                const t = docSnap.data();
                                if (t.date >= fyStartDate && t.date < startDate) {
                                    // Check debit entries
                                    if (t.allDebitEntries && t.allDebitEntries.length > 0) {
                                        t.allDebitEntries.forEach(e => {
                                            if ((e.name || '').trim().toLowerCase() === item.key) {
                                                preDebits += parseFloat(e.amount || 0);
                                            }
                                        });
                                    } else if ((t.debitAccount || '').trim().toLowerCase() === item.key) {
                                        preDebits += parseFloat(t.debitAmount || 0);
                                    }

                                    // Check credit entries
                                    if (t.allCreditEntries && t.allCreditEntries.length > 0) {
                                        t.allCreditEntries.forEach(e => {
                                            if ((e.name || '').trim().toLowerCase() === item.key) {
                                                preCredits += parseFloat(e.amount || 0);
                                            }
                                        });
                                    } else if ((t.creditAccount || '').trim().toLowerCase() === item.key) {
                                        preCredits += parseFloat(t.creditAmount || 0);
                                    }
                                }
                            });
                        } catch (err) {
                            console.error(`Error querying prior txns for ${item.name}:`, err);
                        }
                    }

                    // Opening Balance as of startDate
                    const openingSigned = fyObSigned + preDebits - preCredits;
                    const openingBalance = Math.abs(openingSigned);
                    const openingBalanceType = openingSigned < 0 ? 'Cr' : (openingSigned > 0 ? 'Dr' : '');

                    // Period Interference totals
                    const totalDebit = item.periodDebit;
                    const totalCredit = item.periodCredit;
                    const netDelta = totalDebit - totalCredit;

                    // Closing Balance as of endDate
                    const closingSigned = openingSigned + totalDebit - totalCredit;
                    const closingBalance = Math.abs(closingSigned);
                    const closingBalanceType = closingSigned < 0 ? 'Cr' : (closingSigned > 0 ? 'Dr' : '');

                    // Sort vouchers chronologically and calculate running balances
                    const sortedVouchers = [...item.vouchers].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
                    let running = openingSigned;
                    const vouchersWithRunning = sortedVouchers.map(v => {
                        running = running + (v.debit || 0) - (v.credit || 0);
                        return {
                            ...v,
                            runningBalance: Math.abs(running),
                            runningBalanceType: running < 0 ? 'Cr' : (running > 0 ? 'Dr' : '')
                        };
                    });

                    return {
                        key: item.key,
                        name: item.name,
                        group,
                        openingSigned,
                        openingBalance,
                        openingBalanceType,
                        totalDebit,
                        totalCredit,
                        netDelta,
                        closingSigned,
                        closingBalance,
                        closingBalanceType,
                        txnCount: item.vouchers.length,
                        vouchers: vouchersWithRunning
                    };
                }));

                if (isMounted) {
                    setAccountDataList(calculatedList);
                    setLoading(false);
                }
            } catch (err) {
                console.error("Error generating today interference summary:", err);
                if (isMounted) {
                    setLoading(false);
                }
            }
        };

        loadInterferenceData();

        return () => {
            isMounted = false;
        };
    }, [isOpen, startDate, endDate, fyOptions]);

    // Handle Quick Date Toggles
    const handleSetToday = () => {
        const t = getTodayDateStr();
        setStartDate(t);
        setEndDate(t);
        setSelectedAccount(null);
    };

    const handleSetYesterday = () => {
        const y = getYesterdayDateStr();
        setStartDate(y);
        setEndDate(y);
        setSelectedAccount(null);
    };

    const handleSyncTabDates = () => {
        const s = defaultStartDate || getTodayDateStr();
        const e = defaultEndDate || defaultStartDate || getTodayDateStr();
        setStartDate(s);
        setEndDate(e);
        setSelectedAccount(null);
    };

    // Filter and Sort Accounts
    const filteredAccounts = useMemo(() => {
        let list = [...accountDataList];

        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase().trim();
            list = list.filter(acc => 
                acc.name.toLowerCase().includes(q) || 
                acc.group.toLowerCase().includes(q)
            );
        }

        list.sort((a, b) => {
            let valA = a[sortField];
            let valB = b[sortField];

            if (sortField === 'name') {
                return sortDir === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
            }
            if (sortField === 'openingBalance') {
                valA = a.openingSigned;
                valB = b.openingSigned;
            }
            if (sortField === 'closingBalance') {
                valA = a.closingSigned;
                valB = b.closingSigned;
            }
            if (sortField === 'netDelta') {
                valA = Math.abs(a.netDelta);
                valB = Math.abs(b.netDelta);
            }

            return sortDir === 'asc' ? valA - valB : valB - valA;
        });

        return list;
    }, [accountDataList, searchQuery, sortField, sortDir]);

    // Grand Totals Summary
    const summaryTotals = useMemo(() => {
        let totalDebit = 0;
        let totalCredit = 0;
        let totalTxns = 0;

        accountDataList.forEach(a => {
            totalDebit += a.totalDebit;
            totalCredit += a.totalCredit;
            totalTxns += a.txnCount;
        });

        const net = totalDebit - totalCredit;

        return {
            accountCount: accountDataList.length,
            totalDebit,
            totalCredit,
            netDelta: Math.abs(net),
            netType: net < 0 ? 'Cr' : (net > 0 ? 'Dr' : ''),
            totalTxns
        };
    }, [accountDataList]);

    // Handle column sort toggle
    const handleSort = (field) => {
        if (sortField === field) {
            setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDir('desc');
        }
    };

    // Export Excel of all accounts in interference
    const handleExportAllToExcel = () => {
        if (accountDataList.length === 0) return;

        const dataToExport = accountDataList.map(a => ({
            "Account Name": a.name,
            "Group": a.group,
            "Opening Balance": `${formatCurrency(a.openingBalance)} ${a.openingBalanceType}`,
            "Interference Debit (Dr)": a.totalDebit,
            "Interference Credit (Cr)": a.totalCredit,
            "Net Movement": `${formatCurrency(Math.abs(a.netDelta))} ${a.netDelta >= 0 ? 'Dr' : 'Cr'}`,
            "Closing Balance": `${formatCurrency(a.closingBalance)} ${a.closingBalanceType}`,
            "Vouchers Count": a.txnCount
        }));

        const ws = XLSX.utils.json_to_sheet(dataToExport);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Today Interference");
        XLSX.writeFile(wb, `Interference_Summary_${startDate}_to_${endDate}.xlsx`);
    };

    // Export single account detail to Excel
    const handleExportAccountDetail = (account) => {
        if (!account) return;

        const rows = [
            {
                "Date": startDate,
                "Voucher Type": "Opening Balance",
                "Voucher No": "-",
                "Particulars": `Balance before ${startDate}`,
                "Debit": account.openingBalanceType === 'Dr' ? account.openingBalance : 0,
                "Credit": account.openingBalanceType === 'Cr' ? account.openingBalance : 0,
                "Running Balance": `${formatCurrency(account.openingBalance)} ${account.openingBalanceType}`
            },
            ...account.vouchers.map(v => ({
                "Date": v.date,
                "Voucher Type": v.type,
                "Voucher No": v.voucherNo,
                "Particulars": `${v.oppositeAccount} ${v.narration ? `(${v.narration})` : ''}`,
                "Debit": v.debit || 0,
                "Credit": v.credit || 0,
                "Running Balance": `${formatCurrency(v.runningBalance)} ${v.runningBalanceType}`
            }))
        ];

        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Account Interference");
        XLSX.writeFile(wb, `${account.name.replace(/[^a-zA-Z0-9]/g, '_')}_Interference_${startDate}.xlsx`);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
            <div className="bg-white w-full max-w-6xl h-[92vh] max-h-[850px] rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-gray-100">
                
                {/* Header */}
                <div className="px-5 py-4 bg-white border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-500 flex items-center justify-center text-white shadow-md shadow-orange-500/20">
                            <Zap className="w-5 h-5 fill-white" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h2 className="text-lg sm:text-xl font-black text-gray-900">
                                    Interference Scenario
                                </h2>
                                <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                    {startDate === endDate ? startDate : `${startDate} to ${endDate}`}
                                </span>
                            </div>
                            
                        </div>
                    </div>

                    {/* Date Controls & Close */}
                    <div className="flex items-center flex-wrap gap-2">
                        <div className="flex items-center bg-gray-100 p-1 rounded-xl text-xs font-bold text-gray-600 gap-1">
                            <button
                                onClick={handleSyncTabDates}
                                className="px-2.5 py-1.5 rounded-lg hover:bg-white hover:text-gray-900 hover:shadow-xs transition"
                                title="Use date range currently active in Transactions tab"
                            >
                                Tab Dates
                            </button>
                            <button
                                onClick={handleSetToday}
                                className={`px-2.5 py-1.5 rounded-lg transition ${startDate === getTodayDateStr() && endDate === getTodayDateStr() ? 'bg-white text-orange-600 shadow-xs' : 'hover:bg-white hover:text-gray-900'}`}
                            >
                                Today
                            </button>
                            <button
                                onClick={handleSetYesterday}
                                className={`px-2.5 py-1.5 rounded-lg transition ${startDate === getYesterdayDateStr() && endDate === getYesterdayDateStr() ? 'bg-white text-orange-600 shadow-xs' : 'hover:bg-white hover:text-gray-900'}`}
                            >
                                Yesterday
                            </button>
                        </div>

                        

                        {/* Close button */}
                        <button 
                            onClick={onClose}
                            className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                

                {/* Main Content Area */}
                <div className="flex-1 min-h-0 overflow-y-auto">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                            <RefreshCw className="w-8 h-8 text-amber-500 animate-spin mb-3" />
                            <p className="text-sm font-bold text-gray-800">Calculating Interference & Balances...</p>
                            <p className="text-xs text-gray-400 mt-1">Aggregating vouchers and determining pre-date opening balances</p>
                        </div>
                    ) : selectedAccount ? (
                        /* --- VIEW 2: ACCOUNT DRILLDOWN VIEW --- */
                        <div className="p-4 sm:p-6 flex flex-col gap-5 animate-fadeIn">
                            {/* Drilldown Top Bar */}
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-gray-100">
                                <div className="flex items-center gap-3">
                                    <button
                                        onClick={() => setSelectedAccount(null)}
                                        className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-xl text-xs font-bold transition shadow-2xs cursor-pointer"
                                    >
                                        <ArrowLeft className="w-4 h-4" />
                                        <span>Back to Accounts</span>
                                    </button>
                                    <div>
                                        <h3 className="text-base sm:text-lg font-black text-gray-900 flex items-center gap-2">
                                            {selectedAccount.name}
                                           
                                        </h3>
                                        
                                    </div>
                                </div>

                                
                            </div>

                            

                            {/* Chronological Ledger Table */}
                            <div className="border border-gray-200 rounded-2xl overflow-hidden shadow-2xs bg-white">
                                <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 font-extrabold text-xs text-gray-700 uppercase tracking-wider flex items-center justify-between">
                                    <span>Vouchers Ledger Breakdown</span>
                                    
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left text-xs">
                                        <thead className="bg-gray-100/70 border-b border-gray-200 text-gray-600 font-bold uppercase text-[10px]">
                                            <tr>
                                                <th className="py-2.5 px-4">Date</th>
                                                <th className="py-2.5 px-4">Type & No</th>
                                                <th className="py-2.5 px-4">Particulars / Narration</th>
                                                <th className="py-2.5 px-4 text-right">Debit (Dr)</th>
                                                <th className="py-2.5 px-4 text-right">Credit (Cr)</th>
                                                <th className="py-2.5 px-4 text-right">Running Balance</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {/* Row 0: Opening Balance */}
                                            <tr className="bg-slate-50/80 font-bold text-gray-800">
                                                <td className="py-3 px-4 font-mono text-[11px] text-gray-500">{startDate}</td>
                                                <td className="py-3 px-4">
                                                    <span className="px-2 py-0.5 rounded bg-gray-200 text-gray-700 font-bold text-[10px]">
                                                        OPENING
                                                    </span>
                                                </td>
                                                <td className="py-3 px-4 text-gray-600 italic">
                                                    Balance prior to start date
                                                </td>
                                                <td className="py-3 px-4 text-right text-gray-400">-</td>
                                                <td className="py-3 px-4 text-right text-gray-400">-</td>
                                                <td className="py-3 px-4 text-right font-black text-gray-900">
                                                    Rs. {formatCurrency(selectedAccount.openingBalance)}{' '}
                                                    <span className="text-[10px] text-gray-500">{selectedAccount.openingBalanceType}</span>
                                                </td>
                                            </tr>

                                            {/* Period Voucher Entries */}
                                            {selectedAccount.vouchers.map((v, idx) => (
                                                <tr key={v.id || idx} className="hover:bg-amber-50/30 transition">
                                                    <td className="py-3 px-4 font-mono text-[11px] text-gray-600 whitespace-nowrap">
                                                        {v.date}
                                                    </td>
                                                    <td className="py-3 px-4 whitespace-nowrap">
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-100">
                                                                {v.type}
                                                            </span>
                                                            <span className="font-mono text-gray-700 font-semibold">
                                                                #{v.voucherNo}
                                                            </span>
                                                        </div>
                                                    </td>
                                                    <td className="py-3 px-4">
                                                        <div className="font-semibold text-gray-800">
                                                            {v.oppositeAccount || 'Contra Entry'}
                                                        </div>
                                                        {v.narration && (
                                                            <div className="text-[11px] text-gray-400 mt-0.5 italic line-clamp-1">
                                                                {v.narration}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td className="py-3 px-4 text-right font-bold text-blue-600 whitespace-nowrap">
                                                        {v.debit > 0 ? `Rs. ${formatCurrency(v.debit)}` : '-'}
                                                    </td>
                                                    <td className="py-3 px-4 text-right font-bold text-amber-600 whitespace-nowrap">
                                                        {v.credit > 0 ? `Rs. ${formatCurrency(v.credit)}` : '-'}
                                                    </td>
                                                    <td className="py-3 px-4 text-right font-extrabold text-gray-900 whitespace-nowrap">
                                                        Rs. {formatCurrency(v.runningBalance)}{' '}
                                                        <span className="text-[10px] font-bold text-gray-500">{v.runningBalanceType}</span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                        {/* Table Footer */}
                                        <tfoot className="bg-gray-50 border-t-2 border-gray-200 font-black text-xs text-gray-900">
                                            <tr>
                                                <td colSpan={3} className="py-3 px-4 uppercase text-gray-700">
                                                    Period Totals & Final Closing
                                                </td>
                                                <td className="py-3 px-4 text-right text-blue-700">
                                                    Rs. {formatCurrency(selectedAccount.totalDebit)}
                                                </td>
                                                <td className="py-3 px-4 text-right text-amber-700">
                                                    Rs. {formatCurrency(selectedAccount.totalCredit)}
                                                </td>
                                                <td className="py-3 px-4 text-right text-emerald-800 text-sm">
                                                    Rs. {formatCurrency(selectedAccount.closingBalance)}{' '}
                                                    <span className="text-xs">{selectedAccount.closingBalanceType}</span>
                                                </td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            </div>
                        </div>
                    ) : accountDataList.length === 0 ? (
                        /* --- EMPTY STATE --- */
                        <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                            <div className="w-16 h-16 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mb-4">
                                <Zap className="w-8 h-8" />
                            </div>
                            <h3 className="text-base font-black text-gray-800">
                                No Interference Found
                            </h3>
                            <p className="text-xs text-gray-500 max-w-sm mt-1">
                                No transactions occurred between <strong className="text-gray-700">{startDate}</strong> and <strong className="text-gray-700">{endDate}</strong>.
                            </p>
                            <div className="flex items-center gap-2 mt-4">
                                <button
                                    onClick={handleSetToday}
                                    className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold transition shadow-xs"
                                >
                                    Check Today
                                </button>
                                <button
                                    onClick={handleSetYesterday}
                                    className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold transition"
                                >
                                    Check Yesterday
                                </button>
                            </div>
                        </div>
                    ) : (
                        /* --- VIEW 1: MASTER ACCOUNT LIST TABLE --- */
                        <div className="p-4 sm:p-5">
                            <div className="border border-gray-200 rounded-2xl overflow-hidden shadow-2xs bg-white">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left text-xs">
                                        <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 font-bold uppercase text-[10px] tracking-wider select-none">
                                            <tr>
                                                <th 
                                                    onClick={() => handleSort('name')}
                                                    className="py-3 px-4 cursor-pointer hover:bg-gray-100 transition"
                                                >
                                                    <div className="flex items-center gap-1.5">
                                                        <span>Account Name</span>
                                                        {sortField === 'name' ? (
                                                            sortDir === 'asc' ? <ArrowUp className="w-3 h-3 text-amber-600" /> : <ArrowDown className="w-3 h-3 text-amber-600" />
                                                        ) : (
                                                            <ArrowUpDown className="w-3 h-3 text-gray-400" />
                                                        )}
                                                    </div>
                                                </th>
                                                <th 
                                                    onClick={() => handleSort('openingBalance')}
                                                    className="py-3 px-4 text-right cursor-pointer hover:bg-gray-100 transition"
                                                >
                                                    <div className="flex items-center justify-end gap-1.5">
                                                        <span >Opening Balance</span>
                                                        {sortField === 'openingBalance' ? (
                                                            sortDir === 'asc' ? <ArrowUp className="w-3 h-3 text-amber-600" /> : <ArrowDown className="w-3 h-3 text-amber-600" />
                                                        ) : (
                                                            <ArrowUpDown className="w-3 h-3 text-gray-400" />
                                                        )}
                                                    </div>
                                                </th>
                                                <th 
                                                    onClick={() => handleSort('totalDebit')}
                                                    className="py-3 px-4 text-right cursor-pointer hover:bg-gray-100 transition"
                                                >
                                                    <div className="flex items-center justify-end gap-1.5">
                                                        <span>Interference Dr</span>
                                                        {sortField === 'totalDebit' ? (
                                                            sortDir === 'asc' ? <ArrowUp className="w-3 h-3 text-amber-600" /> : <ArrowDown className="w-3 h-3 text-amber-600" />
                                                        ) : (
                                                            <ArrowUpDown className="w-3 h-3 text-gray-400" />
                                                        )}
                                                    </div>
                                                </th>
                                                <th 
                                                    onClick={() => handleSort('totalCredit')}
                                                    className="py-3 px-4 text-right cursor-pointer hover:bg-gray-100 transition"
                                                >
                                                    <div className="flex items-center justify-end gap-1.5">
                                                        <span>Interference Cr</span>
                                                        {sortField === 'totalCredit' ? (
                                                            sortDir === 'asc' ? <ArrowUp className="w-3 h-3 text-amber-600" /> : <ArrowDown className="w-3 h-3 text-amber-600" />
                                                        ) : (
                                                            <ArrowUpDown className="w-3 h-3 text-gray-400" />
                                                        )}
                                                    </div>
                                                </th>
                                                <th 
                                                    onClick={() => handleSort('closingBalance')}
                                                    className="py-3 px-4 text-right cursor-pointer hover:bg-gray-100 transition"
                                                >
                                                    <div className="flex items-center justify-end gap-1.5">
                                                        <span>Closing Balance</span>
                                                        {sortField === 'closingBalance' ? (
                                                            sortDir === 'asc' ? <ArrowUp className="w-3 h-3 text-amber-600" /> : <ArrowDown className="w-3 h-3 text-amber-600" />
                                                        ) : (
                                                            <ArrowUpDown className="w-3 h-3 text-gray-400" />
                                                        )}
                                                    </div>
                                                </th>
                                                <th className="py-3 px-4 text-center">Action</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {filteredAccounts.map((acc) => (
                                                <tr 
                                                    key={acc.key}
                                                    onClick={() => setSelectedAccount(acc)}
                                                    className="hover:bg-amber-50/40 cursor-pointer transition group"
                                                >
                                                    {/* Account Name & Group */}
                                                    <td className="py-3.5 px-4">
                                                        <div className="font-extrabold text-gray-900 group-hover:text-amber-700 transition">
                                                            {acc.name}
                                                        </div>
                                                        <div className="flex items-center gap-1.5 mt-0.5">
                                                            <span className="text-[10px] text-gray-400 font-semibold">
                                                                {acc.group}
                                                            </span>
                                                            <span className="text-[10px]  px-1.5 py-0.2 rounded bg-purple-50 text-purple-700 border border-purple-100">
                                                                {acc.txnCount} txns
                                                            </span>
                                                        </div>
                                                    </td>

                                                    {/* Opening Balance */}
                                                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                                                        <div className="font-bold text-gray-900">
                                                            Rs. {formatCurrency(acc.openingBalance)}
                                                        </div>
                                                        {acc.openingBalanceType && (
                                                            <span className={`text-[10px] font-black px-1.5 py-0.2 rounded ${acc.openingBalanceType === 'Dr' ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'}`}>
                                                                {acc.openingBalanceType}
                                                            </span>
                                                        )}
                                                    </td>

                                                    {/* Interference Debit */}
                                                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                                                        <span className={`font-bold ${acc.totalDebit > 0 ? 'text-blue-600' : 'text-gray-400'}`}>
                                                            {acc.totalDebit > 0 ? `Rs. ${formatCurrency(acc.totalDebit)}` : '-'}
                                                        </span>
                                                    </td>

                                                    {/* Interference Credit */}
                                                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                                                        <span className={`font-bold ${acc.totalCredit > 0 ? 'text-amber-600' : 'text-gray-400'}`}>
                                                            {acc.totalCredit > 0 ? `Rs. ${formatCurrency(acc.totalCredit)}` : '-'}
                                                        </span>
                                                    </td>

                                                    {/* Closing Balance */}
                                                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                                                        <div className="font-bold text-gray-900">
                                                            Rs. {formatCurrency(acc.closingBalance)}
                                                        </div>
                                                        {acc.closingBalanceType && (
                                                            <span className={`text-[10px] font-black px-1.5 py-0.2 rounded ${acc.closingBalanceType === 'Dr' ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'}`}>
                                                                {acc.closingBalanceType}
                                                            </span>
                                                        )}
                                                    </td>

                                                    {/* Action button */}
                                                    <td className="py-3.5 px-4 text-center whitespace-nowrap">
                                                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-gray-100 group-hover:bg-amber-500 group-hover:text-white text-gray-600 text-xs font-bold transition">
                                                            <span>Details</span>
                                                            <ChevronRight className="w-3.5 h-3.5" />
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500 shrink-0">
                    <span>
                        Showing <strong className="text-gray-900">{filteredAccounts.length}</strong> active accounts
                    </span>
                    <button
                        onClick={onClose}
                        className="px-4 py-2 bg-gray-900 hover:bg-gray-800 text-white rounded-xl text-xs font-bold transition shadow-xs"
                    >
                        Close
                    </button>
                </div>

            </div>
        </div>
    );
}
