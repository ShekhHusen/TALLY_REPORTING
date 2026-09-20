import React, { useState, useEffect } from 'react';
import { db, auth } from './firebase';
import { doc, updateDoc, getDoc, collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
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

const NAV_ITEMS = [
    { id: 'users', label: 'Users', icon: Users, adminOnly: true },
    { id: 'accounts', label: 'Accounts', icon: Briefcase },
    { id: 'transactions', label: 'Transactions', icon: ArrowRightLeft },
    { id: 'followups', label: 'Follow-ups', icon: Clock },
    { id: 'import', label: 'Import', icon: UploadCloud },
    { id: 'settings', label: 'Settings', icon: Settings, adminOnly: true },
];

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
    const [lastUpdatedDate, setLastUpdatedDate] = useState('');

    // Helper role checks
    const isSuperAdmin = Boolean(currentUser?.role === 'admin' && currentUser?.adminType !== 'secondary');
    const isSecondaryAdmin = Boolean(currentUser?.role === 'secondary_admin' || (currentUser?.role === 'admin' && currentUser?.adminType === 'secondary'));
    const isAdmin = isSuperAdmin || isSecondaryAdmin;

    const hasTabAccess = (tabId) => {
        if (!currentUser) return false;
        if (isSuperAdmin) return true;
        if (isSecondaryAdmin) {
            return Boolean(currentUser.allowedTabs?.includes(tabId));
        }
        return Boolean(currentUser.allowedTabs?.includes(tabId));
    };

    const availableTabs = !currentUser ? [] : NAV_ITEMS.filter(item => {
        if (isSuperAdmin) return true;
        if (isSecondaryAdmin) {
            // Secondary admins only see tabs explicitly assigned to them
            return Boolean(currentUser.allowedTabs?.includes(item.id));
        }
        // Standard user cannot access adminOnly tabs
        if (item.adminOnly) return false;
        return hasTabAccess(item.id);
    });

    // Ensure activeTab stays synchronized with permitted tabs
    useEffect(() => {
        if (currentUser && availableTabs.length > 0) {
            if (!activeTab || !availableTabs.some(t => t.id === activeTab)) {
                if (isSuperAdmin && availableTabs.some(t => t.id === 'users')) {
                    setActiveTab('users');
                } else {
                    setActiveTab(availableTabs[0].id);
                }
            }
        }
    }, [currentUser, availableTabs, activeTab, isSuperAdmin]);

    // Fetch last updated date for admin (super or secondary)
    useEffect(() => {
        if (!db || !isAdmin) return;

        let isMounted = true;
        const fetchLastUpdated = async () => {
            try {
                // 1. Check system metadata document
                const metaSnap = await getDoc(doc(db, 'system', 'metadata'));
                if (metaSnap.exists()) {
                    const data = metaSnap.data();
                    const d = data.lastUpdatedDate || data.lastUpdated;
                    if (d && isMounted) {
                        setLastUpdatedDate(d);
                        return;
                    }
                }

                // 2. Query most recent transaction date from Firestore
                const q = query(collection(db, 'transactions'), orderBy('date', 'desc'), limit(1));
                const txnSnap = await getDocs(q);
                if (!txnSnap.empty) {
                    const latestDate = txnSnap.docs[0].data()?.date;
                    if (latestDate && isMounted) {
                        setLastUpdatedDate(latestDate);
                        return;
                    }
                }

                // 3. Fallback to today if no transaction exists
                if (isMounted) {
                    setLastUpdatedDate(new Date().toISOString().split('T')[0]);
                }
            } catch (err) {
                console.error('Failed to fetch last updated date:', err);
                if (isMounted) {
                    setLastUpdatedDate(new Date().toISOString().split('T')[0]);
                }
            }
        };

        fetchLastUpdated();
        return () => { isMounted = false; };
    }, [currentUser, updateTrigger, isAdmin]);

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

    const handleLogout = async () => {
        try {
            if (auth) {
                await signOut(auth);
            }
        } catch (e) {
            console.error(e);
        }
        handleSetCurrentUser(null);
        setActiveTab('');
    };

    const handleChangePassword = async () => {
        if (!newPassword || !db || !currentUser) return;
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

    if (!db || !auth) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
                <div className="bg-white p-8 rounded-2xl shadow-xl max-w-xl text-center border border-red-100">
                    <div className="text-red-500 mb-4 flex justify-center"><Settings size={48} /></div>
                    <h1 className="text-2xl font-bold text-gray-900 mb-2">Configuration Missing</h1>
                    <p className="text-gray-600 mb-6">
                        The application failed to load because the Firebase configuration is missing or could not initialize.
                        Please provide valid Firebase credentials in your environment variables.
                    </p>
                </div>
            </div>
        );
    }

    if (!currentUser) {
        return <LoginScreen onLoginSuccess={handleSetCurrentUser} />;
    }

    const activeTabObj = availableTabs.find(t => t.id === activeTab) || availableTabs[0];

    const roleDisplayName = isSuperAdmin 
        ? 'Super Admin' 
        : isSecondaryAdmin 
        ? 'Secondary Admin' 
        : 'User';

    return (
        <div className="flex flex-col h-screen bg-gray-50 overflow-hidden font-sans">
            
            {/* TOP NAVIGATION BAR */}
            <header className="bg-white border-b border-red-100 px-4 md:px-6 py-2.5 flex justify-between items-center shadow-sm z-30">
                <div className="flex items-center gap-4 lg:gap-6">
                    {/* LOGO */}
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 flex items-center justify-center shrink-0 overflow-visible">
                            <img src="/LOGO%20WON.png" alt="Logo" className="w-full h-full object-contain mix-blend-multiply" />
                        </div>
                        <div>
                            <h1 className="text-lg md:text-xl font-black text-slate-900 tracking-tight leading-none">Jay Baudhimai Traders</h1>
                            <p className="text-[9px] md:text-[10px] text-red-600 mt-1 font-bold tracking-widest uppercase leading-none">Accounts Reporting Portal</p>
                        </div>
                    </div>

                    {/* PAGE TITLE (Moved to Nav) */}
                    <div className="hidden md:block h-6 w-px bg-slate-200 mx-1"></div>
                    <div className="hidden md:flex flex-col justify-center">
                        <h2 className="flex text-base lg:text-lg font-bold text-slate-800 items-center gap-2 leading-tight">
                            {activeTabObj && <activeTabObj.icon className="w-5 h-5 text-red-600" />}
                            {activeTabObj ? activeTabObj.label : 'Dashboard'}
                        </h2>
                        {isAdmin && (
                            <p className="text-[11px] text-slate-500 font-medium leading-none mt-1">
                                last updated on : <span className="font-semibold text-slate-700">{lastUpdatedDate || '...'}</span>
                            </p>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-3 lg:gap-5">
                    {/* DESKTOP NAVIGATION (Compact Section) */}
                    <nav className="hidden md:flex items-center p-1 bg-slate-100/80 border border-slate-200 rounded-xl shadow-sm gap-0.5">
                        {availableTabs.map(tab => {
                            const isActive = activeTab === tab.id;
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 ${
                                        isActive 
                                        ? 'bg-red-600 text-white shadow-md' 
                                        : 'text-slate-500 hover:text-slate-900 hover:bg-white'
                                    }`}
                                >
                                    <tab.icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                                    <span className={isActive ? 'inline-block' : 'hidden lg:inline-block'}>{tab.label}</span>
                                </button>
                            );
                        })}
                    </nav>
                    {/* DESKTOP RESTRICTED VIEW */}
                    {currentUser.allowedAccount && (
                        <div className="hidden md:flex items-center">
                            <span className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mr-2">View:</span>
                            <span className="text-xs text-orange-700 bg-orange-100 px-2 py-1 rounded font-semibold max-w-[150px] truncate">
                                {currentUser.allowedAccount}
                            </span>
                        </div>
                    )}
                    
                    {/* MOBILE RESTRICTED VIEW */}
                    {currentUser.allowedAccount && (
                        <p className="md:hidden text-[10px] text-orange-700 bg-orange-100 px-1.5 py-0.5 rounded inline-block font-semibold mt-0.5">
                            View: {currentUser.allowedAccount}
                        </p>
                    )}

                    {/* MOBILE MENU BUTTON */}
                    <button 
                        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                        className="md:hidden p-2 -mr-2 text-slate-600 hover:text-red-600 focus:outline-none"
                    >
                        <User className="w-6 h-6" />
                    </button>

                    {/* DESKTOP USER MENU (Hover Dropdown) */}
                    <div className="hidden md:block relative group">
                        <button className="flex items-center gap-2 p-1 rounded-full hover:bg-slate-50 transition-colors focus:outline-none">
                            <div className="w-9 h-9 rounded-full bg-red-100 flex items-center justify-center text-red-700 font-bold shadow-inner">
                                {currentUser.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="hidden lg:block text-left mr-1">
                                <p className="text-sm font-bold text-slate-900 max-w-[120px] truncate leading-tight">{currentUser.name}</p>
                                <p className="text-xs text-slate-500 font-semibold leading-tight">{roleDisplayName}</p>
                            </div>
                        </button>
                        
                        {/* Dropdown Panel */}
                        <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-xl shadow-lg border border-slate-100 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 transform origin-top-right z-50">
                            <div className="p-4 border-b border-slate-50">
                                <p className="text-sm font-bold text-slate-900 truncate">{currentUser.name}</p>
                                <p className="text-xs text-slate-500 font-medium mt-0.5">{roleDisplayName}</p>
                            </div>
                            <div className="p-2 space-y-1">
                                <button 
                                    onClick={() => setShowChangePassword(true)}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 rounded-lg transition-colors"
                                >
                                    <Key className="w-4 h-4 text-slate-500" /> Change Password
                                </button>
                                <button 
                                    onClick={handleLogout}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                >
                                    <LogOut className="w-4 h-4 text-red-500" /> Sign Out
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            {/* MOBILE USER MENU DROPDOWN */}
            {mobileMenuOpen && (
                <div className="md:hidden absolute top-[60px] left-0 right-0 bg-white border-b border-slate-200 shadow-lg z-40 p-4">
                    <div className="flex items-center gap-3 mb-4 pb-4 border-b border-slate-100">
                        <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center text-red-700 font-bold text-lg">
                            {currentUser.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                            <p className="text-base font-bold text-slate-900">{currentUser.name}</p>
                            <p className="text-sm text-slate-500 font-medium">{roleDisplayName}</p>
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

            {/* MAIN CONTENT AREA */}
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">

                {/* SCROLLABLE MAIN PAGE */}
                <main className="flex-1 overflow-hidden p-3 md:p-4 bg-gray-50 pb-24 md:pb-4 flex flex-col">
                    
                    {/* Password Change Modal */}
                    {showChangePassword && (
                        <div className="shrink-0 mb-6 p-5 bg-white border border-gray-200 rounded-xl shadow-sm flex flex-col sm:flex-row items-start sm:items-end gap-4 max-w-xl mx-auto md:mx-0">
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

                    <div className="max-w-7xl mx-auto w-full flex-1 min-h-0 flex flex-col">
                        <div style={{ display: (activeTab === 'users' && hasTabAccess('users')) ? 'flex' : 'none' }} className="flex-1 min-h-0 flex-col">
                            {activeTab === 'users' && hasTabAccess('users') && <UserManagementTab updateTrigger={updateTrigger} currentUser={currentUser} />}
                        </div>
                        <div style={{ display: (activeTab === 'settings' && hasTabAccess('settings')) ? 'flex' : 'none' }} className="flex-1 min-h-0 flex-col overflow-y-auto">
                            {activeTab === 'settings' && hasTabAccess('settings') && <SettingsTab currentUser={currentUser} />}
                        </div>
                        <div style={{ display: (activeTab === 'import' && hasTabAccess('import')) ? 'flex' : 'none' }} className="flex-1 min-h-0 flex-col overflow-y-auto">
                            {activeTab === 'import' && hasTabAccess('import') && <ImportCenter setUpdateTrigger={setUpdateTrigger} currentUser={currentUser} />}
                        </div>
                        <div style={{ display: (activeTab === 'accounts' && hasTabAccess('accounts')) ? 'flex' : 'none' }} className="flex-1 min-h-0 flex-col">
                            {activeTab === 'accounts' && hasTabAccess('accounts') && (
                                <AccountsTab 
                                    updateTrigger={updateTrigger}
                                    setUpdateTrigger={setUpdateTrigger}
                                    allowedAccount={currentUser.allowedAccount}
                                    currentUser={currentUser}
                                    setCurrentUser={handleSetCurrentUser}
                                />
                            )}
                        </div>
                        <div style={{ display: (activeTab === 'transactions' && hasTabAccess('transactions')) ? 'flex' : 'none' }} className="flex-1 min-h-0 flex-col">
                            {activeTab === 'transactions' && hasTabAccess('transactions') && (
                                <TransactionsTab 
                                    updateTrigger={updateTrigger}
                                    setUpdateTrigger={setUpdateTrigger}
                                    allowedAccount={currentUser.allowedAccount}
                                    currentUser={currentUser}
                                />
                            )}
                        </div>
                        <div style={{ display: (activeTab === 'followups' && hasTabAccess('followups')) ? 'flex' : 'none' }} className="flex-1 min-h-0 flex-col">
                            {activeTab === 'followups' && hasTabAccess('followups') && <FollowUpsTab currentUser={currentUser} />}
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

