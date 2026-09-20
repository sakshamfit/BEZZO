/**
 * Category visuals — compact tiles with a category glyph on a soft tinted
 * ground. Like product visuals, they are deterministic, inline and offline;
 * the tint comes from the brand family so the grid of categories reads as one
 * system rather than a wall of clip-art.
 */
import type { ReactNode } from 'react';
import {
  BoxIcon,
  HeartPulseIcon,
  HubIcon,
  PillIcon,
  ScanIcon,
  SparkleIcon,
  StethoscopeIcon,
  StoreIcon,
  TagIcon,
} from './icons';

/** Soft tint pairs: [background, foreground] — quiet, pharma-clean. */
const TINTS: Array<[string, string]> = [
  ['#E9F0FC', '#122D6E'],
  ['#E3F6F3', '#007A69'],
  ['#EAF1FB', '#0D5A8A'],
  ['#EDEFF9', '#3A86FF'],
  ['#E6F9F6', '#00A891'],
  ['#E8EEF8', '#153E75'],
];

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}

export function tintFor(key: string): [string, string] {
  return TINTS[hashString(key) % TINTS.length]!;
}

function iconForCategory(name: string): ReactNode {
  const value = name.toLowerCase();
  if (/(tablet|tab\b)/.test(value)) return <PillIcon size={24} />;
  if (/(capsule|cap\b)/.test(value)) return <PillIcon size={24} />;
  if (/(syrup|liquid|suspension)/.test(value)) return <TagIcon size={24} />;
  if (/(inject|ampoule|vial)/.test(value)) return <ScanIcon size={24} />;
  if (/(drop|ophthal|otic|nasal)/.test(value)) return <SparkleIcon size={24} />;
  if (/(cream|gel|ointment|topical)/.test(value)) return <TagIcon size={24} />;
  if (/(device|consumable|equipment|instrument)/.test(value)) return <BoxIcon size={24} />;
  if (/(surgic|dressing|bandage|disposable)/.test(value)) return <HubIcon size={24} />;
  if (/(diabet)/.test(value)) return <SparkleIcon size={24} />;
  if (/(cardiac|cardio|heart)/.test(value)) return <HeartPulseIcon size={24} />;
  if (/(vitamin|supplement|nutr)/.test(value)) return <SparkleIcon size={24} />;
  if (/(antibiotic|anti-infect|infection)/.test(value)) return <ShieldGlyph />;
  if (/(otc|over.the.counter)/.test(value)) return <TagIcon size={24} />;
  if (/(prescription|rx\b)/.test(value)) return <StethoscopeIcon size={24} />;
  if (/(medicine|pharma|drug)/.test(value)) return <PillIcon size={24} />;
  if (/(store|retail|buyer)/.test(value)) return <StoreIcon size={24} />;
  return <PillIcon size={24} />;
}

function ShieldGlyph() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M12 3 5 5.8v5.4c0 4.4 3 8.2 7 9.8 4-1.6 7-5.4 7-9.8V5.8z" />
    </svg>
  );
}

export function CategoryVisual({
  categoryKey,
  name,
  className,
}: {
  categoryKey: string;
  name: string;
  className?: string;
}) {
  const [bg, fg] = tintFor(categoryKey);
  return (
    <span
      className={`ct-visual${className ? ` ${className}` : ''}`}
      aria-hidden="true"
      style={{ background: bg, color: fg }}
    >
      {iconForCategory(name)}
    </span>
  );
}
