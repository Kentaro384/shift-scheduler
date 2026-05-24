import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

/**
 * Firebase Web Config.
 *
 * These values are public project identifiers required by the Firebase client SDK.
 * Data access is protected by firestore.rules and the allowedUsers/{uid} gate,
 * not by hiding this config. Keep the Firebase Console API key referrer
 * restrictions and Auth authorized domains limited to the deployed app origins.
 *
 * See SECURITY.md for the operating policy.
 */
const firebaseConfig = {
    apiKey: "AIzaSyA8G6gJaEUVCd-Rl9SVho5pqPpyf1NFOBg",
    authDomain: "shiftpalette.firebaseapp.com",
    projectId: "shiftpalette",
    storageBucket: "shiftpalette.firebasestorage.app",
    messagingSenderId: "331025852082",
    appId: "1:331025852082:web:faacd4a3a0d06caf2a0bab",
    measurementId: "G-PB6YR2MMBQ"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Auth
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Firestore
export const db = getFirestore(app);

export default app;
