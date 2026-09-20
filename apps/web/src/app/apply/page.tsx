import { serverGet } from '../../lib/api';
import type { ApplicationRouting } from '../../lib/types';
import { ApplyForm } from './apply-form';

export const dynamic = 'force-dynamic';

/**
 * Apply to partner with BEZZO — server shell.
 *
 * The operations WhatsApp line is fetched on the server and passed down, so the number an applicant is
 * asked to message is present in the delivered HTML even before hydration (and stays correct if the
 * number is ever reconfigured in `APPLICATIONS_WHATSAPP_NUMBER`). The API already reads that number
 * from configuration; the literal in the copy is only a last-resort fallback.
 */
export default async function ApplyPage() {
  const envelope = await serverGet<ApplicationRouting>('/applications/routing');
  const routing = envelope?.data ?? null;

  return <ApplyForm routing={routing} />;
}
