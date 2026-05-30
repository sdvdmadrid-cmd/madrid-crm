/**
 * Props that reduce browser / password-manager / Google "Save address?" prompts
 * on CRM forms. Use on address, client, and payment fields inside FieldBase only.
 *
 * @param {"street"|"city"|"state"|"zip"|"email"|"tel"|"name"|"generic"} kind
 */
export function autofillGuardProps(kind = "generic") {
  const nameByKind = {
    street: "fb-service-street-line",
    city: "fb-service-city",
    state: "fb-service-state",
    zip: "fb-service-postal",
    billingStreet: "fb-billing-street-line",
    billingCity: "fb-billing-city",
    billingState: "fb-billing-state",
    billingZip: "fb-billing-postal",
    email: "fb-client-contact-email",
    tel: "fb-client-contact-phone",
    firstName: "fb-client-given-name",
    lastName: "fb-client-family-name",
    generic: "fb-field-other",
  };

  return {
    autoComplete: "off",
    autoCorrect: "off",
    autoCapitalize: "off",
    spellCheck: false,
    "data-lpignore": "true",
    "data-1p-ignore": "true",
    "data-bwignore": "true",
    "data-form-type": "other",
    name: nameByKind[kind] || nameByKind.generic,
  };
}

/** Chrome sometimes saves addresses after blur — readonly until focus blocks heuristics. */
export function autofillReadonlyUntilFocusProps() {
  return {
    readOnly: true,
    onFocus: (event) => {
      event.currentTarget.removeAttribute("readonly");
    },
  };
}
