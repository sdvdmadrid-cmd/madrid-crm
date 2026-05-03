"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, Suspense } from "react";
import { apiFetch } from "@/lib/client-auth";

export default function LegalRequiredPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <p className="text-gray-500 text-sm">Loading…</p>
        </div>
      }
    >
      <LegalRequiredInner />
    </Suspense>
  );
}

function LegalRequiredInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") || "/dashboard";

  const [checked, setChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [legalVersion, setLegalVersion] = useState("");
  const [alreadyAccepted, setAlreadyAccepted] = useState(false);
  const [scrolledToBottom, setScrolledToBottom] = useState(false);
  const scrollRef = useRef(null);
  const checkedStatusRef = useRef(false);

  // Check if already accepted (e.g. cookie missing but DB has record)
  useEffect(() => {
    if (checkedStatusRef.current) return;
    checkedStatusRef.current = true;

    apiFetch("/api/legal/status", { suppressUnauthorizedEvent: true })
      .then((res) => res.json())
      .then((data) => {
        if (data?.data?.accepted) {
          setAlreadyAccepted(true);
          // Redirect after short delay so user sees the confirmation
          setTimeout(() => {
            const safe = normalizeSafeRedirect(nextPath);
            router.replace(safe);
          }, 800);
        }
      })
      .catch(() => {
        // Ignore — let user accept manually
      });
  }, [nextPath, router]);

  useEffect(() => {
    apiFetch("/api/legal/version", { suppressUnauthorizedEvent: true })
      .then((res) => res.json())
      .then((data) => {
        const version = String(data?.data?.version || "").trim();
        if (version) setLegalVersion(version);
      })
      .catch(() => {
        // Ignore; accept endpoint also validates current tenant version.
      });
  }, []);

  // Track scroll to bottom of legal summary
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    if (atBottom) setScrolledToBottom(true);
  }, []);

  const handleAccept = async () => {
    if (!checked || submitting) return;
    setSubmitting(true);
    setError("");

    try {
      const res = await apiFetch("/api/legal/accept", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: typeof window !== "undefined" ? window.location.origin : "",
        },
        body: JSON.stringify({ version: legalVersion || undefined }),
        suppressUnauthorizedEvent: true,
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data?.error || "Failed to record acceptance. Please try again.");
        setSubmitting(false);
        return;
      }

      const safe = normalizeSafeRedirect(nextPath);
      router.replace(safe);
    } catch {
      setError("Network error. Please try again.");
      setSubmitting(false);
    }
  };

  if (alreadyAccepted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              className="text-green-600"
              aria-hidden="true"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <p className="text-gray-700 font-medium">Terms already accepted. Redirecting…</p>
        </div>
      </div>
    );
  }

  const acceptEnabled = checked && scrolledToBottom;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <span className="text-lg font-semibold text-gray-900">
            FieldBase
          </span>
          <span className="text-sm text-gray-400 hidden sm:block">
            Legal acceptance required
          </span>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 flex flex-col items-center justify-center p-4 py-10">
        <div className="w-full max-w-2xl">
          {/* Card */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            {/* Card header */}
            <div className="px-6 py-5 border-b border-gray-100 bg-blue-50">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 bg-blue-100 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="text-blue-700"
                    aria-hidden="true"
                  >
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  </svg>
                </div>
                <div>
                  <h1 className="text-base font-semibold text-gray-900">
                    Review &amp; Accept Legal Terms
                  </h1>
                  <p className="text-sm text-gray-500 mt-0.5">
                    You must accept the FieldBase Legal &amp; Compliance
                    Terms before accessing the platform.
                  </p>
                </div>
              </div>
            </div>

            {/* Scrollable summary */}
            <div
              ref={scrollRef}
              onScroll={handleScroll}
              className="overflow-y-auto px-6 py-5 text-sm text-gray-700 space-y-4 leading-relaxed"
              style={{ maxHeight: 320 }}
              tabIndex={0}
              aria-label="Legal terms summary — scroll to read"
            >
              <p className="font-medium text-gray-900">
                FieldBase Legal &amp; Compliance Terms — {legalVersion || "current"}
              </p>
              <p>
                <strong>Terms of Service:</strong> By using FieldBase you
                agree to use the platform only for lawful business purposes.
                Your subscription renews automatically unless cancelled.
                Subscription fees are non-refundable. Misuse may result in
                account suspension.
              </p>
              <p>
                <strong>Privacy Policy:</strong> We collect account and usage
                data to operate the service. We do not sell your data or your
                clients' data. Payment processing is handled by Stripe. You may
                request deletion of your data at any time.
              </p>
              <p>
                <strong>Payment Authorization:</strong> By subscribing, you
                authorize recurring charges to your payment method. All fees
                are non-refundable. Failed payments may result in workspace
                suspension. You must keep your billing information current.
              </p>
              <p>
                <strong>SMS &amp; TCPA Consent:</strong> If you use SMS
                features, you are solely responsible for obtaining prior
                express written consent from your clients before messaging them.
                FieldBase provides infrastructure only. You must honor all
                opt-out requests (STOP).
              </p>
              <p>
                <strong>Estimate &amp; Invoice Terms:</strong> Estimates are
                not legally binding until accepted by both parties. Scope and
                pricing may change. FieldBase is not a party to agreements
                between you and your clients and is not responsible for
                disputes.
              </p>
              <p>
                <strong>Liability:</strong> The platform is provided as-is.
                FieldBase is not liable for indirect or consequential
                damages. Total liability is capped at fees paid in the prior 12
                months or $100, whichever is greater.
              </p>
              <p>
                Read the{" "}
                <Link
                  href="/legal"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-700 underline"
                >
                  full Legal &amp; Compliance document
                </Link>{" "}
                for complete terms.
              </p>
              <div className="h-2" aria-hidden="true" />
            </div>

            {!scrolledToBottom && (
              <div className="px-6 pb-2">
                <p className="text-xs text-amber-600 flex items-center gap-1.5">
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    <polyline points="7 13 12 18 17 13" />
                    <polyline points="7 6 12 11 17 6" />
                  </svg>
                  Scroll down to read all terms before accepting
                </p>
              </div>
            )}

            {/* Checkbox */}
            <div className="px-6 py-4 border-t border-gray-100">
              <label className="flex items-start gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => setChecked(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 shrink-0"
                  aria-label="Accept legal terms"
                />
                <span className="text-sm text-gray-700">
                  I have read and agree to the{" "}
                  <Link
                    href="/legal"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-700 underline"
                  >
                    FieldBase Legal &amp; Compliance Terms
                  </Link>{" "}
                  including the Terms of Service, Privacy Policy, Payment
                  Authorization, SMS Consent, and Estimate/Invoice Terms
                  ({legalVersion || "current version"}).
                </span>
              </label>
            </div>

            {/* Error */}
            {error && (
              <div className="mx-6 mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {error}
              </div>
            )}

            {/* Action */}
            <div className="px-6 pb-6">
              <button
                type="button"
                onClick={handleAccept}
                disabled={!acceptEnabled || submitting}
                className="w-full py-3 px-4 bg-blue-700 text-white text-sm font-medium rounded-lg hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {submitting ? "Recording acceptance…" : "I Accept — Continue to Platform"}
              </button>
              {!acceptEnabled && !submitting && (
                <p className="text-xs text-gray-400 text-center mt-2">
                  {!scrolledToBottom
                    ? "Scroll through the terms above, then check the box to continue."
                    : "Check the box above to continue."}
                </p>
              )}
            </div>
          </div>

          <p className="text-xs text-gray-400 text-center mt-4">
            Your acceptance is recorded with timestamp, IP address, and browser
            information for compliance purposes.
          </p>
        </div>
      </main>
    </div>
  );
}

function normalizeSafeRedirect(path) {
  const unsafe = ["/legal-required", "/login", "/register"];
  if (!path || typeof path !== "string") return "/dashboard";
  if (!path.startsWith("/")) return "/dashboard";
  if (unsafe.includes(path)) return "/dashboard";
  return path;
}
