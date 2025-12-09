import React, { useState, useCallback, createContext, useContext, useEffect } from 'react';
import { AlertTriangle, CheckCircle, Info, X, Undo2 } from 'lucide-react';

// ============================================
// Types
// ============================================

export type ToastType = 'success' | 'warning' | 'error' | 'info';

export interface Toast {
    id: string;
    type: ToastType;
    message: string;
    description?: string;
    duration?: number;
    onUndo?: () => void;
}

interface ToastContextType {
    toasts: Toast[];
    addToast: (toast: Omit<Toast, 'id'>) => string;
    removeToast: (id: string) => void;
    success: (message: string, description?: string) => void;
    warning: (message: string, description?: string, onUndo?: () => void) => void;
    error: (message: string, description?: string) => void;
    info: (message: string, description?: string) => void;
}

// ============================================
// Context
// ============================================

const ToastContext = createContext<ToastContextType | null>(null);

export function useToast() {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToast must be used within a ToastProvider');
    }
    return context;
}

// ============================================
// Toast Item Component
// ============================================

const ToastItem: React.FC<{ toast: Toast; onRemove: () => void }> = ({ toast, onRemove }) => {
    useEffect(() => {
        if (toast.duration !== 0) {
            const timer = setTimeout(onRemove, toast.duration || 4000);
            return () => clearTimeout(timer);
        }
    }, [toast.duration, onRemove]);

    const iconMap = {
        success: <CheckCircle className="w-5 h-5 text-green-500" />,
        warning: <AlertTriangle className="w-5 h-5 text-amber-500" />,
        error: <X className="w-5 h-5 text-red-500" />,
        info: <Info className="w-5 h-5 text-blue-500" />,
    };

    const bgMap = {
        success: 'bg-green-50 border-green-200',
        warning: 'bg-amber-50 border-amber-200',
        error: 'bg-red-50 border-red-200',
        info: 'bg-blue-50 border-blue-200',
    };

    return (
        <div
            className={`flex items-start gap-3 p-4 rounded-xl border shadow-lg ${bgMap[toast.type]} animate-slide-in-right`}
            style={{ minWidth: '300px', maxWidth: '400px' }}
        >
            {iconMap[toast.type]}
            <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-800 text-sm">{toast.message}</p>
                {toast.description && (
                    <p className="text-xs text-gray-600 mt-0.5">{toast.description}</p>
                )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
                {toast.onUndo && (
                    <button
                        onClick={() => {
                            toast.onUndo?.();
                            onRemove();
                        }}
                        className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-100 rounded-lg transition-colors"
                    >
                        <Undo2 size={14} />
                        取り消す
                    </button>
                )}
                <button
                    onClick={onRemove}
                    className="p-1 hover:bg-gray-200 rounded-lg transition-colors"
                >
                    <X size={16} className="text-gray-400" />
                </button>
            </div>
        </div>
    );
};

// ============================================
// Toast Container Component
// ============================================

const ToastContainer: React.FC<{ toasts: Toast[]; onRemove: (id: string) => void }> = ({
    toasts,
    onRemove,
}) => {
    if (toasts.length === 0) return null;

    return (
        <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
            {toasts.map((toast) => (
                <ToastItem
                    key={toast.id}
                    toast={toast}
                    onRemove={() => onRemove(toast.id)}
                />
            ))}
        </div>
    );
};

// ============================================
// Toast Provider Component
// ============================================

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const addToast = useCallback((toast: Omit<Toast, 'id'>) => {
        const id = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        setToasts((prev) => [...prev, { ...toast, id }]);
        return id;
    }, []);

    const removeToast = useCallback((id: string) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }, []);

    const success = useCallback((message: string, description?: string) => {
        addToast({ type: 'success', message, description });
    }, [addToast]);

    const warning = useCallback((message: string, description?: string, onUndo?: () => void) => {
        addToast({ type: 'warning', message, description, onUndo, duration: onUndo ? 8000 : 4000 });
    }, [addToast]);

    const error = useCallback((message: string, description?: string) => {
        addToast({ type: 'error', message, description, duration: 6000 });
    }, [addToast]);

    const info = useCallback((message: string, description?: string) => {
        addToast({ type: 'info', message, description });
    }, [addToast]);

    return (
        <ToastContext.Provider
            value={{ toasts, addToast, removeToast, success, warning, error, info }}
        >
            {children}
            <ToastContainer toasts={toasts} onRemove={removeToast} />
        </ToastContext.Provider>
    );
};

// ============================================
// CSS Animation (add to global styles)
// ============================================
// Add this to your global CSS:
// @keyframes slide-in-right {
//   from { transform: translateX(100%); opacity: 0; }
//   to { transform: translateX(0); opacity: 1; }
// }
// .animate-slide-in-right { animation: slide-in-right 0.3s ease-out; }
