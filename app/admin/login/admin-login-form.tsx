"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function AdminLoginForm() {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);

    if (signInError) {
      setError(signInError.message);
      return;
    }

    router.replace("/admin");
    router.refresh();
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[1240px] items-center px-5 py-8 md:px-8">
      <section className="grid w-full gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <article className="panel-hero flex flex-col justify-between gap-8 p-6 md:p-8 lg:p-10">
          <div>
            <p className="label-kicker">Private Operations Portal</p>
            <div className="mt-4 flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-[1.5rem] bg-gradient-to-br from-teal-600 to-sky-700 text-base font-extrabold tracking-[0.24em] text-white shadow-lg shadow-sky-900/15">
                HL
              </div>
              <div>
                <h1 className="font-display text-3xl font-semibold tracking-tight text-slate-950 md:text-4xl">
                  Heisck Laundry
                </h1>
                <p className="mt-2 max-w-xl text-base leading-7 text-slate-600 md:text-lg">
                  Secure access for package intake, worker payouts, weekly closing, and customer updates.
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <article className="metric-tile px-4 py-4">
              <p className="label-kicker">Clarity</p>
              <p className="mt-2 text-lg font-semibold text-slate-950">Readable workflow</p>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                Faster package creation and simpler status changes.
              </p>
            </article>
            <article className="metric-tile px-4 py-4">
              <p className="label-kicker">Security</p>
              <p className="mt-2 text-lg font-semibold text-slate-950">Protected access</p>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                Admin pages stay behind Supabase authentication.
              </p>
            </article>
            <article className="metric-tile px-4 py-4">
              <p className="label-kicker">Speed</p>
              <p className="mt-2 text-lg font-semibold text-slate-950">Lighter interface</p>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                Less visual clutter and faster page load behavior.
              </p>
            </article>
          </div>
        </article>

        <article className="glass-card p-6 md:p-8">
          <p className="label-kicker">Admin Sign In</p>
          <h2 className="font-display mt-3 text-3xl font-semibold tracking-tight text-slate-950">
            Continue to the dashboard
          </h2>
          <p className="mt-3 text-base leading-7 text-slate-600">
            Use your verified admin credentials to access the laundry control area.
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
              />
            </div>

            {error ? (
              <p className="rounded-[1rem] border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-700">
                {error}
              </p>
            ) : null}

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
