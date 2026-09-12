import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyDxUdNuacE9J08BoebrY4Ax63CD4phZXj4",
  authDomain: "jbmt-reporting.firebaseapp.com",
  projectId: "jbmt-reporting",
  storageBucket: "jbmt-reporting.firebasestorage.app",
  messagingSenderId: "554546722753",
  appId: "1:554546722753:web:c6be832b4d00fbe6bfe140",
  measurementId: "G-JGCWKJPQTG"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
