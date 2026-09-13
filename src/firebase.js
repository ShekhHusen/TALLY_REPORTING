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

/*
const firebaseConfig = {
  apiKey: "AIzaSyDxUdNuacE9J08BoebrY4Ax63CD4phZXj4",
  authDomain: "jbmt-reporting.firebaseapp.com",
  projectId: "jbmt-reporting",
  storageBucket: "jbmt-reporting.firebasestorage.app",
  messagingSenderId: "554546722753",
  appId: "1:554546722753:web:c6be832b4d00fbe6bfe140",
  measurementId: "G-JGCWKJPQTG"
};
*/

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
