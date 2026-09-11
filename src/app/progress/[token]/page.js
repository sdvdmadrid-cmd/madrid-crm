"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

function formatDateTime(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function stageLabel(stage) {
  const value = String(stage || "progress").toLowerCase();
  if (value === "before") return "Before";
  if (value === "completion") return "Completion";
  return "Progress";
}

function groupByDay(items) {
  const groups = new Map();
  for (const item of items) {
    const key = (item.takenAt || item.createdAt || "").slice(0, 10) || "unknown";
    const bucket = groups.get(key) || [];
    bucket.push(item);
    groups.set(key, bucket);
  }
  return [...groups.entries()].sort((a, b) => b[0].localeCompare(a[0]));
}

export default function PublicJobProgressPage() {
  const { token } = useParams();
  const accessToken = String(token || "").trim();
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async ({ soft = false } = {}) => {
    if (!accessToken) {
      setError("This progress link is invalid or incomplete.");
      setLoading(false);
      return;
    }
    if (soft) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await fetch(
        `/api/public/jobs/progress/${encodeURIComponent(accessToken)}`,
        { cache: "no-store" },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Unable to load progress.");
      }
      setPayload(json.data);
      setError("");
    } catch (err) {
      setError(err?.message || "Unable to load progress.");
      if (!soft) setPayload(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [accessToken]);

  useEffect(() => {
    load();
    const timer = setInterval(() => load({ soft: true }), 60_000);
    return () => clearInterval(timer);
  }, [load]);

  const groups = useMemo(
    () => groupByDay(payload?.items || []),
    [payload?.items],
  );

  if (loading) {
    return (
      <main style={styles.page}>
        <p style={styles.muted}>Loading live job progress…</p>
      </main>
    );
  }

  if (error && !payload) {
    return (
      <main style={styles.page}>
        <p style={styles.error}>{error}</p>
      </main>
    );
  }

  const job = payload?.job || {};
  const reviews = payload?.reviews || {};
  const reviewLinks = [
    { key: "google", href: reviews.googleUrl, label: "Leave a Google review" },
    { key: "yelp", href: reviews.yelpUrl, label: "Leave a Yelp review" },
  ].filter((item) => String(item.href || "").startsWith("http"));
  const showReviewCta = Boolean(reviews.showCta) && reviewLinks.length > 0;

  return (
    <main style={styles.page} data-testid="public-job-progress">
      <header style={styles.header}>
        <p style={styles.eyebrow}>{payload?.companyName || "FieldBase"}</p>
        <h1 style={styles.title}>{job.title || "Job progress"}</h1>
        <p style={styles.meta}>
          {[job.service, job.description].filter(Boolean).join(" · ") ||
            "Live updates from the crew"}
        </p>
        <p style={styles.counts}>
          {payload?.photoCount || 0} photos · {payload?.videoCount || 0} videos
          {job.completed ? " · completed" : ""}
          {refreshing ? " · refreshing…" : ""}
        </p>
        <button type="button" style={styles.refreshBtn} onClick={() => load({ soft: true })}>
          Refresh
        </button>
      </header>

      {error ? <p style={styles.error}>{error}</p> : null}

      {!groups.length ? (
        <section style={styles.empty}>
          <h2>No media yet</h2>
          <p>Photos and videos will appear here as the crew documents the job.</p>
        </section>
      ) : (
        groups.map(([day, items]) => (
          <section key={day} style={styles.day}>
            <h2 style={styles.dayTitle}>{day === "unknown" ? "Recent" : day}</h2>
            <div style={styles.list}>
              {items.map((item) => (
                <article key={item.id} style={styles.card}>
                  <div style={styles.badgeRow}>
                    <span style={styles.badge}>{stageLabel(item.photoStage)}</span>
                    <span style={styles.badgeMuted}>
                      {item.fileType === "video" ? "Video" : "Photo"}
                    </span>
                    <time dateTime={item.takenAt || item.createdAt}>
                      {formatDateTime(item.takenAt || item.createdAt)}
                    </time>
                  </div>
                  {item.fileType === "video" && item.mediaUrl ? (
                    <video
                      src={item.mediaUrl}
                      controls
                      playsInline
                      preload="metadata"
                      style={styles.video}
                    />
                  ) : item.mediaUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.mediaUrl}
                      alt={item.caption || item.name || "Job photo"}
                      style={styles.image}
                    />
                  ) : null}
                  {item.caption ? <p style={styles.caption}>{item.caption}</p> : null}
                </article>
              ))}
            </div>
          </section>
        ))
      )}

      {showReviewCta ? (
        <section style={styles.review} data-testid="public-job-review-cta">
          <h2 style={styles.reviewTitle}>How did we do?</h2>
          <p style={styles.reviewSub}>
            Thanks for trusting {payload?.companyName || "us"}. A quick review helps other
            homeowners find great local work.
          </p>
          <div style={styles.reviewActions}>
            {reviewLinks.map((link) => (
              <a
                key={link.key}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                style={styles.reviewBtn}
              >
                {link.label} →
              </a>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    padding: "32px 20px 64px",
    maxWidth: 720,
    margin: "0 auto",
    fontFamily: '"Segoe UI", system-ui, sans-serif',
    background: "linear-gradient(180deg, #f4f7fb 0%, #eef2f7 40%, #f8fafc 100%)",
    color: "#0f172a",
  },
  header: { marginBottom: 28 },
  eyebrow: {
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    fontSize: 12,
    color: "#64748b",
    margin: "0 0 8px",
  },
  title: { margin: "0 0 8px", fontSize: "1.75rem", lineHeight: 1.2 },
  meta: { margin: "0 0 8px", color: "#475569" },
  counts: { margin: "0 0 12px", color: "#64748b", fontSize: 14 },
  refreshBtn: {
    border: "1px solid #cbd5e1",
    background: "#fff",
    borderRadius: 8,
    padding: "8px 14px",
    cursor: "pointer",
  },
  muted: { color: "#64748b" },
  error: { color: "#b91c1c" },
  empty: {
    background: "#fff",
    borderRadius: 16,
    padding: 24,
    border: "1px solid #e2e8f0",
  },
  day: { marginBottom: 28 },
  dayTitle: { fontSize: "1rem", margin: "0 0 12px", color: "#334155" },
  list: { display: "grid", gap: 16 },
  card: {
    background: "#fff",
    borderRadius: 16,
    padding: 14,
    border: "1px solid #e2e8f0",
    boxShadow: "0 8px 24px rgba(15, 23, 42, 0.04)",
  },
  badgeRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    alignItems: "center",
    marginBottom: 10,
    fontSize: 13,
    color: "#64748b",
  },
  badge: {
    background: "#e0f2fe",
    color: "#075985",
    borderRadius: 999,
    padding: "2px 10px",
    fontWeight: 600,
  },
  badgeMuted: {
    background: "#f1f5f9",
    color: "#475569",
    borderRadius: 999,
    padding: "2px 10px",
  },
  image: {
    width: "100%",
    height: "auto",
    borderRadius: 12,
    display: "block",
  },
  video: {
    width: "100%",
    borderRadius: 12,
    background: "#0f172a",
    display: "block",
  },
  caption: { margin: "10px 0 0", color: "#334155" },
  review: {
    marginTop: 36,
    background: "#fff",
    borderRadius: 16,
    padding: 24,
    border: "1px solid #e2e8f0",
    textAlign: "center",
  },
  reviewTitle: { margin: "0 0 8px", fontSize: "1.25rem" },
  reviewSub: { margin: "0 0 16px", color: "#475569" },
  reviewActions: {
    display: "flex",
    flexWrap: "wrap",
    gap: 12,
    justifyContent: "center",
  },
  reviewBtn: {
    background: "#0f172a",
    color: "#fff",
    textDecoration: "none",
    borderRadius: 10,
    padding: "12px 16px",
    fontWeight: 600,
  },
};
