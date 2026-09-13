import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, getDocs, doc, updateDoc, query } from 'firebase/firestore';
import { Users, X, Pencil, Shield, AlertCircle } from 'lucide-react';

export default function UserManagementTab({ updateTrigger }) {
    const [users, setUsers] = useState([]);
    const [accounts, setAccounts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editingUser, setEditingUser] = useState(null);

    // Form states for the modal
    const [status, setStatus] = useState('');
    const [customUsername, setCustomUsername] = useState('');
    const [customPassword, setCustomPassword] = useState('');
    const [allowedTabs, setAllowedTabs] = useState([]);
    const [allowedAccount, setAllowedAccount] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        const fetchAccounts = async () => {
            try {
                const snap = await getDocs(query(collection(db, 'accounts')));
                const nameMap = new Map();
                snap.forEach(d => {
                    const name = d.data().name ? d.data().name.trim() : '';
                    if (name && !nameMap.has(name.toLowerCase())) {
                        nameMap.set(name.toLowerCase(), { id: d.id, name });
                    }
                });
                const accs = Array.from(nameMap.values());
                accs.sort((a, b) => a.name.localeCompare(b.name));
                setAccounts(accs);
            } catch (error) {
                console.error("Error fetching accounts:", error);
            }
        };

        const fetchUsers = async () => {
            setLoading(true);
            try {
                const snap = await getDocs(query(collection(db, 'users')));
                const usersData = [];
                snap.forEach(d => usersData.push({ id: d.id, ...d.data() }));
                setUsers(usersData);
            } catch (error) {
                console.error("Error fetching users:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchUsers();
        fetchAccounts();
    }, [updateTrigger]);

    const handleEditClick = (user) => {
        setEditingUser(user);
        setStatus(user.status || 'pending');
        setCustomUsername(user.customUsername || '');
        setCustomPassword(user.customPassword || '');
        setAllowedTabs(user.allowedTabs || []);
        setAllowedAccount(user.allowedAccount || '');
    };

    const handleTabToggle = (tab) => {
        setAllowedTabs(prev => 
            prev.includes(tab) ? prev.filter(t => t !== tab) : [...prev, tab]
        );
    };

    const handleSave = async () => {
        if (!editingUser) return;
        setSaving(true);
        try {
            const userRef = doc(db, 'users', editingUser.id);
            await updateDoc(userRef, {
                status,
                customUsername,
                customPassword,
                allowedTabs,
                allowedAccount: allowedAccount || null
            });
            // Re-fetch users inline
            const snap = await getDocs(query(collection(db, 'users')));
            const usersData = [];
            snap.forEach(d => usersData.push({ id: d.id, ...d.data() }));
            setUsers(usersData);
            
            setEditingUser(null);
        } catch (err) {
            console.error("Error updating user:", err);
            alert("Failed to update user.");
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="flex-1 flex items-center justify-center p-12 text-sm font-bold text-slate-400 gap-3">
                <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                Loading users...
            </div>
        );
    }

    return (
        <div className="flex flex-col min-h-0 flex-1 p-4 sm:p-6 gap-4 sm:gap-6 bg-slate-50/50">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 flex flex-col flex-1 min-h-0 overflow-hidden">
                <div className="p-4 sm:px-6 sm:py-4 border-b border-slate-100 bg-white flex justify-between items-center shrink-0 z-10">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                            <Users className="w-5 h-5 stroke-[2.5]" />
                        </div>
                        <h2 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">User Management</h2>
                    </div>
                </div>

                <div className="overflow-auto flex-1 p-0">
                    <table className="min-w-full divide-y divide-slate-100 text-sm">
                        <thead className="bg-slate-50 sticky top-0 z-10">
                            <tr>
                                <th className="px-6 py-3 text-left text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">Name & Email</th>
                                <th className="px-6 py-3 text-left text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">Role</th>
                                <th className="px-6 py-3 text-left text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">Status</th>
                                <th className="hidden lg:table-cell px-6 py-3 text-left text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">Login Details</th>
                                <th className="hidden md:table-cell px-6 py-3 text-left text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">Permissions</th>
                                <th className="px-6 py-3 text-right text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-slate-50">
                            {users.map(u => (
                                <tr key={u.id} className="hover:bg-slate-50/50 transition-colors group">
                                    <td className="px-6 py-3 text-slate-900">
                                        <div className="font-bold">{u.name}</div>
                                        <div className="text-[11px] font-medium text-slate-500">{u.email}</div>
                                    </td>
                                    <td className="px-6 py-3">
                                        <span className={`px-2.5 py-1 inline-flex text-[10px] uppercase tracking-wider font-extrabold rounded-md ${u.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-700'}`}>
                                            {u.role === 'admin' ? <Shield size={12} className="mr-1 mt-[1px]" /> : ''}
                                            {u.role}
                                        </span>
                                    </td>
                                    <td className="px-6 py-3">
                                        <span className={`px-2.5 py-1 inline-flex text-[10px] uppercase tracking-wider font-extrabold rounded-md ${
                                            u.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 
                                            u.status === 'pending' ? 'bg-amber-100 text-amber-700' : 
                                            'bg-rose-100 text-rose-700'
                                        }`}>
                                            {u.status}
                                        </span>
                                    </td>
                                    <td className="hidden lg:table-cell px-6 py-3 text-slate-600 font-medium text-[11px]">
                                        {u.customUsername ? (
                                            <div className="flex flex-col gap-0.5">
                                                <span><span className="text-slate-400 font-normal">User:</span> {u.customUsername}</span>
                                                <span><span className="text-slate-400 font-normal">Pass:</span> {u.customPassword}</span>
                                            </div>
                                        ) : <span className="text-slate-400">-</span>}
                                    </td>
                                    <td className="hidden md:table-cell px-6 py-3 text-[11px] text-slate-600 font-medium">
                                        <div className="flex flex-col gap-1">
                                            <div className="flex flex-wrap gap-1">
                                                {u.allowedTabs && u.allowedTabs.length > 0 
                                                    ? u.allowedTabs.map(t => <span key={t} className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded uppercase tracking-wider text-[9px] font-bold">{t}</span>)
                                                    : <span className="text-slate-400 italic">None</span>
                                                }
                                            </div>
                                            {u.allowedAccount && <div className="text-indigo-600 font-bold bg-indigo-50 px-1.5 py-0.5 rounded w-fit max-w-[150px] truncate" title={u.allowedAccount}>Acct: {u.allowedAccount}</div>}
                                        </div>
                                    </td>
                                    <td className="px-6 py-3 text-right">
                                        {u.role !== 'admin' || u.email === 'husnailalam06@gmail.com' ? (
                                            <button 
                                                onClick={() => handleEditClick(u)}
                                                className="inline-flex items-center justify-center bg-indigo-50 hover:bg-indigo-100 text-indigo-600 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors gap-1.5 opacity-80 group-hover:opacity-100"
                                            >
                                                <Pencil size={14} className="stroke-[2.5]" />
                                                <span className="hidden sm:inline">Edit</span>
                                            </button>
                                        ) : (
                                            <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">Admin</span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                            {users.length === 0 && (
                                <tr><td colSpan="6" className="text-center py-12 text-slate-500 font-medium">No users found.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Edit Modal */}
            {editingUser && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden ring-1 ring-black/5">
                        <div className="flex justify-between items-center p-4 sm:px-6 sm:py-5 border-b border-slate-100 bg-white shrink-0">
                            <h3 className="font-extrabold text-lg sm:text-xl text-slate-900 tracking-tight truncate pr-4">Edit User: <span className="text-indigo-600">{editingUser.name}</span></h3>
                            <button 
                                onClick={() => setEditingUser(null)}
                                className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-1.5 rounded-xl transition-colors shrink-0"
                            >
                                <X className="w-5 h-5 stroke-[2.5]" />
                            </button>
                        </div>
                        
                        <div className="p-4 sm:p-6 bg-slate-50/50 overflow-y-auto flex-1">
                            <div className="space-y-5">
                                <div>
                                    <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-1.5">Status</label>
                                    <select 
                                        value={status} 
                                        onChange={(e) => setStatus(e.target.value)}
                                        className="w-full px-3 py-2 sm:px-4 sm:py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm font-bold bg-white text-slate-900 shadow-sm"
                                    >
                                        <option value="pending">Pending</option>
                                        <option value="active">Active</option>
                                        <option value="rejected">Rejected</option>
                                    </select>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-1.5">Custom Username</label>
                                        <input 
                                            type="text" 
                                            value={customUsername} 
                                            onChange={(e) => setCustomUsername(e.target.value)}
                                            className="w-full px-3 py-2 sm:px-4 sm:py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm font-bold bg-white text-slate-900 shadow-sm"
                                            placeholder="Optional"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-1.5">Custom Password</label>
                                        <input 
                                            type="text" 
                                            value={customPassword} 
                                            onChange={(e) => setCustomPassword(e.target.value)}
                                            className="w-full px-3 py-2 sm:px-4 sm:py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm font-bold bg-white text-slate-900 shadow-sm"
                                            placeholder="Optional"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-2">Allowed Tabs</label>
                                    <div className="grid grid-cols-2 gap-2">
                                        {['accounts', 'transactions', 'followups', 'import'].map(tab => (
                                            <label key={tab} className="flex items-center gap-2 p-2 sm:px-3 sm:py-2.5 bg-white border border-slate-200 rounded-xl cursor-pointer hover:border-indigo-300 transition-colors shadow-sm">
                                                <input 
                                                    type="checkbox" 
                                                    checked={allowedTabs.includes(tab)} 
                                                    onChange={() => handleTabToggle(tab)}
                                                    className="w-4 h-4 text-indigo-600 focus:ring-indigo-500 border-slate-300 rounded"
                                                />
                                                <span className="text-sm font-bold text-slate-700 capitalize">{tab}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-1.5">Restrict to Specific Account</label>
                                    <input 
                                        type="text"
                                        list="userAccountsList"
                                        value={allowedAccount} 
                                        onChange={(e) => setAllowedAccount(e.target.value)}
                                        placeholder="-- No Restriction (All Accounts) --"
                                        className="w-full px-3 py-2 sm:px-4 sm:py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm font-bold bg-white text-slate-900 shadow-sm"
                                    />
                                    <datalist id="userAccountsList">
                                        {accounts.map(acc => (
                                            <option key={acc.id} value={acc.name} />
                                        ))}
                                    </datalist>
                                    <p className="mt-1.5 text-[11px] font-medium text-slate-500 flex items-center gap-1"><AlertCircle size={12} /> If set, the user will only see transactions and data for this specific ledger account.</p>
                                </div>
                            </div>
                        </div>

                        <div className="p-4 sm:px-6 sm:py-4 border-t border-slate-100 bg-white flex justify-end gap-3 shrink-0">
                            <button 
                                onClick={() => setEditingUser(null)}
                                className="px-4 py-2 border border-slate-200 bg-white text-slate-600 rounded-xl font-bold hover:bg-slate-50 transition-colors shadow-sm text-sm"
                            >
                                Cancel
                            </button>
                            <button 
                                onClick={handleSave}
                                disabled={saving}
                                className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-xl font-bold shadow-sm disabled:opacity-50 transition-all text-sm flex items-center justify-center min-w-[120px]"
                            >
                                {saving ? 'Saving...' : 'Save Changes'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
