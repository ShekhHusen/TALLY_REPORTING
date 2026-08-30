import React, { useState } from 'react';
import { auth, googleProvider, db } from '../firebase';
import { signInWithPopup } from 'firebase/auth';
import { collection, query, where, getDocs, setDoc, doc, limit } from 'firebase/firestore';

export default function LoginScreen({ onLoginSuccess }) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [pendingMsg, setPendingMsg] = useState('');
    
    // Custom login state
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');

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
                const isAdmin = user.email === 'husnailalam06@gmail.com';

                const newUser = {
                    uid: user.uid,
                    email: user.email,
                    name: user.displayName,
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
                    setPendingMsg('Your access request has been sent. Please wait for an Admin to verify and approve your account.');
                }
            } else {
                const userData = snapshot.docs[0].data();
                if (userData.status === 'active') {
                    onLoginSuccess(userData);
                } else if (userData.status === 'pending') {
                    setPendingMsg('Your account is still pending admin approval.');
                } else {
                    setError('Your account has been rejected or suspended.');
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
                // If it's the hardcoded admin login
                const adminQuery = query(collection(db, 'users'), where('email', '==', 'husnailalam06@gmail.com'));
                const adminSnap = await getDocs(adminQuery);
                if (adminSnap.empty) {
                    // Seed the admin user if they haven't logged in with Google yet
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
                setError('Invalid username or password.');
            } else {
                const userData = snapshot.docs[0].data();
                if (userData.status === 'active') {
                    onLoginSuccess(userData);
                } else if (userData.status === 'pending') {
                    setPendingMsg('Your account is still pending admin approval.');
                } else {
                    setError('Your account has been rejected or suspended.');
                }
            }
        } catch (err) {
            console.error(err);
            setError('Failed to login. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    if (pendingMsg) {
        return (
            <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
                <div className="sm:mx-auto sm:w-full sm:max-w-md bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10 text-center">
                    <svg className="mx-auto h-12 w-12 text-yellow-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                    <h2 className="text-xl font-bold text-gray-900 mb-2">Access Pending</h2>
                    <p className="text-sm text-gray-600 mb-6">{pendingMsg}</p>
                    <button 
                        onClick={() => setPendingMsg('')}
                        className="text-sm font-medium text-blue-600 hover:text-blue-500"
                    >
                        Return to Login
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
            <div className="sm:mx-auto sm:w-full sm:max-w-md text-center mb-8">
                <h2 className="text-3xl font-extrabold text-gray-900">Tally Analyzer</h2>
                <p className="mt-2 text-sm text-gray-600">Sign in to access your reports</p>
            </div>

            <div className="sm:mx-auto sm:w-full sm:max-w-md">
                <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
                    
                    {error && <div className="mb-4 bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded">{error}</div>}

                    <div>
                        <button
                            onClick={handleGoogleSignIn}
                            disabled={loading}
                            className="w-full flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition"
                        >
                            <svg className="h-5 w-5 mr-2" viewBox="0 0 24 24">
                                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                            </svg>
                            Sign in with Google
                        </button>
                    </div>

                    <div className="mt-6">
                        <div className="relative">
                            <div className="absolute inset-0 flex items-center">
                                <div className="w-full border-t border-gray-300" />
                            </div>
                            <div className="relative flex justify-center text-sm">
                                <span className="px-2 bg-white text-gray-500">Or use Admin credentials</span>
                            </div>
                        </div>
                    </div>

                    <form className="mt-6 space-y-4" onSubmit={handleCustomLogin}>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Username</label>
                            <input
                                type="text"
                                required
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                className="mt-1 appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Password</label>
                            <input
                                type="password"
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="mt-1 appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                        >
                            Sign in
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}
