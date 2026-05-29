"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, getJsonOrThrow } from "@/lib/client-auth";
import PremiumPageShell from "@/components/workspace/PremiumPageShell";
import PlatformZoneBanner from "@/components/workspace/PlatformZoneBanner";
import ws from "@/styles/workspace-dark.module.css";
import rep from "./reputation.module.css";

const PLATFORMS = [
  "google",
  "yelp",
  "facebook",
  "instagram",
  "tiktok",
  "houzz",
  "angi",
  "thumbtack",
  "manual",
];

const SOCIAL_PLATFORMS = ["facebook", "instagram", "tiktok", "youtube", "google", "yelp"];

export default function ReviewsReputationClient() {
  const [tab, setTab] = useState("reviews");
  const [reviews, setReviews] = useState([]);
  const [social, setSocial] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [importUrl, setImportUrl] = useState("");
  const [importText, setImportText] = useState("");
  const [importAuthor, setImportAuthor] = useState("");
  const [importRating, setImportRating] = useState("5");

  // Review-request state (Paquete D)
  const [requests, setRequests] = useState([]);
  const [reqEmail, setReqEmail] = useState("");
  const [reqPhone, setReqPhone] = useState("");
  const [reqName, setReqName] = useState("");
  const [reqMessage, setReqMessage] = useState("");
  const [reqChannel, setReqChannel] = useState("email");
  const [reqSending, setReqSending] = useState(false);
  const [lastReviewLink, setLastReviewLink] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [revRes, socRes, reqRes] = await Promise.all([
        apiFetch("/api/reputation/reviews"),
        apiFetch("/api/reputation/social"),
        apiFetch("/api/reputation/request-review"),
      ]);
      const revJson = await getJsonOrThrow(revRes, "Failed to load reviews");
      const socJson = await getJsonOrThrow(socRes, "Failed to load social");
      const reqJson = await reqRes.json().catch(() => ({}));
      setReviews(Array.isArray(revJson.data) ? revJson.data : []);
      setSocial(Array.isArray(socJson.data) ? socJson.data : []);
      setRequests(Array.isArray(reqJson?.data) ? reqJson.data : []);
    } catch (err) {
      setError(err.message || "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const patchReview = async (id, patch) => {
    const res = await apiFetch(`/api/reputation/reviews/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    await getJsonOrThrow(res, "Update failed");
    await load();
  };

  const handleImport = async () => {
    setError("");
    setNotice("");
    try {
      const res = await apiFetch("/api/reputation/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceUrl: importUrl,
          platform: PLATFORMS.find((p) => importUrl.toLowerCase().includes(p)) || "manual",
          authorName: importAuthor || "Customer",
          rating: Number(importRating) || 5,
          reviewText: importText,
          mode: "paste",
        }),
      });
      const json = await getJsonOrThrow(res, "Import failed");
      setNotice(`Imported ${json.imported || 1} review(s).`);
      setImportText("");
      setImportAuthor("");
      await load();
    } catch (err) {
      setError(err.message || "Import failed");
    }
  };

  const sendReviewRequest = async () => {
    if (reqSending) return;
    setError("");
    setNotice("");
    setLastReviewLink("");
    if (!reqEmail && !reqPhone) {
      setError("Please enter an email or phone for the customer.");
      return;
    }
    setReqSending(true);
    try {
      const res = await apiFetch("/api/reputation/request-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: reqName,
          customerEmail: reqEmail,
          customerPhone: reqPhone,
          message: reqMessage,
          channel: reqChannel,
        }),
      });
      const payload = await getJsonOrThrow(res, "Could not send review request");
      const link = payload?.data?.reviewLink || "";
      setLastReviewLink(link);
      const emailOk = payload?.data?.delivery?.email?.success === true;
      const smsOk = payload?.data?.delivery?.sms?.success === true;
      const sentVia = [emailOk ? "email" : "", smsOk ? "SMS" : ""].filter(Boolean).join(" + ");
      setNotice(
        sentVia
          ? `Review request sent via ${sentVia}. You can also share the link manually below.`
          : "Review request saved. Copy the link below to share with your customer.",
      );
      setReqEmail("");
      setReqPhone("");
      setReqName("");
      setReqMessage("");
      await load();
    } catch (err) {
      setError(err.message || "Could not send review request");
    } finally {
      setReqSending(false);
    }
  };

  const revokeRequest = async (id) => {
    if (!window.confirm("Revoke this review link? The customer won't be able to submit anymore.")) {
      return;
    }
    try {
      await apiFetch(`/api/reputation/request-review?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      await load();
    } catch (err) {
      setError(err.message || "Could not revoke");
    }
  };

  const copyReviewLink = async (link) => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setNotice("Link copied to clipboard.");
    } catch {
      setNotice(link);
    }
  };

  const saveSocial = async (platform, profileUrl) => {
    setError("");
    try {
      const res = await apiFetch("/api/reputation/social", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform, profileUrl, displayOnWebsite: true }),
      });
      await getJsonOrThrow(res, "Save failed");
      setNotice("Social link saved — appears on your public website.");
      await load();
    } catch (err) {
      setError(err.message || "Save failed");
    }
  };

  return (
    <PremiumPageShell
      title="Reviews & Reputation"
      subtitle="Private FieldBase workspace — manage what homeowners see on your public website only."
    >
      <PlatformZoneBanner zone="private" />
      {notice ? <div className={ws.noticeSuccess}>{notice}</div> : null}
      {error ? <div className={ws.noticeErrorBlock}>{error}</div> : null}

      <div className={rep.tabs}>
        <button
          type="button"
          className={tab === "reviews" ? rep.tabActive : rep.tab}
          onClick={() => setTab("reviews")}
        >
          Reviews
        </button>
        <button
          type="button"
          className={tab === "requests" ? rep.tabActive : rep.tab}
          onClick={() => setTab("requests")}
        >
          Request reviews
        </button>
        <button
          type="button"
          className={tab === "social" ? rep.tabActive : rep.tab}
          onClick={() => setTab("social")}
        >
          Social links
        </button>
      </div>

      {loading ? <p className={rep.muted}>Loading…</p> : null}

      {!loading && tab === "reviews" ? (
        <>
          <div className={rep.importCard}>
            <h3>Import a review</h3>
            <p className={rep.muted}>
              Paste a public review link (Google, Yelp, Facebook, etc.) and the review text. Only
              reviews you approve appear on your public site.
            </p>
            <input
              className={rep.input}
              placeholder="Review URL (optional)"
              value={importUrl}
              onChange={(e) => setImportUrl(e.target.value)}
            />
            <div className={rep.row}>
              <input
                className={rep.input}
                placeholder="Customer name"
                value={importAuthor}
                onChange={(e) => setImportAuthor(e.target.value)}
              />
              <select
                className={rep.input}
                value={importRating}
                onChange={(e) => setImportRating(e.target.value)}
              >
                {[5, 4, 3, 2, 1].map((n) => (
                  <option key={n} value={n}>
                    {n} stars
                  </option>
                ))}
              </select>
            </div>
            <textarea
              className={rep.textarea}
              rows={4}
              placeholder="Paste review text here…"
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
            />
            <button type="button" className={ws.btnPrimary} onClick={handleImport}>
              Import review
            </button>
          </div>

          <div className={rep.list}>
            {reviews.length === 0 ? (
              <p className={rep.muted}>No reviews yet. Import your first review above.</p>
            ) : (
              reviews.map((review) => (
                <article key={review.id} className={rep.reviewCard}>
                  <div className={rep.reviewHead}>
                    <strong>{review.authorName}</strong>
                    <span className={rep.badge}>{review.platform}</span>
                    {review.pinned ? <span className={rep.badgePin}>Pinned</span> : null}
                    {review.hidden ? <span className={rep.badgeHide}>Hidden</span> : null}
                  </div>
                  <p className={rep.quote}>{review.reviewText}</p>
                  <div className={rep.actions}>
                    <button
                      type="button"
                      className={ws.btnSecondary}
                      onClick={() => patchReview(review.id, { pinned: !review.pinned })}
                    >
                      {review.pinned ? "Unpin" : "Pin featured"}
                    </button>
                    <button
                      type="button"
                      className={ws.btnSecondary}
                      onClick={() =>
                        patchReview(review.id, { showOnWebsite: !review.showOnWebsite })
                      }
                    >
                      {review.showOnWebsite ? "Hide from website" : "Show on website"}
                    </button>
                    <button
                      type="button"
                      className={ws.btnSecondary}
                      onClick={() => patchReview(review.id, { hidden: !review.hidden })}
                    >
                      {review.hidden ? "Unhide" : "Mark spam/hidden"}
                    </button>
                    <button
                      type="button"
                      className={ws.btnSecondary}
                      onClick={() => patchReview(review.id, { verified: true })}
                    >
                      Mark verified
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>
        </>
      ) : null}

      {!loading && tab === "requests" ? (
        <>
          <div className={rep.importCard}>
            <h3>Send a customer a review link</h3>
            <p className={rep.muted}>
              We&apos;ll email/SMS a one-tap link they can use to leave a star rating + comment.
              Their review lands in your queue (already marked verified) and is added to your
              public website unless you hide it.
            </p>

            <div className={rep.row}>
              <input
                className={rep.input}
                placeholder="Customer name"
                value={reqName}
                onChange={(e) => setReqName(e.target.value)}
              />
              <select
                className={rep.input}
                value={reqChannel}
                onChange={(e) => setReqChannel(e.target.value)}
              >
                <option value="email">Email</option>
                <option value="sms">SMS</option>
                <option value="both">Both</option>
              </select>
            </div>
            <div className={rep.row}>
              <input
                className={rep.input}
                type="email"
                placeholder="customer@email.com"
                value={reqEmail}
                onChange={(e) => setReqEmail(e.target.value)}
              />
              <input
                className={rep.input}
                type="tel"
                placeholder="+1 555 123 4567"
                value={reqPhone}
                onChange={(e) => setReqPhone(e.target.value)}
              />
            </div>
            <textarea
              className={rep.textarea}
              rows={3}
              placeholder="Optional note for your customer (shown inside the email)…"
              value={reqMessage}
              onChange={(e) => setReqMessage(e.target.value)}
            />
            <button
              type="button"
              className={ws.btnPrimary}
              onClick={sendReviewRequest}
              disabled={reqSending}
            >
              {reqSending ? "Sending…" : "Send review request"}
            </button>

            {lastReviewLink ? (
              <div style={{ marginTop: 12, fontSize: 13, color: "#cbd5f5" }}>
                <div style={{ marginBottom: 6 }}>Share this link manually if needed:</div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <code style={{
                    flex: 1,
                    padding: "6px 8px",
                    background: "#0b1220",
                    borderRadius: 6,
                    fontSize: 12,
                    wordBreak: "break-all",
                  }}>{lastReviewLink}</code>
                  <button
                    type="button"
                    className={ws.btnSecondary}
                    onClick={() => copyReviewLink(lastReviewLink)}
                  >
                    Copy
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          <div className={rep.list}>
            <h3 style={{ marginBottom: 12 }}>Sent review requests</h3>
            {requests.length === 0 ? (
              <p className={rep.muted}>No review requests sent yet.</p>
            ) : (
              <table style={{ width: "100%", fontSize: 13, color: "#e2e8f0", borderCollapse: "collapse" }}>
                <thead style={{ color: "#94a3b8", textAlign: "left", fontSize: 12 }}>
                  <tr>
                    <th style={{ padding: "8px 6px" }}>Customer</th>
                    <th style={{ padding: "8px 6px" }}>Sent</th>
                    <th style={{ padding: "8px 6px" }}>Status</th>
                    <th style={{ padding: "8px 6px" }}>Rating</th>
                    <th style={{ padding: "8px 6px" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map((req) => (
                    <tr key={req.id} style={{ borderTop: "1px solid rgba(148,163,184,0.12)" }}>
                      <td style={{ padding: "8px 6px" }}>
                        <div>{req.customerName || "—"}</div>
                        <div style={{ color: "#64748b", fontSize: 11 }}>
                          {req.customerEmail || req.customerPhone}
                        </div>
                      </td>
                      <td style={{ padding: "8px 6px", color: "#94a3b8" }}>
                        {req.createdAt ? new Date(req.createdAt).toLocaleDateString() : "—"}
                      </td>
                      <td style={{ padding: "8px 6px" }}>
                        <span
                          style={{
                            fontSize: 11,
                            padding: "2px 8px",
                            borderRadius: 999,
                            background:
                              req.status === "responded"
                                ? "rgba(34,197,94,0.2)"
                                : req.status === "revoked"
                                  ? "rgba(248,113,113,0.2)"
                                  : "rgba(96,165,250,0.18)",
                            color:
                              req.status === "responded"
                                ? "#86efac"
                                : req.status === "revoked"
                                  ? "#fca5a5"
                                  : "#93c5fd",
                          }}
                        >
                          {req.status}
                        </span>
                      </td>
                      <td style={{ padding: "8px 6px" }}>
                        {req.rating != null ? `★ ${Number(req.rating).toFixed(1)}` : "—"}
                      </td>
                      <td style={{ padding: "8px 6px", textAlign: "right" }}>
                        {req.status === "sent" ? (
                          <button
                            type="button"
                            className={ws.btnSecondary}
                            onClick={() => revokeRequest(req.id)}
                            style={{ fontSize: 11, padding: "3px 8px" }}
                          >
                            Revoke
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      ) : null}

      {!loading && tab === "social" ? (
        <div className={rep.socialGrid}>
          {SOCIAL_PLATFORMS.map((platform) => {
            const existing = social.find((s) => s.platform === platform);
            return (
              <SocialRow
                key={platform}
                platform={platform}
                initialUrl={existing?.profileUrl || ""}
                onSave={saveSocial}
              />
            );
          })}
        </div>
      ) : null}
    </PremiumPageShell>
  );
}

function SocialRow({ platform, initialUrl, onSave }) {
  const [url, setUrl] = useState(initialUrl);
  useEffect(() => setUrl(initialUrl), [initialUrl]);
  return (
    <div className={rep.socialRow}>
      <label className={rep.socialLabel}>{platform}</label>
      <input
        className={rep.input}
        placeholder={`https://${platform}.com/your-page`}
        value={url}
        onChange={(e) => setUrl(e.target.value)}
      />
      <button type="button" className={ws.btnSecondary} onClick={() => onSave(platform, url)}>
        Save
      </button>
    </div>
  );
}
