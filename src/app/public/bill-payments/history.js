"use client";

export default function PublicBillPaymentsHistory() {
  return (
    <section style={{ background: "#fff", borderRadius: 16, padding: 32, boxShadow: "0 2px 12px #e0e7ef33" }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, color: "#0f172a", marginBottom: 12 }}>Payment History (Demo)</h1>
      <p style={{ color: "#475569", fontSize: 16, marginBottom: 18 }}>
        Para ver tu historial real, inicia sesión o regístrate. Aquí puedes ver cómo se mostraría tu historial de pagos y facturas.
      </p>
      <ul style={{ color: "#64748b", fontSize: 15 }}>
        <li>Factura #1234 — $120.00 — Pagada el 2026-05-01</li>
        <li>Factura #1235 — $75.00 — Pagada el 2026-04-15</li>
        <li>Factura #1236 — $60.00 — Pendiente</li>
      </ul>
    </section>
  );
}
