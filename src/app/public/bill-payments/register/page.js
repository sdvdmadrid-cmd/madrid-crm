"use client";

import Link from "next/link";
import { useState } from "react";

const initialForm = {
  name: "",
  companyName: "",
  email: "",
  password: "",
};

const BILL_PAYMENTS_SUBSCRIBE_PATH = "/subscriptions?source=bill-payments";

function buildLoginRedirectUrl(email) {
  const params = new URLSearchParams({
    mode: "login",
    redirect: BILL_PAYMENTS_SUBSCRIBE_PATH,
  });
  if (email) {
    params.set("email", email);
  }
  return `/login?${params.toString()}`;
}

export default function PublicBillPaymentsRegisterPage() {
  const [form, setForm] = useState(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [registeredEmail, setRegisteredEmail] = useState("");

  async function submitRegister(event) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          companyName: form.companyName,
          email: form.email,
          password: form.password,
          industry: "bill_payments_public",
          role: "contractor",
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "Unable to create account");
      }

      setRegisteredEmail(form.email);
      if (payload?.data?.requiresVerification) {
        setNotice("Account created. Verify your email, then continue to Bill Payments checkout.");
      } else {
        window.location.assign(BILL_PAYMENTS_SUBSCRIBE_PATH);
        return;
      }
      setForm(initialForm);
    } catch (submitError) {
      setError(submitError?.message || "Unable to create account");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section
      style={{
        background: "#fff",
        borderRadius: 16,
        padding: 32,
        boxShadow: "0 2px 12px #e0e7ef33",
        maxWidth: 640,
      }}
    >
      <h1 style={{ fontSize: 30, fontWeight: 800, color: "#0f172a", marginBottom: 10 }}>
        Register for Bill Payments
      </h1>
      <p style={{ color: "#475569", marginBottom: 20 }}>
        This registration is for Bill Payments public access at $5/month. It is separate from the $35 full platform plan.
      </p>
      <p style={{ color: "#334155", marginTop: -6, marginBottom: 20, fontSize: 14 }}>
        After login, you will continue directly to Bill Payments subscription checkout.
      </p>

      <form onSubmit={submitRegister} style={{ display: "grid", gap: 12 }}>
        <input
          required
          placeholder="Full name"
          value={form.name}
          onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
          style={{ borderRadius: 10, border: "1px solid #cbd5e1", padding: "10px 12px" }}
        />
        <input
          placeholder="Company name (optional)"
          value={form.companyName}
          onChange={(event) => setForm((prev) => ({ ...prev, companyName: event.target.value }))}
          style={{ borderRadius: 10, border: "1px solid #cbd5e1", padding: "10px 12px" }}
        />
        <input
          required
          type="email"
          placeholder="Email"
          value={form.email}
          onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
          style={{ borderRadius: 10, border: "1px solid #cbd5e1", padding: "10px 12px" }}
        />
        <input
          required
          type="password"
          minLength={8}
          placeholder="Password"
          value={form.password}
          onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
          style={{ borderRadius: 10, border: "1px solid #cbd5e1", padding: "10px 12px" }}
        />
        <p style={{ margin: "-4px 0 0", color: "#64748b", fontSize: 13 }}>
          Use at least 8 characters with 1 uppercase letter, 1 number, and 1 special character.
        </p>

        <button
          type="submit"
          disabled={submitting}
          style={{
            background: "#0ea5e9",
            color: "#fff",
            fontWeight: 700,
            borderRadius: 8,
            padding: "12px 20px",
            border: 0,
            opacity: submitting ? 0.8 : 1,
          }}
        >
          {submitting ? "Creating account..." : "Create Bill Payments account"}
        </button>
      </form>

      {(error || notice) && (
        <div
          style={{
            marginTop: 14,
            borderRadius: 10,
            border: `1px solid ${error ? "#fecaca" : "#bbf7d0"}`,
            background: error ? "#fef2f2" : "#f0fdf4",
            color: error ? "#b91c1c" : "#166534",
            padding: "10px 12px",
            fontSize: 14,
          }}
        >
          {error || notice}
        </div>
      )}

      <div style={{ marginTop: 16, display: "flex", gap: 14, flexWrap: "wrap" }}>
        <Link href="/public/bill-payments" style={{ color: "#0ea5e9", fontWeight: 700, textDecoration: "none" }}>
          Back to Bill Payments
        </Link>
        <Link
          href={buildLoginRedirectUrl(registeredEmail)}
          style={{ color: "#0ea5e9", fontWeight: 700, textDecoration: "none" }}
        >
          Log in and continue
        </Link>
      </div>
    </section>
  );
}
