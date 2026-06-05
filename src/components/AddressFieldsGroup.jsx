"use client";

import dynamic from "next/dynamic";
import { US_STATE_OPTIONS } from "@/lib/estimate-pricing";

const PlacesAutocomplete = dynamic(
  () => import("@/components/PlacesAutocomplete"),
  { ssr: false },
);

function LabeledControl({ id, label, labelClass, wrapperClass, children }) {
  if (!label) return children;
  return (
    <div className={wrapperClass || undefined}>
      <label className={labelClass || undefined} htmlFor={id}>
        {label}
      </label>
      {children}
    </div>
  );
}

/**
 * Reusable street + city/state/zip block with Google Places on line 1.
 * Optional labels for accessibility and translated forms.
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
  cityId,
  stateId,
  zipId,
  streetPlaceholder = "123 Main St",
  cityPlaceholder = "City",
  zipPlaceholder = "ZIP",
  streetLabel = "",
  cityLabel = "",
  stateLabel = "",
  zipLabel = "",
  labelClass = "",
  fieldWrapperClass = "",
  inputClass = "",
  selectClass = "",
  disabled = false,
  showStateSelect = true,
}) {
  const resolvedCityId = cityId || `${streetId}-city`;
  const resolvedStateId = stateId || `${streetId}-state`;
  const resolvedZipId = zipId || `${streetId}-zip`;

  return (
    <>
      <LabeledControl
        id={streetId}
        label={streetLabel}
        labelClass={labelClass}
        wrapperClass={fieldWrapperClass}
      >
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
      </LabeledControl>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: showStateSelect ? "1fr 100px 90px" : "1fr 90px",
          gap: 8,
        }}
      >
        <LabeledControl
          id={resolvedCityId}
          label={cityLabel}
          labelClass={labelClass}
          wrapperClass={fieldWrapperClass}
        >
          <input
            id={resolvedCityId}
            className={inputClass}
            placeholder={cityPlaceholder}
            value={city}
            disabled={disabled}
            onChange={(e) => onCityChange?.(e.target.value)}
          />
        </LabeledControl>
        {showStateSelect ? (
          <LabeledControl
            id={resolvedStateId}
            label={stateLabel}
            labelClass={labelClass}
            wrapperClass={fieldWrapperClass}
          >
            <select
              id={resolvedStateId}
              className={selectClass || inputClass}
              value={state || "TX"}
              disabled={disabled}
              aria-label={stateLabel || "State"}
              onChange={(e) => onStateChange?.(e.target.value)}
            >
              {US_STATE_OPTIONS.map((opt) => (
                <option key={opt.code} value={opt.code}>
                  {opt.code}
                </option>
              ))}
            </select>
          </LabeledControl>
        ) : (
          <LabeledControl
            id={resolvedStateId}
            label={stateLabel}
            labelClass={labelClass}
            wrapperClass={fieldWrapperClass}
          >
            <input
              id={resolvedStateId}
              className={inputClass}
              placeholder={stateLabel || "State"}
              value={state}
              disabled={disabled}
              onChange={(e) => onStateChange?.(e.target.value)}
            />
          </LabeledControl>
        )}
        <LabeledControl
          id={resolvedZipId}
          label={zipLabel}
          labelClass={labelClass}
          wrapperClass={fieldWrapperClass}
        >
          <input
            id={resolvedZipId}
            className={inputClass}
            placeholder={zipPlaceholder}
            value={zip}
            disabled={disabled}
            onChange={(e) => onZipChange?.(e.target.value)}
          />
        </LabeledControl>
      </div>
    </>
  );
}
