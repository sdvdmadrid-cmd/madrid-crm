"use client";

import { useRef, useState } from "react";
import styles from "./website-builder.module.css";

const MAX_IMAGE_SIZE = 3 * 1024 * 1024;

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Failed to read image"));
    reader.readAsDataURL(file);
  });
}

export default function HeroImageEditor({
  slots,
  imagePresets,
  imageStyle,
  onImageStyleChange,
  onSlotsChange,
  onGenerateSlot,
  generatingSlotId,
  labels,
}) {
  const fileRefs = useRef({});
  const [dragOverId, setDragOverId] = useState(null);

  const updateSlot = (index, patch) => {
    const next = slots.map((slot, i) => (i === index ? { ...slot, ...patch } : slot));
    onSlotsChange(next);
  };

  const moveSlot = (from, to) => {
    if (to < 0 || to >= slots.length) return;
    const next = [...slots];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onSlotsChange(next);
  };

  const handleUpload = async (index, file) => {
    if (!file?.type?.startsWith("image/")) return;
    if (file.size > MAX_IMAGE_SIZE) throw new Error("Image must be 3MB or smaller");
    const src = await readFileAsDataUrl(file);
    updateSlot(index, { src, alt: file.name.replace(/\.[^.]+$/, "").slice(0, 160) });
  };

  const onDrop = async (index, event) => {
    event.preventDefault();
    setDragOverId(null);
    const file = event.dataTransfer?.files?.[0];
    if (!file) return;
    try {
      await handleUpload(index, file);
    } catch (err) {
      alert(err.message || "Upload failed");
    }
  };

  return (
    <div className={styles.heroEditor}>
      <div className={styles.field}>
        <label className={styles.label}>{labels.imageStyleLabel}</label>
        <select
          className={styles.select}
          value={imageStyle}
          onChange={(e) => onImageStyleChange(e.target.value)}
        >
          <option value="realistic">Realistic</option>
          <option value="bright">Bright &amp; clean</option>
          <option value="dramatic">Dramatic</option>
        </select>
      </div>

      <div className={styles.heroGrid}>
        {slots.map((slot, index) => {
          const isGenerating = generatingSlotId === slot.id;
          return (
            <div
              key={slot.id}
              className={`${styles.heroCard} ${dragOverId === slot.id ? styles.heroCardDrag : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverId(slot.id);
              }}
              onDragLeave={() => setDragOverId(null)}
              onDrop={(e) => onDrop(index, e)}
            >
              <div className={styles.heroCardMedia}>
                {slot.src ? (
                  <img src={slot.src} alt={slot.alt || ""} className={styles.heroCardImg} />
                ) : (
                  <div className={styles.heroCardEmpty}>
                    <span>{labels.dropHint}</span>
                  </div>
                )}
                {isGenerating ? <div className={styles.heroCardOverlay}>{labels.generating}</div> : null}
              </div>

              <input
                className={styles.input}
                value={slot.prompt || ""}
                placeholder={labels.promptPlaceholder}
                onChange={(e) => updateSlot(index, { prompt: e.target.value.slice(0, 320) })}
              />

              <div className={styles.heroCardActions}>
                <button
                  type="button"
                  className={styles.chipGen}
                  disabled={Boolean(generatingSlotId)}
                  onClick={() => onGenerateSlot(index)}
                >
                  {isGenerating ? "…" : labels.regenerate}
                </button>
                <button
                  type="button"
                  className={styles.chip}
                  onClick={() => fileRefs.current[slot.id]?.click()}
                >
                  {labels.upload}
                </button>
                {index > 0 ? (
                  <button type="button" className={styles.chip} onClick={() => moveSlot(index, index - 1)}>
                    ↑
                  </button>
                ) : null}
                {index < slots.length - 1 ? (
                  <button type="button" className={styles.chip} onClick={() => moveSlot(index, index + 1)}>
                    ↓
                  </button>
                ) : null}
                {slot.src ? (
                  <button
                    type="button"
                    className={styles.linkDanger}
                    onClick={() => updateSlot(index, { src: "" })}
                  >
                    {labels.remove}
                  </button>
                ) : null}
              </div>

              <input
                ref={(el) => {
                  fileRefs.current[slot.id] = el;
                }}
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  try {
                    await handleUpload(index, file);
                  } catch (err) {
                    alert(err.message || "Upload failed");
                  }
                }}
              />

              {imagePresets?.[index] ? (
                <button
                  type="button"
                  className={styles.chip}
                  style={{ marginTop: 6, width: "100%" }}
                  onClick={() => updateSlot(index, { prompt: imagePresets[index] })}
                >
                  {labels.usePreset}
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
