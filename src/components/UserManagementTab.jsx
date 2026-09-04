import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, getDocs, doc, updateDoc, query } from 'firebase/firestore';

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
        fetchUsers();
        fetchAccounts();
    }, [updateTrigger]);

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
            await fetchUsers();
            setEditingUser(null);
        } catch (err) {
            console.error("Error updating user:", err);
            alert("Failed to update user.");
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return <div className="p-8 text-center text-gray-500">Loading users...</div>;
    }

    return (
        <div className="h-[calc(100vh-12rem)] flex flex-col relative">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-gray-800">User Management</h2>
            </div>
            
            <div className="bg-white shadow rounded-lg border border-gray-200 flex-1 overflow-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50 sticky top-0 shadow-sm z-10">
                        <tr>
                            <th className="px-4 py-3 text-left font-medium text-gray-500 uppercase">Name & Email</th>
                            <th className="px-4 py-3 text-left font-medium text-gray-500 uppercase">Role</th>
                            <th className="px-4 py-3 text-left font-medium text-gray-500 uppercase">Status</th>
                            <th className="px-4 py-3 text-left font-medium text-gray-500 uppercase">Username / Pass</th>
                            <th className="px-4 py-3 text-left font-medium text-gray-500 uppercase">Permissions</th>
                            <th className="px-4 py-3 text-right font-medium text-gray-500 uppercase">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-100">
                        {users.map(u => (
                            <tr key={u.id} className="hover:bg-gray-50">
                                <td className="px-4 py-3 text-gray-900">
                                    <div className="font-medium">{u.name}</div>
                                    <div className="text-xs text-gray-500">{u.email}</div>
                                </td>
                                <td className="px-4 py-3">
                                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${u.role === 'admin' ? 'bg-purple-100 text-purple-800' : 'bg-gray-100 text-gray-800'}`}>
                                        {u.role}
                                    </span>
                                </td>
                                <td className="px-4 py-3">
                                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${u.status === 'active' ? 'bg-green-100 text-green-800' : u.status === 'pending' ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'}`}>
                                        {u.status}
                                    </span>
                                </td>
                                <td className="px-4 py-3 text-gray-500">
                                    {u.customUsername ? (
                                        <>
                                            <div>User: {u.customUsername}</div>
                                            <div className="text-xs">Pass: {u.customPassword}</div>
                                        </>
                                    ) : '-'}
                                </td>
                                <td className="px-4 py-3 text-xs text-gray-500">
                                    <div>Tabs: {u.allowedTabs?.join(', ') || 'None'}</div>
                                    {u.allowedAccount && <div>Account Limit: {u.allowedAccount}</div>}
                                </td>
                                <td className="px-4 py-3 text-right">
                                    {u.role !== 'admin' || u.email === 'husnailalam06@gmail.com' ? (
                                        <button 
                                            onClick={() => handleEditClick(u)}
                                            className="text-blue-600 hover:text-blue-900 font-medium bg-blue-50 px-3 py-1 rounded"
                                        >
                                            Edit
                                        </button>
                                    ) : (
                                        <span className="text-gray-400 text-xs">Admin Config</span>
                                    )}
                                </td>
                            </tr>
                        ))}
                        {users.length === 0 && (
                            <tr><td colSpan="6" className="text-center py-6 text-gray-500">No users found.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Edit Modal */}
            {editingUser && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
                        <h3 className="text-lg font-bold text-gray-900 mb-4">Edit User: {editingUser.name}</h3>
                        
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Status</label>
                                <select 
                                    value={status} 
                                    onChange={(e) => setStatus(e.target.value)}
                                    className="mt-1 block w-full pl-3 pr-10 py-2 text-base border border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
                                >
                                    <option value="pending">Pending</option>
                                    <option value="active">Active</option>
                                    <option value="rejected">Rejected</option>
                                </select>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Custom Username</label>
                                    <input 
                                        type="text" 
                                        value={customUsername} 
                                        onChange={(e) => setCustomUsername(e.target.value)}
                                        className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                                        placeholder="Optional"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Custom Password</label>
                                    <input 
                                        type="text" 
                                        value={customPassword} 
                                        onChange={(e) => setCustomPassword(e.target.value)}
                                        className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                                        placeholder="Optional"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Allowed Tabs</label>
                                <div className="space-y-2">
                                    {['accounts', 'transactions', 'import'].map(tab => (
                                        <label key={tab} className="flex items-center">
                                            <input 
                                                type="checkbox" 
                                                checked={allowedTabs.includes(tab)} 
                                                onChange={() => handleTabToggle(tab)}
                                                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                                            />
                                            <span className="ml-2 text-sm text-gray-900 capitalize">{tab}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700">Restrict to Specific Account</label>
                                <input 
                                    type="text"
                                    list="userAccountsList"
                                    value={allowedAccount} 
                                    onChange={(e) => setAllowedAccount(e.target.value)}
                                    placeholder="-- No Restriction (All Accounts) --"
                                    className="mt-1 block w-full pl-3 pr-10 py-2 text-base border border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
                                />
                                <datalist id="userAccountsList">
                                    {accounts.map(acc => (
                                        <option key={acc.id} value={acc.name} />
                                    ))}
                                </datalist>
                                <p className="mt-1 text-xs text-gray-500">If set, the user will only see transactions and data for this specific ledger account.</p>
                            </div>
                        </div>

                        <div className="mt-6 flex justify-end gap-3">
                            <button 
                                onClick={() => setEditingUser(null)}
                                className="bg-white py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50"
                            >
                                Cancel
                            </button>
                            <button 
                                onClick={handleSave}
                                disabled={saving}
                                className="bg-blue-600 py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
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
