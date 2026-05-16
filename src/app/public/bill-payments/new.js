"use client";

import Link from "next/link";

export default function PublicBillPaymentsNew() {
  return (
    <section style={{ background: "#fff", borderRadius: 16, padding: 32, boxShadow: "0 2px 12px #e0e7ef33" }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, color: "#0f172a", marginBottom: 12 }}>Add a Bill (Demo)</h1>
      <p style={{ color: "#475569", fontSize: 16, marginBottom: 18 }}>
        Para agregar y gestionar facturas reales, inicia sesión o regístrate. Aquí puedes ver cómo sería el formulario de alta de factura.
      </p>
      <form style={{ display: "grid", gap: 16, maxWidth: 400 }}>
        <input type="text" placeholder="Provider name" style={{ padding: 10, borderRadius: 6, border: "1px solid #cbd5e1" }} disabled />
        <input type="text" placeholder="Account number" style={{ padding: 10, borderRadius: 6, border: "1px solid #cbd5e1" }} disabled />
        <input type="number" placeholder="Amount due" style={{ padding: 10, borderRadius: 6, border: "1px solid #cbd5e1" }} disabled />
        <input type="date" placeholder="Due date" style={{ padding: 10, borderRadius: 6, border: "1px solid #cbd5e1" }} disabled />
        <button type="button" style={{ background: "#0ea5e9", color: "#fff", fontWeight: 700, borderRadius: 8, padding: "12px 28px", border: 0 }} disabled>
          Save Bill (Login required)
        </button>
      </form>
      <div style={{ marginTop: 18 }}>
        <Link href="/public/bill-payments/register" style={{ color: "#0ea5e9", fontWeight: 700, marginRight: 16 }}>Register</Link>
        <Link href="/login?mode=login&redirect=%2Fsubscriptions%3Fsource%3Dbill-payments" style={{ color: "#0ea5e9", fontWeight: 700 }}>Log In</Link>
      </div>
    </section>
  );
}
