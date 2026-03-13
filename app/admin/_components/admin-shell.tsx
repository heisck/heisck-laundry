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
  description: string;
}

const NAV_ITEMS: NavItem[] = [
  {
    href: "/admin/packages",
    label: "Packages",
    short: "PKG",
    description: "Create orders, track statuses, and resend failed SMS.",
  },
  {
    href: "/admin/weeks",
    label: "Weeks",
    short: "WKS",
    description: "Open and close payout weeks with clearer controls.",
  },
  {
    href: "/admin/summary",
    label: "Summary",
    short: "SUM",
    description: "Review revenue, worker totals, and export reports.",
  },
];

function NavLink({
  item,
  active,
  compact = false,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  compact?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={cn(
        "group flex items-start gap-3 rounded-[1.15rem] border px-4 py-4 transition",
        active
          ? "border-teal-200 bg-teal-50 text-slate-950 shadow-sm"
          : "border-transparent bg-white/68 text-slate-700 hover:border-slate-200 hover:bg-white",
      )}
      title={item.label}
    >
      <span
        className={cn(
          "inline-flex h-11 min-w-11 items-center justify-center rounded-2xl border text-[0.7rem] font-bold tracking-[0.18em]",
          active
            ? "border-teal-200 bg-white text-teal-700"
            : "border-slate-200 bg-slate-50 text-slate-500",
        )}
      >
        {item.short}
      </span>
      <span className={cn("min-w-0", compact && "flex-1")}>
        <span className="font-display block text-base font-semibold text-inherit">
          {item.label}
        </span>
        <span
          className={cn(
            "mt-1 block text-sm leading-5 text-slate-500",
            active && "text-slate-600",
          )}
        >
          {item.description}
        </span>
      </span>
    </Link>
  );
}

export function AdminShell({
  userEmail,
  title,
  subtitle,
  children,
}: AdminShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();

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

  return (
    <div className="min-h-screen bg-transparent">
      <div className="mx-auto flex max-w-[1600px] gap-6 px-4 py-4 md:px-6 lg:px-8">
        <aside className="sticky top-4 hidden h-[calc(100vh-2rem)] w-[310px] shrink-0 flex-col gap-4 md:flex">
          <div className="panel-hero flex flex-col gap-6 p-5">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-[1.4rem] bg-gradient-to-br from-teal-600 to-sky-700 text-sm font-extrabold tracking-[0.22em] text-white shadow-lg shadow-sky-900/15">
                HL
              </div>
              <div>
                <p className="label-kicker">Private Admin Area</p>
                <h1 className="font-display mt-1 text-2xl font-semibold text-slate-950">
                  Heisck Laundry
                </h1>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  Clear package tracking, worker payouts, and weekly control in one place.
                </p>
              </div>
            </div>

            <div className="surface-subtle grid gap-3 p-4">
              <div>
                <p className="label-kicker">Signed In</p>
                <p className="mt-1 break-all text-sm font-semibold text-slate-900">
                  {userEmail}
                </p>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-[1.1rem] border border-slate-200 bg-white/85 px-3 py-3">
                <div>
                  <p className="label-kicker">Accra Time</p>
                  <p
                    className="font-display mt-1 text-lg font-semibold text-slate-950"
                    suppressHydrationWarning
                  >
                    {clock ?? "--:--:--"}
                  </p>
                </div>
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-teal-100 text-sm font-bold text-teal-700">
                  {adminInitials}
                </span>
              </div>
            </div>
          </div>

          <nav className="glass-card flex flex-col gap-2 p-3">
            {NAV_ITEMS.map((item) => {
              const active = pathname === item.href || pathname === `${item.href}/`;
              return <NavLink key={item.href} item={item} active={active} />;
            })}
          </nav>

          <div className="glass-card mt-auto space-y-4 p-5">
            <div>
              <p className="label-kicker">Security</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Admin pages stay behind Supabase auth. Sign out when the device is shared.
              </p>
            </div>
            <button
              type="button"
              onClick={handleSignOut}
              disabled={signingOut}
              className="btn btn-secondary w-full"
            >
              {signingOut ? "Signing out..." : "Sign Out"}
            </button>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <div className="panel-hero mb-5 flex items-center justify-between gap-3 px-4 py-4 md:hidden">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[1.2rem] bg-gradient-to-br from-teal-600 to-sky-700 text-sm font-extrabold tracking-[0.2em] text-white">
                HL
              </div>
              <div className="min-w-0">
                <p className="label-kicker">Admin</p>
                <p className="font-display truncate text-lg font-semibold text-slate-950">
                  {title}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="btn btn-secondary px-4"
            >
              Menu
            </button>
          </div>

          <section className="panel-hero mb-6 px-5 py-6 md:px-7 md:py-7">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
              <div className="max-w-3xl">
                <p className="label-kicker">Operations Console</p>
                <h2 className="font-display mt-2 text-3xl font-semibold tracking-tight text-slate-950 md:text-[2.6rem]">
                  {title}
                </h2>
                <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600 md:text-lg">
                  {subtitle}
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:min-w-[22rem]">
                <div className="metric-tile px-4 py-4">
                  <p className="label-kicker">Admin Session</p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">Authenticated</p>
                  <p className="mt-1 text-sm text-slate-600">Supabase-protected access only.</p>
                </div>
                <div className="metric-tile px-4 py-4">
                  <p className="label-kicker">Local Time</p>
                  <p
                    className="font-display mt-2 text-xl font-semibold text-slate-950"
                    suppressHydrationWarning
                  >
                    {clock ?? "--:--:--"}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">Accra clock for operations.</p>
                </div>
              </div>
            </div>
          </section>

          <div className="space-y-5">{children}</div>
        </div>
      </div>

      {mobileMenuOpen ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            className="absolute inset-0 bg-slate-950/42 backdrop-blur-sm"
            aria-label="Close menu"
          />
          <aside className="absolute right-0 top-0 flex h-full w-[min(92vw,24rem)] flex-col gap-4 border-l border-slate-200 bg-[var(--background-soft)] p-4">
            <div className="panel-hero p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="label-kicker">Signed In</p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">{userEmail}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  className="btn btn-secondary px-4"
                >
                  Close
                </button>
              </div>
            </div>

            <nav className="glass-card flex flex-col gap-2 p-3">
              {NAV_ITEMS.map((item) => {
                const active = pathname === item.href || pathname === `${item.href}/`;
                return (
                  <NavLink
                    key={item.href}
                    item={item}
                    active={active}
                    compact
                    onNavigate={() => setMobileMenuOpen(false)}
                  />
                );
              })}
            </nav>

            <button
              type="button"
              onClick={handleSignOut}
              disabled={signingOut}
              className="btn btn-secondary mt-auto w-full"
            >
              {signingOut ? "Signing out..." : "Sign Out"}
            </button>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
