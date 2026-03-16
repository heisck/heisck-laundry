"use client";

import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { AdminShell } from "./admin-shell";
import { cn } from "./client-utils";

interface WorkspaceShellConfig {
  packageCount: number;
  refreshing?: boolean;
  onRefresh?: (() => void) | null;
}

interface WorkspaceShellFrameProps {
  userEmail: string;
  children: React.ReactNode;
}

interface WorkspaceShellContextValue {
  setConfig: (config: WorkspaceShellConfig | null) => void;
}

const WorkspaceShellContext = createContext<WorkspaceShellContextValue | null>(null);

function WorkspaceHeaderExtras({
  config,
}: {
  config: WorkspaceShellConfig;
}) {
  return (
    <>
      <button
        type="button"
        onClick={config.onRefresh ?? undefined}
        disabled={!config.onRefresh}
        className="admin-icon-btn"
        aria-label="Refresh page"
        title="Refresh page"
      >
        <svg
          viewBox="0 0 20 20"
          fill="none"
          className={cn(
            "h-4 w-4 text-slate-700",
            config.refreshing ? "animate-spin" : "",
          )}
          aria-hidden="true"
        >
          <path
            d="M16.5 10A6.5 6.5 0 0 1 5.41 14.59"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <path
            d="M4.5 10A6.5 6.5 0 0 1 14.59 5.41"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <path
            d="M6.1 14.75H5v-1.1"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M13.9 5.25H15v1.1"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      <div className="topbar-counter inline-flex min-h-[2.4rem] items-center gap-1.5 rounded-full border border-slate-200 bg-white/92 px-2.5 py-1.5 shadow-[0_8px_18px_rgba(20,32,51,0.06)] sm:min-h-[2.9rem] sm:gap-2 sm:px-3 sm:py-2">
        <span className="hidden text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 sm:inline">
          Packages
        </span>
        <span className="font-display text-sm font-semibold text-slate-950 sm:text-lg">
          {config.packageCount}
        </span>
      </div>
    </>
  );
}

export function WorkspaceShellFrame({
  userEmail,
  children,
}: WorkspaceShellFrameProps) {
  const router = useRouter();
  const [config, setConfig] = useState<WorkspaceShellConfig | null>(null);

  useEffect(() => {
    router.prefetch("/admin/packages");
    router.prefetch("/admin/summary");
  }, [router]);

  const contextValue = useMemo<WorkspaceShellContextValue>(
    () => ({
      setConfig,
    }),
    [],
  );

  return (
    <WorkspaceShellContext.Provider value={contextValue}>
      <AdminShell
        userEmail={userEmail}
        title=""
        subtitle=""
        headerExtras={config ? <WorkspaceHeaderExtras config={config} /> : null}
      >
        {children}
      </AdminShell>
    </WorkspaceShellContext.Provider>
  );
}

export function useWorkspaceShell(config: WorkspaceShellConfig | null) {
  const context = useContext(WorkspaceShellContext);
  const refreshRef = useRef<(() => void) | null>(config?.onRefresh ?? null);
  const packageCount = config?.packageCount ?? null;
  const refreshing = config?.refreshing ?? false;
  const hasRefresh = Boolean(config?.onRefresh);

  useEffect(() => {
    refreshRef.current = config?.onRefresh ?? null;
  }, [config?.onRefresh]);

  useLayoutEffect(() => {
    if (!context) {
      return;
    }

    if (packageCount === null) {
      context.setConfig(null);
      return () => context.setConfig(null);
    }

    context.setConfig({
      packageCount,
      refreshing,
      onRefresh: hasRefresh ? () => refreshRef.current?.() : null,
    });
    return () => context.setConfig(null);
  }, [context, hasRefresh, packageCount, refreshing]);
}
