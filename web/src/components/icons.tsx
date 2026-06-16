// Inline SVG icons. Stroke icons inherit `currentColor`; brand/store marks
// carry their own fills. Keep them simple and legible — this is a safety app.
import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

function base(props: IconProps) {
  return { width: 24, height: 24, viewBox: '0 0 24 24', 'aria-hidden': true, ...props };
}

export function MapPinIcon(props: IconProps) {
  return (
    <svg {...base(props)} {...stroke}>
      <path d="M12 21s-6.5-5.6-6.5-10.5a6.5 6.5 0 0 1 13 0C18.5 15.4 12 21 12 21Z" />
      <circle cx="12" cy="10.5" r="2.5" />
    </svg>
  );
}

export function GuideIcon(props: IconProps) {
  return (
    <svg {...base(props)} {...stroke}>
      <path d="M5 4h11a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2V4Z" />
      <path d="M5 18a2 2 0 0 0 2 2" />
      <path d="M9 8h6M9 12h6" />
    </svg>
  );
}

export function KitIcon(props: IconProps) {
  return (
    <svg {...base(props)} {...stroke}>
      <path d="M9 6V5a3 3 0 0 1 6 0v1" />
      <rect x="4" y="6" width="16" height="14" rx="2.5" />
      <path d="M12 11v5M9.5 13.5h5" />
    </svg>
  );
}

export function OfflineIcon(props: IconProps) {
  return (
    <svg {...base(props)} {...stroke}>
      <path d="M5 12.5a4 4 0 0 1 3.5-4M11 7.2A6 6 0 0 1 19 13" />
      <path d="M8.5 16a3.5 3.5 0 0 0 3.5 3.5h5A3.5 3.5 0 0 0 19.5 16a3.5 3.5 0 0 0-1.2-2.6" />
      <path d="M4 4l16 16" />
    </svg>
  );
}

export function ShieldLockIcon(props: IconProps) {
  return (
    <svg {...base(props)} {...stroke}>
      <path d="M12 3l7 2.5V11c0 4.7-3 8.1-7 9.5C8 19.1 5 15.7 5 11V5.5L12 3Z" />
      <rect x="9.5" y="11" width="5" height="4" rx="1" />
      <path d="M10.5 11v-1a1.5 1.5 0 0 1 3 0v1" />
    </svg>
  );
}

export function GlobeIcon(props: IconProps) {
  return (
    <svg {...base(props)} {...stroke}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.3 2.3 3.5 5.3 3.5 8.5S14.3 18.2 12 20.5C9.7 18.2 8.5 15.2 8.5 12S9.7 5.8 12 3.5Z" />
    </svg>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <svg {...base(props)} {...stroke}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <svg {...base(props)} {...stroke}>
      <path d="M6 9.5l6 6 6-6" />
    </svg>
  );
}

// Legacy brand shield mark kept for icon-only uses.
export function BrandMark(props: IconProps) {
  return (
    <svg {...base({ viewBox: '0 0 64 64', ...props })}>
      <rect width="64" height="64" rx="14" fill="currentColor" />
      <path d="M32 12l16 6v12c0 11-6.8 18.4-16 22-9.2-3.6-16-11-16-22V18l16-6z" fill="#fff" />
      <path d="M32 18l11 4.1V30c0 7.7-4.6 12.9-11 15.6C25.6 42.9 21 37.7 21 30v-7.9L32 18z" fill="currentColor" />
      <path d="M26 31.5l4.3 4.3L40 26" fill="none" stroke="#fff" strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function AppleIcon(props: IconProps) {
  return (
    <svg {...base({ viewBox: '0 0 24 24', ...props })} fill="currentColor">
      <path d="M16.36 12.78c-.02-2.18 1.78-3.23 1.86-3.28-1.01-1.48-2.59-1.69-3.15-1.71-1.34-.13-2.61.79-3.29.79-.67 0-1.72-.77-2.83-.75-1.46.02-2.8.85-3.55 2.15-1.51 2.62-.39 6.5 1.09 8.63.72 1.04 1.58 2.21 2.71 2.17 1.09-.04 1.5-.7 2.81-.7 1.31 0 1.68.7 2.83.68 1.17-.02 1.91-1.06 2.62-2.11.83-1.21 1.17-2.38 1.19-2.44-.03-.01-2.28-.87-2.3-3.45ZM14.3 6.04c.6-.73 1-1.74.89-2.75-.86.03-1.9.57-2.52 1.3-.55.64-1.04 1.67-.91 2.65.96.08 1.94-.49 2.54-1.2Z" />
    </svg>
  );
}

export function GooglePlayIcon(props: IconProps) {
  return (
    <svg {...base({ viewBox: '0 0 24 24', ...props })}>
      <path d="M3.6 2.3c-.26.27-.4.69-.4 1.24v16.92c0 .55.14.97.4 1.24l.07.06 9.48-9.48v-.1L3.67 2.24l-.07.06Z" fill="#34A853" />
      <path d="M16.32 15.46l-3.17-3.18v-.1l3.17-3.17.07.04 3.75 2.13c1.07.61 1.07 1.6 0 2.21l-3.75 2.13-.07-.06Z" fill="#FBBC04" />
      <path d="M16.39 15.4l-3.24-3.24-9.55 9.55c.35.37.93.42 1.59.05l11.2-6.36Z" fill="#EA4335" />
      <path d="M16.39 8.88L5.19 2.52c-.66-.37-1.24-.32-1.59.05l9.55 9.55 3.24-3.24Z" fill="#4285F4" />
    </svg>
  );
}
