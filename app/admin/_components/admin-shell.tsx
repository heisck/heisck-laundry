"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

import { cn, formatAccraClockTime, getAdminInitials } from "./client-utils";

interface AdminShellProps {
  userEmail: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}

interface NavItem {
  href: string;
  label: string;
  short: string;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/admin/packages", label: "Packages", short: "PKG" },
  { href: "/admin/weeks", label: "Weeks", short: "WKS" },
  { href: "/admin/summary", label: "Order Summary", short: "SUM" },
];

export function AdminShell({
  userEmail,
  title,
  subtitle,
  children,
}: AdminShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();

  const [menuCollapsed, setMenuCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [clock, setClock] = useState(() => formatAccraClockTime(new Date()));
  const [signingOut, setSigningOut] = useState(false);

  const adminInitials = useMemo(() => getAdminInitials(userEmail), [userEmail]);

  useEffect(() => {
    const timer = setInterval(() => {
      setClock(formatAccraClockTime(new Date()));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  async function handleSignOut() {
    setSigningOut(true);
    await supabase.auth.signOut();
    router.replace("/admin/login");
    router.refresh();
  }

  const sidebarWidthClass = menuCollapsed ? "md:w-[86px]" : "md:w-[252px]";
  const mainOffsetClass = menuCollapsed ? "md:ml-[86px]" : "md:ml-[252px]";

  return (
    <div className="min-h-screen bg-transparent">
      <header className="fixed inset-x-0 top-0 z-40 border-b border-slate-200/90 bg-white/94 backdrop-blur-xl">
        <div className="mx-auto flex h-20 max-w-[1500px] items-center justify-between px-4 md:px-6">
          <div className="flex items-center gap-3 md:gap-4">
            <button
              type="button"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              className="btn btn-secondary px-3 md:hidden"
            >
              Menu
            </button>
            <button
              type="button"
              onClick={() => setMenuCollapsed((prev) => !prev)}
              className="btn btn-secondary hidden px-3 md:inline-flex"
            >
              {menuCollapsed ? "Show" : "Hide"} Menu
            </button>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 text-sm font-bold text-white shadow-md shadow-blue-500/30">
              HL
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">
                Heisck Laundry
              </p>
              <h1 className="text-lg font-semibold text-slate-900 md:text-xl">{title}</h1>
              <p className="hidden text-xs text-slate-500 md:block">{subtitle}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 md:gap-3">
            <div className="hidden rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 md:block">
              <p className="text-[11px] uppercase tracking-wider text-slate-500">
                Accra Time
              </p>
              <p className="font-mono text-sm font-semibold text-slate-900" suppressHydrationWarning>
                {clock ?? "--:--:--"}
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white/90 px-2 py-2 md:px-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-100 text-sm font-semibold text-blue-700">
                {adminInitials}
              </span>
              <div className="hidden max-w-[16rem] md:block">
                <p className="truncate text-sm font-medium text-slate-900">{userEmail}</p>
                <p className="text-xs text-slate-500">Admin Profile</p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleSignOut}
              disabled={signingOut}
              className="btn btn-secondary"
            >
              {signingOut ? "Signing out..." : "Sign Out"}
            </button>
          </div>
        </div>
      </header>

      <aside
        className={cn(
          "fixed bottom-0 left-0 top-20 z-30 hidden overflow-y-auto border-r border-slate-200 bg-white/92 backdrop-blur-xl md:block",
          "transition-all duration-200",
          sidebarWidthClass,
        )}
      >
        <div className="px-3 py-4">
          <p
            className={cn(
              "mb-2 px-3 text-[11px] uppercase tracking-[0.18em] text-slate-500",
              menuCollapsed && "text-center",
            )}
          >
            Admin Menu
          </p>
          <nav className="divide-y divide-slate-200/90 rounded-2xl border border-slate-200 bg-slate-50/75">
            {NAV_ITEMS.map((item) => {
              const active = pathname === item.href || pathname === `${item.href}/`;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 px-3 py-3 text-sm transition",
                    active
                      ? "bg-blue-50 text-blue-700"
                      : "text-slate-700 hover:bg-white hover:text-slate-900",
                    menuCollapsed && "justify-center",
                  )}
                  title={item.label}
                >
                  <span
                    className={cn(
                      "inline-flex min-w-10 items-center justify-center rounded-lg border text-[11px] font-semibold",
                      active
                        ? "border-blue-200 bg-white text-blue-700"
                        : "border-slate-200 bg-white text-slate-500",
                    )}
                  >
                    {item.short}
                  </span>
                  <span className={cn(menuCollapsed && "hidden")}>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      </aside>

      {mobileMenuOpen ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            className="absolute inset-0 bg-slate-900/35"
            aria-label="Close menu"
          />
          <aside className="absolute left-0 top-0 h-full w-[270px] border-r border-slate-200 bg-white p-4">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Admin Menu</p>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="btn btn-secondary px-3"
              >
                Close
              </button>
            </div>
            <nav className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-slate-50/80">
              {NAV_ITEMS.map((item) => {
                const active = pathname === item.href || pathname === `${item.href}/`;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={cn(
                      "flex items-center gap-3 px-3 py-3 text-sm",
                      active
                        ? "bg-blue-50 font-medium text-blue-700"
                        : "text-slate-700",
                    )}
                  >
                    <span
                      className={cn(
                        "inline-flex min-w-10 items-center justify-center rounded-lg border text-[11px] font-semibold",
                        active
                          ? "border-blue-200 bg-white text-blue-700"
                          : "border-slate-200 bg-white text-slate-500",
                      )}
                    >
                      {item.short}
                    </span>
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </aside>
        </div>
      ) : null}

      <main className={cn("px-4 pb-10 pt-24 md:px-6", mainOffsetClass)}>
        <div className="mx-auto max-w-[1250px]">
          <section className="glass-card mb-4 border border-slate-200/80 p-5">
            <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
            <p className="mt-1 text-sm text-slate-600">{subtitle}</p>
          </section>
          {children}
        </div>
      </main>
    </div>
  );
}
