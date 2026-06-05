"use client";

import { useEffect } from "react";
import { apiFetch } from "@/lib/client-auth";

let lastSentAt = 0;

function reportClientError(payload) {
  const now = Date.now();
  if (now - lastSentAt < 3000) return;
  lastSentAt = now;

  apiFetch("/api/client-errors", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    suppressUnauthorizedEvent: true,
  }).catch(() => {});
}

export default function ClientErrorReporter() {
  useEffect(() => {
    const onError = (event) => {
      reportClientError({
        source: "error",
        message: event.message || "Script error",
        stack: event.error?.stack || "",
        url: event.filename || window.location?.pathname || "",
      });
    };

    const onRejection = (event) => {
      const reason = event.reason;
      reportClientError({
        source: "unhandledrejection",
        message:
          reason?.message ||
          (typeof reason === "string" ? reason : "Unhandled promise rejection"),
        stack: reason?.stack || "",
        url: window.location?.pathname || "",
      });
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
