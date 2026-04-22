"use client";

import { Autocomplete, LoadScript } from "@react-google-maps/api";
import { useRef, useState } from "react";

const libraries = ["places"];

export default function AddressAutocomplete({
  onSelect,
  placeholder = "Enter address...",
}) {
  const [input, setInput] = useState("");
  const autocompleteRef = useRef(null);
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  const handlePlaceChanged = () => {
    const place = autocompleteRef.current?.getPlace();

    if (!place || !place.geometry) {
      return;
    }

    const result = {
      address: place.formatted_address || "",
      lat: place.geometry.location?.lat?.() ?? null,
      lng: place.geometry.location?.lng?.() ?? null,
    };

    setInput(result.address);
    onSelect?.(result);
  };

  if (!apiKey) {
    return (
      <input
        type="text"
        placeholder={placeholder}
        value={input}
        onChange={(event) => setInput(event.target.value)}
        style={{
          width: "100%",
          padding: "12px",
          borderRadius: "8px",
          border: "1px solid #ccc",
        }}
      />
    );
  }

  return (
    <LoadScript googleMapsApiKey={apiKey} libraries={libraries}>
      <Autocomplete
        onLoad={(ref) => {
          autocompleteRef.current = ref;
        }}
        onPlaceChanged={handlePlaceChanged}
      >
        <input
          type="text"
          placeholder={placeholder}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          style={{
            width: "100%",
            padding: "12px",
            borderRadius: "8px",
            border: "1px solid #ccc",
          }}
        />
      </Autocomplete>
    </LoadScript>
  );
}
