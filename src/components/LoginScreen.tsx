import React from 'react';
import { ShiftPaletteIcon } from './ShiftPaletteIcon';
import { signInWithGoogle } from '../lib/auth';

interface LoginScreenProps {
    onLogin: () => void;
    isLoading: boolean;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin, isLoading }) => {
    const handleLogin = async () => {
        try {
            await signInWithGoogle();
            onLogin();
        } catch (error) {
            console.error('Login failed:', error);
            alert('ログインに失敗しました。もう一度お試しください。');
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-pink-50 via-white to-amber-50 flex items-center justify-center p-4">
            <div className="max-w-md w-full">
                {/* Logo */}
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-24 h-24 bg-white rounded-3xl shadow-xl mb-6">
                        <ShiftPaletteIcon className="w-16 h-16" />
                    </div>
                    <h1 className="text-3xl font-bold bg-gradient-to-r from-[#FF6B6B] via-[#FFE66D] to-[#4ECDC4] bg-clip-text text-transparent">
                        ShiftPalette
                    </h1>
                    <p className="text-gray-500 mt-2">保育園シフト管理システム</p>
                </div>

                {/* Login Card */}
                <div className="bg-white rounded-3xl shadow-2xl p-8 border border-gray-100">
                    <h2 className="text-xl font-bold text-gray-800 text-center mb-6">
                        ログイン
                    </h2>

                    <button
                        onClick={handleLogin}
                        disabled={isLoading}
                        className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-white border-2 border-gray-200 rounded-2xl hover:bg-gray-50 hover:border-gray-300 transition-all duration-200 shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isLoading ? (
                            <div className="w-6 h-6 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
                        ) : (
                            <>
                                <svg className="w-6 h-6" viewBox="0 0 24 24">
                                    <path
                                        fill="#4285F4"
                                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                                    />
                                    <path
                                        fill="#34A853"
                                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                                    />
                                    <path
                                        fill="#FBBC05"
                                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                                    />
                                    <path
                                        fill="#EA4335"
                                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                                    />
                                </svg>
                                <span className="font-medium text-gray-700">Googleアカウントでログイン</span>
                            </>
                        )}
                    </button>

                    <p className="text-xs text-gray-400 text-center mt-6">
                        ログインすると、複数デバイスでデータを同期できます
                    </p>
                </div>

                {/* Footer */}
                <p className="text-center text-gray-400 text-sm mt-8">
                    © 2024 ShiftPalette. All rights reserved.
                </p>
            </div>
        </div>
    );
};
