"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { formatAccraClockTime } from "@/app/admin/_components/client-utils";
import { Toaster, useToasts } from "@/app/admin/_components/toaster";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

function EmailFieldIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path
        d="M3.75 5.75h12.5c.55 0 1 .45 1 1v6.5c0 .55-.45 1-1 1H3.75c-.55 0-1-.45-1-1v-6.5c0-.55.45-1 1-1Z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="m3.25 6.5 6.15 4.48c.36.26.84.26 1.2 0l6.15-4.48"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PasswordFieldIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path
        d="M5.75 8.25V6.9a4.25 4.25 0 1 1 8.5 0v1.35"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <rect
        x="3.5"
        y="8.25"
        width="13"
        height="8.25"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M10 11.2v2.35"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function VisibilityOnIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path
        d="M2.8 10s2.45-4.2 7.2-4.2 7.2 4.2 7.2 4.2-2.45 4.2-7.2 4.2S2.8 10 2.8 10Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="10" cy="10" r="2.15" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function VisibilityOffIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path
        d="M3.35 3.35 16.65 16.65"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M8.52 5.98A8.64 8.64 0 0 1 10 5.8c4.75 0 7.2 4.2 7.2 4.2a12.7 12.7 0 0 1-2.2 2.65"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5.16 7.76A12.3 12.3 0 0 0 2.8 10s2.45 4.2 7.2 4.2c.55 0 1.08-.06 1.57-.16"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8.76 8.76A1.75 1.75 0 0 0 11.24 11.24"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function AdminLoginForm() {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const { toasts, pushToast, dismissToast } = useToasts();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [clock, setClock] = useState<string | null>(null);

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
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-cyan-200 bg-white shadow-sm sm:h-16 sm:w-16">
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

        <div className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-1 sm:gap-2 md:gap-3">
          <div className="pill-soft bg-white/92 px-3 py-2.5 text-[0.72rem] uppercase tracking-[0.14em] text-slate-600 sm:px-4 sm:py-3 sm:text-[0.74rem]">
            <span className="sm:hidden">Sign In</span>
            <span className="hidden sm:inline">Admin Sign In</span>
          </div>
          <div className="admin-time-pill" suppressHydrationWarning>
            <span className="sm:hidden">{clock?.slice(0, 5) ?? "--:--"}</span>
            <span className="hidden sm:inline">{clock ?? "--:--:--"}</span>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-[560px]">
        <article className="glass-card p-6 md:p-8 lg:p-10">
          <form className="space-y-0" onSubmit={onSubmit}>
            <div className="-mx-6 border-b border-slate-200/70 px-6 pb-5 md:-mx-8 md:px-8 lg:-mx-10 lg:px-10">
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                Email address
              </label>
              <div className="relative">
                {!email ? (
                  <span className="pointer-events-none absolute left-4 top-1/2 flex -translate-y-1/2 items-center gap-2 text-slate-400">
                    <EmailFieldIcon />
                    <span className="text-sm">Email address</span>
                  </span>
                ) : null}
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  className="input-control pl-[3.35rem]"
                  autoComplete="email"
                />
              </div>
            </div>

            <div className="-mx-6 border-t border-slate-200/70 px-6 pb-5 pt-5 md:-mx-8 md:px-8 lg:-mx-10 lg:px-10">
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                Password
              </label>
              <div className="relative">
                {!password ? (
                  <span className="pointer-events-none absolute left-4 top-1/2 flex -translate-y-1/2 items-center gap-2 text-slate-400">
                    <PasswordFieldIcon />
                    <span className="text-sm">Password</span>
                  </span>
                ) : null}
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  className="input-control pl-[3.35rem] pr-12"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-slate-600"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <VisibilityOffIcon /> : <VisibilityOnIcon />}
                </button>
              </div>
            </div>

            <div className="-mx-6 border-t border-slate-200/70 px-6 pt-5 md:-mx-8 md:px-8 lg:-mx-10 lg:px-10">
              <button
                type="submit"
                disabled={loading}
                className="btn btn-primary w-full"
              >
                {loading ? "Signing in..." : "Sign In"}
              </button>
            </div>
          </form>
        </article>
      </section>
    </main>
  );
}
