"use client";

import { useEffect, useRef } from "react";

function getPoint(event, canvas) {
  const rect = canvas.getBoundingClientRect();
  const source = event.touches?.[0] || event.changedTouches?.[0] || event;
  const scaleX = canvas.width / Math.max(rect.width, 1);
  const scaleY = canvas.height / Math.max(rect.height, 1);
  return {
    x: (source.clientX - rect.left) * scaleX,
    y: (source.clientY - rect.top) * scaleY,
  };
}

export default function SignaturePad({
  value,
  onChange,
  label,
  clearLabel,
}) {
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = 2.2;
    context.strokeStyle = "#0f172a";

    context.clearRect(0, 0, canvas.width, canvas.height);
    if (!value) return;

    const image = new Image();
    image.onload = () => {
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
    };
    image.src = value;
  }, [value]);

  const sync = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    onChange(canvas.toDataURL("image/png"));
  };

  const start = (event) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    event.preventDefault();
    drawingRef.current = true;
    lastPointRef.current = getPoint(event, canvas);
  };

  const move = (event) => {
    const canvas = canvasRef.current;
    if (!canvas || !drawingRef.current) return;
    event.preventDefault();
    const context = canvas.getContext("2d");
    const nextPoint = getPoint(event, canvas);
    const lastPoint = lastPointRef.current || nextPoint;
    context.beginPath();
    context.moveTo(lastPoint.x, lastPoint.y);
    context.lineTo(nextPoint.x, nextPoint.y);
    context.stroke();
    lastPointRef.current = nextPoint;
  };

  const end = (event) => {
    if (!drawingRef.current) return;
    event?.preventDefault?.();
    drawingRef.current = false;
    lastPointRef.current = null;
    sync();
  };

  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    context.clearRect(0, 0, canvas.width, canvas.height);
    onChange("");
  };

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 600, color: "#334155" }}>
          {label}
        </div>
        <button
          type="button"
          onClick={clear}
          style={{
            padding: "6px 10px",
            borderRadius: 8,
            border: "1px solid #cbd5e1",
            background: "white",
            color: "#475569",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          {clearLabel}
        </button>
      </div>
      <canvas
        ref={canvasRef}
        width={640}
        height={180}
        onMouseDown={start}
        onMouseMove={move}
        onMouseUp={end}
        onMouseLeave={end}
        onTouchStart={start}
        onTouchMove={move}
        onTouchEnd={end}
        style={{
          width: "100%",
          height: 180,
          borderRadius: 10,
          border: "1.5px dashed #94a3b8",
          background: "white",
          touchAction: "none",
        }}
      />
    </div>
  );
}
