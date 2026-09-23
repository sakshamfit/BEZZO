/**
 * Icon set — BEZZO's own inline SVG vocabulary.
 *
 * Stroke inherits `currentColor`; every glyph is drawn on a 24×24 grid with 1.8px
 * round strokes so the family reads as one system at 12–24px. No external icon
 * fonts or image requests: the chrome renders fully offline.
 */
import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 20, children, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const SearchIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.2-3.2" />
  </Svg>
);

export const CartIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 4h2l2.4 12.2a1.5 1.5 0 0 0 1.5 1.2h7.9a1.5 1.5 0 0 0 1.5-1.2L20 8H6" />
    <circle cx="10" cy="20.4" r="1.1" />
    <circle cx="17.4" cy="20.4" r="1.1" />
  </Svg>
);

export const HomeIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m3.5 10.5 8.5-7 8.5 7" />
    <path d="M5.5 9.5V20a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V9.5" />
    <path d="M9.8 21v-5.6a1 1 0 0 1 1-1h2.4a1 1 0 0 1 1 1V21" />
  </Svg>
);

export const GridIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
    <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
    <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
    <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
  </Svg>
);

export const ReceiptIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5.5 3.5h13v17l-2.2-1.4-2.1 1.4-2.2-1.4-2.1 1.4-2.2-1.4L5.5 20.5z" />
    <path d="M9 8h6M9 11.5h6M9 15h3.5" />
  </Svg>
);

export const UserIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="8" r="3.6" />
    <path d="M4.5 20.5c1.3-3.6 4.1-5.4 7.5-5.4s6.2 1.8 7.5 5.4" />
  </Svg>
);

export const PlusIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);

export const MinusIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 12h14" />
  </Svg>
);

export const CloseIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m6 6 12 12M18 6 6 18" />
  </Svg>
);

export const CheckIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m4.5 12.5 5 5 10-11" />
  </Svg>
);

export const CheckCircleIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="m8.2 12.4 2.6 2.6 5-5.6" />
  </Svg>
);

export const ChevronRight = (p: IconProps) => (
  <Svg {...p}>
    <path d="m9 5 7 7-7 7" />
  </Svg>
);

export const ChevronLeft = (p: IconProps) => (
  <Svg {...p}>
    <path d="m15 5-7 7 7 7" />
  </Svg>
);

export const ChevronDown = (p: IconProps) => (
  <Svg {...p}>
    <path d="m5 9 7 7 7-7" />
  </Svg>
);

export const PinIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 21.5s7-6.1 7-11.5a7 7 0 1 0-14 0c0 5.4 7 11.5 7 11.5z" />
    <circle cx="12" cy="10" r="2.6" />
  </Svg>
);

export const ClockIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7v5.2l3.2 2" />
  </Svg>
);

export const TruckIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M2.5 6.5h11v10h-11z" />
    <path d="M13.5 10h4l3 3v3.5h-7z" />
    <circle cx="7" cy="18" r="1.8" />
    <circle cx="17" cy="18" r="1.8" />
  </Svg>
);

export const HubIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3.5 9.5 12 4l8.5 5.5V20h-17z" />
    <path d="M8.5 20v-6h7v6" />
  </Svg>
);

export const BoxIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m12 3 8.5 4.5v9L12 21l-8.5-4.5v-9z" />
    <path d="m3.5 7.5 8.5 4.5 8.5-4.5M12 12v9" />
  </Svg>
);

export const ScanIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" />
    <path d="M7.5 12h9" />
  </Svg>
);

export const VerifiedIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 2.8l2.2 1.9 2.9-.3.9 2.8 2.5 1.6-1.1 2.7 1.1 2.7-2.5 1.6-.9 2.8-2.9-.3L12 21.2l-2.2-1.9-2.9.3-.9-2.8-2.5-1.6 1.1-2.7-1.1-2.7 2.5-1.6.9-2.8 2.9.3z" />
    <path d="m8.8 12.2 2.2 2.2 4.2-4.6" />
  </Svg>
);

export const ShieldIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3 5 5.8v5.4c0 4.4 3 8.2 7 9.8 4-1.6 7-5.4 7-9.8V5.8z" />
    <path d="m9 11.8 2.2 2.2 3.8-4.2" />
  </Svg>
);

export const HeartPulseIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 20.5S4 15.6 4 9.8A4.3 4.3 0 0 1 12 7a4.3 4.3 0 0 1 8 2.8c0 5.8-8 10.7-8 10.7z" />
    <path d="M7.5 11.5h2l1.5-2.6 2 4.6 1.5-2h2" />
  </Svg>
);

export const StoreIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 9.5 5.5 4h13L20 9.5" />
    <path d="M4 9.5a2.6 2.6 0 0 0 5.2 0 2.6 2.6 0 0 0 5.3 0 2.6 2.6 0 0 0 5.2 0" />
    <path d="M5.5 12.4V20h13v-7.6" />
    <path d="M10 20v-4.5h4V20" />
  </Svg>
);

export const TagIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 12.5V5a1 1 0 0 1 1-1h7.5L20 11.5 12.5 19z" />
    <circle cx="8.2" cy="8.2" r="1.4" />
  </Svg>
);

export const SparkleIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 4.5 13.8 10 19.5 12l-5.7 2-1.8 5.5L10.2 14 4.5 12l5.7-2z" />
    <path d="M18.5 4.5v3M17 6h3" />
  </Svg>
);

export const AlertIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 4 2.8 19.5h18.4z" />
    <path d="M12 10v4M12 17.2v.4" />
  </Svg>
);

export const InfoIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 11v5M12 7.8v.4" />
  </Svg>
);

export const WifiOffIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m3 3 18 18" />
    <path d="M9.5 15.5a4 4 0 0 1 5 0" />
    <path d="M6.5 12a8.5 8.5 0 0 1 3-1.9M17.5 12a8.5 8.5 0 0 0-2.2-1.5" />
    <path d="M3.5 8.5A13 13 0 0 1 8 5.8M20.5 8.5a13 13 0 0 0-4.3-2.6" />
    <path d="M12 19.5v.4" />
  </Svg>
);

export const RefreshIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20 12a8 8 0 1 1-2.5-5.8" />
    <path d="M20 3.5V8h-4.5" />
  </Svg>
);

export const TrashIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4.5 6.5h15M9.5 6.5V5a1.5 1.5 0 0 1 1.5-1.5h2A1.5 1.5 0 0 1 14.5 5v1.5" />
    <path d="M6.5 6.5 7.3 20a1.5 1.5 0 0 0 1.5 1.4h6.4a1.5 1.5 0 0 0 1.5-1.4l.8-13.5" />
    <path d="M10 10.5v7M14 10.5v7" />
  </Svg>
);

export const MenuIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Svg>
);

export const StethoscopeIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 3.5v5a4 4 0 0 0 8 0v-5" />
    <path d="M4.5 3.5h3M12.5 3.5h3" />
    <path d="M10 15.5v-3" />
    <path d="M10 15.5A5.5 5.5 0 0 0 15.5 21 5.5 5.5 0 0 0 21 15.5v-2" />
    <circle cx="21" cy="11.5" r="1.6" />
  </Svg>
);

export const PillIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3.5" y="8.5" width="17" height="7" rx="3.5" transform="rotate(-45 12 12)" />
    <path d="M8.8 8.8 15.2 15.2" />
  </Svg>
);

export const BoltIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M13 2.5 5.5 13.5H11l-1 8L18.5 10H13z" />
  </Svg>
);

export const ArrowRightIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 12h16m0 0-6-6m6 6-6 6" />
  </Svg>
);
