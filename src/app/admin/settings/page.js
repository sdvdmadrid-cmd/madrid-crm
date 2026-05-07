"use client";

import { useEffect, useState } from "react";
import { apiFetch, getJsonOrThrow } from "@/lib/client-auth";
import { useTranslation } from "react-i18next";
import "@/i18n";

export default function PlatformSettingsPage() {
  const { t } = useTranslation();
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState({});

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await apiFetch("/api/admin/system-settings");
      const data = await getJsonOrThrow(res, "Failed to fetch settings");
      setSettings(data?.data || {});
    } catch (err) {
      setError(err.message || "Failed to load settings");
    } finally {
      setLoading(false);
    }
  };

  const updateSetting = async (key, value) => {
    setSaving((prev) => ({ ...prev, [key]: true }));
    setError("");
    try {
      const res = await apiFetch("/api/admin/system-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value }),
      });
      const data = await getJsonOrThrow(res, "Failed to update setting");
      setSettings(data?.data || {});
    } catch (err) {
      setError(err.message || "Failed to update setting");
    } finally {
      setSaving((prev) => ({ ...prev, [key]: false }));
    }
  };

  return (
    <main
      style={{
        padding: "24px",
        fontFamily: "Arial, sans-serif",
        maxWidth: 1200,
        margin: "0 auto",
      }}
    >
      <header style={{ marginBottom: "28px" }}>
        <h1 style={{ fontSize: "32px", margin: 0, color: "#0f172a" }}>
          Platform Settings
        </h1>
        <p style={{ margin: "8px 0 0 0", color: "#64748b", fontSize: "15px" }}>
          Configure system settings, API keys, and platform behavior
        </p>
      </header>

      {loading && (
        <div style={{ color: "#64748b", fontSize: "14px" }}>Loading settings…</div>
      )}
      {error && (
        <div
          style={{
            padding: "12px 16px",
            background: "#fee2e2",
            color: "#991b1b",
            borderRadius: "8px",
            border: "1px solid #fecaca",
            marginBottom: "20px",
            fontSize: "14px",
          }}
        >
          {error}
        </div>
      )}

      {!loading && (
        <div style={{ display: "grid", gap: "20px" }}>
          {/* Email Configuration */}
          <section
            style={{
              padding: "20px",
              border: "1px solid #e2e8f0",
              borderRadius: "12px",
              background: "#fff",
            }}
          >
            <h2 style={{ margin: "0 0 16px 0", fontSize: "18px", color: "#0f172a" }}>
              Email Service
            </h2>
            <div style={{ display: "grid", gap: "12px" }}>
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "13px",
                    fontWeight: "600",
                    color: "#334155",
                    marginBottom: "6px",
                  }}
                >
                  Email Provider
                </label>
                <div
                  style={{
                    padding: "10px 12px",
                    background: "#f1f5f9",
                    borderRadius: "8px",
                    fontSize: "14px",
                    color: "#475569",
                  }}
                >
                  {settings.emailProvider || "resend"}
                </div>
              </div>
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "13px",
                    fontWeight: "600",
                    color: "#334155",
                    marginBottom: "6px",
                  }}
                >
                  From Email
                </label>
                <div
                  style={{
                    padding: "10px 12px",
                    background: "#f1f5f9",
                    borderRadius: "8px",
                    fontSize: "14px",
                    color: "#475569",
                  }}
                >
                  {settings.emailFrom || "noreply@fieldbaseapp.net"}
                </div>
              </div>
            </div>
          </section>

          {/* Payment Configuration */}
          <section
            style={{
              padding: "20px",
              border: "1px solid #e2e8f0",
              borderRadius: "12px",
              background: "#fff",
            }}
          >
            <h2 style={{ margin: "0 0 16px 0", fontSize: "18px", color: "#0f172a" }}>
              Payment Processing
            </h2>
            <div style={{ display: "grid", gap: "12px" }}>
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "13px",
                    fontWeight: "600",
                    color: "#334155",
                    marginBottom: "6px",
                  }}
                >
                  Stripe Status
                </label>
                <div
                  style={{
                    padding: "10px 12px",
                    background: settings.stripeApiKey ? "#dcfce7" : "#fee2e2",
                    color: settings.stripeApiKey ? "#166534" : "#991b1b",
                    borderRadius: "8px",
                    fontSize: "14px",
                    fontWeight: "500",
                  }}
                >
                  {settings.stripeApiKey ? "✓ Configured" : "⚠ Missing API Key"}
                </div>
              </div>
            </div>
          </section>

          {/* Authentication */}
          <section
            style={{
              padding: "20px",
              border: "1px solid #e2e8f0",
              borderRadius: "12px",
              background: "#fff",
            }}
          >
            <h2 style={{ margin: "0 0 16px 0", fontSize: "18px", color: "#0f172a" }}>
              Authentication
            </h2>
            <div style={{ display: "grid", gap: "12px" }}>
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "13px",
                    fontWeight: "600",
                    color: "#334155",
                    marginBottom: "6px",
                  }}
                >
                  Supabase Status
                </label>
                <div
                  style={{
                    padding: "10px 12px",
                    background: "#dcfce7",
                    color: "#166534",
                    borderRadius: "8px",
                    fontSize: "14px",
                    fontWeight: "500",
                  }}
                >
                  ✓ Connected
                </div>
              </div>
            </div>
          </section>

          {/* Platform Features */}
          <section
            style={{
              padding: "20px",
              border: "1px solid #e2e8f0",
              borderRadius: "12px",
              background: "#fff",
            }}
          >
            <h2 style={{ margin: "0 0 16px 0", fontSize: "18px", color: "#0f172a" }}>
              Feature Flags
            </h2>
            <p style={{ margin: 0, fontSize: "13px", color: "#64748b" }}>
              Enable or disable features across the platform for all users.
            </p>
            <p
              style={{
                margin: "12px 0 0 0",
                fontSize: "13px",
                color: "#94a3b8",
                fontStyle: "italic",
              }}
            >
              Go to Admin → Feature Flags to manage individual flags.
            </p>
          </section>

          {/* System Health */}
          <section
            style={{
              padding: "20px",
              border: "1px solid #e2e8f0",
              borderRadius: "12px",
              background: "#fff",
            }}
          >
            <h2 style={{ margin: "0 0 16px 0", fontSize: "18px", color: "#0f172a" }}>
              System Health
            </h2>
            <div style={{ display: "grid", gap: "12px" }}>
              <div
                style={{
                  padding: "12px",
                  background: "#f1f5f9",
                  borderRadius: "8px",
                  fontSize: "13px",
                  color: "#475569",
                }}
              >
                <strong>Rate Limiting:</strong> Redis-backed — Configured
              </div>
              <div
                style={{
                  padding: "12px",
                  background: "#f1f5f9",
                  borderRadius: "8px",
                  fontSize: "13px",
                  color: "#475569",
                }}
              >
                <strong>Session Secret:</strong> {settings.sessionSecretStatus || "Loading…"}
              </div>
              <div
                style={{
                  padding: "12px",
                  background: "#f1f5f9",
                  borderRadius: "8px",
                  fontSize: "13px",
                  color: "#475569",
                }}
              >
                <strong>Last System Check:</strong> {settings.lastHealthCheck || "N/A"}
              </div>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
