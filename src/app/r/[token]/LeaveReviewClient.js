"use client";

import { useEffect, useState } from "react";

const ENDPOINT_BASE = "/api/public/review-requests";

function Stars({ value, onChange }) {
  return (
    <div role="radiogroup" aria-label="Rating" style={{ display: "flex", gap: 8 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          onClick={() => onChange(n)}
          style={{
            border: "none",
            background: "transparent",
            fontSize: 36,
            cursor: "pointer",
            color: value >= n ? "#fbbf24" : "#475569",
            padding: 0,
          }}
        >
          {value >= n ? "★" : "☆"}
        </button>
      ))}
    </div>
  );
}

export default function LeaveReviewClient({ token }) {
  const [loading, setLoading] = useState(true);
  const [meta, setMeta] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const [rating, setRating] = useState(0);
  const [authorName, setAuthorName] = useState("");
  const [reviewText, setReviewText] = useState("");
  const [showOnWebsite, setShowOnWebsite] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  useEffect(() => {
    let cancelled = false;
    if (!token) {
      setLoadError("Missing review token in URL.");
      setLoading(false);
      return undefined;
    }
    (async () => {
      try {
        const res = await fetch(`${ENDPOINT_BASE}/${encodeURIComponent(token)}`);
        const payload = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok || !payload?.success) {
          setLoadError(payload?.error || "Invalid review link.");
          setLoading(false);
          return;
        }
        setMeta(payload.data);
        setAuthorName(String(payload.data?.customerName || ""));
        setLoading(false);
      } catch {
        if (!cancelled) {
          setLoadError("Could not load the review form.");
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function submit() {
    if (submitting) return;
    setSubmitError("");
    if (rating < 1) {
      setSubmitError("Please pick a star rating before submitting.");
      return;
    }
    if (!reviewText.trim()) {
      setSubmitError("Please share a few words about your experience.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`${ENDPOINT_BASE}/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rating,
          reviewText: reviewText.trim(),
          authorName: authorName.trim(),
          showOnWebsite,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload?.success) {
        throw new Error(payload?.error || "Could not submit your review.");
      }
      setSubmitted(true);
    } catch (err) {
      setSubmitError(err?.message || "Could not submit your review.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#0f172a",
        color: "#e2e8f0",
        padding: "32px 18px 80px",
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
      }}
    >
      <div style={{ maxWidth: 480, margin: "0 auto" }}>
        {loading ? (
          <p style={{ color: "#94a3b8" }}>Loading…</p>
        ) : loadError ? (
          <div
            role="alert"
            style={{
              background: "rgba(127,29,29,0.4)",
              border: "1px solid rgba(248,113,113,0.4)",
              color: "#fecaca",
              borderRadius: 14,
              padding: "16px 18px",
              fontSize: 14,
            }}
          >
            {loadError}
          </div>
        ) : submitted ? (
          <div
            style={{
              background: "rgba(20, 83, 45, 0.45)",
              border: "1px solid rgba(74, 222, 128, 0.5)",
              borderRadius: 14,
              padding: "20px 18px",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 28, marginBottom: 8 }}>★★★★★</div>
            <h1 style={{ fontSize: 22, fontWeight: 800, margin: "4px 0" }}>
              Thank you!
            </h1>
            <p style={{ color: "#d1fae5", marginTop: 6 }}>
              Your review helps {meta?.branding?.companyName || "your contractor"} grow.
            </p>
          </div>
        ) : (
          <>
            {meta?.branding?.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={meta.branding.logoUrl}
                alt={meta.branding.companyName || "Contractor logo"}
                style={{
                  width: 64,
                  height: 64,
                  objectFit: "contain",
                  borderRadius: 12,
                  marginBottom: 12,
                  background: "white",
                  padding: 6,
                }}
              />
            ) : null}
            <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 6 }}>
              How did we do?
            </h1>
            <p style={{ color: "#94a3b8", marginBottom: 20, fontSize: 14 }}>
              Leave {meta?.branding?.companyName || "your contractor"} a quick review.
              It takes about a minute and helps other neighbors find a trusted contractor.
            </p>

            {meta?.message ? (
              <blockquote
                style={{
                  borderLeft: "3px solid #38bdf8",
                  padding: "8px 12px",
                  margin: "0 0 18px",
                  background: "rgba(56, 189, 248, 0.08)",
                  fontStyle: "italic",
                  fontSize: 13,
                  color: "#cbd5f5",
                }}
              >
                {meta.message}
              </blockquote>
            ) : null}

            <label
              style={{
                display: "block",
                fontSize: 13,
                fontWeight: 600,
                color: "#cbd5f5",
                marginBottom: 6,
              }}
            >
              Your rating
            </label>
            <Stars value={rating} onChange={setRating} />

            <label
              style={{
                display: "block",
                fontSize: 13,
                fontWeight: 600,
                color: "#cbd5f5",
                marginTop: 18,
                marginBottom: 6,
              }}
            >
              Your name
            </label>
            <input
              type="text"
              value={authorName}
              onChange={(e) => setAuthorName(e.target.value)}
              maxLength={200}
              placeholder="First L."
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid rgba(148,163,184,0.3)",
                background: "#0b1220",
                color: "#e2e8f0",
                fontSize: 15,
              }}
            />

            <label
              style={{
                display: "block",
                fontSize: 13,
                fontWeight: 600,
                color: "#cbd5f5",
                marginTop: 18,
                marginBottom: 6,
              }}
            >
              Your review
            </label>
            <textarea
              value={reviewText}
              onChange={(e) => setReviewText(e.target.value)}
              rows={6}
              maxLength={4000}
              placeholder="Tell us about your experience…"
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid rgba(148,163,184,0.3)",
                background: "#0b1220",
                color: "#e2e8f0",
                fontSize: 15,
                resize: "vertical",
              }}
            />

            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginTop: 14,
                fontSize: 13,
                color: "#94a3b8",
              }}
            >
              <input
                type="checkbox"
                checked={showOnWebsite}
                onChange={(e) => setShowOnWebsite(e.target.checked)}
              />
              Allow this review to appear on the contractor's public website.
            </label>

            {submitError ? (
              <div
                role="alert"
                style={{
                  marginTop: 14,
                  background: "rgba(127,29,29,0.4)",
                  border: "1px solid rgba(248,113,113,0.4)",
                  color: "#fecaca",
                  borderRadius: 10,
                  padding: "10px 12px",
                  fontSize: 13,
                }}
              >
                {submitError}
              </div>
            ) : null}

            <button
              type="button"
              onClick={submit}
              disabled={submitting}
              style={{
                marginTop: 22,
                width: "100%",
                padding: "14px 18px",
                borderRadius: 12,
                border: "none",
                background: submitting ? "#1e40af" : "#2563eb",
                color: "white",
                fontWeight: 800,
                fontSize: 16,
                cursor: submitting ? "wait" : "pointer",
                boxShadow: "0 10px 24px rgba(37, 99, 235, 0.45)",
              }}
            >
              {submitting ? "Submitting…" : "Submit review"}
            </button>

            <p
              style={{
                marginTop: 18,
                fontSize: 11,
                color: "#64748b",
                textAlign: "center",
              }}
            >
              Powered by FieldBase. This link is private — only your contractor can read your response.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
