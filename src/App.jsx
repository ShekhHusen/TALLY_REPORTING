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
import FollowUpsTab from './components/FollowUpsTab';

import { 
    Users, 
    Briefcase, 
    ArrowRightLeft, 
    Clock, 
    UploadCloud, 
    Settings, 
    LogOut,
    Key,
    User
} from 'lucide-react';

export default function App() {
    const [currentUser, setCurrentUser] = useState(() => {
        try {
            const saved = sessionStorage.getItem('currentUser');
            return saved ? JSON.parse(saved) : null;
        } catch { return null; }
    });
    const [activeTab, setActiveTab] = useState('');
    
    // For updating user's custom password
    const [showChangePassword, setShowChangePassword] = useState(false);
    const [newPassword, setNewPassword] = useState('');

    const [updateTrigger, setUpdateTrigger] = useState(0);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    // Wrapper to sync user state with sessionStorage
    const handleSetCurrentUser = (valOrFn) => {
        setCurrentUser(prev => {
            const next = typeof valOrFn === 'function' ? valOrFn(prev) : valOrFn;
            if (next) {
                sessionStorage.setItem('currentUser', JSON.stringify(next));
            } else {
                sessionStorage.removeItem('currentUser');
            }
            return next;
        });
    };

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
        handleSetCurrentUser(null);
        setActiveTab('');
    };

    const handleChangePassword = async () => {
        if (!newPassword) return;
        try {
            const userRef = doc(db, 'users', currentUser.uid);
            await updateDoc(userRef, { customPassword: newPassword });
            handleSetCurrentUser(prev => ({ ...prev, customPassword: newPassword }));
            alert("Password updated successfully!");
            setShowChangePassword(false);
            setNewPassword('');
        } catch (err) {
            console.error(err);
            alert("Failed to change password");
        }
    };

    if (!currentUser) {
        return <LoginScreen onLoginSuccess={handleSetCurrentUser} />;
    }

    const hasTabAccess = (tabId) => {
        if (currentUser.role === 'admin') return true;
        return currentUser.allowedTabs?.includes(tabId);
    };

    const NAV_ITEMS = [
        { id: 'users', label: 'Users', icon: Users, adminOnly: true },
        { id: 'accounts', label: 'Accounts', icon: Briefcase },
        { id: 'transactions', label: 'Transactions', icon: ArrowRightLeft },
        { id: 'followups', label: 'Follow-ups', icon: Clock },
        { id: 'import', label: 'Import', icon: UploadCloud },
        { id: 'settings', label: 'Settings', icon: Settings, adminOnly: true },
    ];

    const availableTabs = NAV_ITEMS.filter(item => 
        item.adminOnly ? currentUser.role === 'admin' : hasTabAccess(item.id)
    );

    const activeTabObj = availableTabs.find(t => t.id === activeTab) || availableTabs[0];

    return (
        <div className="flex h-screen bg-gray-50 overflow-hidden font-sans">
            
            {/* DESKTOP SIDEBAR */}
            <aside className="hidden md:flex flex-col w-64 bg-white border-r border-gray-200 shadow-sm z-20">
                <div className="p-6 border-b border-gray-100">
                    <h1 className="text-2xl font-extrabold text-blue-700 tracking-tight">Tally Analyzer</h1>
                    <p className="text-xs text-gray-500 mt-1 font-medium">Deep Data Analysis</p>
                </div>
                
                <nav className="flex-1 px-4 py-6 space-y-1.5 overflow-y-auto">
                    {availableTabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 ${
                                activeTab === tab.id 
                                ? 'bg-blue-50 text-blue-700 shadow-sm' 
                                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                            }`}
                        >
                            <tab.icon className={`w-5 h-5 ${activeTab === tab.id ? 'text-blue-600' : 'text-gray-400'}`} />
                            {tab.label}
                        </button>
                    ))}
                </nav>

                <div className="p-4 border-t border-gray-200 bg-gray-50">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold shadow-inner">
                            {currentUser.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 overflow-hidden">
                            <p className="text-sm font-bold text-gray-900 truncate">{currentUser.name}</p>
                            <p className="text-xs text-gray-500 capitalize">{currentUser.role}</p>
                        </div>
                    </div>
                    {currentUser.allowedAccount && (
                        <div className="mb-3">
                            <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-1">Restricted View</p>
                            <p className="text-xs text-orange-700 bg-orange-100 px-2 py-1 rounded truncate font-semibold">
                                {currentUser.allowedAccount}
                            </p>
                        </div>
                    )}
                    <div className="flex gap-2">
                        <button 
                            onClick={() => setShowChangePassword(true)}
                            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-white border border-gray-300 rounded-md text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors shadow-sm"
                            title="Change Password"
                        >
                            <Key className="w-3.5 h-3.5" /> Pass
                        </button>
                        <button 
                            onClick={handleLogout}
                            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-red-50 border border-red-100 rounded-md text-xs font-medium text-red-600 hover:bg-red-100 transition-colors shadow-sm"
                        >
                            <LogOut className="w-3.5 h-3.5" /> Exit
                        </button>
                    </div>
                </div>
            </aside>

            {/* MAIN CONTENT AREA */}
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
                
                {/* MOBILE TOP HEADER */}
                <header className="md:hidden bg-white border-b border-gray-200 px-4 py-3 flex justify-between items-center shadow-sm z-20">
                    <div>
                        <h1 className="text-lg font-bold text-blue-700 tracking-tight">Tally Analyzer</h1>
                        {currentUser.allowedAccount && (
                            <p className="text-[10px] text-orange-700 bg-orange-100 px-1.5 py-0.5 rounded inline-block font-semibold mt-0.5">
                                View: {currentUser.allowedAccount}
                            </p>
                        )}
                    </div>
                    <button 
                        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                        className="p-2 -mr-2 text-gray-600 hover:text-gray-900 focus:outline-none"
                    >
                        <User className="w-6 h-6" />
                    </button>
                </header>

                {/* MOBILE USER MENU DROPDOWN */}
                {mobileMenuOpen && (
                    <div className="md:hidden absolute top-[60px] left-0 right-0 bg-white border-b border-gray-200 shadow-lg z-30 p-4">
                        <div className="flex items-center gap-3 mb-4 pb-4 border-b border-gray-100">
                            <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-lg">
                                {currentUser.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                                <p className="text-base font-bold text-gray-900">{currentUser.name}</p>
                                <p className="text-sm text-gray-500 capitalize">{currentUser.role} Account</p>
                            </div>
                        </div>
                        <div className="flex flex-col gap-2">
                            <button 
                                onClick={() => { setShowChangePassword(true); setMobileMenuOpen(false); }}
                                className="w-full flex items-center gap-3 px-4 py-3 bg-gray-50 rounded-lg text-sm font-semibold text-gray-700"
                            >
                                <Key className="w-4 h-4 text-gray-500" /> Change Password
                            </button>
                            <button 
                                onClick={handleLogout}
                                className="w-full flex items-center gap-3 px-4 py-3 bg-red-50 rounded-lg text-sm font-semibold text-red-600"
                            >
                                <LogOut className="w-4 h-4 text-red-500" /> Logout
                            </button>
                        </div>
                    </div>
                )}

                {/* DESKTOP TOP HEADER (Optional context bar) */}
                <header className="hidden md:flex bg-white/80 backdrop-blur-md border-b border-gray-200 px-8 py-5 items-center justify-between z-10 sticky top-0">
                    <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                        {activeTabObj && <activeTabObj.icon className="w-6 h-6 text-blue-600" />}
                        {activeTabObj ? activeTabObj.label : 'Dashboard'}
                    </h2>
                </header>

                {/* SCROLLABLE MAIN PAGE */}
                <main className="flex-1 overflow-auto p-4 md:p-8 bg-gray-50 pb-24 md:pb-8">
                    
                    {/* Password Change Modal */}
                    {showChangePassword && (
                        <div className="mb-6 p-5 bg-white border border-gray-200 rounded-xl shadow-sm flex flex-col sm:flex-row items-start sm:items-end gap-4 max-w-xl mx-auto md:mx-0">
                            <div className="flex-1 w-full">
                                <label className="block text-sm font-semibold text-gray-700 mb-1">Set New Password</label>
                                <input 
                                    type="password" 
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    placeholder="Enter secure password"
                                    className="w-full border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 px-4 py-2.5 border transition-shadow"
                                />
                            </div>
                            <div className="flex gap-2 w-full sm:w-auto">
                                <button 
                                    onClick={() => setShowChangePassword(false)}
                                    className="flex-1 sm:flex-none bg-gray-100 hover:bg-gray-200 text-gray-800 px-5 py-2.5 rounded-lg text-sm font-bold transition-colors"
                                >
                                    Cancel
                                </button>
                                <button 
                                    onClick={handleChangePassword}
                                    className="flex-1 sm:flex-none bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg text-sm font-bold shadow-md shadow-blue-200 transition-colors"
                                >
                                    Save
                                </button>
                            </div>
                        </div>
                    )}

                    <div className="max-w-7xl mx-auto">
                        <div style={{ display: activeTab === 'users' ? 'block' : 'none' }}>
                            {activeTab === 'users' && <UserManagementTab updateTrigger={updateTrigger} />}
                        </div>
                        <div style={{ display: activeTab === 'settings' ? 'block' : 'none' }}>
                            {activeTab === 'settings' && <SettingsTab currentUser={currentUser} />}
                        </div>
                        <div style={{ display: activeTab === 'import' ? 'block' : 'none' }}>
                            {activeTab === 'import' && <ImportCenter setUpdateTrigger={setUpdateTrigger} currentUser={currentUser} />}
                        </div>
                        <div style={{ display: activeTab === 'accounts' ? 'block' : 'none' }}>
                            {activeTab === 'accounts' && (
                                <AccountsTab 
                                    updateTrigger={updateTrigger}
                                    setUpdateTrigger={setUpdateTrigger}
                                    allowedAccount={currentUser.allowedAccount}
                                    currentUser={currentUser}
                                    setCurrentUser={handleSetCurrentUser}
                                />
                            )}
                        </div>
                        <div style={{ display: activeTab === 'transactions' ? 'block' : 'none' }}>
                            {activeTab === 'transactions' && (
                                <TransactionsTab 
                                    updateTrigger={updateTrigger}
                                    setUpdateTrigger={setUpdateTrigger}
                                    allowedAccount={currentUser.allowedAccount}
                                    currentUser={currentUser}
                                />
                            )}
                        </div>
                        <div style={{ display: activeTab === 'followups' ? 'block' : 'none' }}>
                            {activeTab === 'followups' && <FollowUpsTab currentUser={currentUser} />}
                        </div>
                    </div>
                </main>
                
                {/* MOBILE BOTTOM NAVIGATION */}
                <nav className="md:hidden absolute bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex justify-around items-center px-2 pb-safe pt-2 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-20">
                    {availableTabs.slice(0, 5).map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => { setActiveTab(tab.id); setMobileMenuOpen(false); }}
                            className={`flex flex-col items-center justify-center w-full py-2 gap-1 rounded-lg ${
                                activeTab === tab.id 
                                ? 'text-blue-600' 
                                : 'text-gray-500 hover:text-gray-900'
                            }`}
                        >
                            <div className={`p-1.5 rounded-full transition-colors ${activeTab === tab.id ? 'bg-blue-50' : ''}`}>
                                <tab.icon className={`w-5 h-5 ${activeTab === tab.id ? 'fill-blue-100/50' : ''}`} />
                            </div>
                            <span className={`text-[10px] font-semibold tracking-wide ${activeTab === tab.id ? 'text-blue-700' : ''}`}>
                                {tab.label}
                            </span>
                        </button>
                    ))}
                </nav>
            </div>
        </div>
    );
}

