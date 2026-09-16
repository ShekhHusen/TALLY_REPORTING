import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, getDocs, doc, setDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import { X, Plus, Calendar, Trash2, Database } from 'lucide-react';

export default function SettingsTab({ currentUser }) {
    const [fiscalYears, setFiscalYears] = useState([]);
    const [loading, setLoading] = useState(true);
    
    const [fyName, setFyName] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isAddFYModalOpen, setIsAddFYModalOpen] = useState(false);
    const [isMigrating, setIsMigrating] = useState(false);
    const [migrationStatus, setMigrationStatus] = useState('');

    const handleMigrateTransactions = async () => {
        if (!window.confirm("This will process all transactions and link them to Account GUIDs for robust searching. Proceed?")) return;
        setIsMigrating(true);
        setMigrationStatus("Fetching accounts...");
        try {
            // Build map of account name -> IDs
            const accSnap = await getDocs(collection(db, 'accounts'));
            const existingAccounts = new Map();
            accSnap.forEach(d => {
                const key = (d.data().name || '').toLowerCase().trim();
                if (!key) return;
                if (!existingAccounts.has(key)) existingAccounts.set(key, []);
                existingAccounts.get(key).push(d.id);
            });

            setMigrationStatus("Fetching all transactions...");
            const snap = await getDocs(collection(db, 'transactions'));
            const txns = [];
            snap.forEach(d => txns.push({ id: d.id, ref: d.ref, ...d.data() }));
            
            setMigrationStatus(`Processing ${txns.length} transactions...`);
            let count = 0;
            
            const chunkArray = (arr, size) => {
                const chunked = [];
                for (let i = 0; i < arr.length; i += size) {
                    chunked.push(arr.slice(i, i + size));
                }
                return chunked;
            };

            const chunks = chunkArray(txns, 450);
            for (let i = 0; i < chunks.length; i++) {
                setMigrationStatus(`Saving batch ${i + 1} of ${chunks.length}...`);
                const batch = writeBatch(db);
                chunks[i].forEach(t => {
                    const allDebit = t.allDebitAccounts || [];
                    const allCredit = t.allCreditAccounts || [];
                    const ids = new Set();
                    const lowers = new Set();
                    [...allDebit, ...allCredit].forEach(name => {
                        const key = name.toLowerCase().trim();
                        if (key) lowers.add(key);
                        if (existingAccounts.has(key)) {
                            existingAccounts.get(key).forEach(id => ids.add(id));
                        }
                    });
                    
                    const involvedAccountIds = Array.from(ids);
                    const involvedAccountsLower = Array.from(lowers);
                    batch.update(t.ref, { involvedAccountIds, involvedAccountsLower });
                    count++;
                });
                await batch.commit();
            }
            alert(`Migration complete! Successfully updated ${count} transactions with GUIDs.`);
            setMigrationStatus("");
        } catch (err) {
            console.error(err);
            alert("Migration failed: " + err.message);
        } finally {
            setIsMigrating(false);
            setMigrationStatus("");
        }
    };

    const fetchFiscalYears = async () => {
        setLoading(true);
        try {
            const snap = await getDocs(collection(db, 'fiscalYears'));
            const fys = [];
            snap.forEach(d => fys.push({ id: d.id, ...d.data() }));
            // Sort by start date
            fys.sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
            setFiscalYears(fys);
        } catch (error) {
            console.error("Error fetching fiscal years:", error);
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchFiscalYears();
    }, []);

    const handleCreateFY = async (e) => {
        e.preventDefault();
        if (!fyName || !startDate || !endDate) {
            alert("Please fill all fields.");
            return;
        }
        if (startDate > endDate) {
            alert("Start Date cannot be after End Date.");
            return;
        }

        try {
            setIsSubmitting(true);
            const id = `fy-${startDate.substring(0,4)}-${endDate.substring(0,4)}`;
            const fyData = {
                name: fyName,
                startDate: startDate,
                endDate: endDate,
                createdBy: currentUser.name,
                createdAt: new Date().toISOString()
            };

            await setDoc(doc(db, 'fiscalYears', id), fyData);
            alert("Fiscal Year created successfully!");
            setFyName('');
            setStartDate('');
            setEndDate('');
            fetchFiscalYears();
            setIsAddFYModalOpen(false);
        } catch (error) {
            console.error("Error creating FY:", error);
            alert("Failed to create Fiscal Year.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDeleteFY = async (id, name) => {
        if (!window.confirm(`Are you sure you want to delete ${name}? Make sure no data is actively using this FY.`)) return;
        try {
            await deleteDoc(doc(db, 'fiscalYears', id));
            alert("Fiscal Year deleted.");
            fetchFiscalYears();
        } catch (error) {
            console.error("Error deleting FY:", error);
            alert("Failed to delete Fiscal Year.");
        }
    };

    if (currentUser?.role !== 'admin') {
        return <div className="p-6 text-rose-600 font-bold">Access Denied. Admins only.</div>;
    }

    return (
        <div className="flex flex-col min-h-0 flex-1 p-4 sm:p-6 gap-4 sm:gap-6 bg-slate-50/50">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 flex flex-col flex-1 min-h-0 overflow-hidden">
                <div className="p-4 sm:px-6 sm:py-4 border-b border-slate-100 bg-white flex justify-between items-center shrink-0 z-10">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                            <Calendar className="w-5 h-5 stroke-[2.5]" />
                        </div>
                        <h2 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">System Settings</h2>
                    </div>
                    <button 
                        onClick={() => setIsAddFYModalOpen(true)}
                        className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all shadow-sm"
                    >
                        <Plus className="w-4 h-4 stroke-[3]" />
                        <span className="hidden sm:inline">Add Fiscal Year</span>
                        <span className="sm:hidden">Add FY</span>
                    </button>
                </div>
                
                <div className="overflow-y-auto flex-1 p-0">
                    {loading ? (
                        <div className="flex items-center justify-center p-12 text-sm font-bold text-slate-400 gap-3">
                            <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                            Loading Fiscal Years...
                        </div>
                    ) : fiscalYears.length === 0 ? (
                        <div className="p-12 text-center text-slate-500 font-medium">No Fiscal Years created yet.</div>
                    ) : (
                        <table className="min-w-full divide-y divide-slate-100 text-sm">
                            <thead className="bg-slate-50 sticky top-0 z-10">
                                <tr>
                                    <th className="px-6 py-3 text-left text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">FY Name</th>
                                    <th className="px-6 py-3 text-left text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">From Date</th>
                                    <th className="px-6 py-3 text-left text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">To Date</th>
                                    <th className="hidden sm:table-cell px-6 py-3 text-left text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">Created By</th>
                                    <th className="px-6 py-3 text-right text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-slate-50">
                                {fiscalYears.map(fy => (
                                    <tr key={fy.id} className="hover:bg-slate-50/50 transition-colors group">
                                        <td className="px-6 py-3 font-bold text-slate-900">{fy.name}</td>
                                        <td className="px-6 py-3 font-medium text-slate-600">{fy.startDate}</td>
                                        <td className="px-6 py-3 font-medium text-slate-600">{fy.endDate}</td>
                                        <td className="hidden sm:table-cell px-6 py-3 text-slate-500 text-xs font-medium">{fy.createdBy}</td>
                                        <td className="px-6 py-3 text-right">
                                            <button 
                                                onClick={() => handleDeleteFY(fy.id, fy.name)}
                                                className="inline-flex items-center justify-center bg-rose-50 hover:bg-rose-100 text-rose-600 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors gap-1.5 opacity-80 group-hover:opacity-100"
                                                title="Delete"
                                            >
                                                <Trash2 size={14} className="stroke-[2.5]" />
                                                <span className="hidden sm:inline">Delete</span>
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 flex flex-col min-h-0 overflow-hidden">
                <div className="p-4 sm:px-6 sm:py-4 border-b border-slate-100 bg-white flex justify-between items-center shrink-0 z-10">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-rose-50 text-rose-600 rounded-xl">
                            <Database className="w-5 h-5 stroke-[2.5]" />
                        </div>
                        <h2 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">Data Maintenance</h2>
                    </div>
                </div>
                <div className="p-4 sm:p-6 bg-slate-50/50 flex flex-col gap-4">
                    <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center shadow-sm">
                        <div>
                            <h3 className="font-bold text-slate-900 text-sm sm:text-base">Migrate Transactions (Link by GUID)</h3>
                            <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-xl">
                                Scans all transactions and maps their ledger names to actual Account IDs (GUIDs). This creates an `involvedAccountIds` field for robust, duplicate-proof searching across all statements. Run this once!
                            </p>
                        </div>
                        <button
                            onClick={handleMigrateTransactions}
                            disabled={isMigrating}
                            className="shrink-0 bg-rose-600 hover:bg-rose-700 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-sm disabled:opacity-50 transition-all flex items-center gap-2"
                        >
                            {isMigrating ? (
                                <>
                                    <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                                    <span>{migrationStatus || 'Running...'}</span>
                                </>
                            ) : (
                                'Run Transaction Migration'
                            )}
                        </button>
                    </div>
                </div>
            </div>

            {isAddFYModalOpen && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex justify-center items-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden ring-1 ring-black/5 flex flex-col">
                        <div className="flex justify-between items-center p-4 sm:px-6 sm:py-5 border-b border-slate-100 bg-white">
                            <h3 className="font-extrabold text-lg sm:text-xl text-slate-900 tracking-tight">Add Fiscal Year</h3>
                            <button 
                                onClick={() => setIsAddFYModalOpen(false)}
                                className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-1.5 rounded-xl transition-colors"
                            >
                                <X className="w-5 h-5 stroke-[2.5]" />
                            </button>
                        </div>
                        <div className="p-4 sm:p-6 bg-slate-50/50">
                            <form onSubmit={handleCreateFY} className="flex flex-col gap-4">
                                <div>
                                    <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-1.5">FY Name (e.g., FY 2024-25)</label>
                                    <input 
                                        type="text" 
                                        value={fyName}
                                        onChange={(e) => setFyName(e.target.value)}
                                        className="w-full px-3 py-2 sm:px-4 sm:py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm font-bold bg-white text-slate-900 shadow-sm"
                                        placeholder="FY 2024-25"
                                        required
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-1.5">From Date</label>
                                        <input 
                                            type="date" 
                                            value={startDate}
                                            onChange={(e) => setStartDate(e.target.value)}
                                            className="w-full px-3 py-2 sm:px-4 sm:py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm font-bold bg-white text-slate-900 shadow-sm"
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-1.5">To Date</label>
                                        <input 
                                            type="date" 
                                            value={endDate}
                                            onChange={(e) => setEndDate(e.target.value)}
                                            className="w-full px-3 py-2 sm:px-4 sm:py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm font-bold bg-white text-slate-900 shadow-sm"
                                            required
                                        />
                                    </div>
                                </div>
                                <div className="mt-4 flex justify-end gap-3 pt-2">
                                    <button 
                                        type="button" 
                                        onClick={() => setIsAddFYModalOpen(false)}
                                        className="px-4 py-2 border border-slate-200 bg-white text-slate-600 rounded-xl font-bold hover:bg-slate-50 transition-colors shadow-sm text-sm"
                                    >
                                        Cancel
                                    </button>
                                    <button 
                                        type="submit" 
                                        disabled={isSubmitting}
                                        className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-xl font-bold shadow-sm disabled:opacity-50 transition-all text-sm flex items-center justify-center min-w-[120px]"
                                    >
                                        {isSubmitting ? 'Saving...' : 'Add Fiscal Year'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

