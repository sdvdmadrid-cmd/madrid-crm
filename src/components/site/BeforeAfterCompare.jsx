"use client";

import { useCallback, useRef, useState } from "react";

export default function BeforeAfterCompare({
  beforeSrc,
  afterSrc,
  beforeLabel = "Before",
  afterLabel = "After",
}) {
  const [pct, setPct] = useState(50);
  const dragging = useRef(false);
  const containerRef = useRef(null);

  const updateFromClientX = useCallback((clientX) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect?.width) return;
    const next = ((clientX - rect.left) / rect.width) * 100;
    setPct(Math.min(98, Math.max(2, next)));
  }, []);

  const onPointerDown = (e) => {
    dragging.current = true;
    updateFromClientX(e.clientX);
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e) => {
    if (!dragging.current) return;
    updateFromClientX(e.clientX);
  };

  const onPointerUp = (e) => {
    dragging.current = false;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  };

  if (!beforeSrc || !afterSrc) return null;

  return (
    <div className="ps-before-after-block">
      <div
        ref={containerRef}
        className="ps-before-after"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        role="slider"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Before and after comparison"
      >
        <img src={afterSrc} alt={afterLabel} draggable={false} />
        <img
          src={beforeSrc}
          alt={beforeLabel}
          draggable={false}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            clipPath: `inset(0 ${100 - pct}% 0 0)`,
          }}
        />
        <div className="ps-before-after-handle" style={{ left: `${pct}%` }} />
      </div>
      <div className="ps-before-after-labels">
        <span>{beforeLabel}</span>
        <span>{afterLabel}</span>
      </div>
    </div>
  );
}
