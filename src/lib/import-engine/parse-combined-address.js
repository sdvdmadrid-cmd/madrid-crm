/**
 * Split a single "full address" cell (Jobber-style) into street, city, state, zip.
 * Example: "369 Boulder Drive, Glendale Heights, Illinois 60139"
 */

export function parseCombinedAddressString(raw = "") {
  const text = String(raw || "").trim();
  if (!text) {
    return { street: "", city: "", state: "", zip: "" };
  }

  if (!text.includes(",")) {
    return { street: text, city: "", state: "", zip: "" };
  }

  const parts = text
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length < 2) {
    return { street: text, city: "", state: "", zip: "" };
  }

  let zip = "";
  let state = parts[parts.length - 1];
  const zipMatch = state.match(/\b(\d{5}(?:-\d{4})?)\s*$/);
  if (zipMatch) {
    zip = zipMatch[1];
    state = state.slice(0, zipMatch.index).trim();
  }

  let city = "";
  let street = "";

  if (parts.length >= 3) {
    city = parts[parts.length - 2];
    street = parts.slice(0, parts.length - 2).join(", ");
  } else {
    street = parts[0];
    const tail = parts[1];
    const tailZip = tail.match(/\b(\d{5}(?:-\d{4})?)\s*$/);
    if (tailZip && !zip) {
      zip = tailZip[1];
    }
    const tailNoZip = tail.replace(/\b\d{5}(?:-\d{4})?\s*$/, "").trim();
    const words = tailNoZip.split(/\s+/).filter(Boolean);
    if (words.length >= 2) {
      state = words[words.length - 1];
      city = words.slice(0, -1).join(" ");
    } else {
      city = tailNoZip;
    }
  }

  return {
    street: street.trim(),
    city: city.trim(),
    state: state.trim(),
    zip: zip.trim(),
  };
}
