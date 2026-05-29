/**
 * Extra column aliases for common field-service CRM CSV exports
 * (first/last name split, street 1, mobile phone, billing columns, etc.).
 */

/** @type {Record<string, string[]>} */
export const STANDARD_CSV_HEADER_ALIASES = {
  name: [
    "client name",
    "customer name",
    "display name",
    "contact name",
  ],
  firstName: ["firstname", "given name", "fname"],
  lastName: ["lastname", "surname", "family name", "lname"],
  email: [
    "primary email",
    "main email",
    "client email",
    "billing email",
    "invoice email",
    "contact email",
  ],
  phone: [
    "primary phone",
    "main phone",
    "client phone",
    "telephone",
    "contact phone",
  ],
  mobilePhone: [
    "mobile phone",
    "mobile",
    "cell",
    "cell phone",
    "cellular",
  ],
  homePhone: ["home phone", "home", "residence phone"],
  workPhone: ["work phone", "business phone", "office phone"],
  address: [
    "service address",
    "property address",
    "street 1",
    "address line 1",
    "service street 1",
    "service street",
    "property street 1",
  ],
  addressLine2: [
    "street 2",
    "address line 2",
    "service street 2",
    "unit",
    "suite",
    "apt",
    "apartment",
  ],
  city: ["service city", "property city", "billing city", "town"],
  state: ["province", "region", "service state", "billing state"],
  zip: [
    "zip code",
    "postal code",
    "postal",
    "service zip",
    "billing zip",
    "postcode",
  ],
  company: ["business name", "organization", "org"],
  billingAddress: [
    "billing address",
    "billing street",
    "billing street 1",
    "bill to address",
  ],
  billingCity: ["billing city", "bill to city"],
  billingState: ["billing state", "bill to state", "billing province"],
  billingZip: ["billing zip", "billing postal code", "bill to zip"],
  notes: ["client notes", "customer notes", "tags", "internal notes"],
  leadStatus: ["lead status", "pipeline status", "client status", "status"],
};
