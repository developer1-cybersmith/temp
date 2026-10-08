import React from 'react';

type VyavsayLogoProps = {
  className?: string;
};

const VyavsayLogo: React.FC<VyavsayLogoProps> = ({ className = 'h-12 w-12' }) => {
  const ringId = React.useId();
  const arrowId = React.useId();
  const barsId = React.useId();

  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      fill="none"
      role="img"
      aria-label="Vyavsay Assist logo"
    >
      <defs>
        <linearGradient id={ringId} x1="10" y1="10" x2="54" y2="54" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#183B6B" />
          <stop offset="100%" stopColor="#0E274A" />
        </linearGradient>
        <linearGradient id={arrowId} x1="20" y1="46" x2="52" y2="16" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#6E9B6E" />
          <stop offset="100%" stopColor="#A9C58B" />
        </linearGradient>
        <linearGradient id={barsId} x1="18" y1="48" x2="46" y2="16" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#214A84" />
          <stop offset="100%" stopColor="#7AA16F" />
        </linearGradient>
      </defs>

      <circle cx="32" cy="32" r="24" stroke={`url(#${ringId})`} strokeWidth="6" />
      <path
        d="M16 42.5L28 31l8.25 8.25L47.5 21"
        stroke={`url(#${arrowId})`}
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M16 42.5L28 31l8.25 8.25L47.5 21"
        stroke="#EEF4EE"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.95"
      />
      <rect x="19" y="29" width="6" height="15" rx="1.5" fill={`url(#${barsId})`} />
      <rect x="29" y="21" width="6" height="23" rx="1.5" fill={`url(#${barsId})`} opacity="0.95" />
      <rect x="39" y="15" width="6" height="29" rx="1.5" fill={`url(#${barsId})`} opacity="0.88" />
    </svg>
  );
};

export default VyavsayLogo;