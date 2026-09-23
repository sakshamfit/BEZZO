'use client';

/**
 * Toast feedback — quick, quiet confirmation for cart actions.
 *
 * Design rules: never blocking (pointer-events only on the toast itself), auto
 * dismisses in ~2.4s, announced politely to screen readers, honours nothing
 * about layout (fixed region, above the bottom navigation).
 */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AlertIcon, CheckCircleIcon, InfoIcon } from './icons';

export interface ToastOptions {
  title: string;
  tone?: 'ok' | 'error' | 'info';
}

interface ToastEntry extends ToastOptions {
  id: number;
  leaving: boolean;
}

interface ToastContextValue {
  toast: (options: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const DISMISS_AFTER_MS = 2400;
const LEAVE_MS = 200;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<ToastEntry[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    setEntries((current) => current.map((entry) => (entry.id === id ? { ...entry, leaving: true } : entry)));
    const leave = setTimeout(() => {
      setEntries((current) => current.filter((entry) => entry.id !== id));
      timers.current.delete(id);
    }, LEAVE_MS);
    timers.current.set(id, leave);
  }, []);

  const toast = useCallback(
    (options: ToastOptions) => {
      const id = nextId.current;
      nextId.current += 1;
      setEntries((current) => [...current.slice(-2), { id, tone: 'ok', ...options, leaving: false }]);
      const dismissAt = setTimeout(() => dismiss(id), DISMISS_AFTER_MS);
      timers.current.set(id, dismissAt);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-region" aria-live="polite" aria-atomic="false">
        {entries.map((entry) => (
          <div key={entry.id} className={`toast${entry.tone === 'error' ? ' error' : ''}`}>
            <span className="t-icon">
              {entry.tone === 'error' ? (
                <AlertIcon size={18} />
              ) : entry.tone === 'info' ? (
                <InfoIcon size={18} />
              ) : (
                <CheckCircleIcon size={18} />
              )}
            </span>
            <span>{entry.title}</span>
            <button
              type="button"
              aria-label="Dismiss notification"
              onClick={() => {
                const existing = timers.current.get(entry.id);
                if (existing) clearTimeout(existing);
                dismiss(entry.id);
              }}
              style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', opacity: 0.7, padding: 4 }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="m6 6 12 12M18 6 6 18" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside <ToastProvider>');
  return context;
}
