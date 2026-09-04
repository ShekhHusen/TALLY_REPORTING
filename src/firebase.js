import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyC7_yuapmis0lvNyEgn7lx7zURh82MdDN8",
  authDomain: "reporting-cfd7f.firebaseapp.com",
  projectId: "reporting-cfd7f",
  storageBucket: "reporting-cfd7f.firebasestorage.app",
  messagingSenderId: "960616847306",
  appId: "1:960616847306:web:c5092bbf28e78c9619e133",
  measurementId: "G-QST3GBXPZC"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
