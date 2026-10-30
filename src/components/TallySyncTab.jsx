import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
    testConnection,
    fetchLedgerMasters,
    fetchStockItems,
    fetchVouchers,
    fetchIncrementalVouchers,
    fetchCurrentMaxAlterId,
    getLastAlterId,
    saveLastAlterId,
    getAutoSyncSettings,
    saveAutoSyncSettings,
    mergeIncrementalVouchers,
    toTallyDate,
    getSavedTallyUrl,
    saveTallyUrl,
    getSavedCompany,
    saveCompany,
    cacheMasters,
    getCachedMasters,
    cacheStockItems,
    getCachedStockItems,
    cacheTransactions,
    getCachedTransactions,
    clearTallySyncCache,
    getCacheSize,
    formatBytes,
} from '../utils/tallyService';
import {
    RefreshCw, Wifi, WifiOff, Loader2, Building2, Search,
    ChevronDown, ChevronUp, Trash2, HardDrive, Download,
    BookOpen, Package, ArrowRightLeft, AlertTriangle,
    ChevronLeft, ChevronRight, Zap, Filter, RotateCcw,
    BarChart3, Radio, Activity, Clock, Sparkles,
    Settings, LayoutDashboard, ShieldCheck, X
} from 'lucide-react';

const PREVIEW_PAGE_SIZE = 50;

// Pure formatters
const fmtTs = (ts) => {
    if (!ts) return '-';
    try {
        return new Date(ts).toLocaleString('en-IN', {
            day: '2-digit', month: 'short', year: 'numeric',
            hour: '2-digit', minute: '2-digit', hour12: true
        });
    } catch { return ts; }
};

const fmtCur = (n) => new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
}).format(Math.abs(parseFloat(n || 0)));

