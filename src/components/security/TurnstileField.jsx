"use client";

import { useEffect, useRef, useState } from "react";

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "";

export default function TurnstileField({ onToken, resetKey = 0 }) {
  const containerRef = useRef(null);
  const widgetIdRef = useRef(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!SITE_KEY) {
      onToken?.("");
      return undefined;
    }

    const existing = document.querySelector('script[src*="turnstile/v0/api.js"]');
    if (!existing) {
      const script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      script.onload = () => setReady(true);
      document.head.appendChild(script);
    } else if (window.turnstile) {
      setReady(true);
    } else {
      existing.addEventListener("load", () => setReady(true));
    }

    return () => undefined;
  }, [onToken]);

  useEffect(() => {
    if (!SITE_KEY || !ready || !containerRef.current || !window.turnstile) return;

    if (widgetIdRef.current != null) {
      try {
        window.turnstile.remove(widgetIdRef.current);
      } catch {
        /* ignore */
      }
      widgetIdRef.current = null;
    }

    containerRef.current.innerHTML = "";
    widgetIdRef.current = window.turnstile.render(containerRef.current, {
      sitekey: SITE_KEY,
      theme: "light",
      callback: (token) => onToken?.(token),
      "expired-callback": () => onToken?.(""),
      "error-callback": () => onToken?.(""),
    });
  }, [ready, resetKey, onToken]);

  if (!SITE_KEY) return null;

  return (
    <div
      ref={containerRef}
      style={{ marginTop: 12, minHeight: 65 }}
      aria-label="Security verification"
    />
  );
}
