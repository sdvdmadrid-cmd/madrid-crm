"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

function formatCurrency(value) {
  const amount = Number(value || 0);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(amount);
}

const defaultPricing = {
  monthlyFeeUsd: 9.99,
  cardFeePercent: 5.9,
  bankAccountFeePercent: 3.0,
};

export default function PublicBillPaymentsPage() {
  const [pricing, setPricing] = useState(defaultPricing);
  const [amountInput, setAmountInput] = useState("120");
  const [methodType, setMethodType] = useState("bank_account");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    companyName: "",
    role: "owner",
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/public/bill-payments/pricing", {
          cache: "no-store",
        });
        const payload = await response.json().catch(() => ({}));
        if (!cancelled && response.ok && payload?.success) {
          setPricing({
            monthlyFeeUsd: Number(payload.data.monthlyFeeUsd || 9.99),
            cardFeePercent: Number(payload.data.cardFeePercent || 5.9),
            bankAccountFeePercent: Number(
              payload.data.bankAccountFeePercent || 3.0,
            ),
          });
        }
      } catch {
        // Ignore and keep defaults.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const checkout = useMemo(() => {
    const subtotal = Number(amountInput || 0) || 0;
    const feePercent =
      methodType === "bank_account"
        ? pricing.bankAccountFeePercent
        : pricing.cardFeePercent;
    const fee = Number((subtotal * (feePercent / 100)).toFixed(2));
    const total = Number((subtotal + fee).toFixed(2));
    return { subtotal, feePercent, fee, total };
  }, [amountInput, methodType, pricing]);

  async function submitSignup(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Unable to create your account.");
      }
      if (payload?.data?.requiresVerification) {
        setNotice("Account created. Check your email to verify your account before logging in.");
      } else {
        setNotice("Account created. You can log in now and start adding bills.");
      }
      setForm({ name: "", email: "", password: "", companyName: "", role: "owner" });
    } catch (submitError) {
      setError(submitError.message || "Unable to create your account.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at 10% 15%, rgba(14,165,233,0.22), transparent 40%), radial-gradient(circle at 85% 10%, rgba(249,115,22,0.22), transparent 40%), linear-gradient(180deg, #f8fafc, #eef2ff)",
        padding: "32px 18px 60px",
      }}
    >
      <div style={{ maxWidth: 1080, margin: "0 auto", display: "grid", gap: 20 }}>
        <section
          style={{
            borderRadius: 24,
            background: "rgba(255,255,255,0.92)",
            border: "1px solid rgba(15,23,42,0.08)",
            boxShadow: "0 20px 60px rgba(15,23,42,0.10)",
            padding: 24,
            display: "grid",
            gap: 12,
          }}
        >
          <p style={{ margin: 0, color: "#0ea5e9", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>
            FieldBase Bill Payments
          </p>
          <h1 style={{ margin: 0, color: "#0f172a", fontSize: "clamp(1.8rem, 4vw, 2.8rem)" }}>
            Public bill-payments checkout, built for margin
          </h1>
          <p style={{ margin: 0, color: "#475569", maxWidth: 760, lineHeight: 1.5 }}>
            Public onboarding inside your app: account registration is required, transparent monthly pricing, and fee-by-method checkout.
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link href="/login" style={{ textDecoration: "none", background: "#0f766e", color: "#fff", borderRadius: 999, padding: "10px 16px", fontWeight: 700 }}>
              Log in
            </Link>
            <Link href="/bill-payments" style={{ textDecoration: "none", background: "#fff", color: "#0f172a", borderRadius: 999, padding: "10px 16px", border: "1px solid rgba(15,23,42,0.16)", fontWeight: 700 }}>
              Go to app bill-payments
            </Link>
          </div>
        </section>

        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 20 }}>
          <article
            style={{
              borderRadius: 24,
              background: "rgba(255,255,255,0.94)",
              border: "1px solid rgba(15,23,42,0.08)",
              boxShadow: "0 20px 50px rgba(15,23,42,0.08)",
              padding: 22,
            }}
          >
            <h2 style={{ margin: 0, color: "#0f172a" }}>Live pricing preview</h2>
            <p style={{ color: "#64748b", marginTop: 8 }}>
              Monthly platform fee: <strong>{formatCurrency(pricing.monthlyFeeUsd)}</strong>
            </p>
            <p style={{ color: "#0f172a", marginTop: 8, fontSize: 14 }}>
              If you pay 3-4+ bills per month, subscribing usually saves time and makes saved methods worth it.
            </p>
            <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
              <label style={{ display: "grid", gap: 6 }}>
                Bill amount
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={amountInput}
                  onChange={(event) => setAmountInput(event.target.value)}
                  style={{ borderRadius: 10, border: "1px solid rgba(15,23,42,0.2)", padding: "10px 12px" }}
                />
              </label>
              <label style={{ display: "grid", gap: 6 }}>
                Payment method
                <select
                  value={methodType}
                  onChange={(event) => setMethodType(event.target.value)}
                  style={{ borderRadius: 10, border: "1px solid rgba(15,23,42,0.2)", padding: "10px 12px", background: "#fff" }}
                >
                  <option value="bank_account">Bank account (ACH) - {pricing.bankAccountFeePercent.toFixed(2)}%</option>
                  <option value="card">Card - {pricing.cardFeePercent.toFixed(2)}%</option>
                </select>
              </label>
            </div>

            <div style={{ marginTop: 16, borderRadius: 14, background: "rgba(15,23,42,0.04)", padding: 14, display: "grid", gap: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", color: "#334155" }}>
                <span>Subtotal</span>
                <strong>{formatCurrency(checkout.subtotal)}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", color: "#334155" }}>
                <span>Transaction fee ({checkout.feePercent.toFixed(2)}%)</span>
                <strong>{formatCurrency(checkout.fee)}</strong>
              </div>
              <div style={{ height: 1, background: "rgba(15,23,42,0.14)", margin: "4px 0" }} />
              <div style={{ display: "flex", justifyContent: "space-between", color: "#0f172a", fontSize: 18 }}>
                <span>Total charge</span>
                <strong>{formatCurrency(checkout.total)}</strong>
              </div>
            </div>
          </article>

          <article
            style={{
              borderRadius: 24,
              background: "rgba(255,255,255,0.94)",
              border: "1px solid rgba(15,23,42,0.08)",
              boxShadow: "0 20px 50px rgba(15,23,42,0.08)",
              padding: 22,
            }}
          >
            <h2 style={{ margin: 0, color: "#0f172a" }}>Create public account</h2>
            <p style={{ marginTop: 8, color: "#64748b" }}>
              Registration is required. Users can pay publicly, and saved bill/payment data is enabled for subscribed accounts.
            </p>
            <form onSubmit={submitSignup} style={{ display: "grid", gap: 10, marginTop: 12 }}>
              <input
                required
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="Full name"
                style={{ borderRadius: 10, border: "1px solid rgba(15,23,42,0.2)", padding: "10px 12px" }}
              />
              <input
                required
                type="email"
                value={form.email}
                onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                placeholder="Email"
                style={{ borderRadius: 10, border: "1px solid rgba(15,23,42,0.2)", padding: "10px 12px" }}
              />
              <input
                required
                type="password"
                value={form.password}
                onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
                placeholder="Password (8+ chars, uppercase, number, special)"
                style={{ borderRadius: 10, border: "1px solid rgba(15,23,42,0.2)", padding: "10px 12px" }}
              />
              <input
                value={form.companyName}
                onChange={(event) => setForm((prev) => ({ ...prev, companyName: event.target.value }))}
                placeholder="Company name (optional)"
                style={{ borderRadius: 10, border: "1px solid rgba(15,23,42,0.2)", padding: "10px 12px" }}
              />
              <button
                type="submit"
                disabled={loading}
                style={{
                  border: "none",
                  borderRadius: 12,
                  background: loading ? "#94a3b8" : "linear-gradient(135deg, #0284c7, #0f766e)",
                  color: "#fff",
                  padding: "11px 14px",
                  fontWeight: 700,
                  cursor: loading ? "not-allowed" : "pointer",
                }}
              >
                {loading ? "Creating account..." : "Create account"}
              </button>
            </form>
            {(error || notice) && (
              <div
                style={{
                  marginTop: 12,
                  borderRadius: 10,
                  border: `1px solid ${error ? "rgba(239,68,68,0.26)" : "rgba(16,185,129,0.25)"}`,
                  background: error ? "rgba(239,68,68,0.08)" : "rgba(16,185,129,0.08)",
                  color: error ? "#991b1b" : "#065f46",
                  padding: "10px 12px",
                  fontSize: 14,
                }}
              >
                {error || notice}
              </div>
            )}
          </article>
        </section>
      </div>
    </main>
  );
}