export default function TallySyncTab() {
    // ── Active Sub-Tab Navigation ──
    // 'dashboard' | 'transactions' | 'inventory' | 'masters' | 'analytics'
    const [activeSubTab, setActiveSubTab] = useState('dashboard');

    // ── Connection ──
    const [tallyUrl, setTallyUrl] = useState(() => getSavedTallyUrl());
    const [connectionStatus, setConnectionStatus] = useState('idle'); // 'idle' | 'connecting' | 'connected' | 'error'
    const [connectionError, setConnectionError] = useState('');
    const [companies, setCompanies] = useState([]);
    const [selectedCompany, setSelectedCompany] = useState(() => getSavedCompany());
    const [showConfigModal, setShowConfigModal] = useState(false);

    // ── Transaction Date Range ──
    const [txnDateFrom, setTxnDateFrom] = useState('2024-04-01');
    const [txnDateTo, setTxnDateTo] = useState('2027-03-31');

    // ── Sync states ──
    const [syncingMasters, setSyncingMasters] = useState(false);
    const [syncingItems, setSyncingItems] = useState(false);
    const [syncingTxns, setSyncingTxns] = useState(false);
    const [masterSyncResult, setMasterSyncResult] = useState('');
    const [itemSyncResult, setItemSyncResult] = useState('');
    const [txnSyncResult, setTxnSyncResult] = useState('');

    // ── Cache stats ──
    const [cachedMasterCount, setCachedMasterCount] = useState(() => getCachedMasters().data?.length || 0);
    const [cachedMasterTs, setCachedMasterTs] = useState(() => getCachedMasters().timestamp || '');
    const [cachedItemCount, setCachedItemCount] = useState(() => getCachedStockItems().data?.length || 0);
    const [cachedItemTs, setCachedItemTs] = useState(() => getCachedStockItems().timestamp || '');
    const [cachedTxnCount, setCachedTxnCount] = useState(() => getCachedTransactions().data?.length || 0);
    const [cachedTxnTs, setCachedTxnTs] = useState(() => getCachedTransactions().timestamp || '');
    const [cachedTxnFy, setCachedTxnFy] = useState(() => getCachedTransactions().fy || null);
    const [cacheBytes, setCacheBytes] = useState(() => getCacheSize());

    // ── Raw Datasets for Tables ──
    const [transactionsData, setTransactionsData] = useState(() => getCachedTransactions().data || []);
    const [itemsData, setItemsData] = useState(() => getCachedStockItems().data || []);
    const [mastersData, setMastersData] = useState(() => getCachedMasters().data || []);

    // ── Table Filtering & Pagination States ──
    const [tableSearch, setTableSearch] = useState('');
    const [tablePage, setTablePage] = useState(1);
    const [expandedRows, setExpandedRows] = useState(new Set());
    const [sortField, setSortField] = useState('');
    const [sortDir, setSortDir] = useState('asc');
    const [showFilters, setShowFilters] = useState(false);

    // Filters for Transactions
    const [txnFilterType, setTxnFilterType] = useState('');
    const [txnFilterDateFrom, setTxnFilterDateFrom] = useState('');
    const [txnFilterDateTo, setTxnFilterDateTo] = useState('');

    // Filters for Masters & Items
    const [masterFilterGroup, setMasterFilterGroup] = useState('');
    const [masterFilterBalType, setMasterFilterBalType] = useState('');
    const [itemFilterGroup, setItemFilterGroup] = useState('');

    // ── Auto-Sync / Live Push Engine state ──
    const autoSyncInitial = useMemo(() => getAutoSyncSettings(), []);
    const [autoSyncEnabled, setAutoSyncEnabled] = useState(autoSyncInitial.enabled);
    const [autoSyncInterval, setAutoSyncInterval] = useState(autoSyncInitial.interval);
    const [isAutoSyncing, setIsAutoSyncing] = useState(false);
    const [lastAutoSyncTs, setLastAutoSyncTs] = useState(null);
    const [autoSyncCount, setAutoSyncCount] = useState(0);
    const [lastSyncedAlterId, setLastSyncedAlterId] = useState(() => getLastAlterId());
    const [liveToast, setLiveToast] = useState(null);
    const isPollingRef = useRef(false);
    const toastTimeoutRef = useRef(null);

    const loadAllCachedDatasets = () => {
        const txns = getCachedTransactions();
        setTransactionsData(txns.data || []);
        const items = getCachedStockItems();
        setItemsData(items.data || []);
        const masters = getCachedMasters();
        setMastersData(masters.data || []);
    };

    const refreshCacheStats = () => {
        const masters = getCachedMasters();
        setCachedMasterCount(masters.data?.length || 0);
        setCachedMasterTs(masters.timestamp || '');
        const items = getCachedStockItems();
        setCachedItemCount(items.data?.length || 0);
        setCachedItemTs(items.timestamp || '');
        const txns = getCachedTransactions();
        setCachedTxnCount(txns.data?.length || 0);
        setCachedTxnTs(txns.timestamp || '');
        setCachedTxnFy(txns.fy || null);
        setCacheBytes(getCacheSize());
    };

    // Reset pagination & search when sub-tab changes
    const handleSubTabChange = (tab) => {
        setActiveSubTab(tab);
        setTableSearch('');
        setTablePage(1);
        setExpandedRows(new Set());
        setSortField('');
        setSortDir('asc');
        setShowFilters(false);
    };

    // ── Mount Check: Discover Tally & Company State Immediately on Load ──
    useEffect(() => {
        let isMounted = true;
        const initialCheck = async () => {
            try {
                const res = await testConnection(tallyUrl);
                if (!isMounted) return;
                if (res.connected) {
                    setConnectionStatus('connected');
                    const openCompanies = res.companies || [];
                    setCompanies(openCompanies);
                    if (openCompanies.length === 0) {
                        setSelectedCompany('');
                        saveCompany('');
                    } else {
                        const saved = getSavedCompany();
                        if (saved && openCompanies.includes(saved)) {
                            setSelectedCompany(saved);
                        } else {
                            setSelectedCompany(openCompanies[0]);
                            saveCompany(openCompanies[0]);
                        }
                    }
                } else {
                    setConnectionStatus('idle');
                }
            } catch {
                if (isMounted) setConnectionStatus('idle');
            }
        };
        initialCheck();
        return () => { isMounted = false; };
    }, [tallyUrl]);

    // ── Live Company Monitor & Incremental Auto-Push Engine ──
    useEffect(() => {
        saveAutoSyncSettings(autoSyncEnabled, autoSyncInterval);
        if (connectionStatus !== 'connected') {
            return;
        }

        const pollCycle = async () => {
            if (isPollingRef.current) return;
            isPollingRef.current = true;

            try {
                // 1. Check open companies in TallyPrime
                // This detects dynamically if user closed or opened a company in Tally
                const connResult = await testConnection(tallyUrl);
                if (!connResult.connected) {
                    console.warn('[Tally Monitor] Tally connection lost');
                    setConnectionStatus('error');
                    setConnectionError(connResult.error || 'Connection to Tally lost');
                    setCompanies([]);
                    return;
                }

                const openCompanies = connResult.companies || [];
                setCompanies(openCompanies);

                if (openCompanies.length === 0) {
                    // ZERO COMPANIES OPEN IN TALLY
                    if (selectedCompany !== '') {
                        console.log('[Tally Monitor] Company was closed in Tally. Setting No Company Open.');
                        setSelectedCompany('');
                        saveCompany('');
                    }
                    return;
                }

                // If currently no selected company, or selected company was closed in Tally:
                let activeCo = selectedCompany;
                if (!activeCo || !openCompanies.includes(activeCo)) {
                    activeCo = openCompanies[0];
                    console.log(`[Tally Monitor] Active company auto-selected: "${activeCo}"`);
                    setSelectedCompany(activeCo);
                    saveCompany(activeCo);
                }

                // 2. Incremental Voucher Sync (only if autoSync is enabled)
                if (!autoSyncEnabled) {
                    return;
                }

                setIsAutoSyncing(true);

                let currentAlterId = getLastAlterId();

                if (!currentAlterId || currentAlterId <= 0) {
                    const cached = getCachedTransactions();
                    const maxFromCache = Array.isArray(cached.data)
                        ? Math.max(0, ...(cached.data.map(t => t.alterId || 0)))
                        : 0;

                    if (maxFromCache > 0) {
                        currentAlterId = maxFromCache;
                        saveLastAlterId(currentAlterId);
                        setLastSyncedAlterId(currentAlterId);
                    } else {
                        const maxFromTally = await fetchCurrentMaxAlterId(activeCo, tallyUrl);
                        currentAlterId = maxFromTally;
                        saveLastAlterId(currentAlterId);
                        setLastSyncedAlterId(currentAlterId);
                    }
                }

                const { vouchers, maxAlterId } = await fetchIncrementalVouchers(activeCo, currentAlterId, tallyUrl);
                setLastAutoSyncTs(new Date());

                if (vouchers && vouchers.length > 0) {
                    const mergeResult = mergeIncrementalVouchers(vouchers);
                    setLastSyncedAlterId(maxAlterId);
                    setAutoSyncCount(prev => prev + vouchers.length);
                    refreshCacheStats();

                    // Update live datasets
                    const updated = getCachedTransactions();
                    setTransactionsData(updated.data || []);

                    // Trigger toast
                    const primary = vouchers[0];
                    const isNew = mergeResult.createdCount > 0;
                    const actionWord = isNew ? 'Created' : 'Altered';
                    const title = vouchers.length === 1
                        ? `Voucher ${actionWord}: ${primary.type} #${primary.voucherNo || primary.voucherNumber || ''}`
                        : `${vouchers.length} Vouchers Auto-Pushed!`;
                    const details = `${primary.partyLedger ? primary.partyLedger + ' · ' : ''}₹${fmtCur(primary.debitAmount || primary.creditAmount || primary.amount)} (${actionWord} in Tally)`;

                    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
                    setLiveToast({
                        id: Date.now(),
                        title,
                        details,
                        type: isNew ? 'created' : 'altered',
                        count: vouchers.length,
                        timestamp: new Date().toLocaleTimeString(),
                        txn: primary,
                    });

                    toastTimeoutRef.current = setTimeout(() => {
                        setLiveToast(null);
                    }, 6000);
                }
            } catch (err) {
                console.warn('[Auto-Push Error]:', err.message);
            } finally {
                setIsAutoSyncing(false);
                isPollingRef.current = false;
            }
        };

        pollCycle();
        const pollIntervalMs = autoSyncEnabled ? autoSyncInterval * 1000 : 4000;
        const intervalId = setInterval(pollCycle, pollIntervalMs);

        return () => {
            clearInterval(intervalId);
            if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
        };
    }, [autoSyncEnabled, autoSyncInterval, connectionStatus, selectedCompany, tallyUrl]);

    // ── Connection Handlers ──
    const handleTestConnection = async () => {
        setConnectionStatus('connecting');
        setConnectionError('');
        try {
            const result = await testConnection(tallyUrl);
            if (result.connected) {
                setConnectionStatus('connected');
                const openCompanies = result.companies || [];
                setCompanies(openCompanies);
                saveTallyUrl(tallyUrl);
                if (openCompanies.length === 0) {
                    setSelectedCompany('');
                    saveCompany('');
                } else if (!selectedCompany || !openCompanies.includes(selectedCompany)) {
                    setSelectedCompany(openCompanies[0]);
                    saveCompany(openCompanies[0]);
                }
            } else {
                setConnectionStatus('error');
                setConnectionError(result.error || 'Connection failed');
                setCompanies([]);
            }
        } catch (err) {
            setConnectionStatus('error');
            setConnectionError(err.message || 'Connection failed');
            setCompanies([]);
        }
    };

    const handleCompanyChange = (e) => {
        setSelectedCompany(e.target.value);
        saveCompany(e.target.value);
    };

    // ── Sync Actions ──
    const handleSyncMasters = async () => {
        if (!selectedCompany) { setMasterSyncResult('⚠️ Select a company first.'); return; }
        setSyncingMasters(true);
        setMasterSyncResult('');
        try {
            const parsed = await fetchLedgerMasters(selectedCompany, tallyUrl);
            cacheMasters(parsed);
            refreshCacheStats();
            setMastersData(parsed);
            setMasterSyncResult(`✅ ${parsed.length} ledger accounts fetched and cached.`);
        } catch (error) {
            setMasterSyncResult(`❌ Error: ${error.message}`);
        } finally { setSyncingMasters(false); }
    };

    const handleSyncStockItems = async () => {
        if (!selectedCompany) { setItemSyncResult('⚠️ Select a company first.'); return; }
        setSyncingItems(true);
        setItemSyncResult('');
        try {
            const parsed = await fetchStockItems(selectedCompany, tallyUrl);
            cacheStockItems(parsed);
            refreshCacheStats();
            setItemsData(parsed);
            setItemSyncResult(`✅ ${parsed.length} inventory items fetched and cached.`);
        } catch (error) {
            setItemSyncResult(`❌ Error: ${error.message}`);
        } finally { setSyncingItems(false); }
    };

    const handleSyncTransactions = async () => {
        if (!selectedCompany) { setTxnSyncResult('⚠️ Select a company first.'); return; }
        if (!txnDateFrom || !txnDateTo) { setTxnSyncResult('⚠️ Select both From and To dates.'); return; }
        if (txnDateFrom > txnDateTo) { setTxnSyncResult('⚠️ From date cannot be after To date.'); return; }
        setSyncingTxns(true);
        setTxnSyncResult('');
        try {
            const allParsed = await fetchVouchers(selectedCompany, toTallyDate(txnDateFrom), toTallyDate(txnDateTo), tallyUrl);
            const valid = allParsed.filter(txn => {
                if (!txn.date) return true;
                if (txnDateFrom && txn.date < txnDateFrom) return false;
                if (txnDateTo && txn.date > txnDateTo) return false;
                return true;
            });
            const skipped = allParsed.length - valid.length;
            const rangeLabel = `${txnDateFrom} → ${txnDateTo}`;
            cacheTransactions(valid, { name: rangeLabel, startDate: txnDateFrom, endDate: txnDateTo, company: selectedCompany });
            refreshCacheStats();
            setTransactionsData(valid);
            let msg = `✅ ${valid.length} transactions fetched and cached (${rangeLabel}).`;
            if (skipped > 0) msg += ` (${skipped} outside range filtered out)`;
            setTxnSyncResult(msg);
        } catch (error) {
            setTxnSyncResult(`❌ Error: ${error.message}`);
        } finally { setSyncingTxns(false); }
    };

    const handleClearCache = () => {
        if (!window.confirm('Clear all cached Tally Sync data?')) return;
        clearTallySyncCache();
        refreshCacheStats();
        loadAllCachedDatasets();
        setMasterSyncResult(''); setItemSyncResult(''); setTxnSyncResult('');
    };

    const handleExportJSON = (type) => {
        const data = type === 'master'
            ? getCachedMasters().data
            : type === 'inventory'
                ? getCachedStockItems().data
                : getCachedTransactions().data;
        if (!data || data.length === 0) {
            alert('No data to export.');
            return;
        }
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const fname = type === 'master' ? 'masters' : type === 'inventory' ? 'inventory_items' : 'transactions';
        a.download = `tally_${fname}_${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    // ── Table Filtering & Pagination Logic ──
    const uniqueVoucherTypes = useMemo(() => {
        const s = new Set();
        transactionsData.forEach(t => { if (t.type) s.add(t.type); });
        return Array.from(s).sort();
    }, [transactionsData]);

    const uniqueMasterGroups = useMemo(() => {
        const s = new Set();
        mastersData.forEach(m => { if (m.group) s.add(m.group); });
        return Array.from(s).sort();
    }, [mastersData]);

    const uniqueItemGroups = useMemo(() => {
        const s = new Set();
        itemsData.forEach(item => { if (item.group) s.add(item.group); });
        return Array.from(s).sort();
    }, [itemsData]);

    const activeFilterCount = useMemo(() => {
        let c = 0;
        if (tableSearch) c++;
        if (activeSubTab === 'transactions') {
            if (txnFilterType) c++;
            if (txnFilterDateFrom) c++;
            if (txnFilterDateTo) c++;
        } else if (activeSubTab === 'inventory') {
            if (itemFilterGroup) c++;
        } else if (activeSubTab === 'masters') {
            if (masterFilterGroup) c++;
            if (masterFilterBalType) c++;
        }
        return c;
    }, [tableSearch, activeSubTab, txnFilterType, txnFilterDateFrom, txnFilterDateTo, itemFilterGroup, masterFilterGroup, masterFilterBalType]);

    const resetFilters = () => {
        setTableSearch('');
        setTxnFilterType('');
        setTxnFilterDateFrom('');
        setTxnFilterDateTo('');
        setMasterFilterGroup('');
        setMasterFilterBalType('');
        setItemFilterGroup('');
        setSortField('');
        setSortDir('asc');
        setTablePage(1);
    };

    // Filtered data for the active view
    const filteredCurrentData = useMemo(() => {
        const term = (tableSearch || '').toLowerCase().trim();

        if (activeSubTab === 'transactions') {
            let res = transactionsData;
            if (term) {
                res = res.filter(t =>
                    (t.debitAccount || '').toLowerCase().includes(term) ||
                    (t.creditAccount || '').toLowerCase().includes(term) ||
                    (t.voucherNo || t.voucherNumber || '').toLowerCase().includes(term) ||
                    (t.type || '').toLowerCase().includes(term) ||
                    (t.narration || '').toLowerCase().includes(term) ||
                    (t.date || '').includes(term) ||
                    (Array.isArray(t.allDebitAccounts) ? t.allDebitAccounts : []).some(a => (a || '').toLowerCase().includes(term)) ||
                    (Array.isArray(t.allCreditAccounts) ? t.allCreditAccounts : []).some(a => (a || '').toLowerCase().includes(term)) ||
                    (Array.isArray(t.inventory) ? t.inventory : []).some(inv => (inv.itemName || '').toLowerCase().includes(term))
                );
            }
            if (txnFilterType) res = res.filter(t => t.type === txnFilterType);
            if (txnFilterDateFrom) res = res.filter(t => t.date >= txnFilterDateFrom);
            if (txnFilterDateTo) res = res.filter(t => t.date <= txnFilterDateTo);

            if (sortField) {
                res = [...res].sort((a, b) => {
                    let va = a[sortField] ?? '';
                    let vb = b[sortField] ?? '';
                    if (sortField === 'debitAmount') {
                        va = parseFloat(a.debitAmount || a.creditAmount || a.amount || 0);
                        vb = parseFloat(b.debitAmount || b.creditAmount || b.amount || 0);
                    }
                    if (typeof va === 'number' && typeof vb === 'number') return sortDir === 'asc' ? va - vb : vb - va;
                    va = String(va).toLowerCase(); vb = String(vb).toLowerCase();
                    if (va < vb) return sortDir === 'asc' ? -1 : 1;
                    if (va > vb) return sortDir === 'asc' ? 1 : -1;
                    return 0;
                });
            }
            return res;
        }

        if (activeSubTab === 'inventory') {
            let res = itemsData;
            if (term) {
                res = res.filter(item =>
                    (item.name || '').toLowerCase().includes(term) ||
                    (item.group || '').toLowerCase().includes(term) ||
                    (item.category || '').toLowerCase().includes(term) ||
                    (item.baseUnits || '').toLowerCase().includes(term) ||
                    (item.closingBalance || '').toLowerCase().includes(term) ||
                    (item.closingRate || '').toLowerCase().includes(term) ||
                    (item.openingBalance || '').toLowerCase().includes(term) ||
                    (item.description || '').toLowerCase().includes(term)
                );
            }
            if (itemFilterGroup) res = res.filter(item => item.group === itemFilterGroup);

            if (sortField) {
                res = [...res].sort((a, b) => {
                    let va = a[sortField] ?? '';
                    let vb = b[sortField] ?? '';
                    if (['closingValue', 'openingValue', 'closingQty', 'openingQty'].includes(sortField)) {
                        va = parseFloat(a[sortField] || 0);
                        vb = parseFloat(b[sortField] || 0);
                    }
                    if (typeof va === 'number' && typeof vb === 'number') return sortDir === 'asc' ? va - vb : vb - va;
                    va = String(va).toLowerCase(); vb = String(vb).toLowerCase();
                    if (va < vb) return sortDir === 'asc' ? -1 : 1;
                    if (va > vb) return sortDir === 'asc' ? 1 : -1;
                    return 0;
                });
            }
            return res;
        }

        if (activeSubTab === 'masters') {
            let res = mastersData;
            if (term) {
                res = res.filter(m =>
                    (m.name || '').toLowerCase().includes(term) ||
                    (m.group || '').toLowerCase().includes(term) ||
                    (m.address || '').toLowerCase().includes(term) ||
                    (m.contact || '').toLowerCase().includes(term)
                );
            }
            if (masterFilterGroup) res = res.filter(m => m.group === masterFilterGroup);
            if (masterFilterBalType) {
                if (masterFilterBalType === 'Dr') res = res.filter(m => m.openingBalanceType === 'Dr');
                else if (masterFilterBalType === 'Cr') res = res.filter(m => m.openingBalanceType === 'Cr');
                else if (masterFilterBalType === 'zero') res = res.filter(m => !m.openingBalance || m.openingBalance === 0);
                else if (masterFilterBalType === 'nonzero') res = res.filter(m => m.openingBalance && m.openingBalance > 0);
            }

            if (sortField) {
                res = [...res].sort((a, b) => {
                    let va = a[sortField] ?? '';
                    let vb = b[sortField] ?? '';
                    if (sortField === 'openingBalance') {
                        va = parseFloat(a.openingBalance || 0);
                        vb = parseFloat(b.openingBalance || 0);
                    }
                    if (typeof va === 'number' && typeof vb === 'number') return sortDir === 'asc' ? va - vb : vb - va;
                    va = String(va).toLowerCase(); vb = String(vb).toLowerCase();
                    if (va < vb) return sortDir === 'asc' ? -1 : 1;
                    if (va > vb) return sortDir === 'asc' ? 1 : -1;
                    return 0;
                });
            }
            return res;
        }

        return [];
    }, [activeSubTab, transactionsData, itemsData, mastersData, tableSearch, txnFilterType, txnFilterDateFrom, txnFilterDateTo, itemFilterGroup, masterFilterGroup, masterFilterBalType, sortField, sortDir]);

    const totalPages = Math.max(1, Math.ceil(filteredCurrentData.length / PREVIEW_PAGE_SIZE));
    const paginatedData = useMemo(() => {
        const start = (tablePage - 1) * PREVIEW_PAGE_SIZE;
        return filteredCurrentData.slice(start, start + PREVIEW_PAGE_SIZE);
    }, [filteredCurrentData, tablePage]);

    const handleSort = (field) => {
        if (sortField === field) {
            if (sortDir === 'asc') setSortDir('desc');
            else { setSortField(''); setSortDir('asc'); }
        } else {
            setSortField(field);
            setSortDir('asc');
        }
        setTablePage(1);
    };

    const SortIcon = ({ field }) => {
        if (sortField !== field) return <ChevronDown className="w-3 h-3 opacity-30" />;
        return sortDir === 'asc' ? <ChevronUp className="w-3 h-3 text-blue-600" /> : <ChevronDown className="w-3 h-3 text-blue-600" />;
    };

    const toggleRow = (id) => {
        setExpandedRows(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    // ── Analytics Metrics ──
    const masterStats = useMemo(() => {
        if (!mastersData || mastersData.length === 0) return null;
        const groups = {};
        let drCount = 0, crCount = 0, zeroCount = 0, totalOB = 0;
        mastersData.forEach(m => {
            const g = m.group || 'Ungrouped';
            groups[g] = (groups[g] || 0) + 1;
            if (m.openingBalanceType === 'Dr') drCount++;
            else if (m.openingBalanceType === 'Cr') crCount++;
            if (!m.openingBalance || m.openingBalance === 0) zeroCount++;
            totalOB += parseFloat(m.openingBalance || 0);
        });
        const sortedGroups = Object.entries(groups).sort((a, b) => b[1] - a[1]);
        return { total: mastersData.length, groups: sortedGroups, drCount, crCount, zeroCount, totalOB };
    }, [mastersData]);

    const itemStats = useMemo(() => {
        if (!itemsData || itemsData.length === 0) return null;
        const groups = {};
        let inStock = 0, zeroStock = 0, negStock = 0, totalVal = 0;
        itemsData.forEach(item => {
            const g = item.group || 'Primary';
            groups[g] = (groups[g] || 0) + 1;
            const q = item.closingQty || 0;
            if (q > 0) inStock++;
            else if (q < 0) negStock++;
            else zeroStock++;
            totalVal += parseFloat(item.closingValue || 0);
        });
        const sortedGroups = Object.entries(groups).sort((a, b) => b[1] - a[1]);
        return { total: itemsData.length, groups: sortedGroups, inStock, zeroStock, negStock, totalVal };
    }, [itemsData]);

    const txnStats = useMemo(() => {
        if (!transactionsData || transactionsData.length === 0) return null;
        const types = {};
        let totalDebit = 0, totalCredit = 0, minDate = '', maxDate = '';
        const uniqueAccounts = new Set();
        const monthlyVolume = {};

        transactionsData.forEach(t => {
            const tp = t.type || 'Unknown';
            types[tp] = (types[tp] || 0) + 1;
            totalDebit += parseFloat(t.debitAmount || t.amount || 0);
            totalCredit += parseFloat(t.creditAmount || t.amount || 0);
            if (!minDate || t.date < minDate) minDate = t.date;
            if (!maxDate || t.date > maxDate) maxDate = t.date;
            const drAccts = t.allDebitAccounts || '';
            const crAccts = t.allCreditAccounts || '';
            (typeof drAccts === 'string' ? drAccts.split(',').map(s => s.trim()).filter(Boolean) : Array.isArray(drAccts) ? drAccts : []).forEach(a => uniqueAccounts.add(a));
            (typeof crAccts === 'string' ? crAccts.split(',').map(s => s.trim()).filter(Boolean) : Array.isArray(crAccts) ? crAccts : []).forEach(a => uniqueAccounts.add(a));
            if (t.date) {
                const m = t.date.slice(0, 7);
                monthlyVolume[m] = (monthlyVolume[m] || 0) + 1;
            }
        });
        const sortedTypes = Object.entries(types).sort((a, b) => b[1] - a[1]);
        const sortedMonths = Object.entries(monthlyVolume).sort((a, b) => a[0].localeCompare(b[0]));
        return { total: transactionsData.length, types: sortedTypes, totalDebit, totalCredit, minDate, maxDate, uniqueAccounts: uniqueAccounts.size, monthlyVolume: sortedMonths };
    }, [transactionsData]);

    // ════════════════════════════════════════════════════════
    // MAIN RENDER (MATCHES ACCOUNTS & TRANSACTIONS TAB DESIGN)
    // ════════════════════════════════════════════════════════
    return (
        <div className="flex flex-col min-h-0 flex-1 gap-3 sm:gap-4">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col flex-1 min-h-0 overflow-hidden">
                
                {/* ═══ TOP INTEGRATED CONTROL HEADER ═══ */}
                <div className="px-4 py-3 sm:px-5 sm:py-3.5 border-b border-gray-100 bg-white shrink-0 relative z-20 flex flex-col gap-2.5">
                    
                    {/* Upper Row: Status, Company, Auto-Push, Connection Actions */}
                    <div className="flex flex-wrap items-center justify-between gap-2.5">
                        {/* Left: Connection Pill & Company */}
                        <div className="flex items-center gap-2 flex-wrap">
                            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-2xs ${
                                connectionStatus === 'connected'
                                    ? companies.length === 0
                                        ? 'bg-amber-50 text-amber-800 border border-amber-300/80'
                                        : 'bg-emerald-50 text-emerald-700 border border-emerald-200/80'
                                    : connectionStatus === 'connecting'
                                        ? 'bg-amber-50 text-amber-700 border border-amber-200/80'
                                        : connectionStatus === 'error'
                                            ? 'bg-rose-50 text-rose-700 border border-rose-200/80'
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
                                ) : connectionStatus === 'connecting' ? (
                                    <>
                                        <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-600" />
                                        <span>Connecting...</span>
                                    </>
                                ) : connectionStatus === 'error' ? (
                                    <>
                                        <WifiOff className="w-3.5 h-3.5 text-rose-500" />
                                        <span>Disconnected</span>
                                    </>
                                ) : (
                                    <>
                                        <Wifi className="w-3.5 h-3.5 text-slate-400" />
                                        <span>Tally Offline</span>
                                    </>
                                )}
                            </div>

                            {/* Company Selector */}
                            {connectionStatus === 'connected' ? (
                                companies.length > 0 ? (
                                    <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200/90 rounded-xl px-2.5 py-1 text-xs font-bold text-slate-800 shadow-2xs">
                                        <Building2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                                        <select
                                            value={selectedCompany}
                                            onChange={handleCompanyChange}
                                            className="bg-transparent border-0 outline-none text-xs font-bold text-slate-800 cursor-pointer max-w-[180px] sm:max-w-[260px] truncate"
                                        >
                                            {companies.map(c => <option key={c} value={c}>{c}</option>)}
                                        </select>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 rounded-xl px-2.5 py-1 text-xs font-bold text-amber-800 shadow-2xs">
                                        <Building2 className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                                        <span>No Company Open in Tally</span>
                                        <button
                                            type="button"
                                            onClick={handleTestConnection}
                                            className="ml-1 text-[10px] font-black underline hover:text-amber-950 cursor-pointer text-amber-700"
                                            title="Check for open company in Tally"
                                        >
                                            Refresh
                                        </button>
                                    </div>
                                )
                            ) : selectedCompany ? (
                                <div className="hidden sm:flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1 text-xs font-semibold text-slate-600">
                                    <Building2 className="w-3.5 h-3.5 text-slate-400" />
                                    <span className="max-w-[160px] truncate">{selectedCompany}</span>
                                </div>
                            ) : null}
                        </div>

                        {/* Right: Live Auto-Push & Server Config Action */}
                        <div className="flex items-center gap-2 flex-wrap ml-auto">
                            {/* Live Auto-Push Toggle Button */}
                            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl border text-xs transition-all shadow-2xs ${
                                autoSyncEnabled && connectionStatus === 'connected'
                                    ? 'bg-slate-900 text-white border-emerald-500/50 shadow-sm'
                                    : 'bg-slate-50 text-slate-700 border-slate-200/90'
                            }`}>
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (connectionStatus !== 'connected') {
                                            alert('Connect to TallyPrime first before enabling Live Auto-Push.');
                                            return;
                                        }
                                        setAutoSyncEnabled(!autoSyncEnabled);
                                    }}
                                    className="flex items-center gap-1.5 font-bold cursor-pointer hover:opacity-80 transition-opacity"
                                    title={autoSyncEnabled ? "Pause real-time sync" : "Enable real-time push sync"}
                                >
                                    <Radio className={`w-3.5 h-3.5 ${autoSyncEnabled && connectionStatus === 'connected' ? 'text-emerald-400 animate-pulse' : 'text-slate-400'}`} />
                                    <span>Live Push</span>
                                    <span className={`text-[9px] px-1.5 py-0.2 rounded font-black ${
                                        autoSyncEnabled && connectionStatus === 'connected'
                                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/40'
                                            : 'bg-slate-200 text-slate-600'
                                    }`}>
                                        {autoSyncEnabled && connectionStatus === 'connected' ? 'ON' : 'OFF'}
                                    </span>
                                </button>

                                {autoSyncEnabled && connectionStatus === 'connected' && (
                                    <div className="hidden md:flex items-center gap-1 pl-1.5 border-l border-white/20">
                                        {[3, 5, 10].map(sec => (
                                            <button
                                                key={sec}
                                                type="button"
                                                onClick={() => setAutoSyncInterval(sec)}
                                                className={`px-1.5 py-0.5 rounded text-[10px] font-bold cursor-pointer transition-colors ${
                                                    autoSyncInterval === sec
                                                        ? 'bg-emerald-400 text-slate-950 font-black'
                                                        : 'text-slate-300 hover:text-white'
                                                }`}
                                            >
                                                {sec}s
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Test Connection / Reconnect */}
                            <button
                                type="button"
                                onClick={handleTestConnection}
                                disabled={connectionStatus === 'connecting'}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl text-xs font-bold transition-colors shadow-2xs cursor-pointer disabled:opacity-50"
                                title="Test connection to Tally"
                            >
                                {connectionStatus === 'connecting' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                                <span className="hidden sm:inline">Test Connection</span>
                            </button>

                            {/* Configure Server URL & Settings Button */}
                            <button
                                type="button"
                                onClick={() => setShowConfigModal(true)}
                                className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200/80 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                                title="Configure Tally URL and settings"
                            >
                                <Settings className="w-3.5 h-3.5 text-slate-500" />
                                <span className="hidden sm:inline">Settings</span>
                            </button>
                        </div>
                    </div>

                    {/* Lower Row: Navigation Sub-Tabs */}
                    <div className="flex items-center justify-between border-t border-slate-100 pt-2 gap-2 overflow-x-auto">
                        <div className="flex items-center gap-1.5">
                            <button
                                type="button"
                                onClick={() => handleSubTabChange('dashboard')}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
                                    activeSubTab === 'dashboard'
                                        ? 'bg-blue-600 text-white shadow-xs'
                                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                                }`}
                            >
                                <LayoutDashboard className="w-3.5 h-3.5" />
                                <span>Overview &amp; Sync</span>
                            </button>

                            <button
                                type="button"
                                onClick={() => handleSubTabChange('transactions')}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
                                    activeSubTab === 'transactions'
                                        ? 'bg-blue-600 text-white shadow-xs'
                                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                                }`}
                            >
                                <ArrowRightLeft className="w-3.5 h-3.5" />
                                <span>Transactions</span>
                                {cachedTxnCount > 0 && (
                                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                                        activeSubTab === 'transactions' ? 'bg-white/20 text-white' : 'bg-blue-50 text-blue-700'
                                    }`}>
                                        {cachedTxnCount}
                                    </span>
                                )}
                            </button>

                            <button
                                type="button"
                                onClick={() => handleSubTabChange('inventory')}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
                                    activeSubTab === 'inventory'
                                        ? 'bg-blue-600 text-white shadow-xs'
                                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                                }`}
                            >
                                <Package className="w-3.5 h-3.5" />
                                <span>Inventory</span>
                                {cachedItemCount > 0 && (
                                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                                        activeSubTab === 'inventory' ? 'bg-white/20 text-white' : 'bg-indigo-50 text-indigo-700'
                                    }`}>
                                        {cachedItemCount}
                                    </span>
                                )}
                            </button>

                            <button
                                type="button"
                                onClick={() => handleSubTabChange('masters')}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
                                    activeSubTab === 'masters'
                                        ? 'bg-blue-600 text-white shadow-xs'
                                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                                }`}
                            >
                                <BookOpen className="w-3.5 h-3.5" />
                                <span>Masters</span>
                                {cachedMasterCount > 0 && (
                                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                                        activeSubTab === 'masters' ? 'bg-white/20 text-white' : 'bg-amber-50 text-amber-700'
                                    }`}>
                                        {cachedMasterCount}
                                    </span>
                                )}
                            </button>

                            <button
                                type="button"
                                onClick={() => handleSubTabChange('analytics')}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
                                    activeSubTab === 'analytics'
                                        ? 'bg-blue-600 text-white shadow-xs'
                                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                                }`}
                            >
                                <BarChart3 className="w-3.5 h-3.5" />
                                <span>Analytics</span>
                            </button>
                        </div>

                        {/* Quick Storage Badge */}
                        <div className="hidden lg:flex items-center gap-2 text-[11px] font-bold text-slate-500">
                            <HardDrive className="w-3.5 h-3.5 text-slate-400" />
                            <span>Cache: {formatBytes(cacheBytes)}</span>
                        </div>
                    </div>
                </div>

                {/* ═══ LIVE AUTO-PUSH MONITORING BANNER (WHEN ACTIVE) ═══ */}
                {autoSyncEnabled && connectionStatus === 'connected' && (
                    <div className="bg-slate-950 text-white px-4 py-2 border-b border-emerald-500/30 flex flex-wrap items-center justify-between text-xs font-medium gap-2 shrink-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="flex items-center gap-1.5 text-emerald-400 font-bold text-[11px]">
                                <Activity className="w-3.5 h-3.5 animate-pulse" />
                                Live AlterID Monitor Active
                            </span>
                            <span className="text-slate-600">·</span>
                            {companies.length === 0 ? (
                                <span className="text-amber-300 font-bold text-[11px] flex items-center gap-1.5">
                                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                                    No company open in Tally · Waiting for company to be opened...
                                </span>
                            ) : (
                                <>
                                    <span className="text-slate-300 text-[11px]">
                                        Tracking: <code className="bg-white/10 px-1.5 py-0.5 rounded font-mono text-emerald-300 font-bold">#{lastSyncedAlterId || 0}</code> ({selectedCompany})
                                    </span>
                                    <span className="text-slate-600">·</span>
                                    <span className="text-slate-400 text-[11px]">
                                        Last Check: {lastAutoSyncTs ? lastAutoSyncTs.toLocaleTimeString() : 'Just now'}
                                    </span>
                                    {isAutoSyncing && (
                                        <span className="text-emerald-300 text-[10px] flex items-center gap-1 animate-pulse font-bold ml-1">
                                            <Loader2 className="w-3 h-3 animate-spin" /> syncing...
                                        </span>
                                    )}
                                </>
                            )}
                        </div>
                        {autoSyncCount > 0 && (
                            <div className="flex items-center gap-1 text-emerald-300 font-black bg-emerald-500/10 px-2 py-0.5 rounded-lg border border-emerald-500/20 text-[11px]">
                                <Sparkles className="w-3 h-3" />
                                <span>{autoSyncCount} voucher{autoSyncCount > 1 ? 's' : ''} pushed live</span>
                            </div>
                        )}
                    </div>
                )}

                {/* ═══ MAIN SCROLLABLE CONTENT AREA ═══ */}
                <div className="flex-1 min-h-0 overflow-y-auto bg-slate-50/50">
                    
                    {/* ───────────────────────────────────────────────────────── */}
                    {/* SUB-TAB 1: OVERVIEW & SYNC DASHBOARD                      */}
                    {/* ───────────────────────────────────────────────────────── */}
                    {activeSubTab === 'dashboard' && (
                        <div className="p-4 sm:p-6 space-y-5 max-w-7xl mx-auto">
                            
                            {/* Connection Error Message Banner */}
                            {connectionStatus === 'error' && connectionError && (
                                <div className="flex items-start gap-3 bg-rose-50 border border-rose-200 rounded-2xl p-4">
                                    <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
                                    <div className="flex-1 text-xs">
                                        <p className="font-bold text-rose-800">{connectionError}</p>
                                        <p className="text-rose-600 mt-1">
                                            💡 Browser CORS policy may block direct Tally calls. Start the proxy: <code className="bg-rose-100 px-1.5 py-0.5 rounded font-mono">cd tally-proxy &amp;&amp; npm start</code>, then use URL: <code className="bg-rose-100 px-1.5 py-0.5 rounded font-mono">http://localhost:3001</code>.
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setShowConfigModal(true)}
                                        className="px-3 py-1 bg-rose-100 hover:bg-rose-200 text-rose-800 font-bold rounded-lg text-xs"
                                    >
                                        Configure
                                    </button>
                                </div>
                            )}

                            {/* Banner: Connected to Tally but NO Company Open */}
                            {connectionStatus === 'connected' && companies.length === 0 && (
                                <div className="bg-gradient-to-r from-amber-50 via-orange-50 to-amber-50 border-2 border-amber-300/90 rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                                    <div className="flex items-start gap-3.5">
                                        <div className="p-2.5 bg-amber-100 text-amber-800 rounded-xl shrink-0 mt-0.5 shadow-2xs">
                                            <Building2 className="w-6 h-6 stroke-[2.2]" />
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <h3 className="text-sm font-black text-amber-950">No Company Open in TallyPrime</h3>
                                                <span className="text-[10px] bg-amber-200/90 text-amber-900 font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider">Tally Online</span>
                                            </div>
                                            <p className="text-xs text-amber-900 mt-1 font-medium leading-relaxed">
                                                TallyPrime is running, but no company is currently open. Please open your company in TallyPrime (<kbd className="bg-white border border-amber-300 px-1.5 py-0.5 rounded text-[11px] font-bold text-slate-800">F3 &gt; Select Company</kbd>).
                                            </p>
                                            <p className="text-[11px] text-amber-700 mt-0.5 font-medium">
                                                Once opened in Tally, this page will automatically detect it and enable syncing.
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleTestConnection}
                                        className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl text-xs transition-colors shadow-2xs shrink-0 flex items-center gap-1.5 cursor-pointer"
                                    >
                                        <RefreshCw className="w-3.5 h-3.5" />
                                        <span>Check for Company</span>
                                    </button>
                                </div>
                            )}

                            {/* 3 Unified Metric & Sync Cards */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                
                                {/* 1. Master Accounts Card */}
                                <div className="bg-white rounded-2xl p-5 border border-slate-200/70 shadow-xs flex flex-col justify-between hover:border-amber-300 transition-colors">
                                    <div>
                                        <div className="flex items-center justify-between mb-3">
                                            <div className="flex items-center gap-2">
                                                <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
                                                    <BookOpen className="w-5 h-5 stroke-[2.5]" />
                                                </div>
                                                <div>
                                                    <h4 className="text-sm font-extrabold text-slate-900">Master Accounts</h4>
                                                    <p className="text-[11px] text-slate-500 font-medium">Ledgers &amp; Groups</p>
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => handleSubTabChange('masters')}
                                                className="text-xs font-bold text-amber-700 hover:text-amber-800 bg-amber-50 px-2 py-1 rounded-lg cursor-pointer transition-colors"
                                            >
                                                View Table →
                                            </button>
                                        </div>

                                        <div className="my-3">
                                            <div className="flex items-baseline gap-2">
                                                <span className="text-3xl font-black text-slate-900 tracking-tight">
                                                    {cachedMasterCount.toLocaleString()}
                                                </span>
                                                <span className="text-xs font-bold text-slate-400 uppercase">Accounts</span>
                                            </div>
                                            <p className="text-[11px] text-slate-500 font-medium mt-1">
                                                Last Synced: <span className="font-bold text-slate-700">{fmtTs(cachedMasterTs)}</span>
                                            </p>
                                        </div>

                                        {masterSyncResult && (
                                            <p className={`text-xs font-bold mb-3 ${masterSyncResult.startsWith('✅') ? 'text-emerald-600' : 'text-rose-600'}`}>
                                                {masterSyncResult}
                                            </p>
                                        )}
                                    </div>

                                    <div className="pt-3 border-t border-slate-100 flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={handleSyncMasters}
                                            disabled={syncingMasters || connectionStatus !== 'connected' || companies.length === 0 || !selectedCompany}
                                            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-amber-600 hover:bg-amber-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold rounded-xl text-xs transition-colors shadow-2xs cursor-pointer disabled:cursor-not-allowed"
                                        >
                                            {syncingMasters ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                                            <span>{companies.length === 0 ? 'No Company Open' : syncingMasters ? 'Fetching...' : 'Fetch Ledgers'}</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleExportJSON('master')}
                                            disabled={cachedMasterCount === 0}
                                            className="px-2.5 py-2 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-700 font-bold rounded-xl text-xs transition-colors cursor-pointer"
                                            title="Export to JSON"
                                        >
                                            <Download className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                </div>

                                {/* 2. Inventory Items Card */}
                                <div className="bg-white rounded-2xl p-5 border border-slate-200/70 shadow-xs flex flex-col justify-between hover:border-indigo-300 transition-colors">
                                    <div>
                                        <div className="flex items-center justify-between mb-3">
                                            <div className="flex items-center gap-2">
                                                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                                                    <Package className="w-5 h-5 stroke-[2.5]" />
                                                </div>
                                                <div>
                                                    <h4 className="text-sm font-extrabold text-slate-900">Inventory Items</h4>
                                                    <p className="text-[11px] text-slate-500 font-medium">Stock &amp; Balances</p>
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => handleSubTabChange('inventory')}
                                                className="text-xs font-bold text-indigo-700 hover:text-indigo-800 bg-indigo-50 px-2 py-1 rounded-lg cursor-pointer transition-colors"
                                            >
                                                View Table →
                                            </button>
                                        </div>

                                        <div className="my-3">
                                            <div className="flex items-baseline gap-2">
                                                <span className="text-3xl font-black text-slate-900 tracking-tight">
                                                    {cachedItemCount.toLocaleString()}
                                                </span>
                                                <span className="text-xs font-bold text-slate-400 uppercase">Items</span>
                                            </div>
                                            <p className="text-[11px] text-slate-500 font-medium mt-1">
                                                Last Synced: <span className="font-bold text-slate-700">{fmtTs(cachedItemTs)}</span>
                                            </p>
                                        </div>

                                        {itemSyncResult && (
                                            <p className={`text-xs font-bold mb-3 ${itemSyncResult.startsWith('✅') ? 'text-emerald-600' : 'text-rose-600'}`}>
                                                {itemSyncResult}
                                            </p>
                                        )}
                                    </div>

                                    <div className="pt-3 border-t border-slate-100 flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={handleSyncStockItems}
                                            disabled={syncingItems || connectionStatus !== 'connected' || companies.length === 0 || !selectedCompany}
                                            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold rounded-xl text-xs transition-colors shadow-2xs cursor-pointer disabled:cursor-not-allowed"
                                        >
                                            {syncingItems ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                                            <span>{companies.length === 0 ? 'No Company Open' : syncingItems ? 'Fetching...' : 'Fetch Stock Items'}</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleExportJSON('inventory')}
                                            disabled={cachedItemCount === 0}
                                            className="px-2.5 py-2 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-700 font-bold rounded-xl text-xs transition-colors cursor-pointer"
                                            title="Export to JSON"
                                        >
                                            <Download className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                </div>

                                {/* 3. Transactions Card */}
                                <div className="bg-white rounded-2xl p-5 border border-slate-200/70 shadow-xs flex flex-col justify-between hover:border-blue-300 transition-colors">
                                    <div>
                                        <div className="flex items-center justify-between mb-3">
                                            <div className="flex items-center gap-2">
                                                <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                                                    <ArrowRightLeft className="w-5 h-5 stroke-[2.5]" />
                                                </div>
                                                <div>
                                                    <h4 className="text-sm font-extrabold text-slate-900">Vouchers &amp; Txns</h4>
                                                    <p className="text-[11px] text-slate-500 font-medium">Journal &amp; Invoices</p>
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => handleSubTabChange('transactions')}
                                                className="text-xs font-bold text-blue-700 hover:text-blue-800 bg-blue-50 px-2 py-1 rounded-lg cursor-pointer transition-colors"
                                            >
                                                View Table →
                                            </button>
                                        </div>

                                        <div className="my-3">
                                            <div className="flex items-baseline gap-2">
                                                <span className="text-3xl font-black text-slate-900 tracking-tight">
                                                    {cachedTxnCount.toLocaleString()}
                                                </span>
                                                <span className="text-xs font-bold text-slate-400 uppercase">Vouchers</span>
                                            </div>
                                            <p className="text-[11px] text-slate-500 font-medium mt-1">
                                                Last Synced: <span className="font-bold text-slate-700">{fmtTs(cachedTxnTs)}</span>
                                                {cachedTxnFy && <span className="text-slate-400"> ({cachedTxnFy.name})</span>}
                                            </p>
                                        </div>

                                        {txnSyncResult && (
                                            <p className={`text-xs font-bold mb-3 ${txnSyncResult.startsWith('✅') ? 'text-emerald-600' : 'text-rose-600'}`}>
                                                {txnSyncResult}
                                            </p>
                                        )}
                                    </div>

                                    <div className="pt-3 border-t border-slate-100 flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={handleSyncTransactions}
                                            disabled={syncingTxns || connectionStatus !== 'connected' || companies.length === 0 || !selectedCompany}
                                            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold rounded-xl text-xs transition-colors shadow-2xs cursor-pointer disabled:cursor-not-allowed"
                                        >
                                            {syncingTxns ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                                            <span>{companies.length === 0 ? 'No Company Open' : syncingTxns ? 'Fetching...' : 'Fetch Date Range'}</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleExportJSON('transaction')}
                                            disabled={cachedTxnCount === 0}
                                            className="px-2.5 py-2 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-700 font-bold rounded-xl text-xs transition-colors cursor-pointer"
                                            title="Export to JSON"
                                        >
                                            <Download className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Transaction Range & Sync Console */}
                            <div className="bg-white rounded-2xl border border-slate-200/70 p-5 shadow-xs">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                                    <div>
                                        <h4 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                                            <Clock className="w-4 h-4 text-blue-600" />
                                            <span>Transaction Fetch Range &amp; Presets</span>
                                        </h4>
                                        <p className="text-xs text-slate-500 font-medium">
                                            Choose date range to fetch vouchers from <span className="font-bold text-slate-700">{selectedCompany || (companies.length === 0 ? 'Tally (No Company Open)' : 'Tally')}</span>.
                                        </p>
                                    </div>

                                    {/* Quick Presets */}
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                        <span className="text-[10px] font-extrabold text-slate-400 mr-1">Presets:</span>
                                        <button
                                            type="button"
                                            onClick={() => { setTxnDateFrom('2020-04-01'); setTxnDateTo('2030-03-31'); }}
                                            className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                                        >
                                            🌟 All Time
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => { setTxnDateFrom('2026-04-01'); setTxnDateTo('2027-03-31'); }}
                                            className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                                        >
                                            FY 2026-27
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => { setTxnDateFrom('2025-04-01'); setTxnDateTo('2026-03-31'); }}
                                            className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                                        >
                                            FY 2025-26
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => { setTxnDateFrom('2024-04-01'); setTxnDateTo('2025-03-31'); }}
                                            className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                                        >
                                            FY 2024-25
                                        </button>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                                    <div className="sm:col-span-4">
                                        <label className="block text-[11px] font-extrabold text-slate-500 uppercase tracking-wider mb-1">From Date</label>
                                        <input
                                            type="date"
                                            value={txnDateFrom}
                                            onChange={(e) => setTxnDateFrom(e.target.value)}
                                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-blue-500"
                                        />
                                    </div>
                                    <div className="sm:col-span-4">
                                        <label className="block text-[11px] font-extrabold text-slate-500 uppercase tracking-wider mb-1">To Date</label>
                                        <input
                                            type="date"
                                            value={txnDateTo}
                                            onChange={(e) => setTxnDateTo(e.target.value)}
                                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-blue-500"
                                        />
                                    </div>
                                    <div className="sm:col-span-4 flex gap-2">
                                        <button
                                            type="button"
                                            onClick={handleSyncTransactions}
                                            disabled={syncingTxns || connectionStatus !== 'connected' || companies.length === 0 || !selectedCompany}
                                            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer disabled:cursor-not-allowed"
                                        >
                                            {syncingTxns ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                                            <span>{companies.length === 0 ? 'No Company Open' : syncingTxns ? 'Fetching...' : 'Fetch Range Data'}</span>
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* System Status & Local Storage Manager */}
                            <div className="bg-white rounded-2xl border border-slate-200/70 p-5 shadow-xs">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2.5 bg-slate-100 text-slate-600 rounded-xl">
                                            <HardDrive className="w-5 h-5 stroke-[2.5]" />
                                        </div>
                                        <div>
                                            <h4 className="text-sm font-extrabold text-slate-900">Local Browser Cache</h4>
                                            <p className="text-xs text-slate-500 font-medium">
                                                All synced records stay locally in your browser session for maximum privacy and instant speed.
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-3">
                                        <div className="text-right hidden sm:block">
                                            <p className="text-xs font-extrabold text-slate-800">{formatBytes(cacheBytes)}</p>
                                            <p className="text-[10px] text-slate-400 font-medium">Storage Used</p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={handleClearCache}
                                            disabled={cacheBytes === 0}
                                            className="flex items-center gap-1.5 px-3 py-2 bg-rose-50 hover:bg-rose-100 disabled:opacity-40 text-rose-700 font-bold rounded-xl text-xs transition-colors cursor-pointer border border-rose-200/60"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                            <span>Clear Cache</span>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ───────────────────────────────────────────────────────── */}
                    {/* SUB-TABS 2, 3, 4: INTERACTIVE DATA TABLES                 */}
                    {/* (Transactions, Inventory, Masters)                        */}
                    {/* ───────────────────────────────────────────────────────── */}
                    {(activeSubTab === 'transactions' || activeSubTab === 'inventory' || activeSubTab === 'masters') && (
                        <div className="flex flex-col h-full min-h-0 bg-white">
                            
                            {/* Table Control & Filter Header */}
                            <div className="shrink-0 bg-white border-b border-slate-200/80 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2.5">
                                <div className="flex items-center gap-2 flex-1 min-w-[200px] max-w-md">
                                    <div className="relative w-full">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                        <input
                                            type="text"
                                            placeholder={`Search in ${activeSubTab}...`}
                                            value={tableSearch}
                                            onChange={(e) => { setTableSearch(e.target.value); setTablePage(1); }}
                                            className="w-full pl-9 pr-3 py-1.5 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors"
                                        />
                                    </div>
                                </div>

                                <div className="flex items-center gap-2 flex-wrap">
                                    {/* Filter Toggle */}
                                    <button
                                        type="button"
                                        onClick={() => setShowFilters(!showFilters)}
                                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                                            showFilters || activeFilterCount > 0
                                                ? 'bg-blue-100 text-blue-700'
                                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                        }`}
                                    >
                                        <Filter className="w-3.5 h-3.5" />
                                        <span>Filters</span>
                                        {activeFilterCount > 0 && (
                                            <span className="bg-blue-600 text-white text-[10px] px-1.5 py-0.2 rounded-full font-black">
                                                {activeFilterCount}
                                            </span>
                                        )}
                                    </button>

                                    {activeFilterCount > 0 && (
                                        <button
                                            type="button"
                                            onClick={resetFilters}
                                            className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                                        >
                                            <RotateCcw className="w-3 h-3" />
                                            <span>Reset</span>
                                        </button>
                                    )}

                                    {/* Export JSON */}
                                    <button
                                        type="button"
                                        onClick={() => handleExportJSON(activeSubTab === 'transactions' ? 'transaction' : activeSubTab === 'inventory' ? 'inventory' : 'master')}
                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors cursor-pointer"
                                    >
                                        <Download className="w-3.5 h-3.5" />
                                        <span>Export JSON</span>
                                    </button>

                                    {/* Record Counter */}
                                    <span className="text-xs text-slate-400 font-medium hidden sm:inline ml-1">
                                        {filteredCurrentData.length} records
                                    </span>
                                </div>
                            </div>

                            {/* Dropdown Filters Tray */}
                            {showFilters && (
                                <div className="shrink-0 bg-slate-50 border-b border-slate-200 px-4 py-3 flex flex-wrap gap-3 items-end">
                                    {activeSubTab === 'transactions' && (
                                        <>
                                            <div>
                                                <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-1">Voucher Type</label>
                                                <select
                                                    value={txnFilterType}
                                                    onChange={(e) => { setTxnFilterType(e.target.value); setTablePage(1); }}
                                                    className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-bold bg-white text-slate-800 min-w-[140px]"
                                                >
                                                    <option value="">All Types</option>
                                                    {uniqueVoucherTypes.map(t => <option key={t} value={t}>{t}</option>)}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-1">Date From</label>
                                                <input
                                                    type="date"
                                                    value={txnFilterDateFrom}
                                                    onChange={(e) => { setTxnFilterDateFrom(e.target.value); setTablePage(1); }}
                                                    className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-bold bg-white text-slate-800"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-1">Date To</label>
                                                <input
                                                    type="date"
                                                    value={txnFilterDateTo}
                                                    onChange={(e) => { setTxnFilterDateTo(e.target.value); setTablePage(1); }}
                                                    className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-bold bg-white text-slate-800"
                                                />
                                            </div>
                                        </>
                                    )}

                                    {activeSubTab === 'inventory' && (
                                        <div>
                                            <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-1">Stock Group</label>
                                            <select
                                                value={itemFilterGroup}
                                                onChange={(e) => { setItemFilterGroup(e.target.value); setTablePage(1); }}
                                                className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-bold bg-white text-slate-800 min-w-[160px]"
                                            >
                                                <option value="">All Groups</option>
                                                {uniqueItemGroups.map(g => <option key={g} value={g}>{g}</option>)}
                                            </select>
                                        </div>
                                    )}

                                    {activeSubTab === 'masters' && (
                                        <>
                                            <div>
                                                <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-1">Account Group</label>
                                                <select
                                                    value={masterFilterGroup}
                                                    onChange={(e) => { setMasterFilterGroup(e.target.value); setTablePage(1); }}
                                                    className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-bold bg-white text-slate-800 min-w-[160px]"
                                                >
                                                    <option value="">All Groups</option>
                                                    {uniqueMasterGroups.map(g => <option key={g} value={g}>{g}</option>)}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-1">Balance Type</label>
                                                <select
                                                    value={masterFilterBalType}
                                                    onChange={(e) => { setMasterFilterBalType(e.target.value); setTablePage(1); }}
                                                    className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-bold bg-white text-slate-800 min-w-[130px]"
                                                >
                                                    <option value="">All</option>
                                                    <option value="Dr">Debit (Dr)</option>
                                                    <option value="Cr">Credit (Cr)</option>
                                                    <option value="nonzero">Non-Zero Balance</option>
                                                    <option value="zero">Zero Balance</option>
                                                </select>
                                            </div>
                                        </>
                                    )}
                                </div>
                            )}

                            {/* Table Body Area */}
                            <div className="flex-1 min-h-0 overflow-auto">
                                
                                {/* Info banner if showing cached records while no company is open */}
                                {connectionStatus === 'connected' && companies.length === 0 && paginatedData.length > 0 && (
                                    <div className="bg-amber-50/90 border-b border-amber-200 px-4 py-2 flex items-center justify-between text-xs text-amber-800 shrink-0 sticky top-0 z-20">
                                        <div className="flex items-center gap-2 font-medium">
                                            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                                            <span>Showing cached records. Currently no company is open in TallyPrime.</span>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={handleTestConnection}
                                            className="font-bold underline text-amber-900 hover:text-amber-950 cursor-pointer text-xs"
                                        >
                                            Check for Company
                                        </button>
                                    </div>
                                )}
                                
                                {/* ── Transactions Table ── */}
                                {activeSubTab === 'transactions' && (
                                    <table className="min-w-full text-sm">
                                        <thead className="bg-slate-50 sticky top-0 z-10 border-b border-slate-200">
                                            <tr>
                                                {[
                                                    ['date', 'Date'],
                                                    ['type', 'Type'],
                                                    ['voucherNo', 'Vch No'],
                                                    ['debitAccount', 'Debit Account'],
                                                    ['creditAccount', 'Credit Account'],
                                                    ['debitAmount', 'Amount', 'right'],
                                                ].map(([f, l, align]) => (
                                                    <th
                                                        key={f}
                                                        onClick={() => handleSort(f)}
                                                        className={`px-3 py-2.5 text-${align || 'left'} text-[11px] font-extrabold text-slate-500 uppercase tracking-wider cursor-pointer select-none hover:bg-slate-100 transition-colors`}
                                                    >
                                                        <span className={`flex items-center gap-1 ${align === 'right' ? 'justify-end' : ''}`}>
                                                            {l} <SortIcon field={f} />
                                                        </span>
                                                    </th>
                                                ))}
                                                <th className="px-2 py-2.5 w-8"></th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {paginatedData.map((t, idx) => {
                                                const hasEntries = (t.allDebitEntries?.length > 1 || t.allCreditEntries?.length > 1 || ((t.allDebitEntries?.length || 0) + (t.allCreditEntries?.length || 0) > 2));
                                                const hasItems = t.inventory?.length > 0;
                                                const isMulti = hasEntries || hasItems || t.narration;
                                                const isExp = expandedRows.has(t.id || idx);

                                                return (
                                                    <React.Fragment key={t.id || idx}>
                                                        <tr
                                                            className={`hover:bg-blue-50/30 transition-colors ${isMulti ? 'cursor-pointer' : ''}`}
                                                            onClick={() => isMulti && toggleRow(t.id || idx)}
                                                        >
                                                            <td className="px-3 py-2 font-medium text-slate-700 whitespace-nowrap text-xs">{t.date}</td>
                                                            <td className="px-3 py-2">
                                                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 font-bold text-slate-600">{t.type}</span>
                                                            </td>
                                                            <td className="px-3 py-2 text-xs text-slate-600 font-medium">
                                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                                    <span>{t.voucherNo || t.voucherNumber || '-'}</span>
                                                                    {t._syncAction === 'created' && (
                                                                        <span className="text-[9px] bg-emerald-100 text-emerald-800 border border-emerald-300 px-1.5 py-0.2 rounded font-black animate-pulse">
                                                                            ✨ NEW
                                                                        </span>
                                                                    )}
                                                                    {t._syncAction === 'altered' && (
                                                                        <span className="text-[9px] bg-amber-100 text-amber-800 border border-amber-300 px-1.5 py-0.2 rounded font-black">
                                                                            🔄 ALTERED
                                                                        </span>
                                                                    )}
                                                                    {hasItems && (
                                                                        <span className="text-[9px] bg-purple-50 text-purple-700 border border-purple-200/80 px-1 py-0.2 rounded font-bold whitespace-nowrap">
                                                                            📦 {t.inventory.length}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </td>
                                                            <td className="px-3 py-2 text-xs font-bold text-orange-700 max-w-[160px] truncate">
                                                                {t.debitAccount}
                                                                {t.allDebitAccounts?.length > 1 && (
                                                                    <span className="ml-1 text-[9px] bg-orange-100 text-orange-600 px-1 rounded">
                                                                        +{t.allDebitAccounts.length - 1}
                                                                    </span>
                                                                )}
                                                            </td>
                                                            <td className="px-3 py-2 text-xs font-bold text-green-700 max-w-[160px] truncate">
                                                                {t.creditAccount}
                                                                {t.allCreditAccounts?.length > 1 && (
                                                                    <span className="ml-1 text-[9px] bg-green-100 text-green-600 px-1 rounded">
                                                                        +{t.allCreditAccounts.length - 1}
                                                                    </span>
                                                                )}
                                                            </td>
                                                            <td className="px-3 py-2 text-right font-mono text-xs font-bold text-slate-900">
                                                                {fmtCur(t.debitAmount || t.creditAmount || t.amount)}
                                                            </td>
                                                            <td className="px-2 py-2 text-center">
                                                                {isMulti && (isExp ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />)}
                                                            </td>
                                                        </tr>

                                                        {isExp && (
                                                            <tr>
                                                                <td colSpan={7} className="bg-slate-50/80 px-6 py-3 border-y border-slate-200">
                                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                                                                        <div>
                                                                            <p className="font-extrabold text-orange-600 mb-1 uppercase tracking-wider text-[10px]">Debit Entries</p>
                                                                            {(t.allDebitEntries || []).map((e, i) => (
                                                                                <div key={i} className="flex justify-between py-0.5">
                                                                                    <span className="text-slate-700 font-medium">{e.name}</span>
                                                                                    <span className="font-mono font-bold text-slate-800">{fmtCur(e.amount)}</span>
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                        <div>
                                                                            <p className="font-extrabold text-green-600 mb-1 uppercase tracking-wider text-[10px]">Credit Entries</p>
                                                                            {(t.allCreditEntries || []).map((e, i) => (
                                                                                <div key={i} className="flex justify-between py-0.5">
                                                                                    <span className="text-slate-700 font-medium">{e.name}</span>
                                                                                    <span className="font-mono font-bold text-slate-800">{fmtCur(e.amount)}</span>
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    </div>
                                                                    {t.narration && <p className="mt-2 text-xs text-slate-500 italic">📝 {t.narration}</p>}
                                                                    {hasItems && (
                                                                        <div className="mt-3 pt-3 border-t border-slate-200">
                                                                            <p className="font-extrabold text-purple-700 mb-1.5 uppercase tracking-wider text-[10px] flex items-center gap-1.5">
                                                                                <Package className="w-3.5 h-3.5" /> Inventory Entries ({t.inventory.length})
                                                                            </p>
                                                                            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
                                                                                <table className="min-w-full text-xs">
                                                                                    <thead className="bg-slate-100 text-[10px] font-extrabold text-slate-600 uppercase tracking-wider">
                                                                                        <tr>
                                                                                            <th className="px-3 py-1.5 text-left">Item Name</th>
                                                                                            <th className="px-3 py-1.5 text-right">Quantity</th>
                                                                                            <th className="px-3 py-1.5 text-right">Rate</th>
                                                                                            <th className="px-3 py-1.5 text-right">Amount</th>
                                                                                        </tr>
                                                                                    </thead>
                                                                                    <tbody className="divide-y divide-slate-100">
                                                                                        {t.inventory.map((inv, i) => (
                                                                                            <tr key={i} className="hover:bg-purple-50/20">
                                                                                                <td className="px-3 py-1.5 font-bold text-slate-800">{inv.itemName}</td>
                                                                                                <td className="px-3 py-1.5 text-right font-mono text-slate-700">{inv.qty}</td>
                                                                                                <td className="px-3 py-1.5 text-right font-mono text-slate-700">{inv.rate}</td>
                                                                                                <td className="px-3 py-1.5 text-right font-mono font-bold text-slate-900">{fmtCur(inv.amount)}</td>
                                                                                            </tr>
                                                                                        ))}
                                                                                    </tbody>
                                                                                </table>
                                                                            </div>
                                                                        </div>
                                                                    )}
                                                                </td>
                                                            </tr>
                                                        )}
                                                    </React.Fragment>
                                                );
                                            })}
                                            {paginatedData.length === 0 && (
                                                <tr>
                                                    <td colSpan={7} className="text-center py-16 px-4">
                                                        {connectionStatus === 'connected' && companies.length === 0 ? (
                                                            <div className="max-w-sm mx-auto flex flex-col items-center">
                                                                <div className="p-3 bg-amber-50 text-amber-600 rounded-2xl mb-2.5">
                                                                    <Building2 className="w-6 h-6" />
                                                                </div>
                                                                <p className="font-extrabold text-sm text-slate-800">No Company Open in TallyPrime</p>
                                                                <p className="text-xs text-slate-500 mt-1">
                                                                    Please open a company in TallyPrime (<kbd className="bg-slate-100 border border-slate-200 px-1 py-0.5 rounded font-bold">F3 &gt; Select Company</kbd>) to view and sync transactions.
                                                                </p>
                                                                <button
                                                                    type="button"
                                                                    onClick={handleTestConnection}
                                                                    className="mt-3.5 px-3.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                                                                >
                                                                    Check for Company
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <span className="text-slate-400 font-medium">
                                                                No transactions found. Fetch from Tally or adjust search.
                                                            </span>
                                                        )}
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                )}

                                {/* ── Inventory Table ── */}
                                {activeSubTab === 'inventory' && (
                                    <table className="min-w-full text-sm">
                                        <thead className="bg-slate-50 sticky top-0 z-10 border-b border-slate-200">
                                            <tr>
                                                {[
                                                    ['name', 'Item Name'],
                                                    ['group', 'Stock Group'],
                                                    ['category', 'Category'],
                                                    ['baseUnits', 'Unit', 'center'],
                                                    ['openingBalance', 'Opening Qty', 'right'],
                                                    ['closingBalance', 'Closing Qty', 'right'],
                                                    ['closingRate', 'Rate', 'right'],
                                                    ['closingValue', 'Closing Value', 'right']
                                                ].map(([f, l, align]) => (
                                                    <th
                                                        key={f}
                                                        onClick={() => handleSort(f)}
                                                        className={`px-3 py-2.5 text-${align || 'left'} text-[11px] font-extrabold text-slate-500 uppercase tracking-wider cursor-pointer select-none hover:bg-slate-100 transition-colors ${
                                                            f === 'category' || f === 'openingBalance' ? 'hidden md:table-cell' : f === 'closingRate' ? 'hidden lg:table-cell' : ''
                                                        }`}
                                                    >
                                                        <span className={`flex items-center gap-1 ${align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : ''}`}>
                                                            {l} <SortIcon field={f} />
                                                        </span>
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {paginatedData.map((item, idx) => (
                                                <tr key={item.id || idx} className="hover:bg-blue-50/30 transition-colors">
                                                    <td className="px-3 py-2 font-bold text-slate-900 max-w-[220px] truncate text-xs">{item.name}</td>
                                                    <td className="px-3 py-2 text-slate-600 font-medium text-xs">{item.group || '-'}</td>
                                                    <td className="hidden md:table-cell px-3 py-2 text-xs text-slate-500">{item.category || '-'}</td>
                                                    <td className="px-3 py-2 text-center text-xs font-mono font-medium text-slate-600">{item.baseUnits || '-'}</td>
                                                    <td className="hidden md:table-cell px-3 py-2 text-right font-mono text-xs text-slate-600">{item.openingBalance || '-'}</td>
                                                    <td className="px-3 py-2 text-right font-mono text-xs font-bold">
                                                        <span className={item.closingQty < 0 ? 'text-rose-600 font-bold' : item.closingQty > 0 ? 'text-emerald-700 font-bold' : 'text-slate-500'}>
                                                            {item.closingBalance || '-'}
                                                        </span>
                                                    </td>
                                                    <td className="hidden lg:table-cell px-3 py-2 text-right font-mono text-xs text-slate-600">{item.closingRate || '-'}</td>
                                                    <td className="px-3 py-2 text-right font-mono text-xs font-bold text-slate-900">
                                                        {item.closingValue ? fmtCur(item.closingValue) : '-'}
                                                    </td>
                                                </tr>
                                            ))}
                                            {paginatedData.length === 0 && (
                                                <tr>
                                                    <td colSpan={8} className="text-center py-16 px-4">
                                                        {connectionStatus === 'connected' && companies.length === 0 ? (
                                                            <div className="max-w-sm mx-auto flex flex-col items-center">
                                                                <div className="p-3 bg-amber-50 text-amber-600 rounded-2xl mb-2.5">
                                                                    <Building2 className="w-6 h-6" />
                                                                </div>
                                                                <p className="font-extrabold text-sm text-slate-800">No Company Open in TallyPrime</p>
                                                                <p className="text-xs text-slate-500 mt-1">
                                                                    Please open a company in TallyPrime (<kbd className="bg-slate-100 border border-slate-200 px-1 py-0.5 rounded font-bold">F3 &gt; Select Company</kbd>) to view and sync stock items.
                                                                </p>
                                                                <button
                                                                    type="button"
                                                                    onClick={handleTestConnection}
                                                                    className="mt-3.5 px-3.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                                                                >
                                                                    Check for Company
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <span className="text-slate-400 font-medium">
                                                                No inventory items found. Fetch from Tally or adjust search.
                                                            </span>
                                                        )}
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                )}

                                {/* ── Masters Table ── */}
                                {activeSubTab === 'masters' && (
                                    <table className="min-w-full text-sm">
                                        <thead className="bg-slate-50 sticky top-0 z-10 border-b border-slate-200">
                                            <tr>
                                                {[
                                                    ['name', 'Name'],
                                                    ['group', 'Group'],
                                                    ['openingBalance', 'Opening Bal', 'right'],
                                                    ['openingBalanceType', 'Type', 'center'],
                                                    ['address', 'Address'],
                                                    ['contact', 'Contact']
                                                ].map(([f, l, align]) => (
                                                    <th
                                                        key={f}
                                                        onClick={() => handleSort(f)}
                                                        className={`px-4 py-2.5 text-${align || 'left'} text-[11px] font-extrabold text-slate-500 uppercase tracking-wider cursor-pointer select-none hover:bg-slate-100 transition-colors ${
                                                            f === 'address' || f === 'contact' ? 'hidden md:table-cell' : ''
                                                        }`}
                                                    >
                                                        <span className={`flex items-center gap-1 ${align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : ''}`}>
                                                            {l} <SortIcon field={f} />
                                                        </span>
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {paginatedData.map((m, idx) => (
                                                <tr key={m.id || idx} className="hover:bg-blue-50/30 transition-colors">
                                                    <td className="px-4 py-2 font-bold text-slate-900 max-w-[220px] truncate text-xs">{m.name}</td>
                                                    <td className="px-4 py-2 text-slate-600 font-medium text-xs">{m.group || '-'}</td>
                                                    <td className="px-4 py-2 text-right font-mono text-xs font-bold text-slate-900">
                                                        {m.openingBalance ? fmtCur(m.openingBalance) : '-'}
                                                    </td>
                                                    <td className="px-4 py-2 text-center">
                                                        {m.openingBalanceType && (
                                                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                                                                m.openingBalanceType === 'Dr' ? 'bg-orange-100 text-orange-700' : 'bg-emerald-100 text-emerald-700'
                                                            }`}>
                                                                {m.openingBalanceType}
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="hidden md:table-cell px-4 py-2 text-xs text-slate-500 max-w-[150px] truncate">{m.address || '-'}</td>
                                                    <td className="hidden md:table-cell px-4 py-2 text-xs text-slate-500">{m.contact || '-'}</td>
                                                </tr>
                                            ))}
                                            {paginatedData.length === 0 && (
                                                <tr>
                                                    <td colSpan={6} className="text-center py-16 px-4">
                                                        {connectionStatus === 'connected' && companies.length === 0 ? (
                                                            <div className="max-w-sm mx-auto flex flex-col items-center">
                                                                <div className="p-3 bg-amber-50 text-amber-600 rounded-2xl mb-2.5">
                                                                    <Building2 className="w-6 h-6" />
                                                                </div>
                                                                <p className="font-extrabold text-sm text-slate-800">No Company Open in TallyPrime</p>
                                                                <p className="text-xs text-slate-500 mt-1">
                                                                    Please open a company in TallyPrime (<kbd className="bg-slate-100 border border-slate-200 px-1 py-0.5 rounded font-bold">F3 &gt; Select Company</kbd>) to view and sync ledger accounts.
                                                                </p>
                                                                <button
                                                                    type="button"
                                                                    onClick={handleTestConnection}
                                                                    className="mt-3.5 px-3.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                                                                >
                                                                    Check for Company
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <span className="text-slate-400 font-medium">
                                                                No master accounts found. Fetch from Tally or adjust search.
                                                            </span>
                                                        )}
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                )}
                            </div>

                            {/* Pinned Bottom Pagination */}
                            <div className="shrink-0 bg-white border-t border-slate-200 px-4 py-2 flex items-center justify-between">
                                <p className="text-xs text-slate-500 font-medium">
                                    Page {tablePage} of {totalPages} · {filteredCurrentData.length} records
                                </p>
                                <div className="flex items-center gap-1">
                                    <button
                                        type="button"
                                        onClick={() => setTablePage(1)}
                                        disabled={tablePage <= 1}
                                        className="px-2 py-1 rounded-lg hover:bg-slate-100 disabled:opacity-30 text-xs font-bold text-slate-500 transition-colors cursor-pointer"
                                    >
                                        First
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setTablePage(p => Math.max(1, p - 1))}
                                        disabled={tablePage <= 1}
                                        className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-30 transition-colors cursor-pointer"
                                    >
                                        <ChevronLeft className="w-4 h-4" />
                                    </button>
                                    <span className="text-xs font-bold text-slate-700 px-2">{tablePage}</span>
                                    <button
                                        type="button"
                                        onClick={() => setTablePage(p => Math.min(totalPages, p + 1))}
                                        disabled={tablePage >= totalPages}
                                        className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-30 transition-colors cursor-pointer"
                                    >
                                        <ChevronRight className="w-4 h-4" />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setTablePage(totalPages)}
                                        disabled={tablePage >= totalPages}
                                        className="px-2 py-1 rounded-lg hover:bg-slate-100 disabled:opacity-30 text-xs font-bold text-slate-500 transition-colors cursor-pointer"
                                    >
                                        Last
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ───────────────────────────────────────────────────────── */}
                    {/* SUB-TAB 5: DEEP DATA ANALYTICS & CACHE INSIGHTS           */}
                    {/* ───────────────────────────────────────────────────────── */}
                    {activeSubTab === 'analytics' && (
                        <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
                            {/* Summary Bar */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-2xs text-center">
                                    <p className="text-2xl font-black text-slate-900">{cachedMasterCount.toLocaleString()}</p>
                                    <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mt-1">Total Ledgers</p>
                                </div>
                                <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-2xs text-center">
                                    <p className="text-2xl font-black text-indigo-700">{cachedItemCount.toLocaleString()}</p>
                                    <p className="text-[10px] font-extrabold text-indigo-400 uppercase tracking-wider mt-1">Stock Items</p>
                                </div>
                                <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-2xs text-center">
                                    <p className="text-2xl font-black text-blue-700">{cachedTxnCount.toLocaleString()}</p>
                                    <p className="text-[10px] font-extrabold text-blue-400 uppercase tracking-wider mt-1">Vouchers</p>
                                </div>
                                <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-2xs text-center">
                                    <p className="text-2xl font-black text-slate-800">{formatBytes(cacheBytes)}</p>
                                    <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mt-1">Storage Consumed</p>
                                </div>
                            </div>

                            {/* Vouchers Breakdown */}
                            {txnStats ? (
                                <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-2xs">
                                    <h4 className="text-sm font-extrabold text-slate-900 mb-4 flex items-center gap-2">
                                        <ArrowRightLeft className="w-4 h-4 text-blue-600" />
                                        <span>Voucher Types &amp; Volume Breakdown</span>
                                    </h4>
                                    
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {/* By Type */}
                                        <div className="bg-slate-50 rounded-xl p-4">
                                            <p className="text-xs font-extrabold text-slate-600 uppercase tracking-wider mb-2">By Voucher Type ({txnStats.types.length})</p>
                                            <div className="space-y-2 max-h-56 overflow-y-auto">
                                                {txnStats.types.map(([tp, c]) => {
                                                    const pct = ((c / txnStats.total) * 100).toFixed(1);
                                                    return (
                                                        <div key={tp} className="bg-white rounded-lg border border-slate-200/80 overflow-hidden">
                                                            <div className="flex items-center justify-between px-3 py-1.5 text-xs">
                                                                <span className="font-bold text-slate-800">{tp}</span>
                                                                <span className="font-mono text-slate-600 font-bold">{c} <span className="text-slate-400 font-normal">({pct}%)</span></span>
                                                            </div>
                                                            <div className="h-1 bg-slate-100">
                                                                <div className="h-full bg-blue-500 rounded-r" style={{ width: `${pct}%` }}></div>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        {/* Monthly Volume */}
                                        <div className="bg-slate-50 rounded-xl p-4">
                                            <p className="text-xs font-extrabold text-slate-600 uppercase tracking-wider mb-2">Monthly Activity</p>
                                            <div className="space-y-1.5 max-h-56 overflow-y-auto">
                                                {txnStats.monthlyVolume.map(([month, c]) => {
                                                    const maxVol = Math.max(...txnStats.monthlyVolume.map(([,v]) => v));
                                                    const pct = ((c / maxVol) * 100).toFixed(0);
                                                    return (
                                                        <div key={month} className="flex items-center gap-2">
                                                            <span className="text-xs font-mono font-bold text-slate-600 w-20 shrink-0">{month}</span>
                                                            <div className="flex-1 bg-white rounded-lg border border-slate-200/80 overflow-hidden h-6 flex items-center">
                                                                <div className="h-full bg-blue-200 flex items-center px-2" style={{ width: `${pct}%` }}>
                                                                    <span className="text-[10px] font-bold text-blue-900 whitespace-nowrap">{c}</span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                            <p className="text-[11px] text-slate-400 mt-2 font-medium">
                                                Period: {txnStats.minDate} → {txnStats.maxDate}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            ) : null}

                            {/* Inventory Stock Groups */}
                            {itemStats ? (
                                <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-2xs">
                                    <h4 className="text-sm font-extrabold text-slate-900 mb-3 flex items-center gap-2">
                                        <Package className="w-4 h-4 text-indigo-600" />
                                        <span>Stock Groups &amp; Valuation</span>
                                    </h4>
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                                        <div className="bg-emerald-50 rounded-xl p-3 text-center">
                                            <p className="text-xl font-black text-emerald-700">{itemStats.inStock}</p>
                                            <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider mt-0.5">In Stock (&gt;0)</p>
                                        </div>
                                        <div className="bg-rose-50 rounded-xl p-3 text-center">
                                            <p className="text-xl font-black text-rose-700">{itemStats.negStock}</p>
                                            <p className="text-[10px] font-bold text-rose-600 uppercase tracking-wider mt-0.5">Negative Stock</p>
                                        </div>
                                        <div className="bg-slate-50 rounded-xl p-3 text-center">
                                            <p className="text-xl font-black text-slate-600">{itemStats.zeroStock}</p>
                                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">Zero Stock</p>
                                        </div>
                                        <div className="bg-indigo-50 rounded-xl p-3 text-center">
                                            <p className="text-sm font-black text-indigo-800">₹{fmtCur(itemStats.totalVal)}</p>
                                            <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-wider mt-0.5">Total Value</p>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-48 overflow-y-auto">
                                        {itemStats.groups.map(([g, c]) => (
                                            <div key={g} className="flex items-center justify-between bg-slate-50 rounded-xl px-3 py-2 border border-slate-100">
                                                <span className="text-xs text-slate-700 font-bold truncate mr-2">{g}</span>
                                                <span className="text-xs font-bold text-indigo-700 shrink-0">{c} items</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ) : null}

                            {/* Master Account Groups */}
                            {masterStats ? (
                                <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-2xs">
                                    <h4 className="text-sm font-extrabold text-slate-900 mb-3 flex items-center gap-2">
                                        <BookOpen className="w-4 h-4 text-amber-600" />
                                        <span>Master Groups Breakdown</span>
                                    </h4>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-48 overflow-y-auto">
                                        {masterStats.groups.map(([g, c]) => (
                                            <div key={g} className="flex items-center justify-between bg-slate-50 rounded-xl px-3 py-2 border border-slate-100">
                                                <span className="text-xs text-slate-700 font-bold truncate mr-2">{g}</span>
                                                <span className="text-xs font-bold text-amber-700 shrink-0">{c}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ) : null}

                            {!txnStats && !itemStats && !masterStats && (
                                <div className="text-center py-16 text-slate-400 font-medium">
                                    No data available yet. Fetch data from the Overview tab to view analytics.
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* ═══ MODAL: TALLY CONNECTION SETTINGS ═══ */}
            {showConfigModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-xs animate-in fade-in duration-150">
                    <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-lg w-full overflow-hidden">
                        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                                <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                                    <Settings className="w-5 h-5" />
                                </div>
                                <div>
                                    <h3 className="text-base font-extrabold text-slate-900">Tally Server Configuration</h3>
                                    <p className="text-xs text-slate-500 font-medium">Configure endpoint URL and connection proxy</p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowConfigModal(false)}
                                className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-5 space-y-4">
                            <div>
                                <label className="block text-xs font-extrabold text-slate-700 mb-1.5">Tally Endpoint URL</label>
                                <input
                                    type="text"
                                    value={tallyUrl}
                                    onChange={(e) => setTallyUrl(e.target.value)}
                                    placeholder="http://localhost:3001"
                                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500"
                                />
                                <p className="text-[11px] text-slate-400 mt-1.5">
                                    Default proxy: <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-slate-700">http://localhost:3001</code> · Direct: <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-slate-700">http://localhost:9000</code>
                                </p>
                            </div>

                            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80 text-xs text-slate-600 space-y-1.5">
                                <p className="font-extrabold text-slate-800 flex items-center gap-1.5">
                                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                                    <span>CORS Proxy Instruction</span>
                                </p>
                                <p>TallyPrime runs on port 9000 without CORS headers. To allow web browser communication, run:</p>
                                <div className="bg-slate-900 text-emerald-300 font-mono text-[11px] p-2 rounded-lg select-all">
                                    cd tally-proxy &amp;&amp; npm start
                                </div>
                            </div>

                            {connectionStatus === 'connected' && companies.length === 0 && (
                                <div className="p-3.5 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-800">
                                    <p className="font-extrabold flex items-center gap-1.5 text-amber-900">
                                        <Building2 className="w-4 h-4 text-amber-600" />
                                        <span>No Company Open in TallyPrime</span>
                                    </p>
                                    <p className="text-[11px] text-amber-700 mt-1">
                                        Open a company in TallyPrime (<kbd className="bg-white border border-amber-300 px-1 py-0.5 rounded font-bold text-slate-800">F3 &gt; Select Company</kbd>). Once opened, it will appear here automatically.
                                    </p>
                                </div>
                            )}

                            {companies.length > 0 && (
                                <div>
                                    <label className="block text-xs font-extrabold text-slate-700 mb-1.5">Active Company</label>
                                    <select
                                        value={selectedCompany}
                                        onChange={handleCompanyChange}
                                        className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white"
                                    >
                                        {companies.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </div>
                            )}
                        </div>

                        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => setShowConfigModal(false)}
                                className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 font-bold rounded-xl text-xs border border-slate-200 transition-colors cursor-pointer"
                            >
                                Close
                            </button>
                            <button
                                type="button"
                                onClick={async () => {
                                    saveTallyUrl(tallyUrl);
                                    await handleTestConnection();
                                    setShowConfigModal(false);
                                }}
                                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs transition-colors shadow-2xs cursor-pointer"
                            >
                                Save &amp; Test
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══ FLOATING REAL-TIME TOAST NOTIFICATION ═══ */}
            {/* Positioned bottom-20 on mobile to never overlap bottom navigation! */}
            {liveToast && (
                <div className="fixed bottom-20 md:bottom-6 right-4 sm:right-6 z-50 max-w-sm sm:max-w-md w-full pointer-events-auto transition-all animate-in slide-in-from-bottom-5">
                    <div className="bg-slate-950/95 backdrop-blur-md text-white p-4 rounded-2xl shadow-2xl border border-emerald-500/50 flex items-start gap-3">
                        <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-400/40 shrink-0 mt-0.5">
                            <Sparkles className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-[10px] font-black uppercase tracking-wider text-emerald-300 bg-emerald-500/20 px-2 py-0.5 rounded-full border border-emerald-400/30">
                                    {liveToast.type === 'created' ? '✨ NEW VOUCHER' : '🔄 VOUCHER ALTERED'}
                                </span>
                                <span className="text-[10px] text-slate-400 font-mono font-medium">{liveToast.timestamp}</span>
                            </div>
                            <h4 className="text-sm font-black text-white mt-1.5 truncate">{liveToast.title}</h4>
                            <p className="text-xs text-slate-300 font-medium mt-0.5 truncate">{liveToast.details}</p>
                            <div className="mt-2.5 flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        handleSubTabChange('transactions');
                                        if (liveToast.txn?.voucherNo || liveToast.txn?.voucherNumber) {
                                            setTableSearch(liveToast.txn.voucherNo || liveToast.txn.voucherNumber);
                                        }
                                        setLiveToast(null);
                                    }}
                                    className="text-xs font-black text-emerald-400 hover:text-emerald-300 underline cursor-pointer"
                                >
                                    View in Transactions Table →
                                </button>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={() => setLiveToast(null)}
                            className="p-1 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-colors cursor-pointer"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
