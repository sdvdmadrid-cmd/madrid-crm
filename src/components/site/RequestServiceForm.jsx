"use client";

import { useState } from "react";

const MAX_IMAGE_SIZE = 4 * 1024 * 1024;

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

export default function RequestServiceForm({ slug, serviceOptions = [] }) {
  const [form, setForm] = useState({
    name: "",
    phone: "",
    address: "",
    serviceNeeded: serviceOptions[0] || "",
    description: "",
    photoDataUrl: "",
    website: "",
    formStartedAt: String(Date.now()),
  });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

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

    try {
      const res = await fetch(`/api/site/${slug}/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Failed to submit");
      }

      setSuccess(true);
      setForm({
        name: "",
        phone: "",
        address: "",
        serviceNeeded: serviceOptions[0] || "",
        description: "",
        photoDataUrl: "",
        website: "",
        formStartedAt: String(Date.now()),
      });
      setTimeout(() => setSuccess(false), 5000);
    } catch (err) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

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
      {success && (
        <div
          style={{
            background: "rgba(16, 185, 129, 0.12)",
            color: "#065f46",
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
            background: "rgba(239, 68, 68, 0.12)",
            color: "#991b1b",
            padding: "14px 16px",
            borderRadius: 8,
            marginBottom: 16,
            fontSize: 14,
          }}
        >
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
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

        <button
          type="submit"
          disabled={loading}
          style={{
            width: "100%",
            padding: "12px 14px",
            borderRadius: 8,
            border: "none",
            background: "#fff",
            color: "#0f172a",
            fontWeight: 800,
            fontSize: 14,
            cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.65 : 1,
          }}
        >
          {loading ? "Submitting..." : "Request Service"}
        </button>
      </form>
    </div>
  );
}
