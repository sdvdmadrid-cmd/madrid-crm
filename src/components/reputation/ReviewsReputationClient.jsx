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

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [revRes, socRes] = await Promise.all([
        apiFetch("/api/reputation/reviews"),
        apiFetch("/api/reputation/social"),
      ]);
      const revJson = await getJsonOrThrow(revRes, "Failed to load reviews");
      const socJson = await getJsonOrThrow(socRes, "Failed to load social");
      setReviews(Array.isArray(revJson.data) ? revJson.data : []);
      setSocial(Array.isArray(socJson.data) ? socJson.data : []);
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
