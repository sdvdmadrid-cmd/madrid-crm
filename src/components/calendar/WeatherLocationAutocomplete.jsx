"use client";

import { useEffect, useRef, useState } from "react";

export default function WeatherLocationAutocomplete({
  value = "",
  onChange,
  onSelect,
  onApply,
  placeholder,
  inputClass,
  disabled = false,
}) {
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [loading, setLoading] = useState(false);

  const debounceRef = useRef(null);
  const containerRef = useRef(null);
  const lastQueryRef = useRef("");

  useEffect(() => {
    clearTimeout(debounceRef.current);

    if (!value || value.trim().length < 2) {
      setSuggestions([]);
      setOpen(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      const query = value.trim();
      lastQueryRef.current = query;
      setLoading(true);

      try {
        const response = await fetch(
          `/api/weather/location-autocomplete?input=${encodeURIComponent(query)}`,
          { credentials: "include" },
        );
        const payload = await response.json().catch(() => null);

        if (lastQueryRef.current !== query) return;

        if (response.ok && payload?.success && Array.isArray(payload.predictions)) {
          setSuggestions(payload.predictions);
          setOpen(payload.predictions.length > 0);
          setActiveIndex(-1);
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
    }, 220);

    return () => clearTimeout(debounceRef.current);
  }, [value]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectSuggestion = (suggestion) => {
    onChange?.(suggestion.normalizedLocation || suggestion.primaryText || "");
    onSelect?.(suggestion);
    setSuggestions([]);
    setOpen(false);
    setActiveIndex(-1);
  };

  const handleKeyDown = (event) => {
    if (!open || suggestions.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, suggestions.length - 1));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      if (activeIndex >= 0) {
        selectSuggestion(suggestions[activeIndex]);
      } else {
        // Select best match automatically on Enter
        selectSuggestion(suggestions[0]);
      }
      return;
    }

    if (event.key === "Escape") {
      setOpen(false);
    }
  };

  const handleInputKeyDown = (event) => {
    if (open && suggestions.length > 0) {
      handleKeyDown(event);
      return;
    }
    // No dropdown open — Enter fires apply
    if (event.key === "Enter") {
      event.preventDefault();
      onApply?.();
    }
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <input
        type="text"
        autoComplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-haspopup="listbox"
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        className={inputClass}
        onChange={(event) => onChange?.(event.target.value)}
        onFocus={() => {
          if (suggestions.length > 0) setOpen(true);
        }}
        onKeyDown={handleInputKeyDown}
      />

      {loading ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin rounded-full border-2 border-slate-200 border-t-slate-500"
        />
      ) : null}

      {open && suggestions.length > 0 ? (
        <ul className="absolute left-0 right-0 top-[calc(100%+4px)] z-[9999] m-0 max-h-64 list-none overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-[0_10px_30px_rgba(15,23,42,0.14)]">
          {suggestions.map((suggestion, index) => (
            <li
              key={suggestion.id}
              onMouseDown={(event) => {
                event.preventDefault();
                selectSuggestion(suggestion);
              }}
              onMouseEnter={() => setActiveIndex(index)}
              className={`cursor-pointer px-3 py-2 transition-colors ${index === activeIndex ? "bg-slate-100" : "bg-transparent"}`}
            >
              <div className="text-sm font-semibold text-slate-900">
                {suggestion.primaryText}
              </div>
              {suggestion.secondaryText ? (
                <div className="text-[11px] text-slate-500">
                  {suggestion.secondaryText}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}