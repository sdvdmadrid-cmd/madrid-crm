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
  const [tab, setTab] = useState("connect");
  const [reviews, setReviews] = useState([]);
  const [social, setSocial] = useState([]);
  const [sources, setSources] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [googlePlaceId, setGooglePlaceId] = useState("");
  const [googleSearch, setGoogleSearch] = useState("");
  const [placeSuggestions, setPlaceSuggestions] = useState([]);
  const [yelpUrl, setYelpUrl] = useState("");

  const [importUrl, setImportUrl] = useState("");
  const [importText, setImportText] = useState("");
  const [importAuthor, setImportAuthor] = useState("");
  const [importRating, setImportRating] = useState("5");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [revRes, socRes, srcRes] = await Promise.all([
        apiFetch("/api/reputation/reviews"),
        apiFetch("/api/reputation/social"),
        apiFetch("/api/reputation/sources"),
      ]);
      const revJson = await getJsonOrThrow(revRes, "Failed to load reviews");
      const socJson = await getJsonOrThrow(socRes, "Failed to load social");
      const srcJson = srcRes.ok ? await srcRes.json() : { data: null };
      setReviews(Array.isArray(revJson.data) ? revJson.data : []);
      setSocial(Array.isArray(socJson.data) ? socJson.data : []);
      const src = srcJson.data || null;
      setSources(src);
      setGooglePlaceId(src?.googlePlaceId || "");
      setYelpUrl(src?.yelpProfileUrl || "");
    } catch (err) {
      setError(err.message || "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const q = googleSearch.trim();
    if (q.length < 3) {
      setPlaceSuggestions([]);
      return undefined;
    }
    const timer = window.setTimeout(async () => {
      try {
        const res = await apiFetch(
          `/api/places/autocomplete?input=${encodeURIComponent(q)}&type=establishment`,
        );
        const json = await res.json();
        setPlaceSuggestions(Array.isArray(json.predictions) ? json.predictions : []);
      } catch {
        setPlaceSuggestions([]);
      }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [googleSearch]);

  const patchReview = async (id, patch) => {
    const res = await apiFetch(`/api/reputation/reviews/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    await getJsonOrThrow(res, "Update failed");
    await load();
  };

  const saveSources = async () => {
    setError("");
    setNotice("");
    try {
      const res = await apiFetch("/api/reputation/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          googlePlaceId,
          yelpProfileUrl: yelpUrl,
        }),
      });
      await getJsonOrThrow(res, "Save failed");
      setNotice("Connected sources saved.");
      await load();
    } catch (err) {
      setError(err.message || "Save failed");
    }
  };

  const runSync = async (platforms) => {
    setSyncing(true);
    setError("");
    setNotice("");
    try {
      const res = await apiFetch("/api/reputation/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platforms }),
      });
      const json = await getJsonOrThrow(res, "Sync failed");
      const r = json.data?.results || {};
      const parts = [];
      if (r.google?.ok) parts.push(`Google: ${r.google.count || 0} reviews`);
      else if (r.google?.error) parts.push(`Google: ${r.google.error}`);
      if (r.yelp?.ok) parts.push(`Yelp: ${r.yelp.count || 0} reviews`);
      else if (r.yelp?.error) parts.push(`Yelp: ${r.yelp.error}`);
      setNotice(parts.length ? parts.join(" · ") : "Sync complete.");
      await load();
    } catch (err) {
      setError(err.message || "Sync failed");
    } finally {
      setSyncing(false);
    }
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
      setNotice(
        `Saved ${json.imported || 1} review(s) for your records. Only API-synced reviews appear on your public website.`,
      );
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

  const syncedReviews = reviews.filter((r) => r.metadata?.syncSource === "api");
  const lastSync = sources?.lastSyncAt
    ? new Date(sources.lastSyncAt).toLocaleString()
    : "Never";

  return (
    <PremiumPageShell
      title="Reviews & Reputation"
      subtitle="Sync real reviews from Google and Yelp. Only verified API reviews appear on your public website."
    >
      <PlatformZoneBanner zone="private" />
      {notice ? <div className={ws.noticeSuccess}>{notice}</div> : null}
      {error ? <div className={ws.noticeErrorBlock}>{error}</div> : null}

      <div className={rep.tabs}>
        <button
          type="button"
          className={tab === "connect" ? rep.tabActive : rep.tab}
          onClick={() => setTab("connect")}
        >
          Connect & sync
        </button>
        <button
          type="button"
          className={tab === "reviews" ? rep.tabActive : rep.tab}
          onClick={() => setTab("reviews")}
        >
          Reviews ({syncedReviews.length})
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

      {!loading && tab === "connect" ? (
        <div className={rep.connectGrid}>
          <div className={rep.importCard}>
            <h3>Google Business</h3>
            <p className={rep.muted}>
              Search your business, select it, then sync. Reviews are pulled from Google Places
              (public data, up to 5 recent reviews per sync).
            </p>
            <input
              className={rep.input}
              placeholder="Search business name + city"
              value={googleSearch}
              onChange={(e) => setGoogleSearch(e.target.value)}
            />
            {placeSuggestions.length > 0 ? (
              <ul className={rep.suggestList}>
                {placeSuggestions.map((item) => (
                  <li key={item.placeId}>
                    <button
                      type="button"
                      className={rep.suggestBtn}
                      onClick={() => {
                        setGooglePlaceId(item.placeId);
                        setGoogleSearch(item.description || "");
                        setPlaceSuggestions([]);
                      }}
                    >
                      {item.description}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            <input
              className={rep.input}
              placeholder="Google Place ID (ChIJ…)"
              value={googlePlaceId}
              onChange={(e) => setGooglePlaceId(e.target.value)}
            />
          </div>

          <div className={rep.importCard}>
            <h3>Yelp</h3>
            <p className={rep.muted}>
              Paste your Yelp business page URL (yelp.com/biz/…). Yelp provides up to 3 review
              excerpts via their official API.
            </p>
            <input
              className={rep.input}
              placeholder="https://www.yelp.com/biz/your-business"
              value={yelpUrl}
              onChange={(e) => setYelpUrl(e.target.value)}
            />
          </div>

          <div className={rep.syncActions}>
            <button type="button" className={ws.btnSecondary} onClick={saveSources}>
              Save connections
            </button>
            <button
              type="button"
              className={ws.btnPrimary}
              disabled={syncing}
              onClick={() => runSync([])}
            >
              {syncing ? "Syncing…" : "Sync all platforms"}
            </button>
          </div>
          <p className={rep.muted}>
            Last sync: {lastSync}
            {sources?.lastSyncStatus?.google?.error
              ? ` · Google: ${sources.lastSyncStatus.google.error}`
              : null}
            {sources?.lastSyncStatus?.yelp?.error
              ? ` · Yelp: ${sources.lastSyncStatus.yelp.error}`
              : null}
          </p>
          <p className={rep.muted}>
            Requires <code>GOOGLE_PLACES_API_KEY</code> and <code>YELP_FUSION_API_KEY</code> on
            the server. AI or template quotes from the website builder are never shown as reviews.
          </p>
        </div>
      ) : null}

      {!loading && tab === "reviews" ? (
        <>
          <div className={rep.importCard}>
            <h3>Archive import (private only)</h3>
            <p className={rep.muted}>
              Paste a review for your own records. It will not appear on your public site unless
              synced from Google or Yelp above.
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
              Save to archive
            </button>
          </div>

          <div className={rep.list}>
            {syncedReviews.length === 0 ? (
              <p className={rep.muted}>
                No synced reviews yet. Connect Google or Yelp and run Sync.
              </p>
            ) : (
              syncedReviews.map((review) => (
                <article key={review.id} className={rep.reviewCard}>
                  <div className={rep.reviewHead}>
                    <strong>{review.authorName}</strong>
                    <span className={rep.badge}>{review.platform}</span>
                    <span className={rep.badgePin}>API verified</span>
                    {review.pinned ? <span className={rep.badgePin}>Pinned</span> : null}
                  </div>
                  <p className={rep.quote}>{review.reviewText}</p>
                  {review.sourceUrl ? (
                    <a href={review.sourceUrl} target="_blank" rel="noreferrer" className={rep.link}>
                      View on {review.platform} →
                    </a>
                  ) : null}
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
