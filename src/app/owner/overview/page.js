import { AdminFinancialDashboardClient } from "@/components/admin/AdminFinancialDashboardClient";
import AdminAiMonitoringClient from "@/components/admin/AdminAiMonitoringClient";
import AdminCapacitySnapshotClient from "@/components/admin/AdminCapacitySnapshotClient";
import OwnerLoginActivityClient from "@/components/owner/OwnerLoginActivityClient";
import Link from "next/link";

export default function OwnerOverviewPage() {
  return (
    <section style={{ display: "grid", gap: 28 }}>
      <div
        style={{
          padding: "28px 32px",
          borderRadius: 24,
          background:
            "linear-gradient(135deg, rgba(99,102,241,0.2) 0%, rgba(15,118,110,0.25) 50%, rgba(30,41,59,0.85) 100%)",
          border: "1px solid rgba(148,163,184,0.12)",
          color: "#f8fafc",
        }}
      >
        <h2
          style={{
            margin: 0,
            fontSize: "1.75rem",
            fontWeight: 800,
            letterSpacing: "-0.03em",
          }}
        >
          Mission Control
        </h2>
        <p style={{ margin: "10px 0 0", maxWidth: "52ch", color: "rgba(226,232,240,0.85)" }}>
          Platform health, revenue, AI usage, and connected payment methods across
          all tenants.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 20 }}>
          <Link
            href="/owner/payment-cards"
            style={{
              padding: "11px 18px",
              borderRadius: 999,
              background: "linear-gradient(135deg, #6366f1, #0f766e)",
              color: "#fff",
              fontWeight: 700,
              textDecoration: "none",
            }}
          >
            Payment cards & usage
          </Link>
          <Link
            href="/owner/revenue"
            style={{
              padding: "11px 18px",
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.25)",
              color: "#e2e8f0",
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            Revenue dashboard
          </Link>
        </div>
      </div>

      <OwnerLoginActivityClient />
      <AdminCapacitySnapshotClient />
      <AdminFinancialDashboardClient />
      <AdminAiMonitoringClient />
    </section>
  );
}
