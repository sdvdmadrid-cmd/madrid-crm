"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import styles from "./DocumentStyleEditor.module.css";

/**
 * Large document-style textarea for long-form scope, proposals, and notes.
 * UI-only: plain text value/onChange — no business logic.
 */
export default function DocumentStyleEditor({
  value = "",
  onChange,
  placeholder = "",
  label = "",
  id,
  disabled = false,
  readOnly = false,
  minHeight = 760,
  toolbar = null,
  "data-testid": testId,
}) {
  const textareaRef = useRef(null);
  const [focusMode, setFocusMode] = useState(false);
  const autoId = useId();
  const fieldId = id || autoId;

  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el || focusMode) return;
    el.style.height = "auto";
    const next = Math.max(minHeight, el.scrollHeight);
    el.style.height = `${next}px`;
  }, [focusMode, minHeight]);

  useEffect(() => {
    adjustHeight();
  }, [value, adjustHeight]);

  useEffect(() => {
    if (!focusMode) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event) => {
      if (event.key === "Escape") setFocusMode(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [focusMode]);

  const handleChange = (event) => {
    onChange?.(event.target.value);
  };

  return (
    <div
      className={`${styles.root} ${focusMode ? styles.rootFocus : ""}`}
      data-document-editor="true"
    >
      <div className={styles.toolbar}>
        {label ? (
          <label htmlFor={fieldId} className={styles.label}>
            {label}
          </label>
        ) : (
          <span />
        )}
        <div className={styles.toolbarActions}>
          {toolbar}
          {!readOnly && !disabled ? (
            <>
              {focusMode ? (
                <button
                  type="button"
                  className={styles.focusExit}
                  onClick={() => setFocusMode(false)}
                >
                  Exit focus
                </button>
              ) : (
                <button
                  type="button"
                  className={styles.focusBtn}
                  onClick={() => setFocusMode(true)}
                >
                  Focus writing
                </button>
              )}
            </>
          ) : null}
        </div>
      </div>

      <div className={styles.paper}>
        <textarea
          ref={textareaRef}
          id={fieldId}
          value={value}
          onChange={handleChange}
          onInput={adjustHeight}
          placeholder={placeholder}
          disabled={disabled}
          readOnly={readOnly}
          className={styles.textarea}
          style={{ minHeight: `${minHeight}px` }}
          data-doc-editor-canvas="true"
          data-testid={testId}
        />
      </div>
    </div>
  );
}
