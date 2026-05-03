"use client";

import { useState } from "react";

export default function ContactForm({ slug, companyName, phone, theme }) {
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    addressLine1: "",
    city: "",
    state: "",
    zipCode: "",
    description: "",
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
        const json = await res.json();
        throw new Error(json.error || "Failed to submit");
      }

      setSuccess(true);
      setForm({
        name: "",
        email: "",
        phone: "",
        addressLine1: "",
        city: "",
        state: "",
        zipCode: "",
        description: "",
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

  return (
    <div style={{ maxWidth: 520, margin: "0 auto", width: "100%" }}>
      {success && (
        <div style={{
          background: "rgba(16, 185, 129, 0.1)",
          color: "#047857",
          padding: "14px 16px",
          borderRadius: 8,
          marginBottom: 16,
          fontSize: 14,
          fontWeight: 500,
        }}>
          ✓ Thank you! We'll be in touch soon.
        </div>
      )}

      {error && (
        <div style={{
          background: "rgba(239, 68, 68, 0.1)",
          color: "#991b1b",
          padding: "14px 16px",
          borderRadius: 8,
          marginBottom: 16,
          fontSize: 14,
        }}>
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
        <input
          type="hidden"
          name="formStartedAt"
          value={form.formStartedAt}
          readOnly
        />
        <div style={{ marginBottom: 16 }}>
          <label style={{
            display: "block",
            fontSize: 14,
            fontWeight: 600,
            marginBottom: 6,
            color: "rgba(255,255,255,0.9)",
          }}>
            Name *
          </label>
          <input
            type="text"
            name="name"
            value={form.name}
            onChange={handleChange}
            required
            style={{
              width: "100%",
              padding: "10px 12px",
              border: "1px solid rgba(255,255,255,0.3)",
              borderRadius: 6,
              fontSize: 14,
              background: "rgba(255,255,255,0.05)",
              color: "#fff",
              boxSizing: "border-box",
            }}
            placeholder="Your name"
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{
            display: "block",
            fontSize: 14,
            fontWeight: 600,
            marginBottom: 6,
            color: "rgba(255,255,255,0.9)",
          }}>
            Email *
          </label>
          <input
            type="email"
            name="email"
            value={form.email}
            onChange={handleChange}
            required
            style={{
              width: "100%",
              padding: "10px 12px",
              border: "1px solid rgba(255,255,255,0.3)",
              borderRadius: 6,
              fontSize: 14,
              background: "rgba(255,255,255,0.05)",
              color: "#fff",
              boxSizing: "border-box",
            }}
            placeholder="your@email.com"
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{
            display: "block",
            fontSize: 14,
            fontWeight: 600,
            marginBottom: 6,
            color: "rgba(255,255,255,0.9)",
          }}>
            Phone
          </label>
          <input
            type="tel"
            name="phone"
            value={form.phone}
            onChange={handleChange}
            style={{
              width: "100%",
              padding: "10px 12px",
              border: "1px solid rgba(255,255,255,0.3)",
              borderRadius: 6,
              fontSize: 14,
              background: "rgba(255,255,255,0.05)",
              color: "#fff",
              boxSizing: "border-box",
            }}
            placeholder="(555) 123-4567"
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{
            display: "block",
            fontSize: 14,
            fontWeight: 600,
            marginBottom: 6,
            color: "rgba(255,255,255,0.9)",
          }}>
            Street Address *
          </label>
          <input
            type="text"
            name="addressLine1"
            value={form.addressLine1}
            onChange={handleChange}
            required
            style={{
              width: "100%",
              padding: "10px 12px",
              border: "1px solid rgba(255,255,255,0.3)",
              borderRadius: 6,
              fontSize: 14,
              background: "rgba(255,255,255,0.05)",
              color: "#fff",
              boxSizing: "border-box",
            }}
            placeholder="123 Main St"
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
          <div>
            <label style={{
              display: "block",
              fontSize: 14,
              fontWeight: 600,
              marginBottom: 6,
              color: "rgba(255,255,255,0.9)",
            }}>
              City *
            </label>
            <input
              type="text"
              name="city"
              value={form.city}
              onChange={handleChange}
              required
              style={{
                width: "100%",
                padding: "10px 12px",
                border: "1px solid rgba(255,255,255,0.3)",
                borderRadius: 6,
                fontSize: 14,
                background: "rgba(255,255,255,0.05)",
                color: "#fff",
                boxSizing: "border-box",
              }}
              placeholder="Los Angeles"
            />
          </div>
          <div>
            <label style={{
              display: "block",
              fontSize: 14,
              fontWeight: 600,
              marginBottom: 6,
              color: "rgba(255,255,255,0.9)",
            }}>
              State *
            </label>
            <input
              type="text"
              name="state"
              value={form.state}
              onChange={handleChange}
              required
              maxLength={20}
              style={{
                width: "100%",
                padding: "10px 12px",
                border: "1px solid rgba(255,255,255,0.3)",
                borderRadius: 6,
                fontSize: 14,
                background: "rgba(255,255,255,0.05)",
                color: "#fff",
                boxSizing: "border-box",
              }}
              placeholder="CA"
            />
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div>
            <label style={{
              display: "block",
              fontSize: 14,
              fontWeight: 600,
              marginBottom: 6,
              color: "rgba(255,255,255,0.9)",
            }}>
              ZIP Code *
            </label>
            <input
              type="text"
              name="zipCode"
              value={form.zipCode}
              onChange={handleChange}
              required
              style={{
                width: "100%",
                padding: "10px 12px",
                border: "1px solid rgba(255,255,255,0.3)",
                borderRadius: 6,
                fontSize: 14,
                background: "rgba(255,255,255,0.05)",
                color: "#fff",
                boxSizing: "border-box",
              }}
              placeholder="90210"
            />
          </div>
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{
            display: "block",
            fontSize: 14,
            fontWeight: 600,
            marginBottom: 6,
            color: "rgba(255,255,255,0.9)",
          }}>
            Project Description *
          </label>
          <textarea
            name="description"
            value={form.description}
            onChange={handleChange}
            required
            rows={4}
            style={{
              width: "100%",
              padding: "10px 12px",
              border: "1px solid rgba(255,255,255,0.3)",
              borderRadius: 6,
              fontSize: 14,
              background: "rgba(255,255,255,0.05)",
              color: "#fff",
              boxSizing: "border-box",
              fontFamily: "inherit",
            }}
            placeholder="Tell us about your project..."
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          style={{
            width: "100%",
            background: "#fff",
            color: theme,
            border: "none",
            borderRadius: 999,
            padding: "12px 24px",
            fontWeight: 700,
            fontSize: 15,
            cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? "Sending..." : "Get Your Free Quote"}
        </button>
      </form>
    </div>
  );
}
