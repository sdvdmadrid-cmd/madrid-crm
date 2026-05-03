import Link from "next/link";
import LegalAcceptanceWidget from "./LegalAcceptanceWidget";

export const metadata = {
  title: "Legal & Compliance — FieldBase",
  description:
    "FieldBase Terms of Service, Privacy Policy, Payment Authorization, SMS Consent, and Estimate/Invoice Terms.",
};

const UPDATED_DATE = "April 30, 2026";
const VERSION = "v1.0-April-2026";

const SECTIONS = [
  { id: "terms", label: "Terms of Service" },
  { id: "privacy", label: "Privacy Policy" },
  { id: "payment", label: "Payment Authorization" },
  { id: "sms", label: "SMS & TCPA Consent" },
  { id: "estimates", label: "Estimate & Invoice Terms" },
  { id: "disclaimers", label: "Disclaimers & Liability" },
  { id: "arbitration", label: "Arbitration & Class Waiver" },
  { id: "general", label: "General Legal Terms" },
];

function SectionAnchor({ id }) {
  return <span id={id} className="block" style={{ scrollMarginTop: "80px" }} />;
}

function SectionHeading({ children }) {
  return (
    <h2 className="text-xl font-semibold text-gray-900 mb-4 mt-10 first:mt-0">
      {children}
    </h2>
  );
}

function SubHeading({ children }) {
  return (
    <h3 className="text-base font-semibold text-gray-800 mt-6 mb-2">
      {children}
    </h3>
  );
}

function Para({ children }) {
  return <p className="text-gray-700 leading-relaxed mb-3">{children}</p>;
}

function ListItem({ children }) {
  return (
    <li className="text-gray-700 leading-relaxed mb-1 pl-1">{children}</li>
  );
}

