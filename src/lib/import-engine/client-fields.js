/**
 * Canonical client import field definitions — shared by UI mapping,
 * validation, and the server import engine.
 */

export const CLIENT_IMPORT_FIELDS = [
  {
    key: "name",
    label: "Full name",
    required: true,
    description: "Customer or contact name (or map First + Last below)",
  },
  {
    key: "firstName",
    label: "First name",
    required: false,
    description: "Combined with Last name when Full name is empty",
  },
  {
    key: "lastName",
    label: "Last name",
    required: false,
    description: "Combined with First name when Full name is empty",
  },
  {
    key: "email",
    label: "Email",
    required: false,
    description: "Used for duplicate detection",
  },
  {
    key: "phone",
    label: "Phone (primary)",
    required: false,
    description: "Main phone; mobile/home/work columns are used if this is empty",
  },
  {
    key: "address",
    label: "Street address (line 1)",
    required: false,
  },
  {
    key: "addressLine2",
    label: "Street address (line 2)",
    required: false,
    description: "Unit, suite, apt, or second line",
  },
  {
    key: "city",
    label: "City",
    required: false,
  },
  {
    key: "state",
    label: "State / Province",
    required: false,
  },
  {
    key: "zip",
    label: "ZIP / Postal code",
    required: false,
  },
  {
    key: "company",
    label: "Company",
    required: false,
  },
  {
    key: "billingAddress",
    label: "Billing street",
    required: false,
  },
  {
    key: "billingCity",
    label: "Billing city",
    required: false,
  },
  {
    key: "billingState",
    label: "Billing state / province",
    required: false,
  },
  {
    key: "billingZip",
    label: "Billing ZIP / postal",
    required: false,
  },
  {
    key: "notes",
    label: "Notes / tags",
    required: false,
  },
  {
    key: "leadStatus",
    label: "Lead status",
    required: false,
    description: "Optional pipeline status from your export",
  },
];

export const CLIENT_IMPORT_FIELD_KEYS = CLIENT_IMPORT_FIELDS.map((f) => f.key);

export const DUPLICATE_MODES = ["skip", "update", "create"];

/** Recommended when migrating a full client list from another app. */
export const DEFAULT_DUPLICATE_MODE = "update";
