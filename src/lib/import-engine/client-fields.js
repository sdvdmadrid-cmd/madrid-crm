/**
 * Canonical client import field definitions — shared by UI mapping,
 * validation, and the server import engine. Additional CRM providers
 * plug in via import-engine/providers/*.
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
    label: "Phone",
    required: false,
    description: "Used for duplicate detection when email is empty",
  },
  {
    key: "address",
    label: "Street address",
    required: false,
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
    key: "notes",
    label: "Notes",
    required: false,
  },
];

export const CLIENT_IMPORT_FIELD_KEYS = CLIENT_IMPORT_FIELDS.map((f) => f.key);

export const DUPLICATE_MODES = ["skip", "update", "create"];
