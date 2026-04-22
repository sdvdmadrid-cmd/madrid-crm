const UNSAFE_KEY_REGEX = /(^\$)|\./;
const UNSAFE_TEXT_REGEX =
  /<\s*\/?\s*script\b|javascript:|data:text\/html|on[a-z]+\s*=|\bunion\b\s+\bselect\b|\bdrop\b\s+\btable\b|\bdelete\b\s+\bfrom\b|--|\/\*|\*\//i;

function stripControlChars(value) {
  let output = "";
  for (const char of String(value ?? "")) {
    const code = char.charCodeAt(0);
    const isAllowedWhitespace = code === 9 || code === 10 || code === 13;
    if ((code >= 32 && code !== 127) || isAllowedWhitespace) {
      output += char;
    }
  }
  return output;
}

function normalizeString(value, maxLength) {
  return stripControlChars(value).trim().slice(0, maxLength);
}

export function sanitizeSearchInput(value, maxLength = 80) {
  return normalizeString(value, maxLength)
    .replace(/[<>`]/g, "")
    .replace(/\s+/g, " ");
}

export function assertSafeText(fieldName, value, maxLength = 2000) {
  const normalized = normalizeString(value, maxLength);
  if (UNSAFE_TEXT_REGEX.test(normalized)) {
    throw new Error(`Unsafe content detected in ${fieldName}`);
  }
  return normalized;
}

export function sanitizePayloadDeep(payload, options = {}) {
  const maxDepth = options.maxDepth || 8;
  const maxStringLength = options.maxStringLength || 2000;

  const visit = (value, depth) => {
    if (depth > maxDepth) {
      throw new Error("Payload is too deeply nested");
    }

    if (value == null) return value;

    if (typeof value === "string") {
      const normalized = normalizeString(value, maxStringLength);
      if (UNSAFE_TEXT_REGEX.test(normalized)) {
        throw new Error("Unsafe text payload detected");
      }
      return normalized;
    }

    if (Array.isArray(value)) {
      return value.map((item) => visit(item, depth + 1));
    }

    if (typeof value === "object") {
      const output = {};
      for (const [key, nested] of Object.entries(value)) {
        if (UNSAFE_KEY_REGEX.test(key)) {
          throw new Error(`Unsafe payload key: ${key}`);
        }
        output[key] = visit(nested, depth + 1);
      }
      return output;
    }

    return value;
  };

  return visit(payload, 0);
}
