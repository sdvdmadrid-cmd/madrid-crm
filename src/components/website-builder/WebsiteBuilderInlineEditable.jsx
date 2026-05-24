"use client";

import styles from "./website-builder.module.css";

/**
 * Inline field on the visual preview — looks like live site text, edits on click.
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
  if (!onChange) {
    const Tag = asHeading ? "span" : "span";
    return (
      <Tag className={className}>{value || placeholder}</Tag>
    );
  }

  const shared = {
    className: `${styles.inlineEdit} ${asHeading ? styles.inlineEditHeading : ""} ${multiline ? styles.inlineEditMultiline : styles.inlineEditSingle} ${className}`,
    value: value || "",
    placeholder,
    maxLength,
    onChange: (e) => onChange(e.target.value),
    onClick: (e) => e.stopPropagation(),
    onKeyDown: (e) => e.stopPropagation(),
  };

  if (multiline) {
    return <textarea {...shared} rows={asHeading ? 2 : 4} />;
  }

  return <input type="text" {...shared} />;
}

export function PreviewSection({
  sectionId,
  label,
  editable,
  selected,
  onSelect,
  children,
  className = "",
}) {
  if (!editable) {
    return <div className={className}>{children}</div>;
  }

  return (
    <div
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
