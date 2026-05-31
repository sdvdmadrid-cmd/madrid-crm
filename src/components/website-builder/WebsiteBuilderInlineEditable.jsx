"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import styles from "./website-builder.module.css";
import { useWebsiteBuilderEditingRef } from "./WebsiteBuilderEditContext";

function autoResizeTextarea(el) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${Math.max(el.scrollHeight, 48)}px`;
}

/**
 * Inline field on the visual preview — local draft while typing to avoid lag / one-char bugs.
 */
export function InlineEditable({
  value,
  onChange,
  multiline = false,
  className = "",
  placeholder = "",
  maxLength = 500,
  asHeading = false,
}) {
  const editingRef = useWebsiteBuilderEditingRef();
  const [draft, setDraft] = useState(() => String(value || ""));
  const inputRef = useRef(null);
  const focusedRef = useRef(false);

  useEffect(() => {
    if (!focusedRef.current) {
      setDraft(String(value || ""));
    }
  }, [value]);

  const commit = useCallback(
    (next) => {
      const trimmed = String(next || "").slice(0, maxLength);
      onChange?.(trimmed);
    },
    [onChange, maxLength],
  );

  const handleFocus = () => {
    focusedRef.current = true;
    if (editingRef) editingRef.current = true;
  };

  const handleBlur = () => {
    focusedRef.current = false;
    if (editingRef) editingRef.current = false;
    commit(draft);
  };

  useLayoutEffect(() => {
    if (multiline && inputRef.current) {
      autoResizeTextarea(inputRef.current);
    }
  }, [draft, multiline]);

  if (!onChange) {
    return <span className={className}>{value || placeholder}</span>;
  }

  const sharedClass = `${styles.inlineEdit} ${asHeading ? styles.inlineEditHeading : ""} ${multiline ? styles.inlineEditMultiline : styles.inlineEditSingle} ${className}`;

  if (multiline) {
    return (
      <textarea
        ref={inputRef}
        className={sharedClass}
        value={draft}
        placeholder={placeholder}
        maxLength={maxLength}
        rows={asHeading ? 2 : 3}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onChange={(e) => {
          setDraft(e.target.value);
          autoResizeTextarea(e.target);
        }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      />
    );
  }

  return (
    <input
      ref={inputRef}
      type="text"
      className={sharedClass}
      value={draft}
      placeholder={placeholder}
      maxLength={maxLength}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onChange={(e) => setDraft(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    />
  );
}

const PREVIEW_ANCHOR_IDS = {
  hero: "home",
  gallery: "gallery",
  trust: "reviews",
};

export function PreviewSection({
  sectionId,
  label,
  editable,
  selected,
  onSelect,
  children,
  className = "",
}) {
  const anchorId = PREVIEW_ANCHOR_IDS[sectionId] || sectionId;

  if (!editable) {
    return (
      <div id={anchorId} className={className}>
        {children}
      </div>
    );
  }

  return (
    <div
      id={anchorId}
      role="button"
      tabIndex={0}
      className={`${styles.previewSection} ${selected ? styles.previewSectionSelected : ""} ${className}`}
      data-section={sectionId}
      onClick={(e) => {
        e.stopPropagation();
        onSelect?.(sectionId);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect?.(sectionId);
        }
      }}
    >
      <div className={styles.previewSectionLabel}>{label}</div>
      {children}
    </div>
  );
}
