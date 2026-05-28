/**
 * Jobber CRM export column hints (clients / customers export).
 * Headers vary by export version — we match case-insensitively.
 */

export const JOBBER_PROVIDER = {
  id: "jobber",
  label: "Jobber",
  description: "Customer export from Jobber (Clients list → Export)",
};

/** @type {Record<string, string[]>} */
export const JOBBER_HEADER_ALIASES = {
  name: [
    "client name",
    "name",
    "full name",
    "customer name",
    "display name",
  ],
  firstName: ["first name", "firstname", "given name"],
  lastName: ["last name", "lastname", "surname", "family name"],
  email: ["email", "primary email", "e-mail", "email address", "client email"],
  phone: [
    "phone",
    "primary phone",
    "mobile phone",
    "mobile",
    "phone number",
    "cell",
    "client phone",
  ],
  address: [
    "service address",
    "address",
    "street",
    "street address",
    "property address",
    "address 1",
    "address line 1",
    "street 1",
  ],
  city: ["city", "service city", "property city"],
  state: ["state", "province", "region", "service state"],
  zip: ["zip", "zip code", "postal code", "postal", "service zip"],
  company: ["company", "company name", "business name"],
  notes: ["notes", "client notes", "note", "tags"],
};
