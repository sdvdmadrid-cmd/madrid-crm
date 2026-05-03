import "server-only";
import crypto from "crypto";

/**
 * Encryption key for sensitive data
 * MUST be exactly 32 bytes (256-bit) for AES-256
 * Store securely in environment variable
 */
function getEncryptionKey() {
  const keyHex = process.env.ENCRYPTION_KEY;

  if (!keyHex) {
    throw new Error(
      "Missing ENCRYPTION_KEY environment variable. Generate with: node -e \"console.log(crypto.randomBytes(32).toString('hex'))\""
    );
  }

  if (keyHex.length !== 64) {
    throw new Error(
      "ENCRYPTION_KEY must be 64 hex characters (32 bytes). Generate with: node -e \"console.log(crypto.randomBytes(32).toString('hex'))\""
    );
  }

  return Buffer.from(keyHex, "hex");
}

/**
 * Encrypt sensitive data using AES-256-GCM
 * GCM mode provides both encryption and authentication
 *
 * @param {string} plaintext - Data to encrypt
 * @returns {string} Encrypted data in format: iv::authTag::ciphertext (hex-encoded)
 */
export function encryptSensitive(plaintext) {
  try {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(16); // 128-bit IV
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

    let encrypted = cipher.update(plaintext, "utf8", "hex");
    encrypted += cipher.final("hex");

    const authTag = cipher.getAuthTag();

    // Format: iv::authTag::ciphertext (all hex)
    return `${iv.toString("hex")}::${authTag.toString("hex")}::${encrypted}`;
  } catch (error) {
    console.error("[Encryption] Encrypt failed:", error.message);
    throw new Error("Failed to encrypt sensitive data");
  }
}

/**
 * Decrypt sensitive data
 *
 * @param {string} encrypted - Encrypted data in format: iv::authTag::ciphertext
 * @returns {string} Decrypted plaintext
 */
export function decryptSensitive(encrypted) {
  try {
    if (!encrypted || typeof encrypted !== "string") {
      throw new Error("Invalid encrypted data format");
    }

    const parts = encrypted.split("::");
    if (parts.length !== 3) {
      throw new Error("Invalid encrypted data format (expected 3 parts)");
    }

    const [ivHex, authTagHex, ciphertextHex] = parts;
    const key = getEncryptionKey();
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");
    const ciphertext = Buffer.from(ciphertextHex, "hex");

    if (iv.length !== 16) {
      throw new Error("Invalid IV length");
    }

    if (authTag.length !== 16) {
      throw new Error("Invalid auth tag length");
    }

    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(ciphertext, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  } catch (error) {
    console.error("[Encryption] Decrypt failed:", error.message);
    throw new Error("Failed to decrypt sensitive data");
  }
}

/**
 * Hash sensitive data (one-way, for comparison)
 * Use for access tokens that need lookup but shouldn't be stored plaintext
 *
 * @param {string} data - Data to hash
 * @returns {string} SHA-256 hash (hex)
 */
export function hashSensitive(data) {
  return crypto.createHash("sha256").update(data).digest("hex");
}

/**
 * Validate that encrypted data is properly formatted
 *
 * @param {string} encrypted - Data to validate
 * @returns {boolean} True if valid format
 */
export function isValidEncryptedFormat(encrypted) {
  if (!encrypted || typeof encrypted !== "string") return false;
  const parts = encrypted.split("::");
  if (parts.length !== 3) return false;

  // Check each part is valid hex
  for (const part of parts) {
    if (!/^[0-9a-f]*$/.test(part)) return false;
  }

  return true;
}
