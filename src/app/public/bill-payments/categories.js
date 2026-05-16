"use client";

export default function PublicBillPaymentsCategories() {
  return (
    <section style={{ background: "#fff", borderRadius: 16, padding: 32, boxShadow: "0 2px 12px #e0e7ef33" }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, color: "#0f172a", marginBottom: 12 }}>Bill Categories</h1>
      <ul style={{ color: "#475569", fontSize: 16, marginBottom: 18 }}>
        <li>Utilities</li>
        <li>Credit Cards</li>
        <li>Equipment Financing</li>
        <li>Truck / Vehicle</li>
        <li>Insurance</li>
        <li>Rent / Storage</li>
        <li>Payroll / Subs</li>
        <li>Materials / Suppliers</li>
        <li>Internet / Phone</li>
        <li>Subscriptions</li>
        <li>General</li>
      </ul>
      <p style={{ color: "#64748b" }}>Estas son las categorías principales que puedes usar para organizar tus facturas.</p>
    </section>
  );
}
