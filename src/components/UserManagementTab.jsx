import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import { collection, getDocs, doc, updateDoc, setDoc, deleteDoc, query } from 'firebase/firestore';
import { 
    Users, 
    X, 
    Pencil, 
    Shield, 
    AlertCircle, 
    UserPlus, 
    Search, 
    Check, 
    Trash2,
    ShieldCheck,
    Briefcase,
    ArrowRightLeft,
    Clock,
    UploadCloud,
    Settings
} from 'lucide-react';

export const ALL_SYSTEM_TABS = [
    { id: 'accounts', label: 'Accounts', desc: 'Ledgers, balances, statements & vouchers', icon: Briefcase },
    { id: 'transactions', label: 'Transactions', desc: 'Voucher entries & transaction search', icon: ArrowRightLeft },
    { id: 'followups', label: 'Follow-ups', desc: 'Customer follow-up logs & reminder schedules', icon: Clock },
    { id: 'import', label: 'Import Center', desc: 'Upload Daybook, Accounts & Voucher files', icon: UploadCloud },
    { id: 'settings', label: 'Fiscal Settings', desc: 'Fiscal year setup & active FY selection', icon: Settings },
    { id: 'users', label: 'User Management', desc: 'View user accounts & team directory', icon: Users },
];

export const STANDARD_USER_TABS = [
    { id: 'accounts', label: 'Accounts', desc: 'Ledgers, balances & statements' },
    { id: 'transactions', label: 'Transactions', desc: 'Voucher entries & search' },
    { id: 'followups', label: 'Follow-ups', desc: 'Customer follow-up schedules' },
    { id: 'import', label: 'Import Center', desc: 'Upload Daybook & Vouchers' },
];

export const isSuperAdminUser = (u) => Boolean(u && u.role === 'admin' && u.adminType !== 'secondary');
export const isSecondaryAdminUser = (u) => Boolean(u && (u.role === 'secondary_admin' || (u.role === 'admin' && u.adminType === 'secondary')));
export const isAnyAdminUser = (u) => isSuperAdminUser(u) || isSecondaryAdminUser(u);
export const isStandardUser = (u) => !isSuperAdminUser(u) && !isSecondaryAdminUser(u);

