/** Presentation helpers shared by every screen (no business logic lives here). */

export function formatMoney(value: number | null | undefined, currency = 'INR'): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return new Intl.NumberFormat('en-IN').format(value);
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}

export function formatRelative(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (Math.abs(minutes) < 1) return 'just now';
  if (Math.abs(minutes) < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (Math.abs(days) < 30) return `${days} d ago`;
  return formatDate(date);
}

/** Human label for SCREAMING_SNAKE domain values (never invent business labels here). */
export function humanise(value: string | null | undefined): string {
  if (!value) return '—';
  return value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export type BadgeTone = 'ok' | 'warn' | 'danger' | 'info' | '';

/** Maps a status/state string to a badge tone. Presentation only — the API owns the state machine. */
export function statusTone(status: string | null | undefined): BadgeTone {
  if (!status) return '';
  const value = status.toUpperCase();
  if (['ACTIVE', 'VERIFIED', 'PUBLISHED', 'SUCCEEDED', 'OK', 'SENT', 'READ', 'DELIVERED', 'AVAILABLE'].includes(value)) {
    return 'ok';
  }
  if (['PENDING', 'PENDING_VERIFICATION', 'UNDER_REVIEW', 'DOCUMENTS_PENDING', 'REGISTERED', 'QUEUED', 'LOW_STOCK', 'WARN', 'DEGRADED'].includes(value)) {
    return 'warn';
  }
  if (['SUSPENDED', 'REJECTED', 'FAILED', 'BLOCKED', 'OUT_OF_STOCK', 'DEAD_LETTER', 'ERROR', 'DEACTIVATED', 'RESTRICTED'].includes(value)) {
    return 'danger';
  }
  return 'info';
}

/** Prescription classification labels per the compliance specification. */
export function prescriptionLabel(classification: string | null | undefined): string {
  switch (classification) {
    case 'OTP':
      return 'OTC';
    case 'NOT_SCHEDULED':
      return 'General sale';
    case 'PRESCRIPTION_REQUIRED':
      return 'Prescription required';
    case 'CONTROLLED_SCHEDULE':
      return 'Controlled schedule (Rx only)';
    case 'NARCOTIC':
      return 'Narcotic (restricted)';
    default:
      return humanise(classification);
  }
}
