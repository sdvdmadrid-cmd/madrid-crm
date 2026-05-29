"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiFetch, getJsonOrThrow } from "@/lib/client-auth";
import {
  formatClientPickerLabel,
  formatClientSearchOption,
} from "@/lib/client-search";
import css from "./client-search.module.css";

const DEBOUNCE_MS = 180;
const MIN_QUERY_LENGTH = 1;

function SearchIcon() {
  return (
    <svg
      className={css.icon}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3-3" />
    </svg>
  );
}

/**
 * Reusable tenant-scoped client search autocomplete.
 * Use on Clients, estimates, invoices, jobs, calendar, lead conversion, etc.
 *
 * @param {object} props
 * @param {(client: object) => void} props.onSelect
 * @param {string} [props.placeholder]
 * @param {boolean} [props.autoFocus]
 * @param {boolean} [props.clearOnSelect=true]
 * @param {number} [props.limit=12]
 * @param {string} [props.className]
 * @param {string} [props.inputClassName]
 * @param {string} [props.value] controlled input text
 * @param {(value: string) => void} [props.onValueChange]
 * @param {() => void} [props.onClear]
 * @param {"dark"|"light"} [props.variant="dark"]
 * @param {boolean} [props.showHint=true]
 */
export default function ClientSearchAutocomplete({
  onSelect,
  placeholder,
  autoFocus = false,
  clearOnSelect = true,
  limit = 12,
  className = "",
  inputClassName = "",
  disabled = false,
  value: controlledValue,
  onValueChange,
  onClear,
  variant = "dark",
  showHint = true,
}) {
  const { t } = useTranslation();
  const listId = useId();
  const inputRef = useRef(null);
  const containerRef = useRef(null);
  const debounceRef = useRef(null);
  const requestSeq = useRef(0);

  const [internalQuery, setInternalQuery] = useState("");
  const isControlled = onValueChange != null;
  const query = isControlled ? String(controlledValue ?? "") : internalQuery;

  const setQuery = useCallback(
    (next) => {
      const value = typeof next === "function" ? next(query) : next;
      if (isControlled) {
        onValueChange(value);
      } else {
        setInternalQuery(value);
      }
    },
    [isControlled, onValueChange, query],
  );
  const [options, setOptions] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [error, setError] = useState("");

  const closeList = useCallback(() => {
    setOpen(false);
    setActiveIndex(-1);
  }, []);

  const runSearch = useCallback(
    async (value) => {
      const trimmed = String(value || "").trim();
      if (trimmed.length < MIN_QUERY_LENGTH) {
        setOptions([]);
        setLoading(false);
        setError("");
        closeList();
        return;
      }

      const seq = ++requestSeq.current;
      setLoading(true);
      setError("");

      try {
        const params = new URLSearchParams({
          q: trimmed,
          limit: String(limit),
        });
        const res = await apiFetch(`/api/clients/search?${params.toString()}`, {
          cache: "no-store",
        });
        const json = await getJsonOrThrow(
          res,
          t("clients.search.errors.fetch"),
        );

        if (seq !== requestSeq.current) return;

        const rows = Array.isArray(json.data) ? json.data : [];
        const formatted = rows.map((client) => formatClientSearchOption(client));
        setOptions(formatted);
        setOpen(formatted.length > 0 || trimmed.length > 0);
        setActiveIndex(-1);
      } catch (err) {
        if (seq !== requestSeq.current) return;
        setOptions([]);
        setError(err.message || t("clients.search.errors.fetch"));
        setOpen(true);
      } finally {
        if (seq === requestSeq.current) {
          setLoading(false);
        }
      }
    },
    [closeList, limit, t],
  );

  useEffect(() => {
    clearTimeout(debounceRef.current);

    if (!query.trim()) {
      setOptions([]);
      setLoading(false);
      closeList();
      return;
    }

    debounceRef.current = setTimeout(() => {
      runSearch(query);
    }, DEBOUNCE_MS);

    return () => clearTimeout(debounceRef.current);
  }, [query, runSearch, closeList]);

  useEffect(() => {
    function handlePointerDown(event) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target)
      ) {
        closeList();
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, [closeList]);

  const pickOption = useCallback(
    (option) => {
      if (!option?.client) return;
      onSelect?.(option.client);
      if (clearOnSelect) {
        setQuery("");
        setOptions([]);
      } else {
        setQuery(formatClientPickerLabel(option.client));
        setOptions([]);
      }
      closeList();
      inputRef.current?.blur();
    },
    [clearOnSelect, closeList, onSelect],
  );

  const handleKeyDown = (event) => {
    if (event.key === "Escape") {
      closeList();
      return;
    }

    if (!open) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (options.length === 0) return;
      setActiveIndex((index) =>
        index < options.length - 1 ? index + 1 : 0,
      );
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (options.length === 0) return;
      setActiveIndex((index) =>
        index > 0 ? index - 1 : options.length - 1,
      );
      return;
    }

    if (event.key === "Enter") {
      if (activeIndex >= 0 && options[activeIndex]) {
        event.preventDefault();
        pickOption(options[activeIndex]);
      } else if (options.length === 1) {
        event.preventDefault();
        pickOption(options[0]);
      }
    }
  };

  const showList = open && (loading || options.length > 0 || error || query.trim());
  const activeOptionId =
    activeIndex >= 0 && options[activeIndex]
      ? `${listId}-option-${activeIndex}`
      : undefined;

  const wrapClass =
    variant === "light" ? `${css.wrap} ${css.wrapLight}` : css.wrap;

  return (
    <div ref={containerRef} className={`${wrapClass} ${className}`.trim()}>
      <SearchIcon />
      <input
        ref={inputRef}
        type="search"
        enterKeyHint="search"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls={showList ? listId : undefined}
        aria-activedescendant={activeOptionId}
        aria-label={t("clients.search.label")}
        disabled={disabled}
        autoFocus={autoFocus}
        placeholder={placeholder || t("clients.search.placeholder")}
        className={`${css.input} ${inputClassName}`.trim()}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          if (event.target.value.trim()) {
            setOpen(true);
          }
        }}
        onFocus={() => {
          if (options.length > 0 || query.trim()) {
            setOpen(true);
          }
        }}
        onKeyDown={handleKeyDown}
      />

      {loading ? <span className={css.spinner} aria-hidden="true" /> : null}

      {!loading && query ? (
        <button
          type="button"
          className={css.clearBtn}
          aria-label={t("clients.search.clear")}
          onClick={() => {
            setQuery("");
            setOptions([]);
            onClear?.();
            closeList();
            inputRef.current?.focus();
          }}
        >
          ×
        </button>
      ) : null}

      {showList ? (
        <ul id={listId} className={css.list} role="listbox">
          {loading && options.length === 0 ? (
            <li className={css.empty} role="presentation">
              {t("clients.search.searching")}
            </li>
          ) : null}

          {!loading && error ? (
            <li className={css.empty} role="presentation">
              {error}
            </li>
          ) : null}

          {!loading && !error && options.length === 0 && query.trim() ? (
            <li className={css.empty} role="presentation">
              {t("clients.search.noResults")}
            </li>
          ) : null}

          {options.map((option, index) => (
            <li key={option.id} role="presentation">
              <button
                type="button"
                id={`${listId}-option-${index}`}
                role="option"
                aria-selected={index === activeIndex}
                className={`${css.option} ${index === activeIndex ? css.optionActive : ""}`}
                onMouseEnter={() => setActiveIndex(index)}
                onMouseDown={(event) => {
                  event.preventDefault();
                  pickOption(option);
                }}
              >
                <div className={css.optionName}>{option.name}</div>
                {option.subtitle ? (
                  <div className={css.optionMeta}>{option.subtitle}</div>
                ) : null}
                {option.location &&
                option.location !== option.subtitle &&
                !String(option.name || "")
                  .toLowerCase()
                  .includes(option.location.toLowerCase().slice(0, 24)) ? (
                  <div className={css.optionMeta}>{option.location}</div>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {showHint ? (
        <p className={css.hint}>{t("clients.search.hint")}</p>
      ) : null}
    </div>
  );
}
