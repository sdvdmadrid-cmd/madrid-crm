"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";


const menuItems = [
  { label: "Overview", href: "/public/bill-payments" },
  { label: "Add Bill", href: "/public/bill-payments/new" },
  { label: "Categories", href: "/public/bill-payments/categories" },
  { label: "Payment Methods", href: "/public/bill-payments/payment-methods" },
  { label: "History", href: "/public/bill-payments/history" },
  { label: "Help", href: "/public/bill-payments/help" },
];

export default function PublicBillPaymentsMenu() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Bill Payments Navigation"
      style={{
        background: "rgba(241,245,249,0.85)",
        borderRadius: 18,
        padding: 18,
        marginBottom: 32,
        boxShadow: "0 8px 32px 0 rgba(31, 38, 135, 0.12)",
        backdropFilter: "blur(8px)",
        border: "1.5px solid rgba(14,165,233,0.10)",
        position: "relative",
      }}
    >
      <ul
        style={{
          display: "flex",
          gap: 24,
          listStyle: "none",
          margin: 0,
          padding: 0,
          justifyContent: "center",
          alignItems: "center",
          position: "relative",
        }}
      >
        {menuItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <li key={item.href} style={{ minWidth: 130, textAlign: "center", position: "relative", zIndex: 1 }}>
              <Link
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                tabIndex={0}
                style={{
                  color: isActive ? "#fff" : "#0ea5e9",
                  fontWeight: 700,
                  textDecoration: "none",
                  padding: "12px 0",
                  borderRadius: 10,
                  background: isActive
                    ? "linear-gradient(90deg, #0ea5e9 0%, #38bdf8 100%)"
                    : "rgba(255,255,255,0.18)",
                  boxShadow: isActive
                    ? "0 4px 18px 0 rgba(14,165,233,0.18)"
                    : "0 1px 4px 0 rgba(14,165,233,0.06)",
                  border: isActive ? "2px solid #0ea5e9" : "1.5px solid #e0f2fe",
                  outline: isActive ? "2px solid #38bdf8" : undefined,
                  outlineOffset: isActive ? "-2px" : undefined,
                  cursor: isActive ? "default" : "pointer",
                  userSelect: "none",
                  minWidth: 130,
                  fontSize: 17,
                  letterSpacing: 0.12,
                  transition:
                    "background 0.22s cubic-bezier(.4,0,.2,1), color 0.22s, box-shadow 0.22s, border 0.22s",
                  boxSizing: "border-box",
                  filter: isActive ? "drop-shadow(0 0 6px #0ea5e9aa)" : undefined,
                  position: "relative",
                }}
              >
                <span style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 7,
                  fontFamily: "'Inter', system-ui, sans-serif",
                  letterSpacing: 0.12,
                  fontSize: 17,
                  textShadow: isActive ? "0 1px 8px #0ea5e9cc" : undefined,
                  transition: "text-shadow 0.22s",
                }}>
                  {isActive && (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" style={{ marginRight: 4 }}>
                      <circle cx="12" cy="12" r="9" stroke="#fff" strokeWidth="2.2" fill="#0ea5e9" />
                      <path d="M9 12l2 2 4-4" stroke="#fff" strokeWidth="2.2" fill="none" />
                    </svg>
                  )}
                  {item.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      {/* Secure navigation moved below, right-aligned, only visible on desktop */}
      {/* Secure navigation label */}
      <div
        className="secure-nav-label"
        style={{
          textAlign: "right",
          marginTop: 8,
          color: "#0ea5e9",
          fontWeight: 600,
          fontSize: 13,
          letterSpacing: 0.1,
          opacity: 0.85,
          userSelect: "none",
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0ea5e9" strokeWidth="2" strokeLinecap="round" style={{ verticalAlign: "middle", marginRight: 4 }}>
          <rect x="3" y="3" width="18" height="18" rx="5" fill="#e0f2fe" stroke="#0ea5e9" strokeWidth="2" />
          <path d="M8 12l2 2 4-4" stroke="#0ea5e9" strokeWidth="2" fill="none" />
        </svg>
        Secure navigation
      </div>
      <style>{`
        .secure-nav-label { display: none; }
        @media (min-width: 700px) { .secure-nav-label { display: block; } }
      `}</style>
    </nav>
  );
}
