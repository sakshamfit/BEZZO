/**
 * BEZZO logomark — the brand's own mark: a rounded "capsule tile" carrying a
 * pulse line through a stylised B. Deliberately original (no borrowed marks):
 * the capsule reads pharmaceutical, the pulse reads speed and care, the navy
 * tile grounds it in the BEZZO palette.
 */
import type { SVGProps } from 'react';

export function BrandMark({ size = 34, ...rest }: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      <defs>
        <linearGradient id="bz-mark" x1="4" y1="2" x2="36" y2="38" gradientUnits="userSpaceOnUse">
          <stop stopColor="#122D6E" />
          <stop offset="0.55" stopColor="#0A2156" />
          <stop offset="1" stopColor="#0D5A8A" />
        </linearGradient>
      </defs>
      <rect x="1.5" y="1.5" width="37" height="37" rx="11.5" fill="url(#bz-mark)" />
      <rect x="1.5" y="1.5" width="37" height="37" rx="11.5" stroke="rgba(255,255,255,0.14)" strokeWidth="1" />
      {/* stylised B */}
      <path
        d="M14 11.5h7.2c3 0 5 1.8 5 4.4 0 1.7-.8 3-2.2 3.7 1.9.6 3 2 3 4.1 0 2.9-2.2 4.8-5.6 4.8H14v-17zm6.7 7c1.4 0 2.3-.8 2.3-2.1s-.9-2-2.3-2h-3.2v4.1h3.2zm.6 7.4c1.5 0 2.5-.9 2.5-2.3 0-1.4-1-2.3-2.5-2.3h-3.8v4.6h3.8z"
        fill="#FFFFFF"
      />
      {/* signature teal pulse */}
      <path
        d="M8 20h4.4l2-4.4 3 9 2.2-4.6h4"
        stroke="#00BFA5"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

export function BrandLogo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="mk-logo">
      <BrandMark size={compact ? 30 : 34} />
      <span>
        <span className="wordmark">BEZZO</span>
        <span className="tagline">Healthcare · Simplified</span>
      </span>
    </span>
  );
}
