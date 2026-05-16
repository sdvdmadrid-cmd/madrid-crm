import Link from "next/link";

export default function PublicBillPaymentsOverview() {
  return (
    <section style={{ background: "#fff", borderRadius: 16, padding: 32, boxShadow: "0 2px 12px #e0e7ef33" }}>
      <h1 style={{ fontSize: 32, fontWeight: 800, color: "#0f172a", marginBottom: 12 }}>Bill Payments Overview</h1>
      <p style={{ color: "#334155", fontSize: 18, marginBottom: 18 }}>
        Manage and pay your bills online for just <b>$5/month</b>. No need to subscribe to the full FieldBase suite. Register to start using bill payments, or explore the features below.
      </p>
      <ul style={{ color: "#475569", fontSize: 16, marginBottom: 18 }}>
        <li>• Add and track bills</li>
        <li>• Categorize expenses</li>
        <li>• Save payment methods</li>
        <li>• View payment history</li>
        <li>• Get reminders and support</li>
      </ul>
      <div style={{ display: "flex", gap: 16 }}>
        <Link href="/public/bill-payments/register" style={{ background: "#0ea5e9", color: "#fff", fontWeight: 700, borderRadius: 8, padding: "12px 28px", textDecoration: "none" }}>
          Register to Start
        </Link>
        <Link href="/login?mode=login&redirect=%2Fsubscriptions%3Fsource%3Dbill-payments" style={{ background: "#f1f5f9", color: "#0ea5e9", fontWeight: 700, borderRadius: 8, padding: "12px 28px", textDecoration: "none" }}>
          Log In
        </Link>
      </div>
    </section>
  );
}
// (código eliminado, el archivo termina correctamente después del componente principal)
