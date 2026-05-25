"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, getJsonOrThrow } from "@/lib/client-auth";

const PEND_REFRESH_MS = 30_000;

function formatExpiry(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const now = Date.now();
  const diffMs = d.getTime() - now;
  if (diffMs <= 0) return "expired";
  const hrs = Math.round(diffMs / 3_600_000);
  if (hrs < 24) return `${hrs}h left`;
  const days = Math.round(hrs / 24);
  return `${days}d left`;
}

/**
 * WebsiteMobileUploads
 * --------------------
 * Self-contained UI block that drops into the website builder. Lets the
 * contractor:
 *   1. Generate a one-tap QR code that, when scanned, opens a public
 *      mobile-upload page bound to their tenant.
 *   2. Review the queue of photos uploaded from that page and approve
 *      them into the draft gallery (or reject them).
 *   3. Revoke a QR/upload link they no longer want active.
 *
 * Photos uploaded through QR land in `draft_content.pendingUploads` so
 * they NEVER appear on the live website until the contractor approves
 * AND publishes — matching the rest of the builder's draft-first model.
 */
export default function WebsiteMobileUploads() {
  const [qr, setQr] = useState(null); // { token, uploadUrl, qrDataUrl, expiresAt, jti, label }
  const [issuing, setIssuing] = useState(false);
  const [label, setLabel] = useState("");
  const [tokens, setTokens] = useState([]);
  const [pending, setPending] = useState([]);
  const [pendingBusy, setPendingBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const refreshTokens = useCallback(async () => {
    try {
      const res = await apiFetch("/api/website-builder/qr-token");
      const payload = await res.json().catch(() => ({}));
      if (payload?.success && Array.isArray(payload.data)) {
        setTokens(payload.data);
      }
    } catch (err) {
      console.warn("[mobile-uploads] token list", err?.message);
    }
  }, []);

  const refreshPending = useCallback(async () => {
    try {
      const res = await apiFetch("/api/website-builder/pending-uploads");
      const payload = await res.json().catch(() => ({}));
      if (payload?.success && Array.isArray(payload.data)) {
        setPending(payload.data);
      }
    } catch (err) {
      console.warn("[mobile-uploads] pending list", err?.message);
    }
  }, []);

  useEffect(() => {
    refreshTokens();
    refreshPending();
    const interval = setInterval(refreshPending, PEND_REFRESH_MS);
    return () => clearInterval(interval);
  }, [refreshTokens, refreshPending]);

  async function issueToken() {
    if (issuing) return;
    setError("");
    setNotice("");
    setIssuing(true);
    try {
      const res = await apiFetch("/api/website-builder/qr-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label }),
      });
      const payload = await getJsonOrThrow(res, "Unable to issue QR.");
      setQr(payload.data || null);
      setLabel("");
      await refreshTokens();
    } catch (err) {
      setError(err?.message || "Unable to issue QR.");
    } finally {
      setIssuing(false);
    }
  }

  async function revokeToken(jti) {
    if (!jti) return;
    if (!window.confirm("Revoke this upload link? Anyone with the QR will no longer be able to upload.")) {
      return;
    }
    try {
      await apiFetch(`/api/website-builder/qr-token?jti=${encodeURIComponent(jti)}`, {
        method: "DELETE",
      });
      if (qr?.jti === jti) setQr(null);
      await refreshTokens();
    } catch (err) {
      setError(err?.message || "Unable to revoke.");
    }
  }

  async function actOnPending(action, ids) {
    if (pendingBusy) return;
    setError("");
    setNotice("");
    setPendingBusy(true);
    try {
      const res = await apiFetch("/api/website-builder/pending-uploads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ids }),
      });
      const payload = await getJsonOrThrow(res, "Action failed.");
      setPending(Array.isArray(payload?.data?.remaining) ? payload.data.remaining : []);
      const moved = Number(payload?.data?.moved || 0);
      const dropped = Number(payload?.data?.dropped || 0);
      if (moved > 0) {
        setNotice(`Approved ${moved} photo${moved === 1 ? "" : "s"}. Don't forget to Publish to push them live.`);
      } else if (dropped > 0) {
        setNotice(`Removed ${dropped} pending photo${dropped === 1 ? "" : "s"}.`);
      }
    } catch (err) {
      setError(err?.message || "Action failed.");
    } finally {
      setPendingBusy(false);
    }
  }

  async function copyLink() {
    if (!qr?.uploadUrl) return;
    try {
      await navigator.clipboard.writeText(qr.uploadUrl);
      setNotice("Link copied to clipboard.");
    } catch {
      setNotice(qr.uploadUrl);
    }
  }

  return (
    <section
      style={{
        marginTop: 24,
        padding: 18,
        background: "#0b1220",
        border: "1px solid rgba(148,163,184,0.2)",
        borderRadius: 14,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 800, color: "#e2e8f0", margin: 0 }}>
            Mobile photo upload (QR)
          </h3>
          <p style={{ color: "#94a3b8", fontSize: 13, margin: "4px 0 0" }}>
            Scan this code from a phone to add photos directly. Each upload lands
            in the queue below for your approval before going live.
          </p>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 16,
          marginTop: 16,
          alignItems: "start",
        }}
      >
        <div>
          <label style={{ fontSize: 12, color: "#94a3b8", display: "block", marginBottom: 4 }}>
            Optional label (e.g. "Maple St job, May 26")
          </label>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Maple St job — May 26"
            style={{
              width: "100%",
              padding: "8px 10px",
              borderRadius: 8,
              border: "1px solid rgba(148,163,184,0.3)",
              background: "#0f172a",
              color: "#e2e8f0",
            }}
          />
          <button
            type="button"
            onClick={issueToken}
            disabled={issuing}
            style={{
              marginTop: 10,
              padding: "9px 14px",
              borderRadius: 10,
              border: "none",
              background: issuing ? "#1e40af" : "#2563eb",
              color: "white",
              fontWeight: 700,
              cursor: issuing ? "wait" : "pointer",
            }}
          >
            {issuing ? "Generating…" : qr ? "Generate another QR" : "Generate QR"}
          </button>

          {qr ? (
            <div style={{ marginTop: 12, fontSize: 12, color: "#cbd5f5" }}>
              <div>
                <strong>Expires:</strong> {formatExpiry(qr.expiresAt)} (max {qr.maxUploads} photos)
              </div>
              <div style={{ marginTop: 6 }}>
                <button
                  type="button"
                  onClick={copyLink}
                  style={{
                    fontSize: 12,
                    padding: "4px 8px",
                    borderRadius: 6,
                    border: "1px solid rgba(148,163,184,0.3)",
                    background: "#111827",
                    color: "#e2e8f0",
                    cursor: "pointer",
                  }}
                >
                  Copy upload link
                </button>
                <button
                  type="button"
                  onClick={() => revokeToken(qr.jti)}
                  style={{
                    fontSize: 12,
                    padding: "4px 8px",
                    borderRadius: 6,
                    border: "1px solid rgba(248,113,113,0.4)",
                    background: "#111827",
                    color: "#fca5a5",
                    cursor: "pointer",
                    marginLeft: 6,
                  }}
                >
                  Revoke
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <div style={{ display: "flex", justifyContent: "center" }}>
          {qr?.qrDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={qr.qrDataUrl}
              alt="QR code for mobile upload"
              style={{
                width: 160,
                height: 160,
                borderRadius: 12,
                background: "white",
                padding: 6,
              }}
            />
          ) : (
            <div
              style={{
                width: 160,
                height: 160,
                borderRadius: 12,
                border: "1px dashed rgba(148,163,184,0.4)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#64748b",
                fontSize: 12,
                textAlign: "center",
                padding: 8,
              }}
            >
              QR will appear here
            </div>
          )}
        </div>
      </div>

      {tokens.length > 0 ? (
        <div style={{ marginTop: 16 }}>
          <div style={{ color: "#94a3b8", fontSize: 12, marginBottom: 6 }}>
            Active links
          </div>
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {tokens
              .filter((tok) => !tok.revoked_at)
              .slice(0, 5)
              .map((tok) => (
                <li
                  key={tok.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    fontSize: 12,
                    color: "#cbd5f5",
                    padding: "6px 0",
                    borderBottom: "1px solid rgba(148,163,184,0.12)",
                  }}
                >
                  <span>
                    {tok.label || "Untitled link"} · {tok.upload_count}/{tok.max_uploads} photos ·{" "}
                    {formatExpiry(tok.expires_at)}
                  </span>
                  <button
                    type="button"
                    onClick={() => revokeToken(tok.jti)}
                    style={{
                      fontSize: 11,
                      padding: "3px 8px",
                      borderRadius: 6,
                      border: "1px solid rgba(248,113,113,0.3)",
                      background: "transparent",
                      color: "#fca5a5",
                      cursor: "pointer",
                    }}
                  >
                    Revoke
                  </button>
                </li>
              ))}
          </ul>
        </div>
      ) : null}

      <div style={{ marginTop: 18, paddingTop: 16, borderTop: "1px solid rgba(148,163,184,0.12)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div>
            <h4 style={{ fontSize: 14, fontWeight: 700, color: "#e2e8f0", margin: 0 }}>
              Pending review ({pending.length})
            </h4>
            <p style={{ color: "#94a3b8", fontSize: 12, margin: "2px 0 0" }}>
              Photos uploaded from mobile. Approve to send them to your gallery
              draft (still requires publish).
            </p>
          </div>
          {pending.length > 0 ? (
            <div style={{ display: "flex", gap: 6 }}>
              <button
                type="button"
                onClick={() => actOnPending("approve_all", [])}
                disabled={pendingBusy}
                style={{
                  fontSize: 12,
                  padding: "6px 10px",
                  borderRadius: 8,
                  border: "none",
                  background: "#16a34a",
                  color: "white",
                  fontWeight: 700,
                  cursor: pendingBusy ? "wait" : "pointer",
                }}
              >
                Approve all
              </button>
              <button
                type="button"
                onClick={() => actOnPending("reject_all", [])}
                disabled={pendingBusy}
                style={{
                  fontSize: 12,
                  padding: "6px 10px",
                  borderRadius: 8,
                  border: "1px solid rgba(248,113,113,0.3)",
                  background: "transparent",
                  color: "#fca5a5",
                  cursor: pendingBusy ? "wait" : "pointer",
                }}
              >
                Reject all
              </button>
            </div>
          ) : null}
        </div>

        {pending.length === 0 ? (
          <div style={{ color: "#64748b", fontSize: 12, marginTop: 8 }}>
            No pending uploads.
          </div>
        ) : (
          <div
            style={{
              marginTop: 12,
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
              gap: 10,
            }}
          >
            {pending.map((photo) => (
              <div
                key={photo.id}
                style={{
                  position: "relative",
                  borderRadius: 10,
                  overflow: "hidden",
                  border: "1px solid rgba(148,163,184,0.18)",
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.thumbnail || photo.src}
                  alt={photo.alt || "Pending"}
                  style={{
                    width: "100%",
                    aspectRatio: "1 / 1",
                    objectFit: "cover",
                    display: "block",
                  }}
                />
                <div style={{ display: "flex", gap: 2, padding: 4, background: "#0f172a" }}>
                  <button
                    type="button"
                    onClick={() => actOnPending("approve", [photo.id])}
                    disabled={pendingBusy}
                    style={{
                      flex: 1,
                      fontSize: 11,
                      padding: "5px 6px",
                      borderRadius: 5,
                      border: "none",
                      background: "#16a34a",
                      color: "white",
                      fontWeight: 700,
                      cursor: pendingBusy ? "wait" : "pointer",
                    }}
                  >
                    Keep
                  </button>
                  <button
                    type="button"
                    onClick={() => actOnPending("reject", [photo.id])}
                    disabled={pendingBusy}
                    style={{
                      flex: 1,
                      fontSize: 11,
                      padding: "5px 6px",
                      borderRadius: 5,
                      border: "1px solid rgba(248,113,113,0.3)",
                      background: "transparent",
                      color: "#fca5a5",
                      cursor: pendingBusy ? "wait" : "pointer",
                    }}
                  >
                    Drop
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {error ? (
        <div
          role="alert"
          style={{
            marginTop: 10,
            background: "rgba(127,29,29,0.4)",
            border: "1px solid rgba(248,113,113,0.45)",
            color: "#fecaca",
            borderRadius: 10,
            padding: "8px 12px",
            fontSize: 12,
          }}
        >
          {error}
        </div>
      ) : null}
      {notice ? (
        <div
          style={{
            marginTop: 10,
            background: "rgba(15, 118, 110, 0.3)",
            border: "1px solid rgba(94, 234, 212, 0.4)",
            color: "#a7f3d0",
            borderRadius: 10,
            padding: "8px 12px",
            fontSize: 12,
          }}
        >
          {notice}
        </div>
      ) : null}
    </section>
  );
}
