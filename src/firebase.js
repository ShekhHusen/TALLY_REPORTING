import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyCrqNgwRJ0RqZqZRJlETX7nTgwEltCO33g",
  authDomain: "tally-reporting.firebaseapp.com",
  projectId: "tally-reporting",
  storageBucket: "tally-reporting.firebasestorage.app",
  messagingSenderId: "896448159679",
  appId: "1:896448159679:web:cbf9ccaa50fb73708a0b0a",
  measurementId: "G-PXGY6S82Q2"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
