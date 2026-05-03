"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch, getJsonOrThrow } from "@/lib/client-auth";
import { useCurrentUserAccess } from "@/lib/current-user-client";

const TYPE_OPTIONS = [
  { value: "all", label: "All types" },
  { value: "suggestion", label: "Suggestion" },
  { value: "issue", label: "Issue" },
  { value: "improvement", label: "Improvement" },
];

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "new", label: "New" },
  { value: "reviewed", label: "Reviewed" },
  { value: "resolved", label: "Resolved" },
];

function formatDateTime(value) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString();
}

export default function PlatformFeedbackPage() {
  const { capabilities } = useCurrentUserAccess();
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [items, setItems] = useState([]);
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortDirection, setSortDirection] = useState("desc");

  const isAdmin = capabilities.isAdmin === true || capabilities.isSuperAdmin === true;

  const loadFeedback = useMemo(
    () => async () => {
      if (!isAdmin) {
        setLoading(false);
        return;
      }
      setLoading(true);
      setError("");
      try {
        const qs = new URLSearchParams({
          type: typeFilter,
          status: statusFilter,
          dir: sortDirection,
        }).toString();
        const response = await apiFetch(`/api/platform/feedback?${qs}`, {
          cache: "no-store",
        });
        const payload = await getJsonOrThrow(response, "Unable to load feedback.");
        setItems(Array.isArray(payload.data) ? payload.data : []);
      } catch (err) {
        setError(err.message || "Unable to load feedback.");
      } finally {
        setLoading(false);
      }
    },
    [isAdmin, statusFilter, sortDirection, typeFilter],
  );

  useEffect(() => {
    loadFeedback();
  }, [loadFeedback]);

  async function updateStatus(id, status) {
    setSavingId(id);
    setError("");
    setNotice("");
    try {
      const response = await apiFetch(`/api/platform/feedback/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      await getJsonOrThrow(response, "Unable to update feedback status.");
      setNotice(`Feedback marked as ${status}.`);
      await loadFeedback();
    } catch (err) {
      setError(err.message || "Unable to update feedback status.");
    } finally {
      setSavingId("");
    }
  }

  if (!isAdmin) {
    return (
      <main style={{ padding: 20 }}>
        <div
          style={{
            borderRadius: 14,
            border: "1px solid rgba(239,68,68,0.2)",
            background: "rgba(239,68,68,0.08)",
            color: "#991b1b",
            padding: 14,
          }}
        >
          You do not have access to this page.
        </div>
      </main>
    );
  }

  return (
    <main style={{ padding: 20, display: "grid", gap: 14 }}>
      <section
        style={{
          background: "#fff",
          border: "1px solid rgba(15,23,42,0.08)",
          borderRadius: 16,
          padding: 16,
          display: "grid",
          gap: 12,
        }}
      >
        <div>
          <h1 style={{ margin: 0, color: "#0f172a" }}>Feedback Inbox</h1>
          <p style={{ margin: "6px 0 0", color: "#64748b" }}>
            Review product feedback from users.
          </p>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <select
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value)}
            style={{
              borderRadius: 10,
              border: "1px solid rgba(15,23,42,0.12)",
              padding: "9px 12px",
              background: "#fff",
            }}
          >
            {TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            style={{
              borderRadius: 10,
              border: "1px solid rgba(15,23,42,0.12)",
              padding: "9px 12px",
              background: "#fff",
            }}
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <select
            value={sortDirection}
            onChange={(event) => setSortDirection(event.target.value)}
            style={{
              borderRadius: 10,
              border: "1px solid rgba(15,23,42,0.12)",
              padding: "9px 12px",
              background: "#fff",
            }}
          >
            <option value="desc">Newest first</option>
            <option value="asc">Oldest first</option>
          </select>
        </div>

        {(error || notice) && (
          <div
            style={{
              borderRadius: 12,
              border: `1px solid ${error ? "rgba(239,68,68,0.22)" : "rgba(16,185,129,0.24)"}`,
              background: error ? "rgba(239,68,68,0.08)" : "rgba(16,185,129,0.08)",
              color: error ? "#991b1b" : "#065f46",
              padding: "10px 12px",
            }}
          >
            {error || notice}
          </div>
        )}
      </section>

      <section style={{ display: "grid", gap: 10 }}>
        {loading ? (
          <div style={{ color: "#64748b" }}>Loading feedback...</div>
        ) : items.length === 0 ? (
          <div
            style={{
              borderRadius: 12,
              border: "1px solid rgba(15,23,42,0.08)",
              background: "#fff",
              color: "#64748b",
              padding: 14,
            }}
          >
            No feedback entries found.
          </div>
        ) : (
          items.map((entry) => (
            <article
              key={entry.id}
              style={{
                borderRadius: 14,
                border: "1px solid rgba(15,23,42,0.1)",
                background: "#fff",
                padding: 14,
                display: "grid",
                gap: 8,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 10,
                  flexWrap: "wrap",
                }}
              >
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <span
                    style={{
                      borderRadius: 999,
                      background: "rgba(15,23,42,0.08)",
                      color: "#334155",
                      fontSize: 11,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      padding: "3px 8px",
                    }}
                  >
                    {entry.feedback_type}
                  </span>
                  <span
                    style={{
                      borderRadius: 999,
                      background:
                        entry.status === "resolved"
                          ? "rgba(16,185,129,0.14)"
                          : entry.status === "reviewed"
                            ? "rgba(14,165,233,0.14)"
                            : "rgba(245,158,11,0.18)",
                      color:
                        entry.status === "resolved"
                          ? "#065f46"
                          : entry.status === "reviewed"
                            ? "#075985"
                            : "#92400e",
                      fontSize: 11,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      padding: "3px 8px",
                    }}
                  >
                    {entry.status}
                  </span>
                </div>
                <div style={{ color: "#64748b", fontSize: 13 }}>
                  {formatDateTime(entry.created_at)}
                </div>
              </div>

              <div style={{ color: "#0f172a", whiteSpace: "pre-wrap" }}>
                {entry.message}
              </div>

              <div style={{ color: "#64748b", fontSize: 13 }}>
                User: {entry.user_id}
                {entry.current_page ? ` | Page: ${entry.current_page}` : ""}
              </div>

              {entry.screenshot_data_url && (
                <a
                  href={entry.screenshot_data_url}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: "#0369a1", fontSize: 13, fontWeight: 600 }}
                >
                  Open screenshot
                </a>
              )}

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={() => updateStatus(entry.id, "reviewed")}
                  disabled={savingId === entry.id || entry.status === "reviewed"}
                  style={{
                    borderRadius: 999,
                    border: "1px solid rgba(14,165,233,0.25)",
                    background: "rgba(14,165,233,0.08)",
                    color: "#075985",
                    padding: "8px 12px",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Mark reviewed
                </button>
                <button
                  type="button"
                  onClick={() => updateStatus(entry.id, "resolved")}
                  disabled={savingId === entry.id || entry.status === "resolved"}
                  style={{
                    borderRadius: 999,
                    border: "1px solid rgba(16,185,129,0.25)",
                    background: "rgba(16,185,129,0.08)",
                    color: "#047857",
                    padding: "8px 12px",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Mark resolved
                </button>
                <button
                  type="button"
                  onClick={() => updateStatus(entry.id, "new")}
                  disabled={savingId === entry.id || entry.status === "new"}
                  style={{
                    borderRadius: 999,
                    border: "1px solid rgba(15,23,42,0.16)",
                    background: "#fff",
                    color: "#334155",
                    padding: "8px 12px",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Reset to new
                </button>
              </div>
            </article>
          ))
        )}
      </section>
    </main>
  );
}
