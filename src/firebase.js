import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyCAkGL0wqhK3h6ausPyCdAfvBud7NmqgRg",
  authDomain: "reporting-c532c.firebaseapp.com",
  projectId: "reporting-c532c",
  storageBucket: "reporting-c532c.firebasestorage.app",
  messagingSenderId: "563591207439",
  appId: "1:563591207439:web:7100ace8701fc188eda17a",
  measurementId: "G-EHQHCVHXNT"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
