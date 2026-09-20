'use client';

/**
 * The apply form (client component).
 *
 * One form drives the whole intake — wholesaler/supplier, pickup partner (picker), medical store and
 * other partnerships — because the routing rule is the same for all of them: **every application is
 * handed to the operations WhatsApp line** (+91 86046 83669 by default, configured server-side as
 * `APPLICATIONS_WHATSAPP_NUMBER`). The line itself arrives as a prop from the server shell, so the
 * number is already on screen before any JavaScript runs.
 *
 * The hand-off is explicit, never implicit: the API returns a `wa.me` deep link whose text is the
 * application summary, and this screen puts it in front of the applicant together with the number in
 * plain sight. Nothing claims the message was delivered — the applicant's own WhatsApp sends it, and
 * the platform never invents an automated approval.
 */
import Link from 'next/link';
import { useCallback, useState } from 'react';
import { apiRequest, ApiError } from '../../lib/api';
import type { ApplicationRouting, PartnerApplication, PartnerApplicationType } from '../../lib/types';

interface FormState {
  applicationType: PartnerApplicationType;
  applicantName: string;
  businessName: string;
  contactPhone: string;
  contactEmail: string;
  city: string;
  state: string;
  postalCode: string;
  gstin: string;
  licenceReference: string;
  yearsInBusiness: string;
  monthlyVolume: string;
  message: string;
}

const CHOICES: { value: PartnerApplicationType; title: string; description: string }[] = [
  {
    value: 'SUPPLIER',
    title: 'Wholesaler / supplier',
    description: 'Distributors and stockists with a valid drug licence who want to sell on BEZZO.',
  },
  {
    value: 'RETAILER',
    title: 'Medical store / retailer',
    description: 'Pharmacies and hospital stores that want to buy at wholesale rates.',
  },
  {
    value: 'PICKER',
    title: 'Pickup partner (picker)',
    description: 'Collect prepared orders from wholesalers and bring them to a BEZZO hub.',
  },
  {
    value: 'PARTNER',
    title: 'Other partnership',
    description: 'Logistics, hub space, finance or anything else you would like to discuss.',
  },
];

const EMPTY_FORM: FormState = {
  applicationType: 'SUPPLIER',
  applicantName: '',
  businessName: '',
  contactPhone: '',
  contactEmail: '',
  city: '',
  state: '',
  postalCode: '',
  gstin: '',
  licenceReference: '',
  yearsInBusiness: '',
  monthlyVolume: '',
  message: '',
};

