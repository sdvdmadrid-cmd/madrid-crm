"use client";

import { useState } from "react";
import TurnstileField from "@/components/security/TurnstileField";

const MAX_IMAGE_SIZE = 4 * 1024 * 1024;

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

export default function RequestServiceForm({
  slug,
  serviceOptions = [],
  initialService = "",
  showEmailField = false,
}) {
  const resolvedInitialService =
    initialService && serviceOptions.includes(initialService)
      ? initialService
      : serviceOptions[0] || initialService || "";

  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    address: "",
    serviceNeeded: resolvedInitialService,
    description: "",
    photoDataUrl: "",
    website: "",
    formStartedAt: String(Date.now()),
  });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [submitState, setSubmitState] = useState("idle");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handlePhotoChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Please upload an image file.");
      return;
    }

    if (file.size > MAX_IMAGE_SIZE) {
      setError("Image is too large. Max size is 4MB.");
      return;
    }

    try {
      const dataUrl = await fileToDataUrl(file);
      setForm((prev) => ({ ...prev, photoDataUrl: dataUrl }));
      setError("");
    } catch {
      setError("Failed to read image file.");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess(false);
    setSubmitState("loading");

    try {
      const res = await fetch(`/api/site/${slug}/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, turnstileToken }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Failed to submit");
      }

      setSuccess(true);
      setSubmitState("success");
      setForm({
        name: "",
        email: "",
        phone: "",
        address: "",
        serviceNeeded: resolvedInitialService,
        description: "",
        photoDataUrl: "",
        website: "",
        formStartedAt: String(Date.now()),
      });
      setTurnstileToken("");
      setTurnstileResetKey((k) => k + 1);
      setTimeout(() => {
        setSuccess(false);
        setSubmitState("idle");
      }, 5000);
    } catch (err) {
      setError(err.message || "Something went wrong");
      setSubmitState("error");
      setTurnstileResetKey((k) => k + 1);
    } finally {
      setLoading(false);
    }
  };

  const submitLabel =
    submitState === "loading"
      ? "Sending..."
      : submitState === "success"
        ? "Request Sent"
        : submitState === "error"
          ? "Try Again"
          : "Send Request";

  const submitBackground =
    submitState === "success"
      ? "#10b981"
      : submitState === "error"
        ? "#ef4444"
        : "#fff";

  const submitTextColor =
    submitState === "success" || submitState === "error"
      ? "#fff"
      : "#0f172a";

  const submitIcon =
    submitState === "loading" ? (
      <span
        aria-hidden="true"
        style={{
          width: 14,
          height: 14,
          border: "2px solid currentColor",
          borderTopColor: "transparent",
          borderRadius: "50%",
          animation: "request-spin 0.8s linear infinite",
          display: "inline-block",
        }}
      />
    ) : submitState === "success" ? (
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        style={{ width: 15, height: 15, display: "inline-block", animation: "request-pop 220ms ease-out" }}
      >
        <path
          d="M20 6L9 17l-5-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ) : submitState === "error" ? (
      <svg aria-hidden="true" viewBox="0 0 24 24" style={{ width: 15, height: 15, display: "inline-block" }}>
        <path
          d="M12 8v5M12 16h.01M10.29 3.86l-8.18 14A2 2 0 0 0 3.82 21h16.36a2 2 0 0 0 1.71-3.14l-8.18-14a2 2 0 0 0-3.42 0z"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ) : null;

  const inputStyle = {
    width: "100%",
    padding: "10px 12px",
    border: "1px solid rgba(255,255,255,0.3)",
    borderRadius: 6,
    fontSize: 14,
    background: "rgba(255,255,255,0.05)",
    color: "#fff",
    boxSizing: "border-box",
  };

  const labelStyle = {
    display: "block",
    fontSize: 14,
    fontWeight: 600,
    marginBottom: 6,
    color: "rgba(255,255,255,0.9)",
  };

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", width: "100%" }}>
      <style>{`
        @keyframes request-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        @keyframes request-pop {
          0% { transform: scale(0.8); opacity: 0.75; }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>

      {success && (
        <div
          style={{
            background: "rgba(16, 185, 129, 0.2)",
            color: "#d1fae5",
            border: "1px solid rgba(16, 185, 129, 0.5)",
            padding: "14px 16px",
            borderRadius: 8,
            marginBottom: 16,
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          Request received. We will contact you soon.
        </div>
      )}

      {error && (
        <div
          style={{
            background: "rgba(239, 68, 68, 0.2)",
            color: "#fee2e2",
            border: "1px solid rgba(239, 68, 68, 0.5)",
            padding: "14px 16px",
            borderRadius: 8,
            marginBottom: 16,
            fontSize: 14,
            fontWeight: 700,
          }}
        >
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} data-lead-form="website-request">
        <input
          type="text"
          name="website"
          value={form.website}
          onChange={handleChange}
          autoComplete="off"
          tabIndex={-1}
          aria-hidden="true"
          style={{ position: "absolute", left: "-9999px", opacity: 0 }}
        />
        <input type="hidden" name="formStartedAt" value={form.formStartedAt} readOnly />

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Name *</label>
          <input type="text" name="name" value={form.name} onChange={handleChange} required style={inputStyle} />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Phone *</label>
          <input type="tel" name="phone" value={form.phone} onChange={handleChange} required style={inputStyle} />
        </div>

        {showEmailField ? (
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Email (optional)</label>
            <input
              type="email"
              name="email"
              value={form.email}
              onChange={handleChange}
              style={inputStyle}
              placeholder="you@email.com"
            />
          </div>
        ) : null}

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Address *</label>
          <input
            type="text"
            name="address"
            value={form.address}
            onChange={handleChange}
            required
            style={inputStyle}
            placeholder="123 Main St, City, State ZIP"
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Service needed *</label>
          <select name="serviceNeeded" value={form.serviceNeeded} onChange={handleChange} required style={inputStyle}>
            <option value="">Select service</option>
            {serviceOptions.map((option) => (
              <option key={option} value={option} style={{ color: "#0f172a" }}>
                {option}
              </option>
            ))}
            <option value="Other" style={{ color: "#0f172a" }}>
              Other
            </option>
          </select>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Description *</label>
          <textarea
            name="description"
            value={form.description}
            onChange={handleChange}
            required
            rows={4}
            style={inputStyle}
            placeholder="Tell us what you need done"
          />
        </div>

        <div style={{ marginBottom: 18 }}>
          <label style={labelStyle}>Photo upload (optional)</label>
          <input type="file" accept="image/*" onChange={handlePhotoChange} style={inputStyle} />
          {form.photoDataUrl && (
            <div style={{ marginTop: 10 }}>
              <img
                src={form.photoDataUrl}
                alt="Uploaded preview"
                style={{ maxWidth: 200, borderRadius: 8, border: "1px solid rgba(255,255,255,0.3)" }}
              />
            </div>
          )}
        </div>

        <TurnstileField onToken={setTurnstileToken} resetKey={turnstileResetKey} />

        <button
          type="submit"
          disabled={loading}
          aria-live="polite"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            width: "100%",
            padding: "12px 14px",
            borderRadius: 8,
            border: "none",
            background: submitBackground,
            color: submitTextColor,
            fontWeight: 800,
            fontSize: 14,
            cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.65 : 1,
            transition: "background 0.2s ease, color 0.2s ease, opacity 0.2s ease",
          }}
        >
          {submitIcon}
          {submitLabel}
        </button>
      </form>
    </div>
  );
}
