/**
 * PrivacyPolicyPage — Privacy Policy & Data Protection notice
 * Route: /privacy-policy
 * Aligned with India's Digital Personal Data Protection Act, 2023 (DPDP Act).
 *
 * Pure presentational component. No data fetching, no props.
 * Replace the {{placeholder}} tokens with real business details before publishing.
 */
import {
  Shield, FileText, Database, Target, UserCheck, Scale,
  Clock, Lock, Share2, Mail, RefreshCw, AlertTriangle,
} from 'lucide-react';

/* ── Primitives ────────────────────────────────────────────────────────────── */
function Card({ children, className = '', style = {} }) {
  return (
    <div
      className={`rounded-lg border ${className}`}
      style={{ background: 'var(--bg-card, var(--bg-secondary))', borderColor: 'var(--border)', ...style }}
    >
      {children}
    </div>
  );
}

/* A single policy section: icon + heading header, then body content. */
function Section({ icon: Icon, title, children }) {
  return (
    <Card>
      <div className="flex items-center gap-2.5 px-5 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
        {Icon && (
          <Icon className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--text-secondary)' }} />
        )}
        <h2 className="text-[13px] font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>
          {title}
        </h2>
      </div>
      <div className="px-5 py-4 space-y-3 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
        {children}
      </div>
    </Card>
  );
}

/* Inline highlight for the {{placeholder}} tokens so owners can spot them. */
function Token({ children }) {
  return (
    <span
      className="px-1 py-0.5 rounded text-[12px] font-medium tabular-nums"
      style={{ background: 'rgba(217,119,6,0.12)', color: '#b45309' }}
    >
      {children}
    </span>
  );
}

