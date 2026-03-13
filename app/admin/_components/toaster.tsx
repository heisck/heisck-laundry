"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { cn } from "./client-utils";

export type ToastKind = "success" | "error" | "info" | "warning" | "loading";

export interface ToastItem {
  id: number;
  kind: ToastKind;
  title: string;
  message?: string;
}

interface PushToastOptions {
  durationMs?: number;
  persist?: boolean;
}

export function useToasts() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toastIdRef = useRef(1);
  const toastTimeoutsRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  const dismissToast = useCallback((id: number) => {
    const timeout = toastTimeoutsRef.current.get(id);
    if (timeout) {
      clearTimeout(timeout);
      toastTimeoutsRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const pushToast = useCallback(
    (
      kind: ToastKind,
      title: string,
      message?: string,
      options?: PushToastOptions,
    ) => {
      const id = toastIdRef.current;
      toastIdRef.current += 1;

      setToasts((prev) => [...prev, { id, kind, title, message }]);
      if (!options?.persist) {
        const timeout = setTimeout(
          () => dismissToast(id),
          options?.durationMs ?? 5000,
        );
        toastTimeoutsRef.current.set(id, timeout);
      }

      return id;
    },
    [dismissToast],
  );

  useEffect(() => {
    const trackedTimeouts = toastTimeoutsRef.current;
    return () => {
      trackedTimeouts.forEach((timeout) => clearTimeout(timeout));
      trackedTimeouts.clear();
    };
  }, []);

  return { toasts, pushToast, dismissToast };
}

export function Toaster({
  toasts,
  dismiss,
}: {
  toasts: ToastItem[];
  dismiss: (id: number) => void;
}) {
  return (
    <aside
      aria-live="polite"
      className="pointer-events-none fixed right-4 top-4 z-50 flex w-[min(92vw,26rem)] flex-col gap-3"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cn(
            "pointer-events-auto overflow-hidden rounded-[1.3rem] border p-4 shadow-lg transition",
            toast.kind === "success" && "border-emerald-200 bg-white/95",
            toast.kind === "error" && "border-rose-200 bg-white/95",
            toast.kind === "info" && "border-slate-200 bg-white/95",
            toast.kind === "warning" && "border-amber-200 bg-white/95",
            toast.kind === "loading" && "border-sky-200 bg-white/95",
          )}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2">
              <span
                className={cn(
                  "mt-1 inline-flex h-2.5 w-2.5 rounded-full",
                  toast.kind === "success" && "bg-emerald-500",
                  toast.kind === "error" && "bg-rose-500",
                  toast.kind === "info" && "bg-blue-500",
                  toast.kind === "warning" && "bg-amber-500",
                  toast.kind === "loading" && "bg-sky-500",
                )}
              />
              <div>
                <p className="font-display text-base font-semibold text-slate-950">
                  {toast.title}
                </p>
                {toast.message ? (
                  <p className="mt-1 text-sm leading-6 text-slate-600">{toast.message}</p>
                ) : null}
              </div>
            </div>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              className="rounded-full px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-100"
            >
              Close
            </button>
          </div>
          <div
            className={cn(
              "mt-3 h-1.5 rounded-full",
              toast.kind === "success" && "bg-emerald-100",
              toast.kind === "error" && "bg-rose-100",
              toast.kind === "info" && "bg-slate-200",
              toast.kind === "warning" && "bg-amber-100",
              toast.kind === "loading" && "bg-sky-100",
            )}
          />
        </div>
      ))}
    </aside>
  );
}
