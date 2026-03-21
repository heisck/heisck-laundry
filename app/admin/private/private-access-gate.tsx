"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { AdminShell } from "../_components/admin-shell";
import { fetchWithTimeout, parseApiResponse } from "../_components/client-utils";
import { Toaster, useToasts } from "../_components/toaster";

export function PrivateAccessGate({ userEmail }: { userEmail: string }) {
  const router = useRouter();
  const { toasts, pushToast, dismissToast } = useToasts();

  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    const loadingToastId = pushToast(
      "loading",
      "Unlocking private view",
      "Checking the owner password.",
      { persist: true },
    );

    try {
      const response = await fetchWithTimeout("/api/admin/private-access", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ password }),
      });

      await parseApiResponse<{ success: boolean }>(response);
      setPassword("");
      dismissToast(loadingToastId);
      router.refresh();
    } catch (submitError) {
      dismissToast(loadingToastId);
      pushToast(
        "error",
        "Unlock failed",
        submitError instanceof Error ? submitError.message : "Unable to unlock private view.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AdminShell
      userEmail={userEmail}
      title="Private"
      subtitle="Enter the secondary password to view admin-only totals."
    >
      <Toaster toasts={toasts} dismiss={dismissToast} />

      <section className="mx-auto max-w-2xl">
        <article className="glass-card overflow-hidden">
          <div className="border-b border-slate-200/70 px-5 py-4">
            <p className="label-kicker">Private Access</p>
            <h3 className="font-display mt-2 text-2xl font-semibold text-slate-950">
              Unlock protected totals
            </h3>
            <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">
              This page holds the current-week private totals and the weekly history.
              Enter the private password to continue.
            </p>
          </div>

          <form className="space-y-5 p-5" onSubmit={handleSubmit}>
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                Private password
              </label>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                autoFocus
                autoComplete="current-password"
                className="input-control"
                placeholder="Enter password"
              />
            </div>

            <button type="submit" disabled={submitting} className="btn btn-primary">
              {submitting ? "Unlocking..." : "Unlock Private View"}
            </button>
          </form>
        </article>
      </section>
    </AdminShell>
  );
}
