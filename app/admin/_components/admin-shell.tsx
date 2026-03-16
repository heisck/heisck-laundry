"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

import { cn, formatAccraClockTime, getAdminInitials } from "./client-utils";

interface AdminShellProps {
  userEmail: string;
  title: string;
  subtitle: string;
  headerExtras?: React.ReactNode;
  children: React.ReactNode;
}

interface NavItem {
  href: string;
  label: string;
}

const NAV_ITEMS: NavItem[] = [
  {
    href: "/admin/packages",
    label: "Packages",
  },
  {
    href: "/admin/summary",
    label: "Summary",
  },
];

export function AdminShell({
  userEmail,
  headerExtras,
  children,
}: AdminShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();

  const [openMenuForPath, setOpenMenuForPath] = useState<string | null>(null);
  const [clock, setClock] = useState(() => formatAccraClockTime(new Date()));
  const [signingOut, setSigningOut] = useState(false);

  const adminInitials = useMemo(() => getAdminInitials(userEmail), [userEmail]);
  const menuOpen = openMenuForPath === pathname;

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
      <div className="mx-auto max-w-[1600px] px-4 py-4 md:px-6 lg:px-8">
        <header className="admin-topbar mb-5 flex items-center gap-2 px-4 py-3 md:gap-3 md:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href="/admin/packages"
              className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-cyan-200 bg-white shadow-sm sm:h-16 sm:w-16"
            >
              <Image
                src="/web-app-manifest-192x192.png"
                alt="Heisck Laundry logo"
                width={64}
                height={64}
                className="h-full w-full object-cover"
                priority
              />
            </Link>
          </div>

          <div className="ml-auto flex shrink-0 items-center justify-end gap-1.5 sm:gap-2 md:gap-3">
            <div className="relative">
              <button
                type="button"
                onClick={() =>
                  setOpenMenuForPath((current) =>
                    current === pathname ? null : pathname,
                  )
                }
                className="admin-icon-btn"
                aria-expanded={menuOpen}
                aria-label="Open pages menu"
              >
                <span className="flex items-center gap-0.5" aria-hidden="true">
                  <span className="h-1 w-1 rounded-full bg-current" />
                  <span className="h-1 w-1 rounded-full bg-current" />
                  <span className="h-1 w-1 rounded-full bg-current" />
                </span>
              </button>

              {menuOpen ? (
                <div className="absolute right-0 top-[calc(100%+0.75rem)] z-50 w-52 rounded-[1.2rem] border border-slate-200 bg-white p-2 shadow-[0_18px_42px_rgba(15,35,53,0.12)]">
                  <div className="space-y-1">
                    {NAV_ITEMS.map((item) => {
                      const active =
                        pathname === item.href || pathname === `${item.href}/`;

                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setOpenMenuForPath(null)}
                          className={cn(
                            "flex items-center rounded-[0.95rem] px-3 py-2.5 text-sm font-semibold transition",
                            active
                              ? "bg-teal-50 text-teal-800"
                              : "text-slate-700 hover:bg-slate-50",
                          )}
                        >
                          <span>{item.label}</span>
                        </Link>
                      );
                    })}
                  </div>

                  <div className="mt-2 border-t border-slate-200 pt-2">
                    <button
                      type="button"
                      onClick={handleSignOut}
                      disabled={signingOut}
                      className="flex w-full items-center justify-between rounded-[0.95rem] px-3 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      <span>{signingOut ? "Signing out..." : "Sign Out"}</span>
                    </button>
                  </div>
                </div>
              ) : null}
            </div>

            {headerExtras ?? null}

            <div className="admin-time-pill" suppressHydrationWarning>
              {clock ?? "--:--:--"}
            </div>

            <div className="admin-profile-badge" title={userEmail}>
              {adminInitials}
            </div>
          </div>
        </header>

        <div className="space-y-4">{children}</div>
      </div>
    </div>
  );
}
