import React, { useState } from 'react';
import { auth, googleProvider, db } from '../firebase';
import { signInWithPopup } from 'firebase/auth';
import { collection, query, where, getDocs, setDoc, doc } from 'firebase/firestore';
import { 
    Briefcase, 
    Lock, 
    User, 
    Eye, 
    EyeOff, 
    ArrowRight, 
    Clock, 
    ShieldCheck, 
    AlertCircle, 
    KeyRound, 
    CheckCircle2
} from 'lucide-react';

export default function LoginScreen({ onLoginSuccess }) {
    const [loginMethod, setLoginMethod] = useState('credentials'); // 'credentials' | 'google'
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [pendingMsg, setPendingMsg] = useState('');
    
    // Custom login state
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);

    const handleGoogleSignIn = async () => {
        setLoading(true);
        setError('');
        setPendingMsg('');
        try {
            const result = await signInWithPopup(auth, googleProvider);
            const user = result.user;
            
            // Check if user exists in Firestore
            const usersRef = collection(db, 'users');
            const q = query(usersRef, where('email', '==', user.email));
            const snapshot = await getDocs(q);
            
            if (snapshot.empty) {
                const isAdmin = user.email === 'husnailalam06@gmail.com' || user.email === 'jaybaudhimaitraders@gmail.com';

                const newUser = {
                    uid: user.uid,
                    email: user.email,
                    name: user.displayName || user.email.split('@')[0],
                    role: isAdmin ? 'admin' : 'user',
                    status: isAdmin ? 'active' : 'pending',
                    customUsername: isAdmin ? 'admin' : '',
                    customPassword: isAdmin ? 'admin' : '',
                    allowedTabs: ['accounts', 'transactions', 'import'],
                    allowedAccount: null
                };
                
                await setDoc(doc(db, 'users', user.uid), newUser);
                
                if (isAdmin) {
                    onLoginSuccess(newUser);
                } else {
                    setPendingMsg('Your access request has been submitted. Please notify an administrator to approve your account.');
                }
            } else {
                const userData = snapshot.docs[0].data();
                if (userData.status === 'active') {
                    onLoginSuccess(userData);
                } else if (userData.status === 'pending') {
                    setPendingMsg('Your account is awaiting admin approval. Please check back shortly.');
                } else {
                    setError('Your account has been deactivated or suspended. Please contact your administrator.');
                }
            }
        } catch (err) {
            console.error(err);
            setError(err.message || 'Failed to sign in with Google');
        } finally {
            setLoading(false);
        }
    };

    const handleCustomLogin = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        setPendingMsg('');
        
        try {
            if (username === 'admin' && password === 'admin') {
                // If it's the default admin login
                const adminQuery = query(collection(db, 'users'), where('email', '==', 'husnailalam06@gmail.com'));
                const adminSnap = await getDocs(adminQuery);
                if (adminSnap.empty) {
                    const uid = 'admin_uid_' + Date.now();
                    const newAdmin = {
                        uid,
                        email: 'husnailalam06@gmail.com',
                        name: 'Admin',
                        role: 'admin',
                        status: 'active',
                        customUsername: 'admin',
                        customPassword: 'admin',
                        allowedTabs: ['accounts', 'transactions', 'import'],
                        allowedAccount: null
                    };
                    await setDoc(doc(db, 'users', uid), newAdmin);
                    onLoginSuccess(newAdmin);
                    return;
                }
            }

            const usersRef = collection(db, 'users');
            const q = query(usersRef, where('customUsername', '==', username), where('customPassword', '==', password));
            const snapshot = await getDocs(q);
            
            if (snapshot.empty) {
                setError('Invalid username or password. Please verify your credentials.');
            } else {
                const userData = snapshot.docs[0].data();
                if (userData.status === 'active') {
                    onLoginSuccess(userData);
                } else if (userData.status === 'pending') {
                    setPendingMsg('Your account is awaiting admin approval.');
                } else {
                    setError('Your account has been deactivated or suspended.');
                }
            }
        } catch (err) {
            console.error(err);
            setError('Failed to log in. Please check your connection and try again.');
        } finally {
            setLoading(false);
        }
    };

    if (pendingMsg) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 sm:p-6 font-sans relative overflow-hidden">
                {/* Background Glow */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-red-500/10 blur-[120px] rounded-full pointer-events-none"></div>

                <div className="relative w-full max-w-md bg-white/80 backdrop-blur-xl rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-200 p-8 text-center">
                    <div className="w-16 h-16 bg-red-50 border border-red-200 rounded-2xl flex items-center justify-center mx-auto mb-5 text-red-500 shadow-inner">
                        <Clock className="w-8 h-8 animate-pulse" />
                    </div>
                    
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-red-100/70 text-red-800 mb-3 border border-red-200/50">
                        <ShieldCheck className="w-3.5 h-3.5" />
                        Verification Pending
                    </span>

                    <h2 className="text-2xl font-bold text-slate-900 tracking-tight mb-2">Access Under Review</h2>
                    <p className="text-sm text-slate-500 leading-relaxed mb-6">
                        {pendingMsg}
                    </p>

                    <div className="bg-slate-50/80 border border-slate-200 rounded-xl p-4 text-xs text-slate-600 text-left mb-6 space-y-1.5">
                        <p className="font-semibold text-slate-900">What happens next?</p>
                        <p>• An administrator will review your account role and assigned ledger permissions.</p>
                        <p>• Once approved, you can log in immediately with the same credentials.</p>
                    </div>

                    <button 
                        onClick={() => { setPendingMsg(''); setError(''); }}
                        className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold rounded-xl shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-slate-900/20 border border-transparent"
                    >
                        Return to Sign In
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center p-4 sm:p-6 font-sans relative overflow-hidden">
            
            {/* Background Ambient Glows */}
            <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-red-400/20 blur-[150px] rounded-full pointer-events-none"></div>
            <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-orange-400/10 blur-[150px] rounded-full pointer-events-none"></div>

            {/* BRAND HEADER */}
            <div className="relative w-full max-w-md text-center mb-8 z-10 flex flex-col items-center">
                <div className="inline-flex items-center justify-center w-20 h-20 sm:w-28 sm:h-28 mb-4 sm:mb-5 overflow-visible">
                    <img src="/LOGO%20WON.png" alt="Jay Baudhimai Traders Logo" className="w-full h-full object-contain mix-blend-multiply" />
                </div>
                <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center justify-center gap-2">
                    Jay Baudhimai Traders
                </h1>
                <p className="text-xs font-bold tracking-widest uppercase text-red-600 mt-2">
                    Accounts Reporting Portal
                </p>
            </div>

            {/* MAIN LOGIN CARD */}
            <div className="relative w-full max-w-md bg-white/80 backdrop-blur-2xl rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-200/80 overflow-hidden z-10">
                
                {/* METHOD TOGGLE TABS */}
                <div className="flex p-1.5 bg-slate-100/80 border-b border-slate-200/50 gap-1 text-xs font-bold mx-4 mt-4 rounded-xl">
                    <button
                        type="button"
                        onClick={() => { setLoginMethod('credentials'); setError(''); }}
                        className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg transition-all ${
                            loginMethod === 'credentials'
                                ? 'bg-white text-red-700 shadow-sm border border-slate-200/60'
                                : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'
                        }`}
                    >
                        <KeyRound className="w-3.5 h-3.5" />
                        Credentials
                    </button>
                    <button
                        type="button"
                        onClick={() => { setLoginMethod('google'); setError(''); }}
                        className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg transition-all ${
                            loginMethod === 'google'
                                ? 'bg-white text-red-700 shadow-sm border border-slate-200/60'
                                : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'
                        }`}
                    >
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
                            <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                            <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                            <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                            <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                        </svg>
                        Google
                    </button>
                </div>

                <div className="p-6 sm:p-8">
                    {/* ERROR BANNER */}
                    {error && (
                        <div className="mb-5 p-3 bg-red-50 border border-red-200 text-red-600 text-xs rounded-xl flex items-start gap-2.5">
                            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                            <span className="leading-snug">{error}</span>
                        </div>
                    )}

                    {loginMethod === 'credentials' ? (
                        <form onSubmit={handleCustomLogin} className="space-y-5">
                            <div>
                                <label className="block text-[10px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">
                                    Username or ID
                                </label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                                        <User className="w-4 h-4" />
                                    </div>
                                    <input
                                        type="text"
                                        required
                                        placeholder="Enter your username"
                                        value={username}
                                        onChange={(e) => setUsername(e.target.value)}
                                        className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200/80 rounded-xl text-sm text-slate-900 placeholder-slate-400 transition-all focus:outline-none focus:border-red-500 focus:ring-4 focus:ring-red-500/20 shadow-sm"
                                    />
                                </div>
                            </div>

                            <div>
                                <div className="flex items-center justify-between mb-1.5">
                                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                                        Password
                                    </label>
                                </div>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                                        <Lock className="w-4 h-4" />
                                    </div>
                                    <input
                                        type={showPassword ? "text" : "password"}
                                        required
                                        placeholder="••••••••"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="w-full pl-10 pr-11 py-3 bg-white border border-slate-200/80 rounded-xl text-sm text-slate-900 placeholder-slate-400 transition-all focus:outline-none focus:border-red-500 focus:ring-4 focus:ring-red-500/20 shadow-sm"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 focus:outline-none transition-colors"
                                        title={showPassword ? "Hide password" : "Show password"}
                                    >
                                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full mt-4 flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-bold text-white bg-red-600 hover:bg-red-700 shadow-md shadow-red-600/20 disabled:opacity-50 disabled:shadow-none transition-all"
                            >
                                {loading ? (
                                    <span className="inline-flex items-center gap-2">
                                        <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                                        </svg>
                                        Authenticating...
                                    </span>
                                ) : (
                                    <>
                                        <span>Sign In Securely</span>
                                        <ArrowRight className="w-4 h-4" />
                                    </>
                                )}
                            </button>
                        </form>
                    ) : (
                        <div className="space-y-5 text-center">
                            <p className="text-xs text-slate-500 leading-relaxed px-2">
                                Sign in seamlessly with your authorized Google Workspace account.
                            </p>

                            <button
                                onClick={handleGoogleSignIn}
                                disabled={loading}
                                className="w-full flex items-center justify-center gap-3 py-3 px-4 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-sm font-bold shadow-sm transition-all disabled:opacity-50"
                            >
                                <svg className="h-5 w-5" viewBox="0 0 24 24">
                                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                                </svg>
                                {loading ? 'Authenticating...' : 'Continue with Google'}
                            </button>

                            <div className="text-left bg-red-50 border border-red-100 rounded-xl p-3 text-[11px] text-red-800 space-y-1">
                                <p className="font-semibold text-red-900 flex items-center gap-1.5">
                                    <CheckCircle2 className="w-3.5 h-3.5 text-red-600" />
                                    First-time user?
                                </p>
                                <p className="opacity-90">New sign-ins will automatically request approval from an administrator.</p>
                            </div>
                        </div>
                    )}
                </div>

                {/* FOOTER REASSURANCE */}
                <div className="px-6 py-4 bg-slate-50/80 border-t border-slate-200/60 flex items-center justify-center gap-4 text-[10px] text-slate-500 font-medium uppercase tracking-wider">
                    <span className="flex items-center gap-1.5 text-slate-600">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                        Role-Based Access
                    </span>
                    <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                    <span>Audit Ready</span>
                </div>
            </div>

            {/* COPYRIGHT / VERSION */}
            <p className="relative z-10 text-center text-[11px] text-slate-400 mt-8 font-medium tracking-wide">
                Jay Baudhimai Traders Portal &copy; {new Date().getFullYear()} • All rights reserved
            </p>
        </div>
    );
}

