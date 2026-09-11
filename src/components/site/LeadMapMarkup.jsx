"use client";

import { useCallback, useMemo, useState } from "react";
import {
  DrawingManager,
  GoogleMap,
  Marker,
  Rectangle,
  useJsApiLoader,
} from "@react-google-maps/api";
import {
  approxAreaSqFtFromBounds,
  normalizeMapMarkup,
} from "@/lib/win-on-site-map";

const MAPS_KEY = String(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "").trim();
const DEFAULT_CENTER = { lat: 29.7604, lng: -95.3698 };
const LIBRARIES = ["drawing"];

const mapContainerStyle = {
  width: "100%",
  height: 280,
  borderRadius: 12,
  border: "1px solid #e2e8f0",
};

/**
 * Optional public lead map: click pin + draw rectangle for approximate area.
 * Renders nothing when NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is missing.
 */
export default function LeadMapMarkup({
  value = null,
  onChange,
  label = "Mark the work area on the map (optional)",
}) {
  const [drawMode, setDrawMode] = useState(false);
  const { isLoaded, loadError } = useJsApiLoader({
    id: "win-on-site-lead-map",
    googleMapsApiKey: MAPS_KEY,
    libraries: LIBRARIES,
  });

  const markup = useMemo(() => normalizeMapMarkup(value), [value]);
  const center = useMemo(() => {
    if (markup?.lat != null && markup?.lng != null) {
      return { lat: markup.lat, lng: markup.lng };
    }
    if (markup?.bounds) {
      return {
        lat: (markup.bounds.north + markup.bounds.south) / 2,
        lng: (markup.bounds.east + markup.bounds.west) / 2,
      };
    }
    return DEFAULT_CENTER;
  }, [markup]);

  const emit = useCallback(
    (next) => {
      onChange?.(normalizeMapMarkup(next));
    },
    [onChange],
  );

  const onMapClick = useCallback(
    (event) => {
      if (drawMode) return;
      const lat = event?.latLng?.lat?.();
      const lng = event?.latLng?.lng?.();
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      emit({
        ...(markup || {}),
        lat,
        lng,
        source: "lead-map-pin",
      });
    },
    [drawMode, emit, markup],
  );

  const onRectangleComplete = useCallback(
    (rect) => {
      try {
        const b = rect.getBounds();
        if (!b) return;
        const ne = b.getNorthEast();
        const sw = b.getSouthWest();
        const bounds = {
          north: ne.lat(),
          east: ne.lng(),
          south: sw.lat(),
          west: sw.lng(),
        };
        const areaSqFt = approxAreaSqFtFromBounds(bounds);
        emit({
          lat: (bounds.north + bounds.south) / 2,
          lng: (bounds.east + bounds.west) / 2,
          bounds,
          areaSqFt,
          source: "lead-map-rect",
        });
        setDrawMode(false);
        rect.setMap(null);
      } catch {
        setDrawMode(false);
      }
    },
    [emit],
  );

  if (!MAPS_KEY || loadError) return null;

  if (!isLoaded) {
    return (
      <div className="ps-field">
        <p className="ps-lead-sub" style={{ margin: 0 }}>
          Loading map…
        </p>
      </div>
    );
  }

  const rectangleBounds = markup?.bounds
    ? {
        north: markup.bounds.north,
        south: markup.bounds.south,
        east: markup.bounds.east,
        west: markup.bounds.west,
      }
    : null;

  return (
    <div className="ps-field" data-testid="lead-map-markup">
      <label className="ps-label">{label}</label>
      <p className="ps-lead-sub" style={{ marginTop: 0 }}>
        Tap the map to drop a pin. Draw an area if you want sq‑ft pricing from the contractor
        catalog.
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        <button
          type="button"
          className="ps-btn-secondary"
          onClick={() => setDrawMode(false)}
        >
          Place pin
        </button>
        <button
          type="button"
          className="ps-btn-secondary"
          onClick={() => setDrawMode(true)}
        >
          Draw area
        </button>
        {markup ? (
          <button type="button" className="ps-btn-secondary" onClick={() => emit(null)}>
            Clear
          </button>
        ) : null}
      </div>
      <GoogleMap
        mapContainerStyle={mapContainerStyle}
        center={center}
        zoom={markup?.bounds || markup?.lat != null ? 18 : 11}
        onClick={onMapClick}
        options={{
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          clickableIcons: false,
        }}
      >
        {markup?.lat != null && markup?.lng != null ? (
          <Marker position={{ lat: markup.lat, lng: markup.lng }} />
        ) : null}
        {rectangleBounds ? (
          <Rectangle
            bounds={rectangleBounds}
            options={{
              fillColor: "#0ea5e9",
              fillOpacity: 0.2,
              strokeColor: "#0284c7",
              strokeWeight: 2,
            }}
          />
        ) : null}
        {drawMode ? (
          <DrawingManager
            drawingMode="rectangle"
            onRectangleComplete={onRectangleComplete}
            options={{
              drawingControl: false,
              rectangleOptions: {
                fillColor: "#0ea5e9",
                fillOpacity: 0.25,
                strokeWeight: 2,
                editable: false,
              },
            }}
          />
        ) : null}
      </GoogleMap>
      {markup?.areaSqFt ? (
        <p className="ps-lead-sub" style={{ marginTop: 8 }}>
          Approx. area: <strong>{markup.areaSqFt.toLocaleString()} sq ft</strong>
        </p>
      ) : null}
    </div>
  );
}
