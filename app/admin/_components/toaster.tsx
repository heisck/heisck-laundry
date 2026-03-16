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

const DEFAULT_TOAST_DURATION_MS = 5000;
const PERSISTENT_TOAST_DURATION_MS = 12000;

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
      const timeout = setTimeout(
        () => dismissToast(id),
        options?.durationMs ??
          (options?.persist ? PERSISTENT_TOAST_DURATION_MS : DEFAULT_TOAST_DURATION_MS),
      );
      toastTimeoutsRef.current.set(id, timeout);

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
      className="pointer-events-none fixed bottom-3 left-1/2 z-50 flex w-[min(82vw,18rem)] -translate-x-1/2 flex-col gap-2 sm:left-auto sm:right-4 sm:top-[calc(env(safe-area-inset-top)+1rem)] sm:bottom-auto sm:w-[min(92vw,26rem)] sm:translate-x-0 sm:gap-3"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cn(
            "pointer-events-auto overflow-hidden rounded-[1.05rem] border p-3 shadow-lg transition sm:rounded-[1.3rem] sm:p-4",
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
                  "mt-1 inline-flex h-2 w-2 rounded-full sm:h-2.5 sm:w-2.5",
                  toast.kind === "success" && "bg-emerald-500",
                  toast.kind === "error" && "bg-rose-500",
                  toast.kind === "info" && "bg-blue-500",
                  toast.kind === "warning" && "bg-amber-500",
                  toast.kind === "loading" && "bg-sky-500",
                )}
              />
              <div>
                <p className="font-display text-sm font-semibold text-slate-950 sm:text-base">
                  {toast.title}
                </p>
                {toast.message ? (
                  <p className="mt-1 text-xs leading-5 text-slate-600 sm:text-sm sm:leading-6">
                    {toast.message}
                  </p>
                ) : null}
              </div>
            </div>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              aria-label="Dismiss notification"
              className="inline-flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 sm:h-8 sm:w-8 sm:text-base"
            >
              <span aria-hidden="true">&times;</span>
            </button>
          </div>
          <div
            className={cn(
              "mt-2 h-1 rounded-full sm:mt-3 sm:h-1.5",
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
