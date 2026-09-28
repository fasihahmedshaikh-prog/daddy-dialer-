import React, { createContext, useCallback, useContext, useState } from 'react';
import { CheckCircle2, XCircle, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ToastItem {
  id: string;
  message: string;
  variant: 'success' | 'error' | 'info';
  action?: { label: string; onClick: () => void };
}

interface ToastContextValue {
  toast: (message: string, opts?: { variant?: ToastItem['variant']; action?: ToastItem['action'] }) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const toast = useCallback<ToastContextValue['toast']>((message, opts) => {
    const id = crypto.randomUUID();
    setItems((prev) => [...prev, { id, message, variant: opts?.variant ?? 'info', action: opts?.action }]);
    setTimeout(() => setItems((prev) => prev.filter((i) => i.id !== id)), 5000);
  }, []);

  const dismiss = (id: string) => setItems((prev) => prev.filter((i) => i.id !== id));

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 w-80">
        {items.map((item) => (
          <div
            key={item.id}
            className="flex items-start gap-2 rounded-md border border-border-strong bg-surface-overlay p-3 shadow-2xl animate-in slide-in-from-bottom-2"
          >
            {item.variant === 'success' && <CheckCircle2 className="h-4 w-4 text-accent mt-0.5 shrink-0" />}
            {item.variant === 'error' && <XCircle className="h-4 w-4 text-danger mt-0.5 shrink-0" />}
            {item.variant === 'info' && <Info className="h-4 w-4 text-info mt-0.5 shrink-0" />}
            <div className="flex-1 text-sm text-text-primary">{item.message}</div>
            {item.action && (
              <button
                className="text-xs font-medium text-accent hover:underline shrink-0"
                onClick={() => {
                  item.action?.onClick();
                  dismiss(item.id);
                }}
              >
                {item.action.label}
              </button>
            )}
            <button onClick={() => dismiss(item.id)} className="text-text-tertiary hover:text-text-primary shrink-0">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

export function cnToastVariant(variant: ToastItem['variant']) {
  return cn(variant === 'success' && 'border-accent/40', variant === 'error' && 'border-danger/40');
}