/* A tidy bullet list with restrained spacing. */
function Bullets({ items }) {
  return (
    <ul className="space-y-2 pl-1">
      {items.map((it, i) => (
        <li key={i} className="flex gap-2.5">
          <span
            className="mt-[7px] w-1 h-1 rounded-full flex-shrink-0"
            style={{ background: 'var(--text-secondary)', opacity: 0.6 }}
          />
          <span className="text-[13px]" style={{ color: 'var(--text-secondary)' }}>{it}</span>
        </li>
      ))}
    </ul>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
export default function PrivacyPolicyPage() {
  const lastUpdated = new Date().toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:gap-4">
        <div
          className="w-11 h-11 rounded-lg border flex items-center justify-center flex-shrink-0 mb-3 sm:mb-0"
          style={{ borderColor: 'var(--border)' }}
        >
          <Shield className="w-5 h-5" style={{ color: 'var(--text-secondary)' }} />
        </div>
        <div>
          <h1 className="text-xl font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>
            Privacy Policy &amp; Data Protection
          </h1>
          <p className="text-[13px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            Compliant with India&rsquo;s DPDP Act 2023
          </p>
          <p className="text-xs mt-1.5 tabular-nums" style={{ color: 'var(--text-secondary)' }}>
            Last updated: {lastUpdated}
          </p>
        </div>
      </div>

      {/* ── Template notice banner ──────────────────────────────────────────── */}
      <div
        className="flex items-start gap-2.5 rounded-lg border px-4 py-3"
        style={{ borderColor: 'rgba(217,119,6,0.35)', background: 'rgba(217,119,6,0.07)' }}
      >
        <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: '#b45309' }} />
        <p className="text-[13px] leading-relaxed" style={{ color: 'var(--text-primary)' }}>
          <span className="font-semibold">Template</span> &mdash; replace the{' '}
          <Token>{'{{placeholders}}'}</Token> with your business details before publishing. The text
          below is a starting point and should be reviewed against your actual data practices and any
          legal advice you obtain.
        </p>
      </div>

      {/* ── 1. Introduction ─────────────────────────────────────────────────── */}
      <Section icon={FileText} title="1. Introduction">
        <p>
          This Privacy Policy explains how <Token>{'{{Business Name}}'}</Token> (&ldquo;we&rdquo;,
          &ldquo;us&rdquo;, or &ldquo;our&rdquo;) collects, uses, stores, and protects your personal
          data when you dine with us, place an order, or join our loyalty programme.
        </p>
        <p>
          We act as a <span className="font-medium" style={{ color: 'var(--text-primary)' }}>Data Fiduciary</span>{' '}
          under the Digital Personal Data Protection Act, 2023 (the &ldquo;DPDP Act&rdquo;). This notice
          is provided to fulfil our obligation to inform you about the processing of your personal data
          and the rights available to you under that Act.
        </p>
      </Section>

      {/* ── 2. What we collect ──────────────────────────────────────────────── */}
      <Section icon={Database} title="2. What We Collect">
        <p>Depending on how you interact with us, we may collect the following personal data:</p>
        <Bullets
          items={[
            'Name',
            'Phone number',
            'Email address',
            'Order history (items purchased, dates, amounts)',
            'Loyalty programme data (points balance, rewards, visit frequency)',
            'Delivery address (only when you place an order for delivery)',
          ]}
        />
        <p>
          We collect only the data we need to provide our services and meet our legal obligations.
        </p>
      </Section>

      {/* ── 3. Why we collect it (purpose) ──────────────────────────────────── */}
      <Section icon={Target} title="3. Why We Collect It (Purpose)">
        <p>Your personal data is processed for the following purposes:</p>
        <Bullets
          items={[
            'Billing and GST invoicing — to issue tax-compliant invoices, as required by applicable law (a legal obligation).',
            'Order fulfilment — to prepare, serve, and where applicable deliver your order.',
            'Loyalty and rewards — to operate our loyalty programme, track points, and apply rewards.',
            'Marketing communications — to send you offers and updates, but only where you have given explicit consent.',
          ]}
        />
        <p>
          We will not use your personal data for a new, unrelated purpose without informing you and,
          where required, obtaining your consent.
        </p>
      </Section>

      {/* ── 4. Consent ──────────────────────────────────────────────────────── */}
      <Section icon={UserCheck} title="4. Consent">
        <p>
          Marketing messages (such as promotional SMS, WhatsApp, or email) are sent{' '}
          <span className="font-medium" style={{ color: 'var(--text-primary)' }}>only with your explicit consent</span>.
          Your consent is free, specific, informed, and unconditional, and is given through a clear
          affirmative action.
        </p>
        <p>
          You may <span className="font-medium" style={{ color: 'var(--text-primary)' }}>withdraw your consent at any time</span>.
          Withdrawing consent is as easy as giving it. To withdraw, contact us using the details in the
          Grievance Officer section below, or use the opt-out instructions included in our messages.
          Withdrawal will not affect the lawfulness of processing carried out before withdrawal, and it
          does not affect processing we are required to perform for legal reasons (such as tax records).
        </p>
      </Section>

      {/* ── 5. Your rights under DPDP ───────────────────────────────────────── */}
      <Section icon={Scale} title="5. Your Rights Under the DPDP Act">
        <p>As a Data Principal, you have the following rights in respect of your personal data:</p>
        <Bullets
          items={[
            'Right to access — request a summary of the personal data we hold about you and how it is processed.',
            'Right to correction — request that inaccurate or incomplete data be corrected, completed, or updated.',
            'Right to erasure — request deletion of your personal data where it is no longer needed for the purpose it was collected or required by law.',
            'Right to grievance redressal — raise a complaint with our Grievance Officer about how your data is handled.',
          ]}
        />
        <p>
          You may request a <span className="font-medium" style={{ color: 'var(--text-primary)' }}>data export</span>{' '}
          (a copy of your personal data) or the{' '}
          <span className="font-medium" style={{ color: 'var(--text-primary)' }}>deletion</span> of your
          data by contacting our Grievance Officer. We will respond within the timelines required under
          the DPDP Act.
        </p>
      </Section>

      {/* ── 6. Data retention ───────────────────────────────────────────────── */}
      <Section icon={Clock} title="6. Data Retention">
        <p>
          We keep your personal data only for as long as it is needed for the purpose it was collected,
          or for as long as we are legally required to retain it.
        </p>
        <Bullets
          items={[
            'Transaction and tax records (including GST invoices) are retained for the period required under GST law — currently up to 8 years.',
            'On an erasure request, personal identifiers (such as your name, phone, and email) are anonymised so that retained transaction records can no longer be linked to you, while still meeting our statutory record-keeping duties.',
          ]}
        />
      </Section>

      {/* ── 7. Data security ────────────────────────────────────────────────── */}
      <Section icon={Lock} title="7. Data Security">
        <p>
          We take reasonable security safeguards to protect your personal data against unauthorised
          access, use, disclosure, alteration, or loss. These measures include:
        </p>
        <Bullets
          items={[
            'Encryption of data in transit (for example, using TLS / HTTPS).',
            'Access controls that limit personal data to authorised staff on a need-to-know basis.',
          ]}
        />
        <p>
          While we strive to protect your data, no method of transmission or storage is completely
          secure, and we cannot guarantee absolute security.
        </p>
      </Section>

      {/* ── 8. Third parties ────────────────────────────────────────────────── */}
      <Section icon={Share2} title="8. Third Parties">
        <p>
          We share personal data with trusted service providers only to the extent needed to deliver
          our services. These may include:
        </p>
        <Bullets
          items={[
            'Payment processors — to securely process card and digital payments.',
            'SMS and WhatsApp providers — to send order updates and, where you have consented, marketing messages.',
          ]}
        />
        <p>
          These providers are permitted to use your data only to perform services on our behalf, and are
          required to protect it. We do not sell your personal data.
        </p>
      </Section>

      {/* ── 9. Grievance Officer / contact ──────────────────────────────────── */}
      <Section icon={Mail} title="9. Grievance Officer & Contact">
        <p>
          If you have any questions about this policy, wish to exercise your rights, or have a complaint
          about how your personal data is handled, please contact our Grievance Officer:
        </p>
        <div
          className="rounded-lg border px-4 py-3 space-y-1.5"
          style={{ borderColor: 'var(--border)', background: 'var(--bg-primary)' }}
        >
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-medium uppercase tracking-wide w-28 flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>
              Grievance Officer
            </span>
            <Token>{'{{Grievance Officer Name}}'}</Token>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-medium uppercase tracking-wide w-28 flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>
              Email
            </span>
            <Token>{'{{contact email}}'}</Token>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-medium uppercase tracking-wide w-28 flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>
              Business
            </span>
            <Token>{'{{Business Name}}'}</Token>
          </div>
        </div>
        <p>
          We aim to acknowledge and respond to grievances within the timelines prescribed under the
          DPDP Act.
        </p>
      </Section>

      {/* ── 10. Updates ─────────────────────────────────────────────────────── */}
      <Section icon={RefreshCw} title="10. Updates to This Policy">
        <p>
          We may update this Privacy Policy from time to time to reflect changes in our practices, our
          services, or the law. When we make material changes, we will revise the &ldquo;Last
          updated&rdquo; date shown below and, where appropriate, notify you.
        </p>
        <p className="text-xs tabular-nums" style={{ color: 'var(--text-secondary)' }}>
          Last updated: {lastUpdated}
        </p>
      </Section>

      {/* ── Footer note ─────────────────────────────────────────────────────── */}
      <p className="text-xs leading-relaxed pt-1 pb-2 text-center" style={{ color: 'var(--text-secondary)' }}>
        This template is provided for convenience and does not constitute legal advice. Please review it
        with a qualified professional before publishing.
      </p>
    </div>
  );
}
