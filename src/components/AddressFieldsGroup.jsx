"use client";

import dynamic from "next/dynamic";
import { US_STATE_OPTIONS } from "@/lib/estimate-pricing";

const PlacesAutocomplete = dynamic(
  () => import("@/components/PlacesAutocomplete"),
  { ssr: false },
);

/**
 * Reusable street + city/state/zip block with Google Places on line 1.
 */
export default function AddressFieldsGroup({
  street = "",
  city = "",
  state = "",
  zip = "",
  onStreetChange,
  onCityChange,
  onStateChange,
  onZipChange,
  onPlaceSelect,
  streetId = "address-street",
  streetPlaceholder = "123 Main St",
  inputClass = "",
  selectClass = "",
  disabled = false,
  showStateSelect = true,
}) {
  return (
    <>
      <PlacesAutocomplete
        id={streetId}
        value={street}
        selectedValueKey="street"
        onChange={onStreetChange}
        onSelect={(selection) => {
          onStreetChange?.(selection.street || "");
          onCityChange?.(selection.city || "");
          onStateChange?.(selection.state || "");
          onZipChange?.(selection.zip || "");
          onPlaceSelect?.(selection);
        }}
        placeholder={streetPlaceholder}
        inputClass={inputClass}
        disabled={disabled}
      />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: showStateSelect ? "1fr 100px 90px" : "1fr 90px",
          gap: 8,
        }}
      >
        <input
          className={inputClass}
          placeholder="City"
          value={city}
          disabled={disabled}
          onChange={(e) => onCityChange?.(e.target.value)}
        />
        {showStateSelect ? (
          <select
            className={selectClass || inputClass}
            value={state || "TX"}
            disabled={disabled}
            onChange={(e) => onStateChange?.(e.target.value)}
          >
            {US_STATE_OPTIONS.map((opt) => (
              <option key={opt.code} value={opt.code}>
                {opt.code}
              </option>
            ))}
          </select>
        ) : (
          <input
            className={inputClass}
            placeholder="State"
            value={state}
            disabled={disabled}
            onChange={(e) => onStateChange?.(e.target.value)}
          />
        )}
        <input
          className={inputClass}
          placeholder="ZIP"
          value={zip}
          disabled={disabled}
          onChange={(e) => onZipChange?.(e.target.value)}
        />
      </div>
    </>
  );
}