export default function UserManagementTab({ updateTrigger, currentUser }) {
    const [users, setUsers] = useState([]);
    const [accounts, setAccounts] = useState([]);
    const [loading, setLoading] = useState(true);

    // Filter and search: 'all' | 'super' | 'secondary' | 'user'
    const [searchQuery, setSearchQuery] = useState('');
    const [roleFilter, setRoleFilter] = useState('all');

    // Edit modal states: 'admin' (super) | 'secondary_admin' | 'user'
    const [editingUser, setEditingUser] = useState(null);
    const [role, setRole] = useState('user');
    const [status, setStatus] = useState('active');
    const [customUsername, setCustomUsername] = useState('');
    const [customPassword, setCustomPassword] = useState('');
    const [allowedTabs, setAllowedTabs] = useState([]);
    const [allowedAccount, setAllowedAccount] = useState('');
    const [saving, setSaving] = useState(false);

    // Create New User/Admin modal states
    const [showAddModal, setShowAddModal] = useState(false);
    const [newName, setNewName] = useState('');
    const [newEmail, setNewEmail] = useState('');
    const [newRole, setNewRole] = useState('secondary_admin');
    const [newStatus, setNewStatus] = useState('active');
    const [newUsername, setNewUsername] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [newAllowedTabs, setNewAllowedTabs] = useState(['accounts', 'transactions', 'followups', 'import']);
    const [newAllowedAccount, setNewAllowedAccount] = useState('');
    const [creatingSaving, setCreatingSaving] = useState(false);

    // Delete confirmation modal states & toast
    const [userToDeleteForConfirm, setUserToDeleteForConfirm] = useState(null);
    const [deleting, setDeleting] = useState(false);
    const [toast, setToast] = useState(null); // { message: string, type: 'success' | 'error' }

    useEffect(() => {
        if (!toast) return;
        const timer = setTimeout(() => setToast(null), 4500);
        return () => clearTimeout(timer);
    }, [toast]);

    const fetchAllData = async () => {
        setLoading(true);
        try {
            // Fetch accounts for account restriction dropdown
            const accSnap = await getDocs(query(collection(db, 'accounts')));
            const nameMap = new Map();
            accSnap.forEach(d => {
                const name = d.data().name ? d.data().name.trim() : '';
                if (name && !nameMap.has(name.toLowerCase())) {
                    nameMap.set(name.toLowerCase(), { id: d.id, name });
                }
            });
            const accs = Array.from(nameMap.values());
            accs.sort((a, b) => a.name.localeCompare(b.name));
            setAccounts(accs);

            // Fetch users
            const usersSnap = await getDocs(query(collection(db, 'users')));
            const usersData = [];
            usersSnap.forEach(d => usersData.push({ id: d.id, ...d.data() }));
            // Sort: Super Admins -> Secondary Admins -> Standard Users, then by name
            usersData.sort((a, b) => {
                if (isSuperAdminUser(a) && !isSuperAdminUser(b)) return -1;
                if (!isSuperAdminUser(a) && isSuperAdminUser(b)) return 1;
                if (isSecondaryAdminUser(a) && !isSecondaryAdminUser(b)) return -1;
                if (!isSecondaryAdminUser(a) && isSecondaryAdminUser(b)) return 1;
                return (a.name || '').localeCompare(b.name || '');
            });
            setUsers(usersData);
        } catch (error) {
            console.error("Error fetching user management data:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAllData();
    }, [updateTrigger]);

    const handleEditClick = (user) => {
        setEditingUser(user);
        const isSup = isSuperAdminUser(user);
        const isSec = isSecondaryAdminUser(user);
        const currentRole = isSup ? 'admin' : isSec ? 'secondary_admin' : 'user';
        setRole(currentRole);
        setStatus(user.status || 'active');
        setCustomUsername(user.customUsername || '');
        setCustomPassword(user.customPassword || '');
        if (isSup) {
            setAllowedTabs(ALL_SYSTEM_TABS.map(t => t.id));
        } else if (user.allowedTabs && user.allowedTabs.length > 0) {
            setAllowedTabs(user.allowedTabs);
        } else {
            setAllowedTabs(['accounts', 'transactions', 'followups', 'import']);
        }
        setAllowedAccount(user.allowedAccount || '');
    };

    const handleTabToggle = (tabId) => {
        setAllowedTabs(prev => 
            prev.includes(tabId) ? prev.filter(t => t !== tabId) : [...prev, tabId]
        );
    };

    const handleNewTabToggle = (tabId) => {
        setNewAllowedTabs(prev => 
            prev.includes(tabId) ? prev.filter(t => t !== tabId) : [...prev, tabId]
        );
    };

    const handleSaveEdit = async () => {
        if (!editingUser) return;

        // Disallow non-super admins from modifying a super admin
        if (!isSuperAdminUser(currentUser) && isSuperAdminUser(editingUser)) {
            setToast({ type: 'error', message: "Only a Super Admin can edit another Super Admin account." });
            return;
        }

        setSaving(true);
        try {
            const userRef = doc(db, 'users', editingUser.id);
            const isSavingSuper = role === 'admin';
            const isSavingSecondary = role === 'secondary_admin';
            
            // For super admin: all tabs; for secondary admin: customized allowedTabs; for standard: user allowedTabs
            const computedAllowedTabs = isSavingSuper 
                ? ALL_SYSTEM_TABS.map(t => t.id)
                : allowedTabs;

            const payload = {
                role: isSavingSecondary ? 'secondary_admin' : role,
                adminType: isSavingSuper ? 'primary' : isSavingSecondary ? 'secondary' : null,
                status,
                customUsername: customUsername.trim(),
                customPassword: customPassword.trim(),
                allowedTabs: computedAllowedTabs,
                allowedAccount: isSavingSuper ? null : (allowedAccount || null)
            };
            await updateDoc(userRef, payload);

            setUsers(prev => prev.map(u => u.id === editingUser.id ? { ...u, ...payload } : u));
            setEditingUser(null);
            setToast({
                type: 'success',
                message: `User "${editingUser.name}" updated successfully!`
            });
        } catch (err) {
            console.error("Error updating user:", err);
            setToast({
                type: 'error',
                message: "Failed to update user: " + err.message
            });
        } finally {
            setSaving(false);
        }
    };

    const handleCreateUser = async (e) => {
        e.preventDefault();
        if (!newName.trim()) {
            setToast({ type: 'error', message: "Please enter a name for the user." });
            return;
        }

        setCreatingSaving(true);
        try {
            const newUid = 'user_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
            const email = newEmail.trim() || `${(newUsername.trim() || newName.trim().replace(/\s+/g, '').toLowerCase())}@local.app`;
            
            const isCreatingSuper = newRole === 'admin';
            const isCreatingSecondary = newRole === 'secondary_admin';
            const computedAllowedTabs = isCreatingSuper
                ? ALL_SYSTEM_TABS.map(t => t.id)
                : (newAllowedTabs.length > 0 ? newAllowedTabs : ['accounts', 'transactions', 'followups', 'import']);

            const newUserDoc = {
                id: newUid,
                uid: newUid,
                name: newName.trim(),
                email: email,
                role: isCreatingSecondary ? 'secondary_admin' : newRole,
                adminType: isCreatingSuper ? 'primary' : isCreatingSecondary ? 'secondary' : null,
                status: newStatus,
                customUsername: newUsername.trim() || (isCreatingSuper ? `superadmin_${Date.now().toString().slice(-4)}` : isCreatingSecondary ? `secadmin_${Date.now().toString().slice(-4)}` : newName.trim().toLowerCase().replace(/\s+/g, '')),
                customPassword: newPassword.trim() || 'password123',
                allowedTabs: computedAllowedTabs,
                allowedAccount: isCreatingSuper ? null : (newAllowedAccount || null),
                createdAt: new Date().toISOString()
            };

            await setDoc(doc(db, 'users', newUid), newUserDoc);

            setUsers(prev => {
                const next = [newUserDoc, ...prev];
                next.sort((a, b) => {
                    if (isSuperAdminUser(a) && !isSuperAdminUser(b)) return -1;
                    if (!isSuperAdminUser(a) && isSuperAdminUser(b)) return 1;
                    if (isSecondaryAdminUser(a) && !isSecondaryAdminUser(b)) return -1;
                    if (!isSecondaryAdminUser(a) && isSecondaryAdminUser(b)) return 1;
                    return (a.name || '').localeCompare(b.name || '');
                });
                return next;
            });

            setShowAddModal(false);
            setNewName('');
            setNewEmail('');
            setNewRole('secondary_admin');
            setNewStatus('active');
            setNewUsername('');
            setNewPassword('');
            setNewAllowedTabs(['accounts', 'transactions', 'followups', 'import']);
            setNewAllowedAccount('');

            const roleLabel = isCreatingSuper ? 'Super Admin' : isCreatingSecondary ? 'Secondary Admin' : 'User';
            setToast({
                type: 'success',
                message: `New ${roleLabel} "${newUserDoc.name}" created (Username: ${newUserDoc.customUsername})`
            });
        } catch (err) {
            console.error("Error creating user:", err);
            setToast({
                type: 'error',
                message: "Failed to create user: " + err.message
            });
        } finally {
            setCreatingSaving(false);
        }
    };

    const initiateDeleteUser = (userToDelete) => {
        const isCurrent = Boolean(
            (currentUser?.uid && (userToDelete.id === currentUser.uid || userToDelete.uid === currentUser.uid)) ||
            (currentUser?.email && userToDelete.email && userToDelete.email.toLowerCase() === currentUser.email.toLowerCase())
        );
        if (isCurrent) {
            setToast({ type: 'error', message: "You cannot delete your own logged-in account." });
            return;
        }
        setUserToDeleteForConfirm(userToDelete);
    };

    const confirmAndDeleteUser = async () => {
        if (!userToDeleteForConfirm) return;
        const target = userToDeleteForConfirm;
        setDeleting(true);

        try {
            const targetDocId = target.id || target.uid;
            if (!targetDocId) {
                throw new Error("User identifier is missing.");
            }

            // Primary delete using target.id
            if (target.id) {
                await deleteDoc(doc(db, 'users', target.id));
            }
            // If uid is different from target.id, also delete to ensure no orphan doc exists
            if (target.uid && target.uid !== target.id) {
                try {
                    await deleteDoc(doc(db, 'users', target.uid));
                } catch (e) {
                    console.warn("Doc cleanup:", e);
                }
            }

            // Update local state immediately
            setUsers(prev => prev.filter(u => {
                const uId = u.id || u.uid;
                return uId !== target.id && uId !== target.uid && u.id !== targetDocId;
            }));

            // If this user was open in editing modal, close it
            if (editingUser && (editingUser.id === target.id || editingUser.uid === target.uid)) {
                setEditingUser(null);
            }

            setUserToDeleteForConfirm(null);
            setToast({
                type: 'success',
                message: `User "${target.name || target.customUsername || 'Account'}" has been permanently deleted.`
            });
        } catch (err) {
            console.error("Error deleting user:", err);
            setToast({
                type: 'error',
                message: "Failed to delete user: " + (err.message || err.toString())
            });
        } finally {
            setDeleting(false);
        }
    };

    // Filtered users list
    const filteredUsers = useMemo(() => {
        return users.filter(u => {
            const matchesRole = 
                roleFilter === 'all' ? true :
                roleFilter === 'super' ? isSuperAdminUser(u) :
                roleFilter === 'secondary' ? isSecondaryAdminUser(u) :
                roleFilter === 'admin' ? isAnyAdminUser(u) :
                isStandardUser(u);

            const q = searchQuery.toLowerCase().trim();
            const matchesQuery = !q || 
                (u.name && u.name.toLowerCase().includes(q)) ||
                (u.email && u.email.toLowerCase().includes(q)) ||
                (u.customUsername && u.customUsername.toLowerCase().includes(q)) ||
                (u.allowedAccount && u.allowedAccount.toLowerCase().includes(q));

            return matchesRole && matchesQuery;
        });
    }, [users, roleFilter, searchQuery]);

    const superAdminCount = useMemo(() => users.filter(isSuperAdminUser).length, [users]);
    const secondaryAdminCount = useMemo(() => users.filter(isSecondaryAdminUser).length, [users]);
    const standardUserCount = useMemo(() => users.filter(isStandardUser).length, [users]);

    if (loading) {
        return (
            <div className="flex-1 flex items-center justify-center p-12 text-sm font-bold text-slate-400 gap-3">
                <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                Loading users...
            </div>
        );
    }

    return (
        <div className="flex flex-col min-h-0 flex-1 p-3 sm:p-6 gap-4 sm:gap-6 bg-slate-50/50">
            {/* ALERT / TOAST FEEDBACK NOTIFICATION */}
            {toast && (
                <div className={`flex items-center gap-3 px-4 py-3 rounded-xl shadow-md border text-sm font-bold animate-in fade-in slide-in-from-top-2 duration-200 ${
                    toast.type === 'error'
                        ? 'bg-rose-50 border-rose-200 text-rose-800'
                        : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                }`}>
                    {toast.type === 'error' ? (
                        <AlertCircle className="w-5 h-5 shrink-0 text-rose-600" />
                    ) : (
                        <Check className="w-5 h-5 shrink-0 text-emerald-600 stroke-[3]" />
                    )}
                    <span className="flex-1 text-xs sm:text-sm">{toast.message}</span>
                    <button 
                        onClick={() => setToast(null)} 
                        className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-black/5"
                    >
                        <X size={15} />
                    </button>
                </div>
            )}

            {/* TOP BAR / STATS & ACTION */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
                        <Users className="w-5 h-5 stroke-[2.5]" />
                    </div>
                    <div>
                        <h2 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                            User Management
                            <span className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full font-bold">
                                {users.length} Total
                            </span>
                        </h2>
                        <p className="text-xs text-slate-500 font-medium">
                            Manage user accounts, assign multiple admins, and configure tab restrictions.
                        </p>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                    <div className="flex items-center gap-1.5 bg-slate-100/80 p-1 rounded-xl text-xs font-bold">
                        <button
                            onClick={() => setRoleFilter('all')}
                            className={`px-3 py-1.5 rounded-lg transition-all ${roleFilter === 'all' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                        >
                            All ({users.length})
                        </button>
                        <button
                            onClick={() => setRoleFilter('super')}
                            className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${roleFilter === 'super' ? 'bg-purple-600 text-white shadow-sm' : 'text-purple-700 hover:bg-purple-50'}`}
                        >
                            <Shield size={13} />
                            Super ({superAdminCount})
                        </button>
                        <button
                            onClick={() => setRoleFilter('secondary')}
                            className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${roleFilter === 'secondary' ? 'bg-indigo-600 text-white shadow-sm' : 'text-indigo-700 hover:bg-indigo-50'}`}
                        >
                            <ShieldCheck size={13} />
                            Secondary ({secondaryAdminCount})
                        </button>
                        <button
                            onClick={() => setRoleFilter('user')}
                            className={`px-3 py-1.5 rounded-lg transition-all ${roleFilter === 'user' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                        >
                            Users ({standardUserCount})
                        </button>
                    </div>

                    <button
                        onClick={() => {
                            setNewRole('secondary_admin');
                            setShowAddModal(true);
                        }}
                        className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-sm shadow-indigo-200 transition-all cursor-pointer"
                    >
                        <UserPlus size={15} className="stroke-[2.5]" />
                        <span>Add User / Admin</span>
                    </button>
                </div>
            </div>

            {/* TABLE CONTAINER */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 flex flex-col flex-1 min-h-0 overflow-hidden">
                {/* SEARCH FILTER BAR */}
                <div className="p-3 sm:px-6 sm:py-3 border-b border-slate-100 bg-white flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shrink-0">
                    <div className="relative flex-1 max-w-md">
                        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search by name, email, username..."
                            className="w-full pl-9 pr-3 py-1.5 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-slate-800"
                        />
                        {searchQuery && (
                            <button 
                                onClick={() => setSearchQuery('')}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                            >
                                <X size={13} />
                            </button>
                        )}
                    </div>
                    <div className="text-xs text-slate-500 font-medium self-end sm:self-center">
                        Showing <span className="font-bold text-slate-800">{filteredUsers.length}</span> of {users.length} users
                    </div>
                </div>

                <div className="overflow-auto flex-1 p-0">
                    <table className="min-w-full divide-y divide-slate-100 text-sm">
                        <thead className="bg-slate-50 sticky top-0 z-10">
                            <tr>
                                <th className="px-5 py-3 text-left text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">Name & Email</th>
                                <th className="px-5 py-3 text-left text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">Role & Access</th>
                                <th className="px-5 py-3 text-left text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">Status</th>
                                <th className="hidden lg:table-cell px-5 py-3 text-left text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">Login Credentials</th>
                                <th className="hidden md:table-cell px-5 py-3 text-left text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">Tab Permissions</th>
                                <th className="px-5 py-3 text-right text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-slate-50">
                            {filteredUsers.map(u => {
                                const isCurrent = Boolean(
                                    (currentUser?.uid && (u.id === currentUser.uid || u.uid === currentUser.uid)) ||
                                    (currentUser?.email && u.email && u.email.toLowerCase() === currentUser.email.toLowerCase())
                                );
                                const isSup = isSuperAdminUser(u);
                                const isSec = isSecondaryAdminUser(u);

                                return (
                                    <tr key={u.id || u.uid} className="hover:bg-slate-50/50 transition-colors group">
                                        <td className="px-5 py-3 text-slate-900">
                                            <div className="flex items-center gap-2">
                                                <span className="font-bold text-slate-900">{u.name}</span>
                                                {isCurrent && (
                                                    <span className="bg-emerald-50 text-emerald-700 text-[10px] font-extrabold px-1.5 py-0.5 rounded border border-emerald-200">
                                                        You
                                                    </span>
                                                )}
                                            </div>
                                            <div className="text-[11px] font-medium text-slate-500">{u.email}</div>
                                        </td>
                                        <td className="px-5 py-3">
                                            {isSup ? (
                                                <div className="flex items-center gap-1.5">
                                                    <span className="px-2.5 py-1 inline-flex items-center text-[10px] uppercase tracking-wider font-extrabold rounded-md bg-purple-100 text-purple-700 border border-purple-200 shadow-2xs">
                                                        <Shield size={12} className="mr-1 stroke-[2.5]" />
                                                        Super Admin
                                                    </span>
                                                </div>
                                            ) : isSec ? (
                                                <div className="flex items-center gap-1.5">
                                                    <span className="px-2.5 py-1 inline-flex items-center text-[10px] uppercase tracking-wider font-extrabold rounded-md bg-indigo-100 text-indigo-700 border border-indigo-200 shadow-2xs">
                                                        <ShieldCheck size={12} className="mr-1 stroke-[2.5]" />
                                                        Secondary Admin
                                                    </span>
                                                </div>
                                            ) : (
                                                <span className="px-2.5 py-1 inline-flex items-center text-[10px] uppercase tracking-wider font-extrabold rounded-md bg-slate-100 text-slate-700">
                                                    User
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-5 py-3">
                                            <span className={`px-2 py-0.5 inline-flex text-[10px] uppercase tracking-wider font-extrabold rounded-md ${
                                                u.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 
                                                u.status === 'pending' ? 'bg-amber-100 text-amber-700' : 
                                                'bg-rose-100 text-rose-700'
                                            }`}>
                                                {u.status}
                                            </span>
                                        </td>
                                        <td className="hidden lg:table-cell px-5 py-3 text-slate-600 font-medium text-[11px]">
                                            {u.customUsername ? (
                                                <div className="flex flex-col gap-0.5">
                                                    <span><span className="text-slate-400 font-normal">User:</span> <strong className="text-slate-700 font-bold">{u.customUsername}</strong></span>
                                                    <span><span className="text-slate-400 font-normal">Pass:</span> <strong className="text-slate-700 font-bold">{u.customPassword}</strong></span>
                                                </div>
                                            ) : <span className="text-slate-400">-</span>}
                                        </td>
                                        <td className="hidden md:table-cell px-5 py-3 text-[11px] text-slate-600 font-medium">
                                            {isSup ? (
                                                <span className="text-purple-700 font-bold text-[11px] bg-purple-50 px-2 py-0.5 rounded inline-flex items-center gap-1 border border-purple-100">
                                                    <ShieldCheck size={13} /> Full Access (All 6 Tabs)
                                                </span>
                                            ) : isSec ? (
                                                <div className="flex flex-col gap-1">
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="text-indigo-700 font-extrabold text-[10px] bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100">
                                                            {u.allowedTabs ? u.allowedTabs.length : 4} / 6 Tabs
                                                        </span>
                                                    </div>
                                                    <div className="flex flex-wrap gap-1">
                                                        {u.allowedTabs && u.allowedTabs.length > 0 
                                                            ? u.allowedTabs.map(t => (
                                                                <span key={t} className="bg-indigo-50/80 text-indigo-700 border border-indigo-200/60 px-1.5 py-0.5 rounded uppercase tracking-wider text-[9px] font-bold">
                                                                    {t}
                                                                </span>
                                                            ))
                                                            : <span className="text-rose-500 italic text-[10px]">No tabs assigned</span>
                                                        }
                                                    </div>
                                                    {u.allowedAccount && (
                                                        <div className="text-slate-600 font-bold bg-slate-100 px-1.5 py-0.5 rounded w-fit max-w-[160px] truncate text-[10px]" title={u.allowedAccount}>
                                                            Acct: {u.allowedAccount}
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                <div className="flex flex-col gap-1">
                                                    <div className="flex flex-wrap gap-1">
                                                        {u.allowedTabs && u.allowedTabs.length > 0 
                                                            ? u.allowedTabs.map(t => <span key={t} className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded uppercase tracking-wider text-[9px] font-bold">{t}</span>)
                                                            : <span className="text-slate-400 italic">None</span>
                                                        }
                                                    </div>
                                                    {u.allowedAccount && (
                                                        <div className="text-indigo-600 font-bold bg-indigo-50 px-1.5 py-0.5 rounded w-fit max-w-[160px] truncate text-[10px]" title={u.allowedAccount}>
                                                            Acct: {u.allowedAccount}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-5 py-3 text-right">
                                            <div className="flex items-center justify-end gap-1.5">
                                                <button 
                                                    onClick={() => handleEditClick(u)}
                                                    className="inline-flex items-center justify-center bg-indigo-50 hover:bg-indigo-100 text-indigo-600 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors gap-1 shadow-2xs cursor-pointer"
                                                    title="Edit User or Change Role to Admin"
                                                >
                                                    <Pencil size={13} className="stroke-[2.5]" />
                                                    <span>Edit</span>
                                                </button>
                                                {!isCurrent && (
                                                    <button
                                                        onClick={() => initiateDeleteUser(u)}
                                                        className="inline-flex items-center justify-center text-rose-500 hover:text-rose-700 hover:bg-rose-50 p-1.5 rounded-lg transition-colors cursor-pointer"
                                                        title="Delete User"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                            {filteredUsers.length === 0 && (
                                <tr>
                                    <td colSpan="6" className="text-center py-12 text-slate-500 font-medium">
                                        No matching users found.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* EDIT USER MODAL (Supports Admin Promotion / Demotion) */}
            {editingUser && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden ring-1 ring-black/5">
                        <div className="flex justify-between items-center p-4 sm:px-6 sm:py-5 border-b border-slate-100 bg-white shrink-0">
                            <div>
                                <h3 className="font-extrabold text-lg sm:text-xl text-slate-900 tracking-tight truncate pr-4">
                                    Edit User: <span className="text-indigo-600">{editingUser.name}</span>
                                </h3>
                                <p className="text-xs text-slate-500 font-medium mt-0.5">
                                    Change role, status, credentials, and access rules.
                                </p>
                            </div>
                            <button 
                                onClick={() => setEditingUser(null)}
                                className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-1.5 rounded-xl transition-colors shrink-0"
                            >
                                <X className="w-5 h-5 stroke-[2.5]" />
                            </button>
                        </div>
                        
                        <div className="p-4 sm:p-6 bg-slate-50/50 overflow-y-auto flex-1 space-y-5">
                            {/* ROLE SELECTION CARDS - 3 OPTIONS */}
                            <div>
                                <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-2">
                                    Account Role
                                </label>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                                    {/* SUPER ADMIN */}
                                    <button
                                        type="button"
                                        onClick={() => setRole('admin')}
                                        className={`p-3 rounded-xl border text-left flex flex-col gap-1 transition-all cursor-pointer ${
                                            role === 'admin'
                                                ? 'bg-purple-50/80 border-purple-500 ring-2 ring-purple-500/20 text-purple-950 shadow-sm'
                                                : 'bg-white border-slate-200 text-slate-700 hover:border-purple-200'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between">
                                            <span className="font-black text-xs flex items-center gap-1.5 text-purple-700">
                                                <Shield size={14} className="stroke-[2.5]" />
                                                Super Admin
                                            </span>
                                            {role === 'admin' && <Check size={14} className="text-purple-600 stroke-[3]" />}
                                        </div>
                                        <p className="text-[10px] text-slate-500 leading-tight">
                                            Unrestricted full access to all 6 system tabs.
                                        </p>
                                    </button>

                                    {/* SECONDARY ADMIN (LIMITED TABS) */}
                                    <button
                                        type="button"
                                        onClick={() => setRole('secondary_admin')}
                                        className={`p-3 rounded-xl border text-left flex flex-col gap-1 transition-all cursor-pointer ${
                                            role === 'secondary_admin'
                                                ? 'bg-indigo-50/90 border-indigo-500 ring-2 ring-indigo-500/20 text-indigo-950 shadow-sm'
                                                : 'bg-white border-slate-200 text-slate-700 hover:border-indigo-200'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between">
                                            <span className="font-black text-xs flex items-center gap-1.5 text-indigo-700">
                                                <ShieldCheck size={14} className="stroke-[2.5]" />
                                                Secondary Admin
                                            </span>
                                            {role === 'secondary_admin' && <Check size={14} className="text-indigo-600 stroke-[3]" />}
                                        </div>
                                        <p className="text-[10px] text-indigo-600 font-semibold leading-tight">
                                            Admin with customizable tab access.
                                        </p>
                                    </button>

                                    {/* STANDARD USER */}
                                    <button
                                        type="button"
                                        onClick={() => setRole('user')}
                                        className={`p-3 rounded-xl border text-left flex flex-col gap-1 transition-all cursor-pointer ${
                                            role === 'user'
                                                ? 'bg-slate-100 border-slate-400 ring-2 ring-slate-400/20 text-slate-900 shadow-sm'
                                                : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between">
                                            <span className="font-black text-xs flex items-center gap-1.5 text-slate-700">
                                                <Users size={14} className="stroke-[2.5]" />
                                                Standard User
                                            </span>
                                            {role === 'user' && <Check size={14} className="text-slate-600 stroke-[3]" />}
                                        </div>
                                        <p className="text-[10px] text-slate-500 leading-tight">
                                            Restricted user with custom tabs or ledger limits.
                                        </p>
                                    </button>
                                </div>

                                {role === 'admin' && (
                                    <div className="mt-2.5 p-2.5 bg-purple-50 rounded-xl border border-purple-100 flex items-start gap-2 text-xs text-purple-800 font-medium">
                                        <ShieldCheck size={16} className="text-purple-600 shrink-0 mt-0.5" />
                                        <span>
                                            <strong>Super Admin Activated:</strong> Unrestricted access to all 6 tabs (Accounts, Transactions, Follow-ups, Import Center, Fiscal Settings, and User Management).
                                        </span>
                                    </div>
                                )}
                            </div>

                            {/* TAB PERMISSIONS FOR SECONDARY ADMIN */}
                            {role === 'secondary_admin' && (
                                <div className="space-y-3 p-3.5 bg-indigo-50/50 rounded-2xl border border-indigo-100/80">
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                        <div>
                                            <label className="block text-xs font-black text-indigo-950 uppercase tracking-wider">
                                                Secondary Admin Tab Access ({allowedTabs.length} of {ALL_SYSTEM_TABS.length} Allowed)
                                            </label>
                                            <p className="text-[11px] text-indigo-700 font-medium">
                                                Choose which specific tabs this secondary admin can view and manage:
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-1.5 shrink-0">
                                            <button
                                                type="button"
                                                onClick={() => setAllowedTabs(ALL_SYSTEM_TABS.map(t => t.id))}
                                                className="px-2 py-1 text-[10px] font-bold bg-white text-indigo-700 border border-indigo-200 rounded-lg hover:bg-indigo-50 shadow-2xs cursor-pointer"
                                            >
                                                All 6
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setAllowedTabs(['accounts', 'transactions', 'followups', 'import'])}
                                                className="px-2 py-1 text-[10px] font-bold bg-white text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 shadow-2xs cursor-pointer"
                                            >
                                                Operational (4)
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setAllowedTabs([])}
                                                className="px-2 py-1 text-[10px] font-bold bg-white text-rose-600 border border-rose-200 rounded-lg hover:bg-rose-50 shadow-2xs cursor-pointer"
                                            >
                                                Clear
                                            </button>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        {ALL_SYSTEM_TABS.map(tab => {
                                            const isChecked = allowedTabs.includes(tab.id);
                                            const TabIcon = tab.icon;
                                            return (
                                                <label 
                                                    key={tab.id} 
                                                    className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer transition-all ${
                                                        isChecked 
                                                            ? 'bg-white border-indigo-400 ring-1 ring-indigo-300/40 shadow-xs text-slate-900' 
                                                            : 'bg-white/60 border-slate-200 text-slate-500 hover:border-indigo-200'
                                                    }`}
                                                >
                                                    <input 
                                                        type="checkbox" 
                                                        checked={isChecked} 
                                                        onChange={() => handleTabToggle(tab.id)}
                                                        className="w-4 h-4 mt-0.5 text-indigo-600 focus:ring-indigo-500 border-slate-300 rounded shrink-0 cursor-pointer"
                                                    />
                                                    <div className="flex flex-col">
                                                        <span className="text-xs font-bold flex items-center gap-1.5 text-slate-800">
                                                            {TabIcon && <TabIcon size={13} className={isChecked ? 'text-indigo-600' : 'text-slate-400'} />}
                                                            {tab.label}
                                                        </span>
                                                        <span className="text-[10px] text-slate-500 leading-tight mt-0.5">
                                                            {tab.desc}
                                                        </span>
                                                    </div>
                                                </label>
                                            );
                                        })}
                                    </div>

                                    <div className="pt-2 border-t border-indigo-100">
                                        <label className="block text-xs font-bold text-slate-700 mb-1">
                                            Optional Account Restriction (Leave blank for all accounts)
                                        </label>
                                        <input 
                                            type="text"
                                            list="userAccountsListEdit"
                                            value={allowedAccount} 
                                            onChange={(e) => setAllowedAccount(e.target.value)}
                                            placeholder="-- No Restriction (All Accounts) --"
                                            className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-bold bg-white text-slate-900 shadow-xs focus:ring-2 focus:ring-indigo-500/20 focus:outline-none"
                                        />
                                    </div>
                                </div>
                            )}

                            <div>
                                <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-1.5">Account Status</label>
                                <select 
                                    value={status} 
                                    onChange={(e) => setStatus(e.target.value)}
                                    className="w-full px-3 py-2 sm:px-4 sm:py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm font-bold bg-white text-slate-900 shadow-xs"
                                >
                                    <option value="active">Active (Permitted to log in)</option>
                                    <option value="pending">Pending (Awaiting Approval)</option>
                                    <option value="rejected">Rejected / Suspended</option>
                                </select>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-1.5">Custom Username</label>
                                    <input 
                                        type="text" 
                                        value={customUsername} 
                                        onChange={(e) => setCustomUsername(e.target.value)}
                                        className="w-full px-3 py-2 sm:px-4 sm:py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm font-bold bg-white text-slate-900 shadow-xs"
                                        placeholder="Optional username"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-1.5">Custom Password</label>
                                    <input 
                                        type="text" 
                                        value={customPassword} 
                                        onChange={(e) => setCustomPassword(e.target.value)}
                                        className="w-full px-3 py-2 sm:px-4 sm:py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm font-bold bg-white text-slate-900 shadow-xs"
                                        placeholder="Optional password"
                                    />
                                </div>
                            </div>

                            {/* TAB PERMISSIONS - Only relevant if standard user */}
                            {role === 'user' && (
                                <div className="space-y-4 pt-2 border-t border-slate-200/60">
                                    <div>
                                        <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-2">Allowed Tabs</label>
                                        <div className="grid grid-cols-2 gap-2">
                                            {[
                                                { id: 'accounts', label: 'Accounts' },
                                                { id: 'transactions', label: 'Transactions' },
                                                { id: 'followups', label: 'Follow Ups' },
                                                { id: 'import', label: 'Import Center' }
                                            ].map(tab => (
                                                <label key={tab.id} className="flex items-center gap-2 p-2 sm:px-3 sm:py-2 bg-white border border-slate-200 rounded-xl cursor-pointer hover:border-indigo-300 transition-colors shadow-2xs">
                                                    <input 
                                                        type="checkbox" 
                                                        checked={allowedTabs.includes(tab.id)} 
                                                        onChange={() => handleTabToggle(tab.id)}
                                                        className="w-4 h-4 text-indigo-600 focus:ring-indigo-500 border-slate-300 rounded"
                                                    />
                                                    <span className="text-xs font-bold text-slate-700">{tab.label}</span>
                                                </label>
                                            ))}
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-1.5">Restrict to Specific Account</label>
                                        <input 
                                            type="text"
                                            list="userAccountsListEdit"
                                            value={allowedAccount} 
                                            onChange={(e) => setAllowedAccount(e.target.value)}
                                            placeholder="-- No Restriction (All Accounts) --"
                                            className="w-full px-3 py-2 sm:px-4 sm:py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm font-bold bg-white text-slate-900 shadow-xs"
                                        />
                                        <datalist id="userAccountsListEdit">
                                            {accounts.map(acc => (
                                                <option key={acc.id} value={acc.name} />
                                            ))}
                                        </datalist>
                                        <p className="mt-1.5 text-[11px] font-medium text-slate-500 flex items-center gap-1">
                                            <AlertCircle size={12} /> If set, user will only see vouchers and balances for this account.
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="p-4 sm:px-6 sm:py-4 border-t border-slate-100 bg-white flex items-center justify-between gap-3 shrink-0">
                            {!(
                                (currentUser?.uid && (editingUser.id === currentUser.uid || editingUser.uid === currentUser.uid)) ||
                                (currentUser?.email && editingUser.email && editingUser.email.toLowerCase() === currentUser.email.toLowerCase())
                            ) ? (
                                <button 
                                    type="button"
                                    onClick={() => initiateDeleteUser(editingUser)}
                                    className="px-3.5 py-2 border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl font-bold transition-colors shadow-2xs text-xs sm:text-sm flex items-center gap-1.5 cursor-pointer"
                                    title="Permanently delete this user"
                                >
                                    <Trash2 size={15} />
                                    <span>Delete User</span>
                                </button>
                            ) : <div />}
                            <div className="flex items-center gap-2">
                                <button 
                                    onClick={() => setEditingUser(null)}
                                    className="px-4 py-2 border border-slate-200 bg-white text-slate-600 rounded-xl font-bold hover:bg-slate-50 transition-colors shadow-xs text-sm cursor-pointer"
                                >
                                    Cancel
                                </button>
                                <button 
                                    onClick={handleSaveEdit}
                                    disabled={saving}
                                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-xl font-bold shadow-xs disabled:opacity-50 transition-all text-sm flex items-center justify-center min-w-[120px] cursor-pointer"
                                >
                                    {saving ? 'Saving...' : 'Save Changes'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* CREATE NEW USER / ADMIN MODAL */}
            {showAddModal && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden ring-1 ring-black/5">
                        <div className="flex justify-between items-center p-4 sm:px-6 sm:py-5 border-b border-slate-100 bg-white shrink-0">
                            <div className="flex items-center gap-2.5">
                                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                                    <UserPlus size={18} className="stroke-[2.5]" />
                                </div>
                                <div>
                                    <h3 className="font-extrabold text-lg sm:text-xl text-slate-900 tracking-tight">
                                        Create New User / Admin
                                    </h3>
                                    <p className="text-xs text-slate-500 font-medium">
                                        Create credentials and configure administrative or standard access.
                                    </p>
                                </div>
                            </div>
                            <button 
                                onClick={() => setShowAddModal(false)}
                                className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-1.5 rounded-xl transition-colors shrink-0"
                            >
                                <X className="w-5 h-5 stroke-[2.5]" />
                            </button>
                        </div>

                        <form onSubmit={handleCreateUser} className="flex flex-col flex-1 min-h-0">
                            <div className="p-4 sm:p-6 bg-slate-50/50 overflow-y-auto flex-1 space-y-5">
                                {/* ROLE SELECTION - 3 CHOICES */}
                                <div>
                                    <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-2">
                                        Assign Role
                                    </label>
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                                        {/* SUPER ADMIN */}
                                        <button
                                            type="button"
                                            onClick={() => setNewRole('admin')}
                                            className={`p-3 rounded-xl border text-left flex flex-col gap-1 transition-all cursor-pointer ${
                                                newRole === 'admin'
                                                    ? 'bg-purple-50/80 border-purple-500 ring-2 ring-purple-500/20 text-purple-950 shadow-sm'
                                                    : 'bg-white border-slate-200 text-slate-700 hover:border-purple-200'
                                            }`}
                                        >
                                            <div className="flex items-center justify-between">
                                                <span className="font-black text-xs flex items-center gap-1.5 text-purple-700">
                                                    <Shield size={14} className="stroke-[2.5]" />
                                                    Super Admin
                                                </span>
                                                {newRole === 'admin' && <Check size={14} className="text-purple-600 stroke-[3]" />}
                                            </div>
                                            <p className="text-[10px] text-slate-500 leading-tight">
                                                Full access to all 6 tabs including Settings & Users.
                                            </p>
                                        </button>

                                        {/* SECONDARY ADMIN */}
                                        <button
                                            type="button"
                                            onClick={() => setNewRole('secondary_admin')}
                                            className={`p-3 rounded-xl border text-left flex flex-col gap-1 transition-all cursor-pointer ${
                                                newRole === 'secondary_admin'
                                                    ? 'bg-indigo-50/90 border-indigo-500 ring-2 ring-indigo-500/20 text-indigo-950 shadow-sm'
                                                    : 'bg-white border-slate-200 text-slate-700 hover:border-indigo-200'
                                            }`}
                                        >
                                            <div className="flex items-center justify-between">
                                                <span className="font-black text-xs flex items-center gap-1.5 text-indigo-700">
                                                    <ShieldCheck size={14} className="stroke-[2.5]" />
                                                    Secondary Admin
                                                </span>
                                                {newRole === 'secondary_admin' && <Check size={14} className="text-indigo-600 stroke-[3]" />}
                                            </div>
                                            <p className="text-[10px] text-indigo-600 font-semibold leading-tight">
                                                Admin with limited/custom tab access.
                                            </p>
                                        </button>

                                        {/* STANDARD USER */}
                                        <button
                                            type="button"
                                            onClick={() => setNewRole('user')}
                                            className={`p-3 rounded-xl border text-left flex flex-col gap-1 transition-all cursor-pointer ${
                                                newRole === 'user'
                                                    ? 'bg-slate-100 border-slate-400 ring-2 ring-slate-400/20 text-slate-900 shadow-sm'
                                                    : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                                            }`}
                                        >
                                            <div className="flex items-center justify-between">
                                                <span className="font-black text-xs flex items-center gap-1.5 text-slate-700">
                                                    <Users size={14} className="stroke-[2.5]" />
                                                    Standard User
                                                </span>
                                                {newRole === 'user' && <Check size={14} className="text-slate-600 stroke-[3]" />}
                                            </div>
                                            <p className="text-[10px] text-slate-500 leading-tight">
                                                Standard access with custom tab permissions.
                                            </p>
                                        </button>
                                    </div>
                                </div>

                                {/* SECONDARY ADMIN TAB SELECTION */}
                                {newRole === 'secondary_admin' && (
                                    <div className="space-y-3 p-3.5 bg-indigo-50/50 rounded-2xl border border-indigo-100/80">
                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                            <div>
                                                <label className="block text-xs font-black text-indigo-950 uppercase tracking-wider">
                                                    Secondary Admin Tab Access ({newAllowedTabs.length} of {ALL_SYSTEM_TABS.length} Allowed)
                                                </label>
                                                <p className="text-[11px] text-indigo-700 font-medium">
                                                    Choose which specific tabs this secondary admin can view and manage:
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-1.5 shrink-0">
                                                <button
                                                    type="button"
                                                    onClick={() => setNewAllowedTabs(ALL_SYSTEM_TABS.map(t => t.id))}
                                                    className="px-2 py-1 text-[10px] font-bold bg-white text-indigo-700 border border-indigo-200 rounded-lg hover:bg-indigo-50 shadow-2xs cursor-pointer"
                                                >
                                                    All 6
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setNewAllowedTabs(['accounts', 'transactions', 'followups', 'import'])}
                                                    className="px-2 py-1 text-[10px] font-bold bg-white text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 shadow-2xs cursor-pointer"
                                                >
                                                    Operational (4)
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setNewAllowedTabs([])}
                                                    className="px-2 py-1 text-[10px] font-bold bg-white text-rose-600 border border-rose-200 rounded-lg hover:bg-rose-50 shadow-2xs cursor-pointer"
                                                >
                                                    Clear
                                                </button>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                            {ALL_SYSTEM_TABS.map(tab => {
                                                const isChecked = newAllowedTabs.includes(tab.id);
                                                const TabIcon = tab.icon;
                                                return (
                                                    <label 
                                                        key={tab.id} 
                                                        className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer transition-all ${
                                                            isChecked 
                                                                ? 'bg-white border-indigo-400 ring-1 ring-indigo-300/40 shadow-xs text-slate-900' 
                                                                : 'bg-white/60 border-slate-200 text-slate-500 hover:border-indigo-200'
                                                        }`}
                                                    >
                                                        <input 
                                                            type="checkbox" 
                                                            checked={isChecked} 
                                                            onChange={() => handleNewTabToggle(tab.id)}
                                                            className="w-4 h-4 mt-0.5 text-indigo-600 focus:ring-indigo-500 border-slate-300 rounded shrink-0 cursor-pointer"
                                                        />
                                                        <div className="flex flex-col">
                                                            <span className="text-xs font-bold flex items-center gap-1.5 text-slate-800">
                                                                {TabIcon && <TabIcon size={13} className={isChecked ? 'text-indigo-600' : 'text-slate-400'} />}
                                                                {tab.label}
                                                            </span>
                                                            <span className="text-[10px] text-slate-500 leading-tight mt-0.5">
                                                                {tab.desc}
                                                            </span>
                                                        </div>
                                                    </label>
                                                );
                                            })}
                                        </div>

                                        <div className="pt-2 border-t border-indigo-100">
                                            <label className="block text-xs font-bold text-slate-700 mb-1">
                                                Optional Account Restriction (Leave blank for all accounts)
                                            </label>
                                            <input 
                                                type="text"
                                                list="newAccountsList"
                                                value={newAllowedAccount} 
                                                onChange={(e) => setNewAllowedAccount(e.target.value)}
                                                placeholder="-- No Restriction (All Accounts) --"
                                                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-bold bg-white text-slate-900 shadow-xs focus:ring-2 focus:ring-indigo-500/20 focus:outline-none"
                                            />
                                        </div>
                                    </div>
                                )}

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-1.5">
                                            Full Name *
                                        </label>
                                        <input 
                                            type="text" 
                                            required
                                            value={newName} 
                                            onChange={(e) => setNewName(e.target.value)}
                                            placeholder="e.g. Ramesh Sharma"
                                            className="w-full px-3 py-2 sm:px-4 sm:py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm font-bold bg-white text-slate-900 shadow-xs"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-1.5">
                                            Email Address
                                        </label>
                                        <input 
                                            type="email" 
                                            value={newEmail} 
                                            onChange={(e) => setNewEmail(e.target.value)}
                                            placeholder="e.g. ramesh@gmail.com"
                                            className="w-full px-3 py-2 sm:px-4 sm:py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm font-bold bg-white text-slate-900 shadow-xs"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-1.5">
                                            Login Username *
                                        </label>
                                        <input 
                                            type="text" 
                                            required
                                            value={newUsername} 
                                            onChange={(e) => setNewUsername(e.target.value)}
                                            placeholder="e.g. ramesh_admin"
                                            className="w-full px-3 py-2 sm:px-4 sm:py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm font-bold bg-white text-slate-900 shadow-xs"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-1.5">
                                            Login Password *
                                        </label>
                                        <input 
                                            type="text" 
                                            required
                                            value={newPassword} 
                                            onChange={(e) => setNewPassword(e.target.value)}
                                            placeholder="e.g. securePass123"
                                            className="w-full px-3 py-2 sm:px-4 sm:py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm font-bold bg-white text-slate-900 shadow-xs"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-1.5">
                                        Initial Status
                                    </label>
                                    <select 
                                        value={newStatus} 
                                        onChange={(e) => setNewStatus(e.target.value)}
                                        className="w-full px-3 py-2 sm:px-4 sm:py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm font-bold bg-white text-slate-900 shadow-xs"
                                    >
                                        <option value="active">Active (Can log in immediately)</option>
                                        <option value="pending">Pending</option>
                                    </select>
                                </div>

                                {newRole === 'user' && (
                                    <div className="space-y-4 pt-2 border-t border-slate-200/60">
                                        <div>
                                            <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-2">Allowed Tabs</label>
                                            <div className="grid grid-cols-2 gap-2">
                                                {[
                                                    { id: 'accounts', label: 'Accounts' },
                                                    { id: 'transactions', label: 'Transactions' },
                                                    { id: 'followups', label: 'Follow Ups' },
                                                    { id: 'import', label: 'Import Center' }
                                                ].map(tab => (
                                                    <label key={tab.id} className="flex items-center gap-2 p-2 sm:px-3 sm:py-2 bg-white border border-slate-200 rounded-xl cursor-pointer hover:border-indigo-300 transition-colors shadow-2xs">
                                                        <input 
                                                            type="checkbox" 
                                                            checked={newAllowedTabs.includes(tab.id)} 
                                                            onChange={() => handleNewTabToggle(tab.id)}
                                                            className="w-4 h-4 text-indigo-600 focus:ring-indigo-500 border-slate-300 rounded"
                                                        />
                                                        <span className="text-xs font-bold text-slate-700">{tab.label}</span>
                                                    </label>
                                                ))}
                                            </div>
                                        </div>

                                        <div>
                                            <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-1.5">Restrict to Specific Account</label>
                                            <input 
                                                type="text"
                                                list="newAccountsList"
                                                value={newAllowedAccount} 
                                                onChange={(e) => setNewAllowedAccount(e.target.value)}
                                                placeholder="-- No Restriction (All Accounts) --"
                                                className="w-full px-3 py-2 sm:px-4 sm:py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm font-bold bg-white text-slate-900 shadow-xs"
                                            />
                                            <datalist id="newAccountsList">
                                                {accounts.map(acc => (
                                                    <option key={acc.id} value={acc.name} />
                                                ))}
                                            </datalist>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="p-4 sm:px-6 sm:py-4 border-t border-slate-100 bg-white flex justify-end gap-3 shrink-0">
                                <button 
                                    type="button"
                                    onClick={() => setShowAddModal(false)}
                                    className="px-4 py-2 border border-slate-200 bg-white text-slate-600 rounded-xl font-bold hover:bg-slate-50 transition-colors shadow-xs text-sm cursor-pointer"
                                >
                                    Cancel
                                </button>
                                <button 
                                    type="submit"
                                    disabled={creatingSaving}
                                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-xl font-bold shadow-xs disabled:opacity-50 transition-all text-sm flex items-center justify-center min-w-[140px] cursor-pointer"
                                >
                                    {creatingSaving ? 'Creating...' : `Create ${newRole === 'admin' ? 'Super Admin' : newRole === 'secondary_admin' ? 'Secondary Admin' : 'User'}`}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* IN-APP CONFIRM DELETE USER MODAL */}
            {userToDeleteForConfirm && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-[70] p-4 animate-in fade-in duration-150">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden ring-1 ring-black/10">
                        <div className="p-6 text-center">
                            <div className="w-14 h-14 bg-rose-100 text-rose-600 rounded-2xl mx-auto flex items-center justify-center mb-4 shadow-inner">
                                <Trash2 className="w-7 h-7 stroke-[2.5]" />
                            </div>
                            <h3 className="text-xl font-black text-slate-900 tracking-tight mb-2">
                                Delete User Account?
                            </h3>
                            <p className="text-sm text-slate-600 font-medium leading-relaxed mb-4">
                                Are you sure you want to permanently delete user <strong className="text-slate-900 font-extrabold">"{userToDeleteForConfirm.name}"</strong>?
                            </p>
                            <div className="bg-slate-50 rounded-xl p-3.5 text-left text-xs font-semibold text-slate-600 border border-slate-200/80 space-y-1.5 mb-6">
                                <div className="flex justify-between">
                                    <span className="text-slate-400">Email:</span>
                                    <span className="text-slate-800 font-bold truncate max-w-[220px]">{userToDeleteForConfirm.email || 'N/A'}</span>
                                </div>
                                {userToDeleteForConfirm.customUsername && (
                                    <div className="flex justify-between">
                                        <span className="text-slate-400">Username:</span>
                                        <span className="text-slate-800 font-bold">{userToDeleteForConfirm.customUsername}</span>
                                    </div>
                                )}
                                <div className="flex justify-between">
                                    <span className="text-slate-400">Role:</span>
                                    <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wider ${
                                        userToDeleteForConfirm.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-slate-200 text-slate-700'
                                    }`}>
                                        {userToDeleteForConfirm.role}
                                    </span>
                                </div>
                                <div className="text-rose-600 font-bold pt-1.5 border-t border-slate-200/60 text-[11px] flex items-center gap-1">
                                    <AlertCircle size={13} className="shrink-0" />
                                    <span>This will permanently delete this account from database.</span>
                                </div>
                            </div>

                            <div className="flex gap-3">
                                <button
                                    type="button"
                                    onClick={() => setUserToDeleteForConfirm(null)}
                                    disabled={deleting}
                                    className="flex-1 py-2.5 px-4 rounded-xl border border-slate-200 text-slate-700 font-bold hover:bg-slate-50 transition-colors text-sm cursor-pointer disabled:opacity-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={confirmAndDeleteUser}
                                    disabled={deleting}
                                    className="flex-1 py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold transition-all shadow-sm text-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                                >
                                    {deleting ? (
                                        <>
                                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                            <span>Deleting...</span>
                                        </>
                                    ) : (
                                        <>
                                            <Trash2 size={16} />
                                            <span>Yes, Delete User</span>
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