export default function LegalPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <Link
            href="/"
            className="text-lg font-semibold text-gray-900 hover:text-blue-700 transition-colors"
          >
            FieldBase
          </Link>
          <span className="text-sm text-gray-500">
            Legal &amp; Compliance — {VERSION}
          </span>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 flex flex-col lg:flex-row gap-10">
        {/* Sidebar navigation */}
        <aside className="lg:w-56 shrink-0">
          <div className="lg:sticky lg:top-24">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
              Sections
            </p>
            <nav className="space-y-1">
              {SECTIONS.map((s) => (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  className="block text-sm text-gray-600 hover:text-blue-700 py-1 transition-colors"
                >
                  {s.label}
                </a>
              ))}
            </nav>
            <div className="mt-8 pt-6 border-t border-gray-200">
              <p className="text-xs text-gray-400">
                Last updated
                <br />
                <span className="text-gray-500">{UPDATED_DATE}</span>
              </p>
              <p className="text-xs text-gray-400 mt-2">
                Version
                <br />
                <span className="text-gray-500">{VERSION}</span>
              </p>
            </div>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 min-w-0">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 sm:p-10">
            {/* Title */}
            <div className="mb-10 pb-8 border-b border-gray-100">
              <div className="inline-flex items-center gap-2 bg-blue-50 text-blue-700 text-xs font-medium px-3 py-1 rounded-full mb-4">
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 12 12"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M6 1a5 5 0 100 10A5 5 0 006 1zm.75 7.25h-1.5v-3h1.5v3zm0-4h-1.5v-1.5h1.5v1.5z" />
                </svg>
                Legal Document
              </div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                Legal &amp; Compliance
              </h1>
              <p className="text-gray-500 text-sm">
                FieldBase — {VERSION} — Effective {UPDATED_DATE}
              </p>
              <p className="text-gray-600 mt-4 leading-relaxed">
                These terms govern your use of the FieldBase platform. By
                creating an account or accessing any feature, you agree to
                these terms in full. Please read each section carefully.
              </p>
            </div>

            {/* ── TERMS OF SERVICE ── */}
            <SectionAnchor id="terms" />
            <SectionHeading>1. Terms of Service</SectionHeading>

            <SubHeading>1.1 Acceptance of Terms</SubHeading>
            <Para>
              By registering for or using FieldBase, you acknowledge that
              you have read, understood, and agree to be bound by these Terms
              of Service and all policies referenced herein. If you do not
              agree, you must not use the platform.
            </Para>

            <SubHeading>1.2 Service Description</SubHeading>
            <Para>
              FieldBase is a business management platform for contractors
              and service companies. It provides tools for lead management,
              estimating, scheduling, client communication, invoicing,
              signatures, and payment collection. Features are provided
              on an as-available basis.
            </Para>

            <SubHeading>1.3 Account Responsibilities</SubHeading>
            <Para>
              You are responsible for maintaining the confidentiality of your
              login credentials, all activity that occurs under your account,
              and ensuring all information you submit is accurate and lawful.
              You must immediately notify FieldBase of any unauthorized
              use.
            </Para>

            <SubHeading>1.4 Prohibited Use</SubHeading>
            <Para>You may not use FieldBase to:</Para>
            <ul className="list-disc list-inside mb-4 space-y-1 text-gray-700 text-sm ml-4">
              <ListItem>
                Violate any applicable law, regulation, or third-party rights
              </ListItem>
              <ListItem>
                Transmit spam, fraudulent communications, or misleading content
              </ListItem>
              <ListItem>
                Attempt to gain unauthorized access to the platform or other
                accounts
              </ListItem>
              <ListItem>
                Use automated scripts to scrape, modify, or interact with the
                system without permission
              </ListItem>
              <ListItem>
                Resell, sublicense, or commercially redistribute platform
                access
              </ListItem>
            </ul>

            <SubHeading>1.5 Subscription & Billing</SubHeading>
            <Para>
              Paid subscriptions renew automatically on the interval shown at
              signup (monthly or annual) unless cancelled before the renewal
              date. FieldBase offers two subscription plans: (a) a
              monthly plan at $35.00/month, following a 30-day free trial; or
              (b) an annual plan at $350/year billed as a single payment. The
              selected rate is locked in for the lifetime of an active
              workspace. Applicable taxes, payment
              processing fees, and local surcharges may be added to the
              billed amount. FieldBase reserves the right to change
              future pricing with 30 days' advance notice.
            </Para>

            <SubHeading>1.6 Automatic Renewal Disclosure</SubHeading>
            <Para>
              <strong>IMPORTANT:</strong> Your subscription will automatically
              renew at the end of each billing period. Your payment method
              will be charged unless you cancel at least 24 hours before the
              renewal date. Cancellation stops future renewals; access
              continues through the end of the current paid term.
            </Para>

            <SubHeading>1.7 Cancellation & Refunds</SubHeading>
            <Para>
              You may cancel your subscription at any time from your account
              settings. Subscription fees are non-refundable except where
              required by applicable law. Partial-month refunds are not
              issued. If you cancel, your workspace data is retained for 30
              days before permanent deletion.
            </Para>

            <SubHeading>1.8 Modifications to Service</SubHeading>
            <Para>
              FieldBase may modify, suspend, or discontinue any feature
              with reasonable notice. Material changes to these Terms will be
              communicated by email or in-app notification and will require
              re-acceptance before continued use.
            </Para>

            {/* ── PRIVACY POLICY ── */}
            <div className="my-8 border-t border-gray-100" />
            <SectionAnchor id="privacy" />
            <SectionHeading>2. Privacy Policy</SectionHeading>

            <SubHeading>2.1 Data We Collect</SubHeading>
            <Para>We collect the following categories of data:</Para>
            <ul className="list-disc list-inside mb-4 space-y-1 text-gray-700 text-sm ml-4">
              <ListItem>
                <strong>Account data:</strong> name, email address, company
                name, phone number, and business type
              </ListItem>
              <ListItem>
                <strong>Business data:</strong> clients, jobs, estimates,
                invoices, contracts, and documents you create on the platform
              </ListItem>
              <ListItem>
                <strong>Usage data:</strong> log files, IP addresses, browser
                type, device information, and activity timestamps
              </ListItem>
              <ListItem>
                <strong>Payment data:</strong> processed through Stripe;
                FieldBase does not store full card numbers
              </ListItem>
              <ListItem>
                <strong>Communication data:</strong> emails and SMS messages
                sent through the platform
              </ListItem>
            </ul>

            <SubHeading>2.2 How We Use Your Data</SubHeading>
            <Para>
              We use collected data to operate and improve the platform,
              process payments, provide customer support, send transactional
              communications, fulfill legal and regulatory obligations, and
              detect and prevent fraud or security incidents. We do not sell
              your personal data or your clients' data to third parties.
            </Para>

            <SubHeading>2.3 Data Sharing</SubHeading>
            <Para>
              We share data only with trusted service providers (Supabase for
              database hosting, Stripe for payments, SendGrid/similar for
              email, Twilio/similar for SMS) under data processing agreements.
              We may disclose data when required by law or to protect the
              rights and safety of users.
            </Para>

            <SubHeading>2.4 Data Retention</SubHeading>
            <Para>
              Your data is retained while your account is active. After
              cancellation, data is kept for 30 days, then deleted except
              where retention is required by law (billing records, audit
              logs). You may request deletion at any time by contacting
              support.
            </Para>

            <SubHeading>2.5 Your Rights</SubHeading>
            <Para>
              Depending on your jurisdiction, you may have the right to
              access, correct, or delete your personal data; object to or
              restrict processing; request data portability; and lodge a
              complaint with a supervisory authority. To exercise these
              rights, contact us at the address listed below.
            </Para>

            <SubHeading>2.6 Cookies & Tracking</SubHeading>
            <Para>
              We use strictly necessary cookies for session management and
              security. We may use analytics tools to understand platform
              usage. You can control cookie preferences through your browser
              settings, though disabling necessary cookies may prevent login.
            </Para>

            {/* ── PAYMENT AUTHORIZATION ── */}
            <div className="my-8 border-t border-gray-100" />
            <SectionAnchor id="payment" />
            <SectionHeading>3. Payment Authorization & Billing</SectionHeading>

            <SubHeading>3.1 Payment Processing</SubHeading>
            <Para>
              All payments are processed by Stripe, Inc., a PCI DSS Level 1
              certified payment processor. By providing your payment method,
              you authorize FieldBase to charge the applicable
              subscription fee and any applicable taxes on the billing
              interval selected.
            </Para>

            <SubHeading>3.2 Authorization for Recurring Charges</SubHeading>
            <Para>
              By accepting these terms and subscribing to a paid plan, you
              expressly authorize FieldBase to initiate recurring charges
              to your payment method at the frequency you selected. This
              authorization remains in effect until you cancel your
              subscription.
            </Para>

            <SubHeading>3.3 Non-Refundable Policy</SubHeading>
            <Para>
              <strong>All subscription fees are non-refundable.</strong>{" "}
              FieldBase does not issue refunds or credits for partial
              months, unused features, or periods when service was available
              but not used, except where required by applicable law.
            </Para>

            <SubHeading>3.4 Failed Payments</SubHeading>
            <Para>
              If a payment fails, we will attempt to recharge your payment
              method up to three times over seven days. If payment cannot be
              collected, your workspace will be suspended until the balance is
              resolved. You are responsible for keeping your payment method
              current.
            </Para>

            <SubHeading>3.5 Payment Compliance (NACHA / ACH)</SubHeading>
            <Para>
              If you use ACH bank transfer or bill payment features, you
              authorize electronic debit entries to the specified bank account
              in accordance with NACHA Operating Rules. You represent that you
              are authorized to initiate debits on the specified account and
              that sufficient funds will be available.
            </Para>

            <SubHeading>3.6 Disputes</SubHeading>
            <Para>
              If you believe a charge was made in error, contact support
              within 30 days of the charge date. Initiating a chargeback
              without first contacting support may result in immediate
              account suspension.
            </Para>

            {/* ── SMS & TCPA ── */}
            <div className="my-8 border-t border-gray-100" />
            <SectionAnchor id="sms" />
            <SectionHeading>4. SMS Consent & TCPA Compliance</SectionHeading>

            <SubHeading>4.1 Platform SMS Features</SubHeading>
            <Para>
              FieldBase may offer SMS messaging features that allow you
              to send text messages to your clients (appointment reminders,
              invoice notifications, quote follow-ups). These features require
              your explicit opt-in consent before activation.
            </Para>

            <SubHeading>4.2 Your Consent Obligations</SubHeading>
            <Para>
              <strong>
                You are solely responsible for obtaining prior express written
                consent from your clients before sending them any SMS
                messages through this platform.
              </strong>{" "}
              FieldBase provides technical infrastructure only. You must
              comply with the Telephone Consumer Protection Act (TCPA), the
              CAN-SPAM Act, applicable state laws, and carrier guidelines.
              Failure to obtain proper consent may expose you to significant
              legal liability.
            </Para>

            <SubHeading>4.3 Consent Records</SubHeading>
            <Para>
              The platform stores the following data when SMS consent is
              recorded: consent timestamp, opt-in source, phone number (hashed
              for storage), and opt-in status. You agree to maintain your own
              records of client consent independent of the platform.
            </Para>

            <SubHeading>4.4 Opt-Out Handling</SubHeading>
            <Para>
              All SMS messages sent through FieldBase must include an
              opt-out option. If a recipient replies STOP (or equivalent), the
              platform will automatically flag that number and prevent future
              messages. You must honor opt-out requests immediately and not
              re-add contacts to messaging lists without renewed consent.
            </Para>

            <SubHeading>4.5 Prohibited SMS Content</SubHeading>
            <Para>
              You may not use the SMS features to send spam, unsolicited
              marketing, illegal content, or messages that violate carrier
              policies. FieldBase reserves the right to suspend SMS
              access for accounts with high opt-out rates or complaints.
            </Para>

            {/* ── ESTIMATE & INVOICE TERMS ── */}
            <div className="my-8 border-t border-gray-100" />
            <SectionAnchor id="estimates" />
            <SectionHeading>5. Estimate & Invoice Terms</SectionHeading>

            <Para>
              FieldBase provides software tools that enable contractors
              ("<strong>Platform Users</strong>") to create, manage, send, and
              track estimates and invoices with their own clients. FieldBase
              is strictly a technology platform and software-as-a-service
              provider. FieldBase is <strong>not</strong> a contractor,
              general contractor, subcontractor, service provider, or party to
              any agreement, estimate, or invoice issued by a Platform User to
              their client. All legal obligations arising from estimates and
              invoices created through the platform belong exclusively to the
              Platform User and their client.
            </Para>

            <SubHeading>5.1 Non-Binding Nature of Estimates</SubHeading>
            <Para>
              Estimates generated through FieldBase are documents created
              solely by the Platform User. FieldBase does not review,
              verify, approve, or endorse the content, accuracy, or legal
              sufficiency of any estimate. An estimate does not constitute a
              legally binding contract until it has been formally accepted by
              both the Platform User (contractor) and their client in accordance
              with applicable law. The Platform User bears sole responsibility
              for ensuring that estimates comply with all federal, state, and
              local laws, licensing requirements, and industry regulations
              applicable to their trade and jurisdiction.
            </Para>

            <SubHeading>5.2 Pricing, Scope, and Change Orders</SubHeading>
            <Para>
              All pricing, scope of work, labor, materials, quantities, and
              payment schedules appearing in an estimate or invoice are
              determined entirely by the Platform User. FieldBase does not
              set, influence, validate, or guarantee any pricing or scope
              representation. The Platform User is solely responsible for
              documenting any changes to scope or pricing in writing prior to
              performing additional work. FieldBase is not liable for any
              dispute arising from undocumented scope changes, price
              discrepancies, or verbal agreements between a Platform User and
              their client.
            </Para>

            <SubHeading>5.3 Invoice Payment Terms</SubHeading>
            <Para>
              Payment terms, due dates, late fees, and collection policies
              appearing on any invoice are established exclusively by the
              Platform User. FieldBase does not impose, collect, or enforce
              payment obligations between Platform Users and their clients.
              FieldBase is not a payment intermediary, escrow agent, or
              collection agent with respect to contractor-client invoices.
              Platform Users are solely responsible for pursuing unpaid invoices
              through appropriate legal channels.
            </Para>

            <SubHeading>5.4 No Guarantee of Accuracy, Legality, or Enforceability</SubHeading>
            <Para>
              FieldBase makes no representation or warranty, express or
              implied, that any estimate or invoice created on the platform is
              accurate, complete, legally compliant, or enforceable in any
              jurisdiction. The platform provides formatting and workflow tools
              only. Platform Users are solely responsible for the legal
              validity of documents they generate and send, and are strongly
              advised to consult qualified legal counsel regarding the
              enforceability of their estimates and invoices under applicable
              law.
            </Para>

            <SubHeading>5.5 Automatic Disclaimer on Documents</SubHeading>
            <Para>
              The following disclaimer is automatically appended to all
              estimates and invoices generated through FieldBase and
              forms part of the document as issued:
            </Para>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 my-4 text-sm text-amber-900 leading-relaxed">
              <strong>PLATFORM DISCLAIMER:</strong> This document was prepared
              by the issuing contractor using FieldBase software.
              FieldBase, Inc. is a technology platform provider and is
              NOT a party to this estimate, invoice, or any agreement between
              the contractor and the client. FieldBase does not guarantee
              the accuracy, completeness, legality, or enforceability of this
              document. All pricing, scope, and payment terms are the sole
              responsibility of the issuing contractor. Any dispute arising
              from this document or the underlying work is strictly between
              the contractor and their client.
            </div>

            <SubHeading>5.6 Platform Neutrality & Limitation of Liability</SubHeading>
            <Para>
              FieldBase expressly disclaims any and all liability arising
              from: (a) the content of any estimate or invoice created by a
              Platform User; (b) disputes between a Platform User and their
              client regarding scope, quality, payment, or performance; (c)
              any representation made by a Platform User to their client using
              documents generated on the platform; (d) non-payment,
              overpayment, or payment disputes between Platform Users and
              their clients; or (e) the failure of any estimate or invoice to
              comply with applicable law. Platform Users agree to indemnify
              and hold FieldBase harmless from any claim asserted by a
              client or third party arising from documents the Platform User
              created using the platform, as further described in Section 6.3.
            </Para>

            {/* ── DISCLAIMERS ── */}
            <div className="my-8 border-t border-gray-100" />
            <SectionAnchor id="disclaimers" />
            <SectionHeading>6. Disclaimers & Limitation of Liability</SectionHeading>

            <SubHeading>6.1 No Warranty</SubHeading>
            <Para>
              THE PLATFORM IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT
              WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT
              LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
              PARTICULAR PURPOSE, OR NON-INFRINGEMENT. FieldBase DOES NOT
              WARRANT THAT THE PLATFORM WILL BE UNINTERRUPTED, ERROR-FREE, OR
              FREE OF VIRUSES.
            </Para>

            <SubHeading>6.2 Limitation of Liability</SubHeading>
            <Para>
              TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW,
              FieldBase AND ITS OFFICERS, DIRECTORS, EMPLOYEES, AND
              AGENTS SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL,
              SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING LOSS OF
              PROFITS, REVENUE, DATA, OR BUSINESS OPPORTUNITIES, ARISING FROM
              OR RELATED TO YOUR USE OF THE PLATFORM, EVEN IF ADVISED OF THE
              POSSIBILITY OF SUCH DAMAGES.
            </Para>
            <Para>
              OUR TOTAL CUMULATIVE LIABILITY FOR ANY CLAIMS ARISING UNDER
              THESE TERMS SHALL NOT EXCEED THE GREATER OF (A) THE AMOUNT PAID
              BY YOU TO FieldBase IN THE TWELVE MONTHS PRECEDING THE
              CLAIM, OR (B) ONE HUNDRED U.S. DOLLARS ($100).
            </Para>

            <SubHeading>6.3 Indemnification</SubHeading>
            <Para>
              You agree to indemnify, defend, and hold harmless FieldBase
              and its affiliates from any claim, demand, loss, liability, or
              expense (including reasonable attorneys' fees) arising from your
              use of the platform, violation of these terms, violation of any
              law, or infringement of any third-party right.
            </Para>

            <SubHeading>6.4 Governing Law & Dispute Resolution</SubHeading>
            <Para>
              These Terms are governed by the laws of the State of Texas,
              United States, without regard to conflict of law principles.
              Any dispute not resolved informally within 30 days must be
              submitted to binding arbitration under the AAA Consumer
              Arbitration Rules. CLASS ACTION WAIVERS: you agree to resolve
              disputes individually, not as part of a class action.
            </Para>

            <SubHeading>6.5 Contact Information</SubHeading>
            <Para>
              For legal inquiries, data requests, or compliance questions,
              contact FieldBase at:
            </Para>
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 my-4 text-sm text-gray-700">
              <p>
                <strong>FieldBase</strong>
              </p>
              <p>Legal & Compliance Department</p>
              <p className="mt-1">
                Email:{" "}
                <a
                  href="mailto:legal@FieldBase.io"
                  className="text-blue-700 underline"
                >
                  legal@FieldBase.io
                </a>
              </p>
            </div>

            {/* ── ARBITRATION ── */}
            <div className="my-8 border-t border-gray-100" />
            <SectionAnchor id="arbitration" />
            <SectionHeading>7. Arbitration & Class Action Waiver</SectionHeading>

            <SubHeading>7.1 Informal Resolution First</SubHeading>
            <Para>
              Before initiating arbitration, either party must provide written
              notice of the dispute and allow thirty (30) days for good-faith
              informal resolution. Notices must describe the legal claim,
              factual basis, and requested remedy.
            </Para>

            <SubHeading>7.2 Binding Arbitration Agreement</SubHeading>
            <Para>
              Except where prohibited by law, any dispute, claim, or
              controversy arising out of or relating to these Terms or use of
              the platform shall be resolved exclusively by final and binding
              arbitration administered by the American Arbitration Association
              (AAA) under its applicable rules.
            </Para>

            <SubHeading>7.3 No Class or Representative Proceedings</SubHeading>
            <Para>
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, EACH PARTY WAIVES ANY
              RIGHT TO PARTICIPATE IN A CLASS, COLLECTIVE, MASS, OR
              REPRESENTATIVE ACTION. CLAIMS MAY BE BROUGHT ONLY IN AN
              INDIVIDUAL CAPACITY.
            </Para>

            <SubHeading>7.4 Injunctive Relief</SubHeading>
            <Para>
              Notwithstanding this arbitration section, either party may seek
              temporary or preliminary injunctive relief in a court of
              competent jurisdiction to prevent imminent misuse of intellectual
              property, confidential information, or security controls.
            </Para>

            {/* ── GENERAL TERMS ── */}
            <div className="my-8 border-t border-gray-100" />
            <SectionAnchor id="general" />
            <SectionHeading>8. General Legal Terms</SectionHeading>

            <SubHeading>8.1 Entire Agreement</SubHeading>
            <Para>
              These Terms, together with any referenced policies and accepted
              order forms, constitute the entire agreement between you and
              FieldBase regarding the platform and supersede prior or
              contemporaneous discussions or understandings.
            </Para>

            <SubHeading>8.2 Assignment</SubHeading>
            <Para>
              You may not assign or transfer these Terms without prior written
              consent from FieldBase. FieldBase may assign these
              Terms in connection with a merger, acquisition, corporate
              reorganization, or sale of assets.
            </Para>

            <SubHeading>8.3 Severability</SubHeading>
            <Para>
              If any provision of these Terms is found unenforceable, the
              remaining provisions will remain in full force and effect, and
              the unenforceable provision will be interpreted to the maximum
              extent permissible under applicable law.
            </Para>

            <SubHeading>8.4 Force Majeure</SubHeading>
            <Para>
              FieldBase is not liable for delays or failures resulting
              from events beyond reasonable control, including natural
              disasters, utility outages, labor disputes, cyberattacks,
              internet backbone failures, governmental actions, or third-party
              provider outages.
            </Para>

            <SubHeading>8.5 Electronic Records and Signatures</SubHeading>
            <Para>
              You agree that electronic records, audit logs, checkbox
              confirmations, and electronic signatures may be used as evidence
              of assent, authorization, and contractual intent to the same
              extent as paper records and handwritten signatures, subject to
              applicable law.
            </Para>

            <SubHeading>8.6 Independent Legal Advice</SubHeading>
            <Para>
              You acknowledge that you have had the opportunity to consult
              independent legal counsel before accepting these Terms and that
              you are not relying on FieldBase for legal advice regarding
              your contracts with clients, employment matters, licensing
              obligations, or tax compliance.
            </Para>

            {/* Acceptance widget */}
            <LegalAcceptanceWidget />

            {/* Footer note */}
            <div className="mt-12 pt-8 border-t border-gray-100 text-xs text-gray-400">
              <p>
                {VERSION} — Last updated {UPDATED_DATE}. This document
                supersedes all prior versions. Your continued use of
                FieldBase after the effective date constitutes acceptance
                of these terms.
              </p>
            </div>
          </div>
        </main>
      </div>

      {/* Page footer */}
      <footer className="border-t border-gray-200 bg-white mt-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-gray-500">
          <span>© 2026 FieldBase. All rights reserved.</span>
          <div className="flex items-center gap-4">
            <Link href="/legal" className="hover:text-gray-700 transition-colors font-medium text-blue-700">
              Legal &amp; Compliance
            </Link>
            <Link href="/dashboard" className="hover:text-gray-700 transition-colors">
              Dashboard
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
