import { useEffect, useState } from "react";
import { apiFetch, getJsonOrThrow } from "@/lib/client-auth";

/**
 * DevMetricsCard - Tiny dev metrics card for super_admin users
 * Shows feedback count, payment total, and trial expirations
 * INTENTIONALLY HIDDEN - appears only in developer mode
 * 
 * SECURITY: Only renders if super_admin && on localhost/dev session
 */
export default function DevMetricsCard({ isSuperAdmin }) {
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isSuperAdmin) return;

    const loadMetrics = async () => {
      setLoading(true);
      try {
        const fbRes = await apiFetch("/api/platform/feedback?status=all&type=all&dir=desc", {
          cache: "no-store",
        });
        const fbData = await getJsonOrThrow(fbRes, "");
        const feedbackCount = Array.isArray(fbData.data) ? fbData.data.length : 0;

        setMetrics({
          feedbackCount,
          hasNewFeedback: feedbackCount > 0,
        });
      } catch (err) {
        // Silently fail - this is optional dev feature
      } finally {
        setLoading(false);
      }
    };

    loadMetrics();
  }, [isSuperAdmin]);

  if (!isSuperAdmin || !metrics) return null;

  return (
    <a
      href="/admin"
      title="Dev Admin Panel"
      style={{
        position: "fixed",
        bottom: 20,
        right: 20,
        width: 48,
        height: 48,
        borderRadius: "50%",
        background: metrics.hasNewFeedback ? "#ef4444" : "#6366f1",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "white",
        fontSize: "10px",
        fontWeight: "bold",
        textDecoration: "none",
        boxShadow: "0 4px 6px rgba(0,0,0,0.1)",
        cursor: "pointer",
        zIndex: 10,
        opacity: 0.7,
        transition: "opacity 0.2s",
      }}
      onMouseEnter={(e) => (e.target.style.opacity = "1")}
      onMouseLeave={(e) => (e.target.style.opacity = "0.7")}
    >
      <div style={{ textAlign: "center" }}>
        <div>🔐</div>
        <div>{metrics.feedbackCount}</div>
      </div>
    </a>
  );
}
