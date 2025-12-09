import {
    signInWithPopup,
    signOut as firebaseSignOut,
    onAuthStateChanged,
} from 'firebase/auth';
import type { User } from 'firebase/auth';
import { auth, googleProvider } from './firebase';

export type AuthUser = User | null;

// Sign in with Google
export const signInWithGoogle = async (): Promise<User> => {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
};

// Sign out
export const signOut = async (): Promise<void> => {
    await firebaseSignOut(auth);
};

// Subscribe to auth state changes
export const onAuthStateChange = (callback: (user: AuthUser) => void): (() => void) => {
    return onAuthStateChanged(auth, callback);
};

// Get current user
export const getCurrentUser = (): AuthUser => {
    return auth.currentUser;
};
