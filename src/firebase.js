import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyDxUdNuacE9J08BoebrY4Ax63CD4phZXj4",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "jbmt-reporting.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "jbmt-reporting",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "jbmt-reporting.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "554546722753",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:554546722753:web:c6be832b4d00fbe6bfe140",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-JGCWKJPQTG"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
