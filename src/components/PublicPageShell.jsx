"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function PublicPageShell({ children }) {
  const pathname = usePathname();
  const hideChrome =
    pathname === "/login" ||
    pathname === "/reset-password" ||
    pathname?.startsWith("/quote/") ||
    pathname?.startsWith("/estimate/") ||
    pathname?.startsWith("/site/") || pathname?.startsWith("/sites/");

  if (hideChrome) {
    return children;
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        background: "#f8fafc",
        fontFamily: "'Inter', system-ui, sans-serif",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 20px",
          borderBottom: "1px solid #e2e8f0",
          background: "#fff",
        }}
      >
        <Link
          href="/"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            textDecoration: "none",
            color: "#0f172a",
            fontWeight: 800,
            fontSize: 16,
          }}
        >
          <span
            style={{
              width: 32,
              height: 32,
              borderRadius: 10,
              background: "linear-gradient(145deg, #0d4fd9 0%, #091220 100%)",
              color: "#fff",
              display: "grid",
              placeItems: "center",
              fontSize: 13,
            }}
          >
            FB
          </span>
          FieldBase
        </Link>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <Link
            href="/login"
            style={{
              color: "#1d4ed8",
              fontWeight: 600,
              fontSize: 14,
              textDecoration: "none",
            }}
          >
            Iniciar sesión
          </Link>
          <Link
            href="/login?mode=register"
            style={{
              background: "#1d4ed8",
              color: "#fff",
              fontWeight: 600,
              fontSize: 14,
              padding: "8px 14px",
              borderRadius: 8,
              textDecoration: "none",
            }}
          >
            Crear cuenta
          </Link>
        </div>
      </header>
      <main style={{ flex: 1 }}>{children}</main>
    </div>
  );
}