export function ApplyForm({ routing }: { routing: ApplicationRouting | null }) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<ApiError | Error | null>(null);
  const [submitted, setSubmitted] = useState<PartnerApplication | null>(null);
  const [copied, setCopied] = useState(false);

  const update = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  }, []);

  const submit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      setSubmitting(true);
      setError(null);
      try {
        const application = await apiRequest<PartnerApplication>('/applications', {
          method: 'POST',
          body: {
            applicationType: form.applicationType,
            applicantName: form.applicantName.trim(),
            businessName: form.businessName.trim(),
            contactPhone: form.contactPhone.trim(),
            contactEmail: form.contactEmail.trim() || undefined,
            city: form.city.trim(),
            state: form.state.trim(),
            postalCode: form.postalCode.trim() || undefined,
            gstin: form.gstin.trim() || undefined,
            licenceReference: form.licenceReference.trim() || undefined,
            yearsInBusiness: form.yearsInBusiness ? Number(form.yearsInBusiness) : undefined,
            monthlyVolume: form.monthlyVolume.trim() || undefined,
            message: form.message.trim() || undefined,
          },
        });
        setSubmitted(application);
        setForm(EMPTY_FORM);
      } catch (caught) {
        setError(caught as ApiError);
      } finally {
        setSubmitting(false);
      }
    },
    [form],
  );

  const whatsappNumber = submitted?.routedToDisplay ?? routing?.whatsappNumber ?? null;

  if (submitted) {
    const messagePreview = decodeURIComponent(submitted.whatsappUrl.split('text=')[1] ?? '').replace(/\*/g, '');
    return (
      <div className="stack loose">
        <div className="page-head">
          <div>
            <p className="eyebrow">Application received</p>
            <h1>Reference {submitted.reference}</h1>
            <p>
              Your application is recorded. Send the same details to our operations line on WhatsApp so a
              person can start verification today.
            </p>
          </div>
          <span className="chip ok">Submitted</span>
        </div>

        <div className="apply-layout">
          <div className="card feature stack">
            <div className="stat-grid">
              <div className="stat">
                <div className="stat-label">Send to</div>
                <div className="stat-value" style={{ fontSize: '1.5rem' }}>
                  {whatsappNumber ?? 'operations line'}
                </div>
                <p className="hint">WhatsApp · operations team</p>
              </div>
              <div className="stat">
                <div className="stat-label">Reference</div>
                <div className="stat-value mono" style={{ fontSize: '1.25rem' }}>
                  {submitted.reference}
                </div>
                <p className="hint">Quote this in every message</p>
              </div>
            </div>

            <div className="row">
              <a className="btn accent" href={submitted.whatsappUrl} target="_blank" rel="noreferrer">
                Open WhatsApp with my details
              </a>
              <button
                type="button"
                className="btn"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(messagePreview);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2500);
                  } catch {
                    setCopied(false);
                  }
                }}
              >
                {copied ? 'Copied' : 'Copy details'}
              </button>
              <Link className="btn link" href="/">
                Back to home
              </Link>
            </div>

            <div>
              <p className="label-sm">Message that will be sent</p>
              <pre className="code-block">{messagePreview}</pre>
            </div>
          </div>

          <aside className="apply-aside stack">
            <h3>What happens next</h3>
            <ol className="stack tight" style={{ paddingLeft: '1.1rem', margin: 0 }}>
              <li>We receive your details on {whatsappNumber ?? 'WhatsApp'} and confirm your reference.</li>
              <li>
                A verification call is scheduled. Keep your drug licence, GSTIN and shop photograph handy.
              </li>
              <li>
                Once documents are verified, your BEZZO account is activated for ordering or selling —
                never before.
              </li>
            </ol>
            <p className="small">
              Submitting an application does not create an account and is not an approval. Verification is
              a human decision, recorded with an audit trail.
            </p>
          </aside>
        </div>
      </div>
    );
  }

  return (
    <div className="stack loose">
      <div className="page-head">
        <div>
          <p className="eyebrow">Partner with BEZZO</p>
          <h1>Apply to sell, pick or buy</h1>
          <p>
            One form for every partnership. Your submission is saved with a reference and delivered to our
            operations team on WhatsApp {whatsappNumber ? <strong>{whatsappNumber}</strong> : 'the operations line'}.
          </p>
        </div>
        {whatsappNumber ? <span className="chip info plain">Routes to {whatsappNumber}</span> : null}
      </div>

      <div className="apply-layout">
        <form className="card feature stack" onSubmit={submit}>
          <div>
            <p className="label-sm">I am applying as</p>
            <div className="choice-grid" style={{ marginTop: '0.5rem' }}>
              {CHOICES.map((choice) => (
                <button
                  key={choice.value}
                  type="button"
                  className={`choice${form.applicationType === choice.value ? ' selected' : ''}`}
                  aria-pressed={form.applicationType === choice.value}
                  onClick={() => update('applicationType', choice.value)}
                >
                  <span className="title">{choice.title}</span>
                  <span className="desc">{choice.description}</span>
                </button>
              ))}
            </div>
          </div>

          <hr className="divider" />

          <div className="form-grid">
            <label className="field">
              <span>Your name *</span>
              <input
                required
                minLength={2}
                value={form.applicantName}
                onChange={(event) => update('applicantName', event.target.value)}
                placeholder="Full name of the applicant"
              />
            </label>
            <label className="field">
              <span>Business name *</span>
              <input
                required
                minLength={2}
                value={form.businessName}
                onChange={(event) => update('businessName', event.target.value)}
                placeholder="Registered shop or firm name"
              />
            </label>
            <label className="field">
              <span>WhatsApp number *</span>
              <input
                required
                value={form.contactPhone}
                onChange={(event) => update('contactPhone', event.target.value)}
                placeholder="+919876543210"
                inputMode="tel"
              />
              <span className="hint">Include the country code; this is the number we call back on.</span>
            </label>
            <label className="field">
              <span>Email</span>
              <input
                type="email"
                value={form.contactEmail}
                onChange={(event) => update('contactEmail', event.target.value)}
                placeholder="you@business.com"
              />
            </label>
            <label className="field">
              <span>City *</span>
              <input required value={form.city} onChange={(event) => update('city', event.target.value)} />
            </label>
            <label className="field">
              <span>State *</span>
              <input required value={form.state} onChange={(event) => update('state', event.target.value)} />
            </label>
            <label className="field">
              <span>PIN code</span>
              <input
                value={form.postalCode}
                onChange={(event) => update('postalCode', event.target.value)}
                placeholder="221010"
              />
            </label>
            <label className="field">
              <span>Years in business</span>
              <input
                type="number"
                min={0}
                max={200}
                value={form.yearsInBusiness}
                onChange={(event) => update('yearsInBusiness', event.target.value)}
              />
            </label>
            <label className="field">
              <span>GSTIN</span>
              <input
                value={form.gstin}
                onChange={(event) => update('gstin', event.target.value.toUpperCase())}
                placeholder="09ABCDE1234F1Z5"
              />
            </label>
            <label className="field">
              <span>Drug licence number</span>
              <input
                value={form.licenceReference}
                onChange={(event) => update('licenceReference', event.target.value)}
                placeholder="Form 20 / 21 reference"
              />
            </label>
            <label className="field">
              <span>Expected monthly volume</span>
              <input
                value={form.monthlyVolume}
                onChange={(event) => update('monthlyVolume', event.target.value)}
                placeholder="e.g. 400 orders or ₹8L"
              />
            </label>
            <label className="field full">
              <span>Anything we should know?</span>
              <textarea
                value={form.message}
                maxLength={2000}
                onChange={(event) => update('message', event.target.value)}
                placeholder="Coverage area, cold-chain requirements, brands you stock, delivery preferences…"
              />
            </label>
          </div>

          {error ? (
            <div className="alert error">
              <div>
                <strong>{error instanceof ApiError ? error.code : 'ERROR'}</strong>
                <div>{error.message}</div>
                {error instanceof ApiError && error.fieldErrors?.length ? (
                  <ul className="small" style={{ margin: '0.35rem 0 0', paddingLeft: '1rem' }}>
                    {error.fieldErrors.map((fieldError) => (
                      <li key={fieldError.field}>
                        {fieldError.field}: {fieldError.message}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="spread">
            <p className="hint" style={{ maxWidth: '46ch' }}>
              By submitting you agree to be contacted on WhatsApp and phone about this application. We do not
              sell your data, and your documents are only visible to the verification team.
            </p>
            <div className="row">
              <button type="button" className="btn" onClick={() => setForm(EMPTY_FORM)} disabled={submitting}>
                Reset
              </button>
              <button type="submit" className="btn accent" disabled={submitting}>
                {submitting ? 'Submitting…' : 'Submit application'}
              </button>
            </div>
          </div>
        </form>

        <aside className="apply-aside stack loose">
          <div className="stack tight">
            <p className="eyebrow">Routed to operations</p>
            <h3 className="whatsapp-number">{whatsappNumber ?? 'WhatsApp line'}</h3>
            <p>
              Every application — supplier, retailer, picker or partner — is delivered to this single
              operations line so nothing is lost between channels.
            </p>
            {routing ? (
              <a className="btn accent" href={routing.whatsappUrl} target="_blank" rel="noreferrer">
                Message us directly
              </a>
            ) : null}
          </div>

          <div className="stack tight">
            <h3>Documents to keep ready</h3>
            <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
              <li>GST registration certificate</li>
              <li>Drug licence (Form 20/21) with validity</li>
              <li>Shop &amp; licence board photograph</li>
              <li>Owner ID and cancelled cheque</li>
            </ul>
          </div>

          <div className="stack tight">
            <h3>Already have an account?</h3>
            <p>
              <Link href="/login">Sign in</Link> instead, or <Link href="/register">create an account</Link> if
              you were invited by our team.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
