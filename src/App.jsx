import React, { useState, useEffect } from 'react';
import { db, auth } from './firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import ImportCenter from './components/ImportCenter';
import AccountsTab from './components/AccountsTab';
import TransactionsTab from './components/TransactionsTab';
import LoginScreen from './components/LoginScreen';
import UserManagementTab from './components/UserManagementTab';
import SettingsTab from './components/SettingsTab';

export default function App() {
    const [currentUser, setCurrentUser] = useState(null);
    const [activeTab, setActiveTab] = useState('');
    
    // For updating user's custom password
    const [showChangePassword, setShowChangePassword] = useState(false);
    const [newPassword, setNewPassword] = useState('');

    const [updateTrigger, setUpdateTrigger] = useState(0);

    // Initial default tab when user logs in
    useEffect(() => {
        if (currentUser && !activeTab) {
            if (currentUser.role === 'admin') {
                setActiveTab('users');
            } else if (currentUser.allowedTabs && currentUser.allowedTabs.length > 0) {
                setActiveTab(currentUser.allowedTabs[0]);
            }
        }
    }, [currentUser, activeTab]);

    const handleLogout = async () => {
        try {
            await signOut(auth);
        } catch (e) {
            console.error(e);
        }
        setCurrentUser(null);
        setActiveTab('');
    };

    const handleChangePassword = async () => {
        if (!newPassword) return;
        try {
            const userRef = doc(db, 'users', currentUser.uid);
            await updateDoc(userRef, { customPassword: newPassword });
            setCurrentUser(prev => ({ ...prev, customPassword: newPassword }));
            alert("Password updated successfully!");
            setShowChangePassword(false);
            setNewPassword('');
        } catch (err) {
            console.error(err);
            alert("Failed to change password");
        }
    };

    if (!currentUser) {
        return <LoginScreen onLoginSuccess={setCurrentUser} />;
    }

    const hasTabAccess = (tabId) => {
        if (currentUser.role === 'admin') return true;
        return currentUser.allowedTabs?.includes(tabId);
    };

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <header className="mb-8 flex justify-between items-end border-b border-gray-300 pb-4">
                <div>
                    <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Tally Analyzer</h1>
                    <p className="text-sm text-gray-500 mt-1">Deep analysis of Master and Transaction exports</p>
                    {currentUser.allowedAccount && (
                        <p className="text-xs text-orange-600 font-bold mt-1 bg-orange-100 inline-block px-2 py-0.5 rounded">
                            Restricted View: {currentUser.allowedAccount}
                        </p>
                    )}
                </div>
                <div className="flex flex-col items-end">
                    <div className="flex items-center gap-4">
                        <div className="text-sm text-gray-600 text-right">
                            Logged in as <b>{currentUser.name}</b>
                            {currentUser.role === 'admin' && <span className="ml-2 text-xs bg-purple-100 text-purple-800 px-1.5 py-0.5 rounded font-bold">ADMIN</span>}
                        </div>
                        <div className="relative group">
                            <button className="text-sm text-gray-500 hover:text-gray-900 focus:outline-none pb-2">
                                Settings ▼
                            </button>
                            <div className="absolute right-0 top-full w-48 pt-1 z-50 hidden group-hover:block">
                                <div className="bg-white rounded-md shadow-lg border border-gray-200 py-1">
                                    <button 
                                        onClick={() => setShowChangePassword(true)}
                                        className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 w-full text-left"
                                    >
                                        Change Password
                                    </button>
                                    <button 
                                        onClick={handleLogout}
                                        className="block px-4 py-2 text-sm text-red-600 hover:bg-gray-100 w-full text-left"
                                    >
                                        Logout
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            {showChangePassword && (
                <div className="mb-6 p-4 bg-gray-50 border border-gray-200 rounded-lg flex items-end gap-4 max-w-md">
                    <div className="flex-1">
                        <label className="block text-sm font-medium text-gray-700">New Password</label>
                        <input 
                            type="password" 
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm px-3 py-2 border"
                        />
                    </div>
                    <button 
                        onClick={handleChangePassword}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded text-sm font-medium"
                    >
                        Save
                    </button>
                    <button 
                        onClick={() => setShowChangePassword(false)}
                        className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded text-sm font-medium"
                    >
                        Cancel
                    </button>
                </div>
            )}
            
            <nav className="flex space-x-4 mb-6 border-b border-gray-200 pb-2">
                {currentUser.role === 'admin' && (
                    <>
                        <button 
                            onClick={() => setActiveTab('users')}
                            className={`px-4 py-2 rounded-md font-medium text-sm transition-colors ${activeTab === 'users' ? 'bg-purple-600 text-white shadow' : 'text-gray-600 hover:bg-gray-100'}`}
                        >
                            Users
                        </button>
                        <button 
                            onClick={() => setActiveTab('settings')}
                            className={`px-4 py-2 rounded-md font-medium text-sm transition-colors ${activeTab === 'settings' ? 'bg-purple-600 text-white shadow' : 'text-gray-600 hover:bg-gray-100'}`}
                        >
                            Settings
                        </button>
                    </>
                )}
                {hasTabAccess('accounts') && (
                    <button 
                        onClick={() => setActiveTab('accounts')}
                        className={`px-4 py-2 rounded-md font-medium text-sm transition-colors ${activeTab === 'accounts' ? 'bg-blue-600 text-white shadow' : 'text-gray-600 hover:bg-gray-100'}`}
                    >
                        Accounts
                    </button>
                )}
                {hasTabAccess('transactions') && (
                    <button 
                        onClick={() => setActiveTab('transactions')}
                        className={`px-4 py-2 rounded-md font-medium text-sm transition-colors ${activeTab === 'transactions' ? 'bg-blue-600 text-white shadow' : 'text-gray-600 hover:bg-gray-100'}`}
                    >
                        Transactions
                    </button>
                )}
                {hasTabAccess('import') && (
                    <button 
                        onClick={() => setActiveTab('import')}
                        className={`px-4 py-2 rounded-md font-medium text-sm transition-colors ${activeTab === 'import' ? 'bg-blue-600 text-white shadow' : 'text-gray-600 hover:bg-gray-100'}`}
                    >
                        Import Center
                    </button>
                )}
            </nav>

            <main className="bg-transparent">
                <div style={{ display: activeTab === 'users' && currentUser.role === 'admin' ? 'block' : 'none' }}>
                    <UserManagementTab updateTrigger={updateTrigger} />
                </div>
                <div style={{ display: activeTab === 'settings' && currentUser.role === 'admin' ? 'block' : 'none' }}>
                    <SettingsTab currentUser={currentUser} />
                </div>
                <div style={{ display: activeTab === 'import' && hasTabAccess('import') ? 'block' : 'none' }}>
                    <ImportCenter setUpdateTrigger={setUpdateTrigger} />
                </div>
                <div style={{ display: activeTab === 'accounts' && hasTabAccess('accounts') ? 'block' : 'none' }}>
                    <AccountsTab 
                        updateTrigger={updateTrigger}
                        setUpdateTrigger={setUpdateTrigger}
                        allowedAccount={currentUser.allowedAccount}
                        currentUser={currentUser}
                        setCurrentUser={setCurrentUser}
                    />
                </div>
                <div style={{ display: activeTab === 'transactions' && hasTabAccess('transactions') ? 'block' : 'none' }}>
                    <TransactionsTab 
                        updateTrigger={updateTrigger}
                        allowedAccount={currentUser.allowedAccount}
                    />
                </div>
            </main>
        </div>
    );
}
