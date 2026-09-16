import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

/*
const firebaseConfig = {
  apiKey: "AIzaSyCrqNgwRJ0RqZqZRJlETX7nTgwEltCO33g",
  authDomain: "tally-reporting.firebaseapp.com",
  projectId: "tally-reporting",
  storageBucket: "tally-reporting.firebasestorage.app",
  messagingSenderId: "896448159679",
  appId: "1:896448159679:web:cbf9ccaa50fb73708a0b0a",
  measurementId: "G-PXGY6S82Q2"
};
*/

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyDxUdNuacE9J08BoebrY4Ax63CD4phZXj4",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "jbmt-reporting.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "jbmt-reporting",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "jbmt-reporting.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "554546722753",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:554546722753:web:c6be832b4d00fbe6bfe140",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-JGCWKJPQTG"
};


let app;
let db;
let auth;
let googleProvider;

try {
  app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  auth = getAuth(app);
  googleProvider = new GoogleAuthProvider();
} catch (error) {
  console.error("Firebase initialization failed. Are Vercel Environment Variables missing?", error);
  // Optional: you can set them to mock objects or leave them undefined
  // but showing a clear error in console is better than a silent white screen crash
}

export { db, auth, googleProvider, app };
