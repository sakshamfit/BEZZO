/**
 * Product visuals — BEZZO's standardized product imagery frame.
 *
 * The catalogue API carries no photographs, and placeholder photography of
 * medicines would be misleading. Instead every product gets a deterministic,
 * consistent visual: a soft brand-family gradient keyed by the product id, with
 * a dosage-form glyph (tablet, capsule, syrup, injection, drops, cream, device,
 * surgical). Rules from the design spec: 1:1 aspect ratio, clean background,
 * consistent padding, never stretched, zero network requests.
 */
import type { SVGProps } from 'react';

/* Brand-family gradient pairs — navy / indigo / teal family only. */
const PALETTE: Array<[string, string]> = [
  ['#122D6E', '#0A2156'],
  ['#0D5A8A', '#0A2156'],
  ['#007A69', '#0A2156'],
  ['#0E4D92', '#122D6E'],
  ['#0A2156', '#14337A'],
  ['#00779B', '#0D5A8A'],
  ['#00A891', '#007A69'],
  ['#153E75', '#0A2156'],
];

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}

export function gradientFor(key: string): [string, string] {
  return PALETTE[hashString(key) % PALETTE.length]!;
}

export type DosageGlyph =
  | 'tablet'
  | 'capsule'
  | 'syrup'
  | 'injection'
  | 'drops'
  | 'cream'
  | 'device'
  | 'surgical'
  | 'general';

/** Maps a free-form dosage form string to a glyph family. */
export function glyphForDosageForm(dosageForm: string | null | undefined): DosageGlyph {
  const value = (dosageForm ?? '').toLowerCase();
  if (!value) return 'general';
  if (/(tablet|tab|caplet)/.test(value)) return 'tablet';
  if (/capsule/.test(value)) return 'capsule';
  if (/(syrup|suspension|susp|liquid|elixir|solution|oral)/.test(value)) return 'syrup';
  if (/(injection|injectable|ampoule|vial|infusion|im\b|iv\b)/.test(value)) return 'injection';
  if (/(drop|ophthalmic|otic|nasal)/.test(value)) return 'drops';
  if (/(cream|gel|ointment|lotion|topical)/.test(value)) return 'cream';
  if (/(device|monitor|meter|kit|strip|thermometer|nebulizer|mask)/.test(value)) return 'device';
  if (/(surgical|dressing|gauze|bandage|catheter|syringe|consumable|swab)/.test(value)) return 'surgical';
  return 'general';
}

function Glyph({ kind, ...rest }: { kind: DosageGlyph } & SVGProps<SVGSVGElement>) {
  const stroke = {
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none',
  };
  switch (kind) {
    case 'tablet':
      return (
        <svg viewBox="0 0 48 48" {...rest}>
          <circle cx="24" cy="24" r="15" {...stroke} strokeWidth={2} />
          <path d="M24 9v30" {...stroke} strokeWidth={2} />
        </svg>
      );
    case 'capsule':
      return (
        <svg viewBox="0 0 48 48" {...rest}>
          <rect
            x="8"
            y="17"
            width="32"
            height="14"
            rx="7"
            transform="rotate(-35 24 24)"
            {...stroke}
            strokeWidth={2}
          />
          <path
            d="M18.5 14.5 25.5 27"
            {...stroke}
            strokeWidth={2}
            style={{ transformOrigin: 'center' }}
          />
        </svg>
      );
    case 'syrup':
      return (
        <svg viewBox="0 0 48 48" {...rest}>
          <path d="M18 6h12v5c3 1.5 5 4.5 5 8v19a3 3 0 0 1-3 3H16a3 3 0 0 1-3-3V19c0-3.5 2-6.5 5-8V6z" {...stroke} strokeWidth={2} />
          <path d="M13 26h22" {...stroke} strokeWidth={2} />
          <path d="M20 6h8" {...stroke} />
        </svg>
      );
    case 'injection':
      return (
        <svg viewBox="0 0 48 48" {...rest}>
          <path d="m30 6 12 12" {...stroke} strokeWidth={2} />
          <path d="m34 10-15 15-6 2 2-6 15-15z" {...stroke} strokeWidth={2} />
          <path d="m13 28-5 5 7 7 5-5" {...stroke} strokeWidth={2} />
          <path d="M19 33 9 43" {...stroke} />
        </svg>
      );
    case 'drops':
      return (
        <svg viewBox="0 0 48 48" {...rest}>
          <path d="M24 6c7 9 11 14.5 11 20a11 11 0 1 1-22 0c0-5.5 4-11 11-20z" {...stroke} strokeWidth={2} />
          <path d="M18 28a6 6 0 0 0 5 6" {...stroke} />
        </svg>
      );
    case 'cream':
      return (
        <svg viewBox="0 0 48 48" {...rest}>
          <path d="M14 16h20v22a3 3 0 0 1-3 3H17a3 3 0 0 1-3-3V16z" {...stroke} strokeWidth={2} />
          <path d="M17 16v-4a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v4" {...stroke} strokeWidth={2} />
          <path d="M20 24h8" {...stroke} />
        </svg>
      );
    case 'device':
      return (
        <svg viewBox="0 0 48 48" {...rest}>
          <rect x="8" y="10" width="32" height="22" rx="3" {...stroke} strokeWidth={2} />
          <path d="M18 38h12M24 32v6" {...stroke} strokeWidth={2} />
          <path d="M24 16v8m-4-4h8" {...stroke} />
        </svg>
      );
    case 'surgical':
      return (
        <svg viewBox="0 0 48 48" {...rest}>
          <rect x="9" y="9" width="30" height="30" rx="4" {...stroke} strokeWidth={2} />
          <path d="M24 16v16M16 24h16" {...stroke} strokeWidth={2.4} />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 48 48" {...rest}>
          <circle cx="24" cy="24" r="16" {...stroke} strokeWidth={2} />
          <path d="M24 15v18M15 24h18" {...stroke} strokeWidth={2.2} />
        </svg>
      );
  }
}

export function ProductVisual({
  productId,
  dosageForm,
  size = 'md',
  label,
  className,
}: {
  productId: string;
  dosageForm: string | null | undefined;
  size?: 'sm' | 'md' | 'lg';
  label: string;
  className?: string;
}) {
  const [from, to] = gradientFor(productId);
  const kind = glyphForDosageForm(dosageForm);
  return (
    <span
      className={`pvisual ${size === 'md' ? '' : size}${className ? ` ${className}` : ''}`}
      role="img"
      aria-label={`${label} — ${dosageForm ?? 'pharmaceutical product'} illustration`}
      style={{ background: `linear-gradient(140deg, ${from} 0%, ${to} 100%)` }}
    >
      <Glyph kind={kind} className="pv-glyph" />
    </span>
  );
}
