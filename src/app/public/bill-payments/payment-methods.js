"use client";

export default function PublicBillPaymentsPaymentMethods() {
  return (
    <section style={{ background: "#fff", borderRadius: 16, padding: 32, boxShadow: "0 2px 12px #e0e7ef33" }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, color: "#0f172a", marginBottom: 12 }}>Payment Methods (Demo)</h1>
      <p style={{ color: "#475569", fontSize: 16, marginBottom: 18 }}>
        Guarda tus tarjetas y cuentas bancarias para pagar facturas más rápido. Para gestionar métodos reales, inicia sesión o regístrate.
      </p>
      <ul style={{ color: "#64748b", fontSize: 15 }}>
        <li>Visa **** 1234</li>
        <li>Mastercard **** 5678</li>
        <li>Cuenta bancaria **** 4321</li>
      </ul>
    </section>
  );
}
