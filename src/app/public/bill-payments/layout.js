"use client";

import Link from "next/link";
import PublicBillPaymentsMenu from "./Menu";

export default function PublicBillPaymentsLayout({ children }) {
  return (
    <div style={{ maxWidth: 1080, margin: "0 auto", padding: 24 }}>
      {/* FieldBase logo — links back to the main landing page */}
      <Link
        href="/"
        title="Back to FieldBase"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 9,
          textDecoration: "none",
          marginBottom: 16,
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 12,
            background: "linear-gradient(145deg, #0d4fd9 0%, #091220 100%)",
            position: "relative",
            flexShrink: 0,
          }}
        >
          <span style={{ position: "absolute", left: 8, top: 9, width: 20, height: 7, borderRadius: 999, background: "linear-gradient(90deg, #fff 0%, rgba(255,255,255,0.18) 100%)" }} />
          <span style={{ position: "absolute", right: 8, bottom: 8, width: 7, height: 7, borderRadius: "50%", background: "#f59e0b" }} />
        </div>
        <span style={{ color: "#0f172a", fontWeight: 700, fontSize: 17, letterSpacing: "-0.3px", fontFamily: "'Inter', system-ui, sans-serif" }}>
          FieldBase
        </span>
      </Link>
      <PublicBillPaymentsMenu />
      <div>{children}</div>
    </div>
  );
}
