"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/client-auth";

/**
 * PlacesAutocomplete
 *
 * Lightweight Google Places address typeahead for Address Line 1.
 * The API key stays on the server — all requests go through
 * /api/places/autocomplete and /api/places/details.
 *
 * Props:
 *   value        {string}   - Controlled input value (street only)
 *   onChange     {Function} - Called with the street string while typing / after select
 *   onSelect     {Function} - Called with { street, city, state, zip, formattedAddress,
 *                             latitude, longitude, placeId }
 *                             after a suggestion is picked and details resolved
 *   selectedValueKey {string} - Which value should be written into the input after
 *                               selection: "street" (default) or "formattedAddress"
 *   placeholder  {string}
 *   inputStyle   {object}   - Inline styles forwarded to the <input>
 *   inputClass   {string}   - className forwarded to the <input>
 *   disabled     {boolean}
 */
export default function PlacesAutocomplete({
  id,
  value = "",
  onChange,
  onSelect,
  selectedValueKey = "street",
  placeholder = "123 Main St, City, TX",
  inputStyle,
  inputClass,
  disabled = false,
}) {
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [configError, setConfigError] = useState("");

  const debounceRef = useRef(null);
  const containerRef = useRef(null);
  const inputRef = useRef(null);
  // Tracks the last fetched query so stale responses are dropped
  const lastQueryRef = useRef("");

  // ── Fetch suggestions (debounced) ────────────────────────────────────────
  useEffect(() => {
    clearTimeout(debounceRef.current);

    if (!value || value.length < 3) {
      setSuggestions([]);
      setOpen(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      const query = value.trim();
      lastQueryRef.current = query;
      setLoading(true);

      try {
        const res = await apiFetch(
          `/api/places/autocomplete?input=${encodeURIComponent(query)}`,
          { suppressUnauthorizedEvent: true },
        );
        const data = await res.json();

        // Drop stale response if the user has typed further
        if (lastQueryRef.current !== query) return;

        if (res.status === 503 || data.error === "Places API not configured") {
          setConfigError("Address lookup is not configured on the server.");
          setSuggestions([]);
          setOpen(false);
          return;
        }

        setConfigError("");

        if (
          data.success &&
          Array.isArray(data.predictions) &&
          data.predictions.length > 0
        ) {
          setSuggestions(data.predictions);
          setActiveIndex(-1);
          setOpen(true);
        } else {
          setSuggestions([]);
          setOpen(false);
        }
      } catch {
        setSuggestions([]);
        setOpen(false);
      } finally {
        setLoading(false);
      }
    }, 280);

    return () => clearTimeout(debounceRef.current);
  }, [value]);

  // ── Close dropdown when clicking outside ─────────────────────────────────
  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // ── Keyboard navigation ───────────────────────────────────────────────────
  function handleKeyDown(e) {
    if (!open || suggestions.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      handleSelect(suggestions[activeIndex]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  async function handleSelect(prediction) {
    // Instantly show partial result in the input so the UI feels snappy
    onChange?.(prediction.mainText);
    setSuggestions([]);
    setOpen(false);
    setActiveIndex(-1);
    inputRef.current?.focus();

    // Fetch structured details (city / state / zip) from the server proxy
    setLoading(true);
    try {
      const res = await apiFetch(
        `/api/places/details?placeId=${encodeURIComponent(prediction.placeId)}`,
        { suppressUnauthorizedEvent: true },
      );
      const data = await res.json();
      if (data.success) {
        const street = data.street || prediction.mainText;
        const formattedAddress =
          data.formattedAddress || prediction.description || street;
        const selectedValue =
          selectedValueKey === "formattedAddress" ? formattedAddress : street;

        onChange?.(selectedValue);
        onSelect?.({
          street,
          city: data.city || "",
          state: data.state || "",
          zip: data.zip || "",
          formattedAddress,
          latitude:
            typeof data.latitude === "number" ? data.latitude : null,
          longitude:
            typeof data.longitude === "number" ? data.longitude : null,
          placeId: prediction.placeId,
        });
      } else {
        const formattedAddress = prediction.description || prediction.mainText;
        const selectedValue =
          selectedValueKey === "formattedAddress"
            ? formattedAddress
            : prediction.mainText;
        onChange?.(selectedValue);
        onSelect?.({
          street: prediction.mainText,
          city: "",
          state: "",
          zip: "",
          formattedAddress,
          latitude: null,
          longitude: null,
          placeId: prediction.placeId,
        });
      }
    } catch {
      const formattedAddress = prediction.description || prediction.mainText;
      const selectedValue =
        selectedValueKey === "formattedAddress"
          ? formattedAddress
          : prediction.mainText;
      onChange?.(selectedValue);
      onSelect?.({
        street: prediction.mainText,
        city: "",
        state: "",
        zip: "",
        formattedAddress,
        latitude: null,
        longitude: null,
        placeId: prediction.placeId,
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div ref={containerRef} style={{ position: "relative", width: "100%" }}>
      {configError ? (
        <p style={{ margin: "0 0 6px", fontSize: 12, color: "#b45309" }}>{configError}</p>
      ) : null}

      <input
        id={id}
        ref={inputRef}
        type="text"
        autoComplete="off"
        className={inputClass}
        style={inputStyle}
        placeholder={placeholder}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange?.(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          if (suggestions.length > 0) setOpen(true);
        }}
        aria-autocomplete="list"
        aria-expanded={open}
        aria-haspopup="listbox"
        role="combobox"
      />

      {/* Loading indicator — tiny spinner inside the right edge */}
      {loading && (
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            right: 10,
            top: "50%",
            transform: "translateY(-50%)",
            width: 14,
            height: 14,
            border: "2px solid rgba(148,163,184,0.25)",
            borderTopColor: "#60a5fa",
            borderRadius: "50%",
            animation: "places-spin 0.65s linear infinite",
            pointerEvents: "none",
          }}
        />
      )}

      {/* Dropdown */}
      {open && suggestions.length > 0 && (
        <ul
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            zIndex: 9999,
            margin: 0,
            padding: "4px 0",
            listStyle: "none",
            background: "linear-gradient(165deg, rgba(36,44,60,0.98), rgba(18,24,36,0.98))",
            borderRadius: 12,
            border: "1px solid rgba(148,163,184,0.22)",
            boxShadow: "0 16px 40px rgba(0,0,0,0.45)",
            maxHeight: 260,
            overflowY: "auto",
          }}
        >
          {suggestions.map((prediction, idx) => (
            <li
              key={prediction.placeId}
              onMouseDown={(e) => {
                // mousedown fires before blur — prevent input losing focus first
                e.preventDefault();
                handleSelect(prediction);
              }}
              onMouseEnter={() => setActiveIndex(idx)}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 1,
                padding: "9px 14px",
                cursor: "pointer",
                background: idx === activeIndex ? "rgba(79,140,255,0.18)" : "transparent",
                transition: "background 0.1s",
              }}
            >
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "#f4f7fc",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {prediction.mainText}
              </span>
              {prediction.secondaryText && (
                <span
                  style={{
                    fontSize: 11,
                    color: "#8b9bb8",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {prediction.secondaryText}
                </span>
              )}
            </li>
          ))}

          {/* Google attribution required in Terms of Service */}
          <li
            aria-hidden="true"
            style={{
              padding: "6px 14px 4px",
              display: "flex",
              justifyContent: "flex-end",
            }}
          >
            <span style={{ fontSize: 10, color: "#cbd5e1" }}>
              Powered by Google
            </span>
          </li>
        </ul>
      )}

      {/* Inline spinner keyframe — injected once via a <style> tag */}
      <style>{`
        @keyframes places-spin {
          to { transform: translateY(-50%) rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
