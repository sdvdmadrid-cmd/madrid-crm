# Stripe Connect platform application — copy-paste draft (English)

Use this text when Stripe asks for business description, use case, or Connect questionnaire answers.  
Replace bracketed placeholders with your legal entity details.

**Platform:** FieldBase  
**Website:** https://fieldbaseapp.net  
**Terms / Privacy:** https://fieldbaseapp.net/legal  
**Support:** support@fieldbaseapp.net (or your live support email)

---

## Short business description (1–2 sentences)

FieldBase is a B2B SaaS platform for home-service and field-service contractors (HVAC, plumbing, landscaping, cleaning, etc.). Contractors manage clients, jobs, estimates, invoices, and scheduling in one workspace. End customers pay invoices online; funds are routed to the contractor’s Stripe Express connected account with a small platform application fee.

---

## Product / use case (paragraph)

FieldBase provides operational software (CRM, jobs, calendar, estimates, invoices, optional bill-pay tools) to independent contractors and small trade businesses. When a contractor sends an invoice, their customer pays by card through Stripe Checkout. We use **Stripe Connect Express** with **destination charges**: the payment is created on the platform account, funds transfer to the contractor’s connected account, and FieldBase retains an **application fee** (approximately 0.75% of the transaction, configurable). Contractors complete identity verification and bank payout setup through Stripe-hosted Account Links. FieldBase does not hold customer funds outside Stripe; we are not a money transmitter. SaaS subscription billing for the platform itself is charged separately on the platform Stripe account (not via Connect splits).

---

## Who pays whom

| Payer | Payee | Method |
|-------|--------|--------|
| Homeowner / commercial client | Contractor (connected account) | Stripe Checkout on invoice |
| Contractor | FieldBase (platform) | SaaS subscription (platform account) |
| FieldBase | Stripe | Processing fees per Stripe pricing |

---

## Connect account type

- **Express** connected accounts for each contractor business (one connected account per tenant company).
- Onboarding: Stripe Account Links from the FieldBase dashboard (Invoices → payment setup).
- Capabilities needed: `card_payments`, transfers/payouts to contractor bank account.

---

## Charge model

- **Destination charges** with `transfer_data.destination` = contractor `acct_...`
- **Application fee** on each customer payment (platform revenue on transactions)
- No separate charges and transfers for MVP; single Checkout session per invoice

---

## Estimated volume (adjust to your truth)

- Launch phase: under $50,000 USD/month in connected payment volume
- SaaS: [X] paying contractor accounts in first 90 days
- Average invoice: $500–$2,500 USD
- Countries: United States (primary)

---

## Risk / compliance notes

- Contractors are businesses serving end customers; we do not sell to consumers as the primary user.
- Customer card data is collected only by Stripe Checkout (PCI SAQ A scope for platform).
- Refunds and disputes: handled per Stripe Connect rules; contractor is merchant of record for job payments.
- Prohibited uses: no adult, gambling, crypto, lending, or illegal services; field services only.
- We display Terms of Service and Privacy Policy at https://fieldbaseapp.net/legal before account use.

---

## URLs to provide in the form

| Field | Value |
|-------|--------|
| Website | https://fieldbaseapp.net |
| Terms of service | https://fieldbaseapp.net/legal |
| Privacy policy | https://fieldbaseapp.net/legal |
| Customer support | https://fieldbaseapp.net (or mailto in footer) |

---

## After Stripe approves Connect

1. Stripe Dashboard → Connect shows **Enabled**
2. Vercel Production → `STRIPE_CONNECT_ENABLED=true`
3. Redeploy https://fieldbaseapp.net
4. Test one contractor onboarding in test mode first, then live

See also: `docs/STRIPE_CONNECT_APPROVAL.md`
