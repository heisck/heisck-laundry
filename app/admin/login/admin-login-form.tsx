"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { formatAccraClockTime } from "@/app/admin/_components/client-utils";
import { Toaster, useToasts } from "@/app/admin/_components/toaster";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function AdminLoginForm() {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const { toasts, pushToast, dismissToast } = useToasts();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [clock, setClock] = useState(() => formatAccraClockTime(new Date()));

  useEffect(() => {
    const timer = setInterval(() => {
      setClock(formatAccraClockTime(new Date()));
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    const loadingToastId = pushToast(
      "loading",
      "Signing in",
      "Verifying your admin credentials.",
      { persist: true },
    );

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    dismissToast(loadingToastId);
    setLoading(false);

    if (signInError) {
      pushToast("error", "Sign in failed", signInError.message);
      return;
    }

    router.replace("/admin");
    router.refresh();
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-[1320px] px-5 py-6 md:px-8">
      <Toaster toasts={toasts} dismiss={dismissToast} />

      <header className="admin-topbar mb-5 flex items-center gap-2 px-4 py-3 md:gap-3 md:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-cyan-200 bg-white shadow-sm sm:h-16 sm:w-16">
            <Image
              src="/web-app-manifest-192x192.png"
              alt="Heisck Laundry logo"
              width={64}
              height={64}
              className="h-full w-full object-cover"
              priority
            />
          </div>
        </div>

        <div className="ml-auto flex shrink-0 items-center justify-end gap-1.5 sm:gap-2 md:gap-3">
          <div className="pill-soft bg-white/92 px-3 py-2.5 text-[0.72rem] uppercase tracking-[0.14em] text-slate-600 sm:px-4 sm:py-3 sm:text-[0.74rem]">
            <span className="sm:hidden">Sign In</span>
            <span className="hidden sm:inline">Admin Sign In</span>
          </div>
          <div className="admin-time-pill" suppressHydrationWarning>
            {clock ?? "--:--:--"}
          </div>
        </div>
      </header>

      <section className="grid gap-5 lg:grid-cols-[1.08fr_0.92fr]">
        <article className="panel-hero flex flex-col justify-between gap-8 p-6 md:p-8 lg:p-10">
          <div className="grid gap-6 lg:grid-cols-[0.88fr_1.12fr] lg:items-center">
            <div className="mx-auto w-full max-w-[18rem]">
              <div className="rounded-[2rem] border border-cyan-100 bg-white/88 p-4 shadow-[0_18px_40px_rgba(15,118,110,0.08)]">
                <div className="overflow-hidden rounded-[1.55rem] bg-white">
                  <Image
                    src="/web-app-manifest-512x512.png"
                    alt="Heisck Laundry logo"
                    width={512}
                    height={512}
                    className="h-auto w-full object-cover"
                    priority
                  />
                </div>
              </div>
            </div>

            <div>
              <p className="label-kicker">Private Operations Portal</p>
              <h1 className="font-display mt-4 text-3xl font-semibold tracking-tight text-slate-950 md:text-4xl">
                Sign in to the laundry workspace
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600 md:text-lg">
                Manage package intake, customer updates, worker payouts, protected private totals, and weekly reporting from one clean dashboard.
              </p>

              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <article className="metric-tile px-4 py-4">
                  <p className="label-kicker">Packages</p>
                  <p className="mt-2 text-lg font-semibold text-slate-950">Fast intake</p>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    Create, update, and track orders with fewer steps.
                  </p>
                </article>
                <article className="metric-tile px-4 py-4">
                  <p className="label-kicker">Privacy</p>
                  <p className="mt-2 text-lg font-semibold text-slate-950">Owner protected</p>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    Sensitive totals stay hidden behind the private route.
                  </p>
                </article>
                <article className="metric-tile px-4 py-4">
                  <p className="label-kicker">Payments</p>
                  <p className="mt-2 text-lg font-semibold text-slate-950">Clear status</p>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    Track customer payment state and package progress in one place.
                  </p>
                </article>
              </div>
            </div>
          </div>
        </article>

        <article className="glass-card p-6 md:p-8 lg:p-10">
          <p className="label-kicker">Admin Access</p>
          <h2 className="font-display mt-3 text-3xl font-semibold tracking-tight text-slate-950">
            Continue to the dashboard
          </h2>
          <p className="mt-3 max-w-xl text-base leading-7 text-slate-600">
            Use your verified admin email and password to enter the Heisck Laundry workspace.
          </p>

          <form className="mt-8 space-y-5" onSubmit={onSubmit}>
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                Email address
              </label>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                className="input-control"
                autoComplete="email"
                placeholder="admin@heiscklaundry.com"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                className="input-control"
                autoComplete="current-password"
                placeholder="Enter your password"
              />
            </div>

            <div className="surface-subtle px-4 py-4">
              <p className="label-kicker">Access Notice</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Normal staff access the shared admin pages. Owner-only totals remain inside the private route after sign in.
              </p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary w-full"
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>
        </article>
      </section>
    </main>
  );
}
