import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getAnalytics } from "firebase/analytics";

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY || "AIzaSyDMFt2d21pDsXjQ0aKvdAa5Z6q_Uka2lBU",
  authDomain: process.env.FIREBASE_AUTH_DOMAIN || "createathon-2026.firebaseapp.com",
  projectId: process.env.FIREBASE_PROJECT_ID || "createathon-2026",
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "createathon-2026.firebasestorage.app",
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "18251361452",
  appId: process.env.FIREBASE_APP_ID || "1:18251361452:web:5e24f0bd7ddd94a0f8c309",
  measurementId: process.env.FIREBASE_MEASUREMENT_ID || "G-RMV9GLCXGT"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

// Analytics is only available in browser environment
let analytics = null;
if (typeof window !== "undefined") {
  analytics = getAnalytics(app);
}

export { app, db, auth, googleProvider, analytics };
