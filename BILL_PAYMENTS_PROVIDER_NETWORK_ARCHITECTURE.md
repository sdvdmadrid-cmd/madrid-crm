# Bill Payments Provider-Network Architecture

## Current state

The app now supports an internal Bill Payments operating layer:

- bill registry and provider search
- saved card and ACH payment methods through Stripe
- single and bulk pay flows
- AutoPay rules and reminders
- webhook-driven transaction state updates
- tenant-scoped history, export, and notifications

This is an in-app payment orchestration layer. It is not yet a real external biller-network or remittance platform.

## Gap to true Doxo-style settlement

A true provider-network product needs more than payment intent collection. It also needs:

- verified biller identities and remittance instructions
- provider-specific account validation rules
- settlement and disbursement orchestration after user funding succeeds
- reconciliation between user payment, outbound remittance, and provider acceptance
- exception queues for rejects, returns, partial posts, and unmatched payments
- compliance controls for NACHA, card, KYC/KYB, OFAC, AML, and money movement audits

## Target architecture

### 1. Provider directory and verification

Create a provider master directory with:

- canonical provider id
- remittance rail support: ACH, check, RTP, virtual card, custom API
- account-number validation rules
- cutoff windows and settlement SLAs
- remittance metadata templates
- support and exception contacts

### 2. Payee account verification

Before first payment to a provider, resolve and verify:

- provider match confidence
- account number format
- account ownership proof when required
- remittance address or settlement destination
- duplicate-account collision rules per tenant

### 3. Funding ledger

Separate customer funding from provider remittance.

Required ledgers:

- customer authorization ledger
- funds captured / pending ledger
- remittance scheduled ledger
- remittance sent ledger
- remittance settled ledger
- exception / returned funds ledger

### 4. Remittance orchestration service

Introduce a dedicated remittance service layer responsible for:

- selecting the outbound rail per provider
- batching outbound files
- handling provider API calls or print-and-mail vendor handoff
- retry policies and cutoff logic
- idempotent remittance job creation

### 5. Reconciliation engine

Add a reconciliation process that links:

- internal bill payment transaction
- Stripe funding event
- outbound remittance id
- provider acceptance or rejection event
- settlement completion timestamp

### 6. Exception operations

Create explicit states beyond paid/failed:

- funded
- remittance_pending
- remittance_submitted
- remittance_settled
- remittance_rejected
- returned
- needs_review

This needs an operator queue with audit trail and retry controls.

## Suggested data model additions

Future tables or equivalent services:

- `biller_network_providers`
- `biller_accounts`
- `bill_payment_funding_events`
- `bill_payment_remittances`
- `bill_payment_reconciliation_events`
- `bill_payment_exceptions`
- `bill_payment_compliance_reviews`

## Delivery phases

### Phase A

Keep current Stripe-backed in-app layer and harden runtime validation, cron, and ops.

### Phase B

Add provider verification and a remittance abstraction with adapter interfaces.

### Phase C

Integrate first external remittance partner or bank/payment-ops rail.

### Phase D

Add reconciliation, exception handling, and finance/ops dashboards.

## Recommended implementation boundary for this repo

This repository should continue to own:

- tenant UI and bill workflow
- payment method vault references
- user-side payment authorization state
- notifications, history, and exports
- webhook ingestion and business state projection

A separate remittance adapter/service should own:

- external provider directory synchronization
- disbursement execution
- settlement tracking
- exception handling
- compliance workflows

## Immediate next build items

1. Add a manual/scheduled trigger path for the existing AutoPay processor.
2. Add transaction states that distinguish funding from settlement.
3. Define the first remittance adapter contract before integrating any provider network.
4. Keep Stripe funding and external remittance ids as separate fields everywhere.
