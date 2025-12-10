import {
    signInWithPopup,
    signOut as firebaseSignOut,
    onAuthStateChanged,
} from 'firebase/auth';
import type { User } from 'firebase/auth';
import { auth, googleProvider } from './firebase';

export type AuthUser = User | null;

// Whitelist of allowed email addresses
// Add emails here to grant access
const ALLOWED_EMAILS: string[] = [
    // Add your allowed emails here, e.g.:
    // 'kentaro@example.com',
    // 'staff@example.com',
];

// Check if email is allowed
export const isEmailAllowed = (email: string | null): boolean => {
    if (!email) return false;
    // If whitelist is empty, allow all (for development)
    if (ALLOWED_EMAILS.length === 0) return true;
    return ALLOWED_EMAILS.includes(email.toLowerCase());
};

// Sign in with Google (with whitelist check)
export const signInWithGoogle = async (): Promise<User> => {
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;

    // Check if email is in whitelist
    if (!isEmailAllowed(user.email)) {
        // Sign out immediately if not allowed
        await firebaseSignOut(auth);
        throw new Error(`アクセスが許可されていません: ${user.email}`);
    }

    return user;
};

// Sign out
export const signOut = async (): Promise<void> => {
    await firebaseSignOut(auth);
};

// Subscribe to auth state changes (with whitelist check)
export const onAuthStateChange = (callback: (user: AuthUser) => void): (() => void) => {
    return onAuthStateChanged(auth, async (user) => {
        if (user && !isEmailAllowed(user.email)) {
            // If user is logged in but not allowed, sign them out
            await firebaseSignOut(auth);
            callback(null);
        } else {
            callback(user);
        }
    });
};

// Get current user
export const getCurrentUser = (): AuthUser => {
    return auth.currentUser;
};
