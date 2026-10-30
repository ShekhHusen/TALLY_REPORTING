import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
    testConnection,
    getSavedTallyUrl,
    getSavedCompany,
    saveCompany,
    getCachedMasters,
    cacheMasters,
    getCachedStockItems,
    cacheStockItems,
    fetchLedgerMasters,
    fetchStockItems,
    postVoucherToTally,
    buildAccountingVoucherXML,
    buildInvoiceVoucherXML,
} from '../utils/tallyService';
import {
    Building2, RefreshCw, Loader2, Plus, Trash2, Send,
    FileText, Package, ShoppingCart, ArrowRightLeft,
    CheckCircle2, AlertCircle, Code, Clock,
    Sparkles, ChevronDown, Check, X,
    CreditCard, Landmark, FileSpreadsheet, AlertTriangle
} from 'lucide-react';

const fmtCur = (n) => new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
}).format(Math.abs(parseFloat(n || 0)));

// ─────────────────────────────────────────────────────────
// Searchable Combobox Component for Existing Masters
// ─────────────────────────────────────────────────────────
function MasterCombobox({
    options = [],
    value = '',
    onChange,
    placeholder = 'Select account...',
    labelField = 'name',
    subField = 'group',
    extraBadgeField = null,
    disabled = false,
    className = '',
}) {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState(value || '');
    const [prevValue, setPrevValue] = useState(value);
    const [openUpwards, setOpenUpwards] = useState(false);
    const wrapperRef = useRef(null);

    // Sync search input when external value changes
    if (prevValue !== value) {
        setPrevValue(value);
        setSearch(value || '');
    }

    // Determine whether dropdown should open upwards or downwards
    useEffect(() => {
        if (isOpen && wrapperRef.current) {
            const rect = wrapperRef.current.getBoundingClientRect();
            const spaceBelow = window.innerHeight - rect.bottom;
            if (spaceBelow < 250 && rect.top > 250) {
                setOpenUpwards(true);
            } else {
                setOpenUpwards(false);
            }
        }
    }, [isOpen]);

    // Close on outside click
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
                setIsOpen(false);
                setSearch(value || '');
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [value]);

    const filteredOptions = useMemo(() => {
        const term = (search || '').toLowerCase().trim();
        if (!term) return options.slice(0, 80);
        return options.filter(opt => {
            const name = (opt[labelField] || '').toLowerCase();
            const sub = (opt[subField] || '').toLowerCase();
            return name.includes(term) || sub.includes(term);
        }).slice(0, 80);
    }, [options, search, labelField, subField]);

    const handleSelect = (opt) => {
        const selectedVal = opt[labelField];
        onChange(selectedVal, opt);
        setSearch(selectedVal);
        setIsOpen(false);
    };

    return (
        <div ref={wrapperRef} className={`relative w-full ${isOpen ? 'z-50' : 'z-auto'} ${className}`}>
            <div className="relative">
                <input
                    type="text"
                    value={search}
                    disabled={disabled}
                    onChange={(e) => {
                        setSearch(e.target.value);
                        setIsOpen(true);
                    }}
                    onFocus={() => setIsOpen(true)}
                    placeholder={placeholder}
                    className="w-full px-3 py-2 pr-8 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all disabled:bg-slate-50 disabled:text-slate-400"
                />
                <button
                    type="button"
                    disabled={disabled}
                    onClick={() => setIsOpen(!isOpen)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 disabled:opacity-40"
                >
                    <ChevronDown className="w-3.5 h-3.5" />
                </button>
            </div>

            {isOpen && (
                <div
                    className={`absolute left-0 right-0 ${
                        openUpwards ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
                    } min-w-[260px] max-h-60 overflow-y-auto bg-white rounded-xl shadow-2xl border border-slate-200 z-50 py-1 text-xs divide-y divide-slate-100 animate-in fade-in duration-100`}
                >
                    {filteredOptions.length > 0 ? (
                        filteredOptions.map((opt, i) => {
                            const isSelected = opt[labelField] === value;
                            return (
                                <button
                                    key={opt.id || opt.name || i}
                                    type="button"
                                    onClick={() => handleSelect(opt)}
                                    className={`w-full text-left px-3 py-2 hover:bg-blue-50/60 transition-colors flex items-center justify-between gap-2 ${
                                        isSelected ? 'bg-blue-50 text-blue-900 font-black' : 'text-slate-800'
                                    }`}
                                >
                                    <div className="min-w-0 flex-1">
                                        <p className="font-bold truncate text-xs">{opt[labelField]}</p>
                                        {opt[subField] && (
                                            <p className="text-[10px] text-slate-400 font-medium truncate mt-0.5">
                                                {opt[subField]}
                                            </p>
                                        )}
                                    </div>
                                    <div className="text-right shrink-0 flex items-center gap-1.5">
                                        {extraBadgeField && opt[extraBadgeField] && (
                                            <span className="text-[9px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-mono font-semibold">
                                                {opt[extraBadgeField]}
                                            </span>
                                        )}
                                        {isSelected && <Check className="w-3.5 h-3.5 text-blue-600 shrink-0" />}
                                    </div>
                                </button>
                            );
                        })
                    ) : (
                        <div className="px-3 py-4 text-center text-slate-400 font-medium">
                            No matching accounts found in Tally.
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ─────────────────────────────────────────────────────────
// MAIN TALLY ENTRY TAB COMPONENT
// ─────────────────────────────────────────────────────────
export default function TallyEntryTab() {
    // ── Connection & Company State ──
    const [tallyUrl] = useState(() => getSavedTallyUrl());
    const [connectionStatus, setConnectionStatus] = useState('idle'); // 'idle' | 'connected' | 'error'
    const [companies, setCompanies] = useState([]);
    const [selectedCompany, setSelectedCompany] = useState(() => getSavedCompany());

    // ── Master Datasets (Strictly existing from Tally) ──
    const [masters, setMasters] = useState(() => getCachedMasters().data || []);
    const [items, setItems] = useState(() => getCachedStockItems().data || []);
    const [refreshingMasters, setRefreshingMasters] = useState(false);
    const [masterRefreshResult, setMasterRefreshResult] = useState('');

    // ── Active Voucher Mode ──
    // 'Payment' | 'Receipt' | 'Contra' | 'Journal' | 'Sales' | 'Purchase'
    const [voucherType, setVoucherType] = useState('Payment');

    // ── General Header Fields ──
    const [txnDate, setTxnDate] = useState(() => new Date().toISOString().slice(0, 10));
    const [voucherNumber, setVoucherNumber] = useState('');
    const [reference, setReference] = useState('');
    const [referenceDate, setReferenceDate] = useState(() => new Date().toISOString().slice(0, 10));
    const [narration, setNarration] = useState('');

    // ── Mode 1: Accounting Voucher Lines (Payment, Receipt, Contra, Journal) ──
    const [accountingEntries, setAccountingEntries] = useState([
        { id: 1, type: 'Dr', ledgerName: '', amount: '' },
        { id: 2, type: 'Cr', ledgerName: '', amount: '' },
    ]);

    // ── Mode 2: Item Invoice Fields (Sales & Purchase) ──
    const [invoiceModeType, setInvoiceModeType] = useState('item'); // 'item' (Item Invoice) | 'voucher' (As Voucher / Dr-Cr)
    const [invoicePartyLedger, setInvoicePartyLedger] = useState('');
    const [invoiceAccountLedger, setInvoiceAccountLedger] = useState('');
    const [invoiceItems, setInvoiceItems] = useState([
        { id: 1, itemName: '', qty: '1', unit: '', rate: '', amount: '' },
    ]);
    const [additionalLedgers, setAdditionalLedgers] = useState([]);

    // ── Submission State ──
    const [isPosting, setIsPosting] = useState(false);
    const [postResult, setPostResult] = useState(null); // { success: boolean, message: string, error?: string }
    const [showXmlPreview, setShowXmlPreview] = useState(false);
    const [xmlPreviewPayload, setXmlPreviewPayload] = useState('');

    // ── Posting History (Current Session) ──
    const [postingHistory, setPostingHistory] = useState([]);

    // ── Initial Connection & Watcher Effect ──
    useEffect(() => {
        let isMounted = true;
        const checkConn = async () => {
            try {
                const res = await testConnection(tallyUrl);
                if (!isMounted) return;
                if (res.connected) {
                    setConnectionStatus('connected');
                    const openCos = res.companies || [];
                    setCompanies(openCos);
                    if (openCos.length === 0) {
                        setSelectedCompany('');
                        saveCompany('');
                    } else if (!selectedCompany || !openCos.includes(selectedCompany)) {
                        setSelectedCompany(openCos[0]);
                        saveCompany(openCos[0]);
                    }
                } else {
                    setConnectionStatus('error');
                }
            } catch {
                if (isMounted) setConnectionStatus('error');
            }
        };

        checkConn();
        const intervalId = setInterval(checkConn, 5000);
        return () => {
            isMounted = false;
            clearInterval(intervalId);
        };
    }, [tallyUrl, selectedCompany]);

    // ── Auto-Refresh Masters when Company changes ──
    const handleRefreshMasters = async () => {
        if (!selectedCompany) {
            setMasterRefreshResult('⚠️ Open a company in Tally first.');
            return;
        }
        setRefreshingMasters(true);
        setMasterRefreshResult('');
        try {
            const [mList, iList] = await Promise.all([
                fetchLedgerMasters(selectedCompany, tallyUrl),
                fetchStockItems(selectedCompany, tallyUrl),
            ]);
            cacheMasters(mList);
            cacheStockItems(iList);
            setMasters(mList);
            setItems(iList);
            setMasterRefreshResult(`✅ Refreshed: ${mList.length} ledgers & ${iList.length} items loaded from ${selectedCompany}.`);
        } catch (err) {
            setMasterRefreshResult(`❌ Failed to refresh masters: ${err.message}`);
        } finally {
            setRefreshingMasters(false);
        }
    };

    // If masters are empty on mount and company is connected, load them
    useEffect(() => {
        let isCancelled = false;
        if (connectionStatus === 'connected' && selectedCompany && masters.length === 0) {
            (async () => {
                try {
                    const [mList, iList] = await Promise.all([
                        fetchLedgerMasters(selectedCompany, tallyUrl),
                        fetchStockItems(selectedCompany, tallyUrl),
                    ]);
                    if (isCancelled) return;
                    cacheMasters(mList);
                    cacheStockItems(iList);
                    setMasters(mList);
                    setItems(iList);
                } catch {
                    // silent fallback
                }
            })();
        }
        return () => { isCancelled = true; };
    }, [connectionStatus, selectedCompany, tallyUrl, masters.length]);

    // ── Categorized Ledgers for Smart Suggestions ──
    const { bankCashLedgers, partyLedgers, salesLedgers, purchaseLedgers } = useMemo(() => {
        const bankCash = [];
        const party = [];
        const debtors = [];
        const creditors = [];
        const sales = [];
        const purchase = [];

        masters.forEach(m => {
            const g = (m.group || '').toLowerCase();
            if (g.includes('bank') || g.includes('cash')) {
                bankCash.push(m);
            }
            if (g.includes('debtor') || g.includes('creditor')) {
                party.push(m);
            }
            if (g.includes('debtor')) {
                debtors.push(m);
            }
            if (g.includes('creditor')) {
                creditors.push(m);
            }
            if (g.includes('sales')) {
                sales.push(m);
            }
            if (g.includes('purchase')) {
                purchase.push(m);
            }
        });

        return {
            bankCashLedgers: bankCash,
            partyLedgers: party,
            debtorLedgers: debtors,
            creditorLedgers: creditors,
            salesLedgers: sales,
            purchaseLedgers: purchase,
        };
    }, [masters]);

    // Handle switching voucher type with intelligent defaults
    const handleSelectVoucherType = (newType) => {
        setVoucherType(newType);
        setPostResult(null);

        if (newType === 'Sales') {
            const defSales = salesLedgers[0]?.name || '';
            const defParty = debtorLedgers[0]?.name || partyLedgers[0]?.name || '';
            if (defSales && !invoiceAccountLedger) setInvoiceAccountLedger(defSales);
            if (defParty && !invoicePartyLedger) setInvoicePartyLedger(defParty);
            setAccountingEntries([
                { id: 1, type: 'Dr', ledgerName: invoicePartyLedger || defParty, amount: '' },
                { id: 2, type: 'Cr', ledgerName: invoiceAccountLedger || defSales, amount: '' }
            ]);
        } else if (newType === 'Purchase') {
            const defPur = purchaseLedgers[0]?.name || '';
            const defParty = creditorLedgers[0]?.name || partyLedgers[0]?.name || '';
            if (defPur && !invoiceAccountLedger) setInvoiceAccountLedger(defPur);
            if (defParty && !invoicePartyLedger) setInvoicePartyLedger(defParty);
            setAccountingEntries([
                { id: 1, type: 'Dr', ledgerName: invoiceAccountLedger || defPur, amount: '' },
                { id: 2, type: 'Cr', ledgerName: invoicePartyLedger || defParty, amount: '' }
            ]);
        } else if (newType === 'Payment') {
            setAccountingEntries(prev => [
                { id: 1, type: 'Dr', ledgerName: prev[0]?.ledgerName || '', amount: prev[0]?.amount || '' },
                { id: 2, type: 'Cr', ledgerName: prev[1]?.ledgerName || (bankCashLedgers[0]?.name || ''), amount: prev[1]?.amount || '' }
            ]);
        } else if (newType === 'Receipt') {
            setAccountingEntries(prev => [
                { id: 1, type: 'Dr', ledgerName: prev[0]?.ledgerName || (bankCashLedgers[0]?.name || ''), amount: prev[0]?.amount || '' },
                { id: 2, type: 'Cr', ledgerName: prev[1]?.ledgerName || '', amount: prev[1]?.amount || '' }
            ]);
        } else if (newType === 'Contra') {
            setAccountingEntries(prev => [
                { id: 1, type: 'Dr', ledgerName: prev[0]?.ledgerName || (bankCashLedgers[0]?.name || ''), amount: prev[0]?.amount || '' },
                { id: 2, type: 'Cr', ledgerName: prev[1]?.ledgerName || (bankCashLedgers[1]?.name || bankCashLedgers[0]?.name || ''), amount: prev[1]?.amount || '' }
            ]);
        }
    };

    // ── Date Helper for Tally (especially Educational Mode) ──
    const setDateToDay = (targetDay) => {
        const parts = (txnDate || new Date().toISOString().slice(0, 10)).split('-');
        const year = parts[0] || '2024';
        const month = parts[1] || '04';
        const day = String(targetDay).padStart(2, '0');
        setTxnDate(`${year}-${month}-${day}`);
    };

    // ── Accounting Voucher Calculations ──
    const { totalDebit, totalCredit, balanceDiff, isBalanced } = useMemo(() => {
        let dr = 0;
        let cr = 0;
        accountingEntries.forEach(e => {
            const val = parseFloat(e.amount) || 0;
            if (e.type === 'Dr') dr += val;
            else cr += val;
        });
        const diff = Math.round((dr - cr) * 100) / 100;
        return {
            totalDebit: dr,
            totalCredit: cr,
            balanceDiff: diff,
            isBalanced: Math.abs(diff) < 0.01 && dr > 0,
        };
    }, [accountingEntries]);

    // ── Invoice Calculations ──
    const { invoiceItemsTotal, invoiceAdditionalTotal, invoiceGrandTotal } = useMemo(() => {
        let itemsSum = 0;
        invoiceItems.forEach(item => {
            const q = parseFloat(item.qty) || 0;
            const r = parseFloat(item.rate) || 0;
            const a = parseFloat(item.amount) || (q * r);
            itemsSum += a;
        });

        let addSum = 0;
        additionalLedgers.forEach(add => {
            const a = parseFloat(add.amount) || 0;
            if (add.type === 'Sub') addSum -= a;
            else addSum += a;
        });

        return {
            invoiceItemsTotal: itemsSum,
            invoiceAdditionalTotal: addSum,
            invoiceGrandTotal: Math.max(0, itemsSum + addSum),
        };
    }, [invoiceItems, additionalLedgers]);

    // ── Accounting Row Actions ──
    const handleAddAccountingRow = (defaultType = 'Dr') => {
        setAccountingEntries(prev => [
            ...prev,
            { id: Date.now(), type: defaultType, ledgerName: '', amount: '' }
        ]);
    };

    const handleRemoveAccountingRow = (id) => {
        if (accountingEntries.length <= 2) {
            alert('A voucher must have at least 2 entries (one Debit and one Credit).');
            return;
        }
        setAccountingEntries(prev => prev.filter(e => e.id !== id));
    };

    const handleUpdateAccountingRow = (id, field, val) => {
        setAccountingEntries(prev => prev.map(e => {
            if (e.id === id) {
                return { ...e, [field]: val };
            }
            return e;
        }));
    };

    const handleAutoBalance = () => {
        if (balanceDiff === 0) return;
        const absDiff = Math.abs(balanceDiff);
        const neededType = balanceDiff > 0 ? 'Cr' : 'Dr';

        // Check if last row is empty, fill it; otherwise append new row
        const lastRow = accountingEntries[accountingEntries.length - 1];
        if (lastRow && !lastRow.ledgerName && (!lastRow.amount || parseFloat(lastRow.amount) === 0)) {
            handleUpdateAccountingRow(lastRow.id, 'type', neededType);
            handleUpdateAccountingRow(lastRow.id, 'amount', absDiff.toFixed(2));
        } else {
            setAccountingEntries(prev => [
                ...prev,
                { id: Date.now(), type: neededType, ledgerName: '', amount: absDiff.toFixed(2) }
            ]);
        }
    };

    // ── Invoice Row Actions ──
    const handleAddInvoiceItem = () => {
        setInvoiceItems(prev => [
            ...prev,
            { id: Date.now(), itemName: '', qty: '1', unit: '', rate: '', amount: '' }
        ]);
    };

    const handleRemoveInvoiceItem = (id) => {
        if (invoiceItems.length <= 1) {
            alert('An invoice must contain at least one item.');
            return;
        }
        setInvoiceItems(prev => prev.filter(item => item.id !== id));
    };

    const handleUpdateInvoiceItem = (id, field, val, fullItemObj = null) => {
        setInvoiceItems(prev => prev.map(item => {
            if (item.id === id) {
                const updated = { ...item, [field]: val };
                if (fullItemObj) {
                    updated.unit = (fullItemObj.baseUnits && fullItemObj.baseUnits !== '-') ? fullItemObj.baseUnits : (updated.unit || '');
                    if (!updated.rate && fullItemObj.closingRate) {
                        const parsedRate = parseFloat(fullItemObj.closingRate.replace(/[^0-9.]/g, '')) || 0;
                        if (parsedRate > 0) updated.rate = parsedRate.toString();
                    }
                }
                if (field === 'qty' || field === 'rate') {
                    const q = parseFloat(field === 'qty' ? val : updated.qty) || 0;
                    const r = parseFloat(field === 'rate' ? val : updated.rate) || 0;
                    updated.amount = (q * r).toFixed(2);
                }
                return updated;
            }
            return item;
        }));
    };

    // ── Additional Charge / Tax Actions ──
    const handleAddAdditionalCharge = () => {
        setAdditionalLedgers(prev => [
            ...prev,
            { id: Date.now(), ledgerName: '', type: 'Add', amount: '' }
        ]);
    };

    const handleRemoveAdditionalCharge = (id) => {
        setAdditionalLedgers(prev => prev.filter(add => add.id !== id));
    };

    const handleUpdateAdditionalCharge = (id, field, val) => {
        setAdditionalLedgers(prev => prev.map(add => {
            if (add.id === id) return { ...add, [field]: val };
            return add;
        }));
    };

    // ── Build Current Payload Object ──
    const buildCurrentPayload = () => {
        const isInvoice = (voucherType === 'Sales' || voucherType === 'Purchase') && invoiceModeType === 'item';
        if (isInvoice) {
            return {
                mode: 'invoice',
                type: voucherType,
                date: txnDate,
                voucherNumber: voucherNumber.trim(),
                reference: reference.trim(),
                referenceDate: referenceDate ? referenceDate.trim() : '',
                partyLedger: invoicePartyLedger,
                accountLedger: invoiceAccountLedger,
                narration: narration.trim(),
                items: invoiceItems.map(i => ({
                    itemName: i.itemName,
                    qty: parseFloat(i.qty) || 1,
                    unit: i.unit,
                    rate: parseFloat(i.rate) || 0,
                    amount: parseFloat(i.amount) || ((parseFloat(i.qty) || 1) * (parseFloat(i.rate) || 0)),
                })),
                additionalLedgers: additionalLedgers.filter(a => a.ledgerName && parseFloat(a.amount) > 0),
            };
        }

        return {
            mode: 'accounting',
            type: voucherType,
            date: txnDate,
            voucherNumber: voucherNumber.trim(),
            reference: reference.trim(),
            referenceDate: referenceDate ? referenceDate.trim() : '',
            narration: narration.trim(),
            entries: accountingEntries.map(e => ({
                type: e.type,
                ledgerName: e.ledgerName,
                amount: parseFloat(e.amount) || 0,
            })),
        };
    };

    // ── Validate Before Post ──
    const validateEntry = () => {
        if (connectionStatus !== 'connected' || companies.length === 0 || !selectedCompany) {
            return 'Cannot post: No company is currently open in TallyPrime. Open your company first.';
        }

        if (!txnDate) return 'Please specify a transaction date.';

        const isInvoice = (voucherType === 'Sales' || voucherType === 'Purchase') && invoiceModeType === 'item';

        if (isInvoice) {
            if (!invoicePartyLedger) return `Please select a Party (${voucherType === 'Sales' ? 'Customer' : 'Supplier'}) account.`;
            if (!invoiceAccountLedger) return `Please select a ${voucherType} account.`;
            if (invoiceItems.length === 0) return 'Invoice must have at least one item.';
            for (let i = 0; i < invoiceItems.length; i++) {
                const itm = invoiceItems[i];
                if (!itm.itemName) return `Item row #${i + 1} has no item selected.`;
                if (!itm.qty || parseFloat(itm.qty) <= 0) return `Item "${itm.itemName}" must have a quantity > 0.`;
                if (!itm.rate || parseFloat(itm.rate) <= 0) return `Item "${itm.itemName}" must have a rate > 0.`;
            }
        } else {
            // Accounting Voucher Validation
            for (let i = 0; i < accountingEntries.length; i++) {
                const entry = accountingEntries[i];
                if (!entry.ledgerName) return `Line #${i + 1} has no ledger account selected.`;
                if (!entry.amount || parseFloat(entry.amount) <= 0) return `Line #${i + 1} (${entry.ledgerName}) must have an amount > 0.`;
            }
            if (!isBalanced) {
                return `Total Debits (₹${fmtCur(totalDebit)}) must equal Total Credits (₹${fmtCur(totalCredit)}). Difference: ₹${fmtCur(balanceDiff)}.`;
            }
        }

        return null;
    };

    // ── Post to Tally Handler ──
    const handlePostToTally = async () => {
        const error = validateEntry();
        if (error) {
            setPostResult({ success: false, error });
            return;
        }

        const payload = buildCurrentPayload();
        setIsPosting(true);
        setPostResult(null);

        try {
            const res = await postVoucherToTally(payload, selectedCompany, tallyUrl);
            setPostResult(res);

            if (res.success) {
                // Record in session history
                const isInvoice = payload.mode === 'invoice';
                const summaryParty = isInvoice
                    ? payload.partyLedger
                    : payload.entries.find(e => e.type === (payload.type === 'Payment' || payload.type === 'Sales' ? 'Dr' : 'Cr'))?.ledgerName || 'Multiple';
                const summaryAmount = isInvoice
                    ? invoiceGrandTotal
                    : totalDebit;

                const historyItem = {
                    id: Date.now(),
                    timestamp: new Date().toLocaleTimeString(),
                    type: payload.type,
                    voucherNumber: payload.voucherNumber || 'Auto',
                    party: summaryParty,
                    amount: summaryAmount,
                    status: 'success',
                    message: res.message,
                    payload,
                };
                setPostingHistory(prev => [historyItem, ...prev]);

                // Reset amounts & invoice items for next entry (keep date & company)
                if (isInvoice) {
                    setInvoiceItems([{ id: Date.now(), itemName: '', qty: '1', unit: '', rate: '', amount: '' }]);
                    setAdditionalLedgers([]);
                    setVoucherNumber('');
                    setReference('');
                    setReferenceDate(txnDate);
                    setNarration('');
                } else {
                    setAccountingEntries(prev => prev.map(e => ({ ...e, amount: '' })));
                    setVoucherNumber('');
                    setReference('');
                    setReferenceDate(txnDate);
                    setNarration('');
                }
            }
        } catch (err) {
            setPostResult({
                success: false,
                error: err.message || 'Failed to post voucher to TallyPrime.',
            });
        } finally {
            setIsPosting(false);
        }
    };

    // ── Generate XML Preview ──
    const handleOpenXmlPreview = () => {
        const payload = buildCurrentPayload();
        const xml = payload.mode === 'invoice'
            ? buildInvoiceVoucherXML(payload, selectedCompany)
            : buildAccountingVoucherXML(payload, selectedCompany);
        setXmlPreviewPayload(xml);
        setShowXmlPreview(true);
    };

    const isInvoiceMode = (voucherType === 'Sales' || voucherType === 'Purchase') && invoiceModeType === 'item';

    // ════════════════════════════════════════════════════════
    // RENDER UI
    // ════════════════════════════════════════════════════════
    return (
        <div className="flex flex-col min-h-0 flex-1 gap-3 sm:gap-4 overflow-hidden">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col flex-1 min-h-0 overflow-hidden">
                
                {/* ═══ TOP INTEGRATED CONTROL HEADER ═══ */}
                <div className="px-4 py-3 sm:px-5 sm:py-3.5 border-b border-gray-100 bg-white shrink-0 relative z-20 flex flex-col gap-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2.5">
                        {/* Left: Tally Status & Active Company */}
                        <div className="flex items-center gap-2 flex-wrap">
                            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-2xs ${
                                connectionStatus === 'connected'
                                    ? companies.length === 0
                                        ? 'bg-amber-50 text-amber-800 border border-amber-300/80'
                                        : 'bg-emerald-50 text-emerald-700 border border-emerald-200/80'
                                    : 'bg-slate-50 text-slate-600 border border-slate-200/80'
                            }`}>
                                {connectionStatus === 'connected' ? (
                                    companies.length === 0 ? (
                                        <>
                                            <span className="relative flex h-2 w-2">
                                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                                                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                                            </span>
                                            <span>Tally Online · No Company Open</span>
                                        </>
                                    ) : (
                                        <>
                                            <span className="relative flex h-2 w-2">
                                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                                            </span>
                                            <span>TallyPrime Connected</span>
                                        </>
                                    )
                                ) : (
                                    <>
                                        <AlertTriangle className="w-3.5 h-3.5 text-slate-400" />
                                        <span>Tally Offline</span>
                                    </>
                                )}
                            </div>

                            {/* Active Company Badge */}
                            {selectedCompany ? (
                                <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200/90 rounded-xl px-2.5 py-1 text-xs font-bold text-slate-800 shadow-2xs">
                                    <Building2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                                    <span className="max-w-[200px] truncate">{selectedCompany}</span>
                                </div>
                            ) : null}

                            {/* Existing Masters Badge */}
                            <div className="hidden sm:flex items-center gap-1.5 bg-slate-100/80 px-2.5 py-1 rounded-xl text-[11px] font-bold text-slate-600">
                                <FileSpreadsheet className="w-3.5 h-3.5 text-slate-400" />
                                <span>{masters.length} Ledgers · {items.length} Items</span>
                            </div>
                        </div>

                        {/* Right: Master Refresh & XML Preview Actions */}
                        <div className="flex items-center gap-2 flex-wrap ml-auto">
                            <button
                                type="button"
                                onClick={handleRefreshMasters}
                                disabled={refreshingMasters || !selectedCompany}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 disabled:opacity-40 text-blue-700 border border-blue-200 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                                title="Fetch latest existing accounts and stock items from Tally"
                            >
                                <RefreshCw className={`w-3.5 h-3.5 ${refreshingMasters ? 'animate-spin' : ''}`} />
                                <span className="hidden sm:inline">{refreshingMasters ? 'Refreshing...' : 'Refresh Masters'}</span>
                            </button>

                            <button
                                type="button"
                                onClick={handleOpenXmlPreview}
                                className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                                title="View raw XML envelope that will be sent to Tally"
                            >
                                <Code className="w-3.5 h-3.5 text-slate-500" />
                                <span className="hidden sm:inline">Inspect XML</span>
                            </button>
                        </div>
                    </div>

                    {/* Lower Row: Voucher Type Switcher */}
                    <div className="flex items-center justify-between border-t border-slate-100 pt-2 gap-2 overflow-x-auto">
                        <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 mr-1 hidden lg:inline">Type:</span>
                            
                            {/* Accounting Vouchers */}
                            {[
                                { type: 'Payment', label: 'Payment', icon: CreditCard, color: 'text-rose-600', activeBg: 'bg-rose-600' },
                                { type: 'Receipt', label: 'Receipt', icon: Landmark, color: 'text-emerald-600', activeBg: 'bg-emerald-600' },
                                { type: 'Contra', label: 'Contra', icon: ArrowRightLeft, color: 'text-indigo-600', activeBg: 'bg-indigo-600' },
                                { type: 'Journal', label: 'Journal', icon: FileText, color: 'text-amber-600', activeBg: 'bg-amber-600' },
                            ].map(({ type, label, icon: Icon, activeBg }) => (
                                <button
                                    key={type}
                                    type="button"
                                    onClick={() => handleSelectVoucherType(type)}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
                                        voucherType === type
                                            ? `${activeBg} text-white shadow-xs`
                                            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                                    }`}
                                >
                                    <Icon className="w-3.5 h-3.5" />
                                    <span>{label}</span>
                                </button>
                            ))}

                            <span className="text-slate-200 mx-1">|</span>

                            {/* Invoices */}
                            {[
                                { type: 'Sales', label: 'Sales Invoice', icon: ShoppingCart, activeBg: 'bg-blue-600' },
                                { type: 'Purchase', label: 'Purchase Invoice', icon: Package, activeBg: 'bg-purple-600' },
                            ].map(({ type, label, icon: Icon, activeBg }) => (
                                <button
                                    key={type}
                                    type="button"
                                    onClick={() => handleSelectVoucherType(type)}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
                                        voucherType === type
                                            ? `${activeBg} text-white shadow-xs`
                                            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                                    }`}
                                >
                                    <Icon className="w-3.5 h-3.5" />
                                    <span>{label}</span>
                                </button>
                            ))}

                            {/* Mode Switcher for Sales & Purchase: Item Invoice vs As Voucher */}
                            {(voucherType === 'Sales' || voucherType === 'Purchase') && (
                                <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-xl border border-slate-200 shrink-0 ml-1">
                                    <button
                                        type="button"
                                        onClick={() => setInvoiceModeType('item')}
                                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                                            invoiceModeType === 'item'
                                                ? 'bg-white shadow-2xs text-blue-700 font-black'
                                                : 'text-slate-600 hover:text-slate-900'
                                        }`}
                                    >
                                        <Package className="w-3.5 h-3.5" />
                                        <span>Item Invoice</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setInvoiceModeType('voucher');
                                            if (voucherType === 'Sales') {
                                                setAccountingEntries([
                                                    { id: 1, type: 'Dr', ledgerName: invoicePartyLedger || debtorLedgers[0]?.name || partyLedgers[0]?.name || '', amount: '' },
                                                    { id: 2, type: 'Cr', ledgerName: invoiceAccountLedger || salesLedgers[0]?.name || '', amount: '' }
                                                ]);
                                            } else {
                                                setAccountingEntries([
                                                    { id: 1, type: 'Dr', ledgerName: invoiceAccountLedger || purchaseLedgers[0]?.name || '', amount: '' },
                                                    { id: 2, type: 'Cr', ledgerName: invoicePartyLedger || creditorLedgers[0]?.name || partyLedgers[0]?.name || '', amount: '' }
                                                ]);
                                            }
                                        }}
                                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                                            invoiceModeType === 'voucher'
                                                ? 'bg-white shadow-2xs text-blue-700 font-black'
                                                : 'text-slate-600 hover:text-slate-900'
                                        }`}
                                    >
                                        <ArrowRightLeft className="w-3.5 h-3.5" />
                                        <span>As Voucher (Dr/Cr)</span>
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* ═══ MAIN SCROLLABLE FORM WORKSPACE ═══ */}
                <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 bg-slate-50/50 space-y-5">
                    
                    {/* Prompt: When Tally is connected but NO company is loaded */}
                    {connectionStatus === 'connected' && companies.length === 0 && (
                        <div className="bg-amber-50/90 border-2 border-amber-300 rounded-2xl p-4 flex items-center justify-between gap-3 text-amber-900">
                            <div className="flex items-center gap-3">
                                <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
                                <div className="text-xs">
                                    <p className="font-extrabold text-sm">No Company Open in TallyPrime</p>
                                    <p className="mt-0.5 text-amber-800">
                                        Please open your company in TallyPrime (<kbd className="bg-white border border-amber-300 px-1.5 py-0.5 rounded text-[10px] font-bold">F3 &gt; Select Company</kbd>). You can prepare your voucher now, and submit once opened.
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Refresh feedback toast/message */}
                    {masterRefreshResult && (
                        <div className={`p-3 rounded-xl border text-xs font-bold flex items-center justify-between ${
                            masterRefreshResult.startsWith('✅') ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'
                        }`}>
                            <span>{masterRefreshResult}</span>
                            <button type="button" onClick={() => setMasterRefreshResult('')} className="p-1 text-slate-400 hover:text-slate-600">
                                <X className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    )}

                    {/* Result alert after posting */}
                    {postResult && (
                        <div className={`p-4 rounded-2xl border flex items-start gap-3 shadow-xs animate-in fade-in duration-150 ${
                            postResult.success
                                ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                                : 'bg-rose-50 border-rose-300 text-rose-900'
                        }`}>
                            {postResult.success ? (
                                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                            ) : (
                                <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                            )}
                            <div className="flex-1 text-xs">
                                <p className="font-extrabold text-sm">
                                    {postResult.success ? 'Voucher Posted Successfully to TallyPrime!' : 'Tally Rejected Voucher Entry'}
                                </p>
                                <p className="mt-1 font-medium leading-relaxed whitespace-pre-line">
                                    {postResult.success ? postResult.message : postResult.error}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setPostResult(null)}
                                className="p-1 text-slate-400 hover:text-slate-700"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    )}

                    {/* ───────────────────────────────────────────────────────── */}
                    {/* FORM SECTION 1: COMMON HEADER FIELDS                      */}
                    {/* ───────────────────────────────────────────────────────── */}
                    <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                                <Sparkles className="w-4 h-4 text-blue-600" />
                                <span>{voucherType} Voucher Header</span>
                            </h3>
                            <span className="text-[11px] font-bold text-slate-400">
                                Target Company: <strong className="text-slate-700">{selectedCompany || 'None'}</strong>
                            </span>
                        </div>

                        {voucherType === 'Purchase' ? (
                            /* ── Purchase Voucher Header (Supplier Invoice & Date - Tally Standard) ── */
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                {/* 1. Supplier Invoice No */}
                                <div>
                                    <label className="block text-[11px] font-extrabold text-purple-900 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                                        <span>Supplier Invoice No *</span>
                                        <span className="text-[9px] font-bold bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded font-mono">Bill No</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={reference}
                                        onChange={(e) => setReference(e.target.value)}
                                        placeholder="e.g. INV-2024-8891"
                                        className="w-full px-3 py-2 bg-purple-50/40 border border-purple-200 rounded-xl text-xs font-bold text-slate-900 placeholder-slate-400 focus:bg-white focus:ring-2 focus:ring-purple-500 transition-colors"
                                    />
                                    <p className="text-[10px] text-slate-400 font-medium mt-1">Vendor's original bill/invoice number</p>
                                </div>

                                {/* 2. Supplier Invoice Date */}
                                <div>
                                    <label className="block text-[11px] font-extrabold text-purple-900 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                                        <span>Supplier Invoice Date *</span>
                                        <span className="text-[9px] font-bold bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded font-mono">Bill Date</span>
                                    </label>
                                    <input
                                        type="date"
                                        value={referenceDate}
                                        onChange={(e) => setReferenceDate(e.target.value)}
                                        className="w-full px-3 py-2 bg-purple-50/40 border border-purple-200 rounded-xl text-xs font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-purple-500 transition-colors"
                                    />
                                    <div className="flex items-center gap-1.5 mt-1">
                                        <button
                                            type="button"
                                            onClick={() => setReferenceDate(txnDate)}
                                            className="text-[10px] font-bold text-purple-600 hover:text-purple-800 transition-colors cursor-pointer"
                                        >
                                            Same as Voucher Date
                                        </button>
                                    </div>
                                </div>

                                {/* 3. Voucher Date (Books) */}
                                <div>
                                    <label className="block text-[11px] font-extrabold text-slate-600 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                                        <span>Voucher Date (Books) *</span>
                                        <span className="text-[9px] font-bold bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-mono">Tally Date</span>
                                    </label>
                                    <input
                                        type="date"
                                        value={txnDate}
                                        onChange={(e) => setTxnDate(e.target.value)}
                                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-blue-500"
                                    />
                                    <div className="flex items-center gap-1.5 mt-1.5">
                                        <span className="text-[10px] text-slate-400 font-bold">Edu:</span>
                                        <button
                                            type="button"
                                            onClick={() => setDateToDay(1)}
                                            className="px-1.5 py-0.5 rounded text-[10px] font-black bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 transition-colors"
                                            title="1st of month"
                                        >
                                            1st
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setDateToDay(2)}
                                            className="px-1.5 py-0.5 rounded text-[10px] font-black bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 transition-colors"
                                            title="2nd of month"
                                        >
                                            2nd
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setTxnDate(new Date().toISOString().slice(0, 10))}
                                            className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors"
                                        >
                                            Today
                                        </button>
                                    </div>
                                </div>

                                {/* 4. Purchase Voucher Number */}
                                <div>
                                    <label className="block text-[11px] font-extrabold text-slate-500 uppercase tracking-wider mb-1.5">
                                        Purchase Voucher No
                                    </label>
                                    <input
                                        type="text"
                                        value={voucherNumber}
                                        onChange={(e) => setVoucherNumber(e.target.value)}
                                        placeholder="Leave empty for Auto-No"
                                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-blue-500"
                                    />
                                    <p className="text-[10px] text-slate-400 font-medium mt-1">Internal purchase voucher number</p>
                                </div>
                            </div>
                        ) : voucherType === 'Sales' ? (
                            /* ── Sales Voucher Header ── */
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                {/* 1. Voucher Date */}
                                <div>
                                    <label className="block text-[11px] font-extrabold text-slate-500 uppercase tracking-wider mb-1.5">
                                        Voucher Date *
                                    </label>
                                    <input
                                        type="date"
                                        value={txnDate}
                                        onChange={(e) => setTxnDate(e.target.value)}
                                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-blue-500"
                                    />
                                    <div className="flex items-center gap-1.5 mt-1.5">
                                        <span className="text-[10px] text-slate-400 font-bold">Edu:</span>
                                        <button
                                            type="button"
                                            onClick={() => setDateToDay(1)}
                                            className="px-1.5 py-0.5 rounded text-[10px] font-black bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 transition-colors"
                                        >
                                            1st
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setDateToDay(2)}
                                            className="px-1.5 py-0.5 rounded text-[10px] font-black bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 transition-colors"
                                        >
                                            2nd
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setTxnDate(new Date().toISOString().slice(0, 10))}
                                            className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors"
                                        >
                                            Today
                                        </button>
                                    </div>
                                </div>

                                {/* 2. Invoice / Voucher No */}
                                <div>
                                    <label className="block text-[11px] font-extrabold text-slate-500 uppercase tracking-wider mb-1.5">
                                        Invoice / Voucher No
                                    </label>
                                    <input
                                        type="text"
                                        value={voucherNumber}
                                        onChange={(e) => setVoucherNumber(e.target.value)}
                                        placeholder="Leave empty for Auto-No"
                                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-blue-500"
                                    />
                                    <p className="text-[10px] text-slate-400 font-medium mt-1">Leave empty for Tally Auto-No</p>
                                </div>

                                {/* 3. Buyer's Order / Ref No */}
                                <div>
                                    <label className="block text-[11px] font-extrabold text-slate-500 uppercase tracking-wider mb-1.5">
                                        Buyer's Order / Ref No
                                    </label>
                                    <input
                                        type="text"
                                        value={reference}
                                        onChange={(e) => setReference(e.target.value)}
                                        placeholder="e.g. PO-8901 / REF-12"
                                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-blue-500"
                                    />
                                    <p className="text-[10px] text-slate-400 font-medium mt-1">Customer purchase order number</p>
                                </div>

                                {/* 4. Order / Ref Date */}
                                <div>
                                    <label className="block text-[11px] font-extrabold text-slate-500 uppercase tracking-wider mb-1.5">
                                        Order / Ref Date
                                    </label>
                                    <input
                                        type="date"
                                        value={referenceDate}
                                        onChange={(e) => setReferenceDate(e.target.value)}
                                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-blue-500"
                                    />
                                    <div className="flex items-center gap-1.5 mt-1">
                                        <button
                                            type="button"
                                            onClick={() => setReferenceDate(txnDate)}
                                            className="text-[10px] font-bold text-blue-600 hover:text-blue-800 transition-colors cursor-pointer"
                                        >
                                            Same as Voucher Date
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            /* ── Payment / Receipt / Contra / Journal Header ── */
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                {/* Voucher Date */}
                                <div>
                                    <label className="block text-[11px] font-extrabold text-slate-500 uppercase tracking-wider mb-1.5">
                                        Voucher Date *
                                    </label>
                                    <input
                                        type="date"
                                        value={txnDate}
                                        onChange={(e) => setTxnDate(e.target.value)}
                                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-blue-500"
                                    />
                                    <div className="flex items-center gap-1.5 mt-1.5">
                                        <span className="text-[10px] text-slate-400 font-bold">Edu Mode:</span>
                                        <button
                                            type="button"
                                            onClick={() => setDateToDay(1)}
                                            className="px-2 py-0.5 rounded text-[10px] font-black bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 transition-colors"
                                            title="Set date to 1st of selected month (Required for Tally Educational Mode)"
                                        >
                                            1st
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setDateToDay(2)}
                                            className="px-2 py-0.5 rounded text-[10px] font-black bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 transition-colors"
                                            title="Set date to 2nd of selected month (Allowed in Tally Educational Mode)"
                                        >
                                            2nd
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setTxnDate(new Date().toISOString().slice(0, 10))}
                                            className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors"
                                        >
                                            Today
                                        </button>
                                    </div>
                                </div>

                                {/* Voucher Number */}
                                <div>
                                    <label className="block text-[11px] font-extrabold text-slate-500 uppercase tracking-wider mb-1.5">
                                        Voucher No (Optional)
                                    </label>
                                    <input
                                        type="text"
                                        value={voucherNumber}
                                        onChange={(e) => setVoucherNumber(e.target.value)}
                                        placeholder="Leave empty for Tally Auto-No"
                                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-blue-500"
                                    />
                                    <p className="text-[10px] text-slate-400 font-medium mt-1">Leave empty for auto numbering</p>
                                </div>

                                {/* Reference */}
                                <div>
                                    <label className="block text-[11px] font-extrabold text-slate-500 uppercase tracking-wider mb-1.5">
                                        Reference / Cheque No
                                    </label>
                                    <input
                                        type="text"
                                        value={reference}
                                        onChange={(e) => setReference(e.target.value)}
                                        placeholder="e.g. CHQ-9901 / PO-88"
                                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-blue-500"
                                    />
                                    <p className="text-[10px] text-slate-400 font-medium mt-1">Bank cheque no or transaction ID</p>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* ───────────────────────────────────────────────────────── */}
                    {/* FORM SECTION 2A: ACCOUNTING VOUCHERS (Payment/Receipt/etc) */}
                    {/* ───────────────────────────────────────────────────────── */}
                    {!isInvoiceMode && (
                        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-4">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                <div>
                                    <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                                        <ArrowRightLeft className="w-4 h-4 text-blue-600" />
                                        <span>Debit &amp; Credit Ledger Allocations</span>
                                    </h3>
                                    <p className="text-xs text-slate-500 font-medium">
                                        Select from existing Tally accounts. Total Debits must match Total Credits.
                                    </p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => handleAddAccountingRow('Dr')}
                                        className="flex items-center gap-1 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
                                    >
                                        <Plus className="w-3.5 h-3.5" />
                                        <span>Add Line</span>
                                    </button>
                                </div>
                            </div>

                            {/* Line Entries List */}
                            <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 shadow-2xs bg-white">
                                <div className="bg-slate-50 px-4 py-2.5 grid grid-cols-12 gap-3 text-[10px] font-black uppercase tracking-wider text-slate-500 rounded-t-xl">
                                    <div className="col-span-2 sm:col-span-1">Type</div>
                                    <div className="col-span-6 sm:col-span-7">Existing Ledger Account (from Tally)</div>
                                    <div className="col-span-3 sm:col-span-3 text-right">Amount (₹)</div>
                                    <div className="col-span-1 text-center"></div>
                                </div>

                                {accountingEntries.map((row) => {
                                    // Look up current balance of chosen ledger for user insight
                                    const matched = masters.find(m => m.name === row.ledgerName);
                                    const balanceText = matched && matched.openingBalance
                                        ? `Bal: ₹${fmtCur(matched.openingBalance)} ${matched.openingBalanceType || ''}`
                                        : '';

                                    return (
                                        <div key={row.id} className="px-4 py-2.5 grid grid-cols-12 gap-3 items-center hover:bg-blue-50/20 transition-colors relative focus-within:z-30">
                                            {/* Dr / Cr Selector */}
                                            <div className="col-span-2 sm:col-span-1">
                                                <select
                                                    value={row.type}
                                                    onChange={(e) => handleUpdateAccountingRow(row.id, 'type', e.target.value)}
                                                    className={`w-full py-1.5 px-2 rounded-lg font-black text-xs border text-center transition-colors ${
                                                        row.type === 'Dr'
                                                            ? 'bg-orange-50 border-orange-300 text-orange-700'
                                                            : 'bg-green-50 border-green-300 text-green-700'
                                                    }`}
                                                >
                                                    <option value="Dr">Dr</option>
                                                    <option value="Cr">Cr</option>
                                                </select>
                                            </div>

                                            {/* Ledger Combobox */}
                                            <div className="col-span-6 sm:col-span-7">
                                                <MasterCombobox
                                                    options={masters}
                                                    value={row.ledgerName}
                                                    onChange={(val) => handleUpdateAccountingRow(row.id, 'ledgerName', val)}
                                                    placeholder="Search existing ledger in Tally..."
                                                    labelField="name"
                                                    subField="group"
                                                    extraBadgeField="openingBalanceType"
                                                />
                                                {balanceText && (
                                                    <p className="text-[10px] text-slate-400 font-medium mt-0.5 ml-1">
                                                        {balanceText}
                                                    </p>
                                                )}
                                            </div>

                                            {/* Amount */}
                                            <div className="col-span-3 sm:col-span-3">
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    min="0"
                                                    value={row.amount}
                                                    onChange={(e) => handleUpdateAccountingRow(row.id, 'amount', e.target.value)}
                                                    placeholder="0.00"
                                                    className="w-full px-3 py-2 text-right bg-white border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-900 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                                />
                                            </div>

                                            {/* Delete Action */}
                                            <div className="col-span-1 text-center">
                                                <button
                                                    type="button"
                                                    onClick={() => handleRemoveAccountingRow(row.id)}
                                                    disabled={accountingEntries.length <= 2}
                                                    className="p-1.5 text-slate-400 hover:text-rose-600 disabled:opacity-20 transition-colors"
                                                    title="Remove Line"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Balance & Auto-Balance Bar */}
                            <div className="bg-slate-50 rounded-xl p-4 border border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                <div className="flex items-center gap-4 flex-wrap">
                                    <div>
                                        <p className="text-[10px] font-extrabold uppercase text-slate-400">Total Debit (Dr)</p>
                                        <p className="text-base font-black text-orange-700 font-mono">₹{fmtCur(totalDebit)}</p>
                                    </div>
                                    <div className="h-6 w-px bg-slate-200 hidden sm:block"></div>
                                    <div>
                                        <p className="text-[10px] font-extrabold uppercase text-slate-400">Total Credit (Cr)</p>
                                        <p className="text-base font-black text-green-700 font-mono">₹{fmtCur(totalCredit)}</p>
                                    </div>
                                    <div className="h-6 w-px bg-slate-200 hidden sm:block"></div>
                                    <div>
                                        <p className="text-[10px] font-extrabold uppercase text-slate-400">Difference</p>
                                        <span className={`text-xs font-black px-2 py-0.5 rounded-full inline-block mt-0.5 ${
                                            isBalanced
                                                ? 'bg-emerald-100 text-emerald-800'
                                                : 'bg-rose-100 text-rose-800'
                                        }`}>
                                            {isBalanced ? '✓ 0.00 (Balanced)' : `₹${fmtCur(balanceDiff)} (Unbalanced)`}
                                        </span>
                                    </div>
                                </div>

                                {!isBalanced && balanceDiff !== 0 && (
                                    <button
                                        type="button"
                                        onClick={handleAutoBalance}
                                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-colors shadow-2xs cursor-pointer flex items-center justify-center gap-1.5"
                                    >
                                        <Plus className="w-3.5 h-3.5" />
                                        <span>Auto-Balance (₹{fmtCur(Math.abs(balanceDiff))})</span>
                                    </button>
                                )}
                            </div>
                        </div>
                    )}

                    {/* ───────────────────────────────────────────────────────── */}
                    {/* FORM SECTION 2B: SALES / PURCHASE INVOICE FORM            */}
                    {/* ───────────────────────────────────────────────────────── */}
                    {isInvoiceMode && (
                        <div className="space-y-4">
                            {/* Parties & Account Ledgers */}
                            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs">
                                <h3 className="text-sm font-extrabold text-slate-900 mb-3 flex items-center gap-2">
                                    <Building2 className="w-4 h-4 text-blue-600" />
                                    <span>{voucherType} Party &amp; Account Selection</span>
                                </h3>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-[11px] font-extrabold text-slate-500 uppercase tracking-wider mb-1.5">
                                            {voucherType === 'Sales' ? 'Customer / Buyer (Party Ledger) *' : 'Supplier / Vendor (Party Ledger) *'}
                                        </label>
                                        <MasterCombobox
                                            options={partyLedgers.length > 0 ? partyLedgers : masters}
                                            value={invoicePartyLedger}
                                            onChange={(val) => setInvoicePartyLedger(val)}
                                            placeholder={`Select ${voucherType === 'Sales' ? 'Customer' : 'Supplier'} ledger...`}
                                            labelField="name"
                                            subField="group"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-[11px] font-extrabold text-slate-500 uppercase tracking-wider mb-1.5">
                                            {voucherType === 'Sales' ? 'Sales Ledger Account *' : 'Purchase Ledger Account *'}
                                        </label>
                                        <MasterCombobox
                                            options={voucherType === 'Sales' ? (salesLedgers.length > 0 ? salesLedgers : masters) : (purchaseLedgers.length > 0 ? purchaseLedgers : masters)}
                                            value={invoiceAccountLedger}
                                            onChange={(val) => setInvoiceAccountLedger(val)}
                                            placeholder={`Select ${voucherType} ledger (e.g. ${voucherType} A/c)...`}
                                            labelField="name"
                                            subField="group"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Inventory Item Rows */}
                            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-4">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                                            <Package className="w-4 h-4 text-indigo-600" />
                                            <span>Stock Items (from Tally Inventory)</span>
                                        </h3>
                                        <p className="text-xs text-slate-500 font-medium">
                                            Select existing stock items. Units and rates will auto-populate from Tally.
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleAddInvoiceItem}
                                        className="flex items-center gap-1 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
                                    >
                                        <Plus className="w-3.5 h-3.5" />
                                        <span>Add Item</span>
                                    </button>
                                </div>

                                <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 shadow-2xs bg-white">
                                    <div className="bg-slate-50 px-4 py-2.5 grid grid-cols-12 gap-3 text-[10px] font-black uppercase tracking-wider text-slate-500 rounded-t-xl">
                                        <div className="col-span-5">Stock Item Name</div>
                                        <div className="col-span-2 text-right">Quantity</div>
                                        <div className="col-span-2 text-right">Rate (₹)</div>
                                        <div className="col-span-2 text-right">Amount (₹)</div>
                                        <div className="col-span-1 text-center"></div>
                                    </div>

                                    {invoiceItems.map((item) => {
                                        const matchedStock = items.find(i => i.name === item.itemName);
                                        const stockInfo = matchedStock
                                            ? `Available: ${matchedStock.closingBalance || '0'} · Group: ${matchedStock.group || '-'}`
                                            : '';

                                        return (
                                            <div key={item.id} className="px-4 py-3 grid grid-cols-12 gap-3 items-center hover:bg-indigo-50/20 transition-colors relative focus-within:z-30">
                                                {/* Stock Item Search */}
                                                <div className="col-span-5">
                                                    <MasterCombobox
                                                        options={items}
                                                        value={item.itemName}
                                                        onChange={(val, opt) => handleUpdateInvoiceItem(item.id, 'itemName', val, opt)}
                                                        placeholder="Search stock item..."
                                                        labelField="name"
                                                        subField="group"
                                                        extraBadgeField="baseUnits"
                                                    />
                                                    {stockInfo && (
                                                        <p className="text-[10px] text-slate-400 font-medium mt-0.5 ml-1">
                                                            {stockInfo}
                                                        </p>
                                                    )}
                                                </div>

                                                {/* Quantity & Unit */}
                                                <div className="col-span-2 flex items-center gap-1">
                                                    <input
                                                        type="number"
                                                        step="any"
                                                        min="0.001"
                                                        value={item.qty}
                                                        onChange={(e) => handleUpdateInvoiceItem(item.id, 'qty', e.target.value)}
                                                        placeholder="Qty"
                                                        className="w-full px-2 py-2 text-right bg-white border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                                                    />
                                                    {item.unit && (
                                                        <span className="text-[10px] font-bold text-slate-400 shrink-0">
                                                            {item.unit}
                                                        </span>
                                                    )}
                                                </div>

                                                {/* Rate */}
                                                <div className="col-span-2">
                                                    <input
                                                        type="number"
                                                        step="0.01"
                                                        min="0"
                                                        value={item.rate}
                                                        onChange={(e) => handleUpdateInvoiceItem(item.id, 'rate', e.target.value)}
                                                        placeholder="Rate"
                                                        className="w-full px-2 py-2 text-right bg-white border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                                                    />
                                                </div>

                                                {/* Amount */}
                                                <div className="col-span-2 text-right font-mono font-black text-slate-900 text-xs">
                                                    ₹{fmtCur(item.amount || ((parseFloat(item.qty) || 0) * (parseFloat(item.rate) || 0)))}
                                                </div>

                                                {/* Remove */}
                                                <div className="col-span-1 text-center">
                                                    <button
                                                        type="button"
                                                        onClick={() => handleRemoveInvoiceItem(item.id)}
                                                        disabled={invoiceItems.length <= 1}
                                                        className="p-1.5 text-slate-400 hover:text-rose-600 disabled:opacity-20 transition-colors"
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Additional Charges / Tax Ledgers */}
                            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-3">
                                <div className="flex items-center justify-between">
                                    <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                                        <span>Taxes &amp; Additional Charges (Optional)</span>
                                    </h4>
                                    <button
                                        type="button"
                                        onClick={handleAddAdditionalCharge}
                                        className="text-xs font-bold text-blue-600 hover:text-blue-800 bg-blue-50 px-2.5 py-1 rounded-lg transition-colors cursor-pointer flex items-center gap-1"
                                    >
                                        <Plus className="w-3 h-3" />
                                        <span>Add Tax / Charge Ledger</span>
                                    </button>
                                </div>

                                {additionalLedgers.map(add => (
                                    <div key={add.id} className="grid grid-cols-12 gap-3 items-center relative focus-within:z-30">
                                        <div className="col-span-2">
                                            <select
                                                value={add.type}
                                                onChange={(e) => handleUpdateAdditionalCharge(add.id, 'type', e.target.value)}
                                                className="w-full py-1.5 px-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
                                            >
                                                <option value="Add">+ Add (Tax / Charge)</option>
                                                <option value="Sub">- Deduct (Discount)</option>
                                            </select>
                                        </div>
                                        <div className="col-span-6">
                                            <MasterCombobox
                                                options={masters}
                                                value={add.ledgerName}
                                                onChange={(val) => handleUpdateAdditionalCharge(add.id, 'ledgerName', val)}
                                                placeholder="Select tax/charge ledger (e.g. CGST, SGST, Freight)..."
                                                labelField="name"
                                                subField="group"
                                            />
                                        </div>
                                        <div className="col-span-3">
                                            <input
                                                type="number"
                                                step="0.01"
                                                value={add.amount}
                                                onChange={(e) => handleUpdateAdditionalCharge(add.id, 'amount', e.target.value)}
                                                placeholder="Amount (₹)"
                                                className="w-full px-3 py-2 text-right bg-white border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-900"
                                            />
                                        </div>
                                        <div className="col-span-1 text-center">
                                            <button
                                                type="button"
                                                onClick={() => handleRemoveAdditionalCharge(add.id)}
                                                className="p-1.5 text-slate-400 hover:text-rose-600"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </div>
                                ))}

                                {/* Invoice Grand Total Card */}
                                <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                    <div className="flex items-center gap-4 text-xs font-bold text-slate-500">
                                        <span>Items Subtotal: <strong className="text-slate-800 font-mono font-black">₹{fmtCur(invoiceItemsTotal)}</strong></span>
                                        {invoiceAdditionalTotal !== 0 && (
                                            <span>Taxes/Charges: <strong className="text-slate-800 font-mono font-black">₹{fmtCur(invoiceAdditionalTotal)}</strong></span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-extrabold uppercase text-slate-400">Grand Total:</span>
                                        <span className="text-xl font-black text-slate-950 font-mono">₹{fmtCur(invoiceGrandTotal)}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ───────────────────────────────────────────────────────── */}
                    {/* FORM SECTION 3: NARRATION & SUBMIT BAR                     */}
                    {/* ───────────────────────────────────────────────────────── */}
                    <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-4">
                        <div>
                            <label className="block text-[11px] font-extrabold text-slate-500 uppercase tracking-wider mb-1.5">
                                Narration (Remark)
                            </label>
                            <textarea
                                rows={2}
                                value={narration}
                                onChange={(e) => setNarration(e.target.value)}
                                placeholder="Enter voucher narration (optional)..."
                                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:bg-white focus:ring-2 focus:ring-blue-500"
                            />
                        </div>

                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
                            <div className="text-xs text-slate-500 font-medium">
                                💡 Data will be posted directly to <span className="font-bold text-slate-800">{selectedCompany || 'TallyPrime'}</span> via XML-over-HTTP.
                            </div>

                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={handlePostToTally}
                                    disabled={isPosting || connectionStatus !== 'connected' || companies.length === 0 || !selectedCompany}
                                    className="w-full sm:w-auto px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-black text-xs rounded-xl transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
                                >
                                    {isPosting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                    <span>{isPosting ? 'Posting to Tally...' : `Post ${voucherType} to Tally`}</span>
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* ───────────────────────────────────────────────────────── */}
                    {/* FORM SECTION 4: POSTING HISTORY (THIS SESSION)             */}
                    {/* ───────────────────────────────────────────────────────── */}
                    {postingHistory.length > 0 && (
                        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-3">
                            <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                                <Clock className="w-4 h-4 text-emerald-600" />
                                <span>Recent Vouchers Posted This Session ({postingHistory.length})</span>
                            </h3>

                            <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
                                {postingHistory.map(item => (
                                    <div key={item.id} className="px-4 py-2.5 flex items-center justify-between text-xs hover:bg-slate-50 transition-colors">
                                        <div className="flex items-center gap-3">
                                            <span className="text-[10px] font-mono text-slate-400">{item.timestamp}</span>
                                            <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200">
                                                {item.type}
                                            </span>
                                            <span className="font-bold text-slate-800">{item.party}</span>
                                            {item.voucherNumber && item.voucherNumber !== 'Auto' && (
                                                <span className="text-slate-400 font-mono">#{item.voucherNumber}</span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <span className="font-mono font-black text-slate-900">₹{fmtCur(item.amount)}</span>
                                            <span className="text-emerald-600 font-bold text-[11px] flex items-center gap-1">
                                                <CheckCircle2 className="w-3.5 h-3.5" /> Posted
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* ═══ XML PREVIEW MODAL ═══ */}
            {showXmlPreview && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-xs animate-in fade-in duration-150">
                    <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-2xl w-full overflow-hidden flex flex-col max-h-[85vh]">
                        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
                            <div className="flex items-center gap-2">
                                <Code className="w-5 h-5 text-blue-600" />
                                <h3 className="text-sm font-extrabold text-slate-900">Tally XML Payload Inspector</h3>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowXmlPreview(false)}
                                className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-700"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-4 flex-1 min-h-0 overflow-auto bg-slate-900 text-emerald-300 font-mono text-xs select-all">
                            <pre className="whitespace-pre-wrap">{xmlPreviewPayload}</pre>
                        </div>
                        <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between shrink-0 bg-slate-50">
                            <span className="text-[11px] text-slate-500 font-medium">Ready to be dispatched to Tally XML API</span>
                            <button
                                type="button"
                                onClick={() => setShowXmlPreview(false)}
                                className="px-4 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-100"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
