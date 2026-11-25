import React from 'react';

export const MathNovaLogo: React.FC<{ size?: number }> = ({ size = 36 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 36 36"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className="shrink-0 drop-shadow-[0_0_12px_rgba(6,182,212,0.6)] group-hover:scale-105 transition-transform"
  >
    <defs>
      <linearGradient
        id="mathNovaGrad"
        x1="0"
        y1="0"
        x2="36"
        y2="36"
        gradientUnits="userSpaceOnUse"
      >
        <stop stopColor="#3B82F6" />
        <stop offset="1" stopColor="#06B6D4" />
      </linearGradient>
      <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="2" result="blur" />
        <feComposite in="SourceGraphic" in2="blur" operator="over" />
      </filter>
    </defs>
    <circle
      cx="18"
      cy="18"
      r="16"
      stroke="url(#mathNovaGrad)"
      strokeWidth="1.5"
      strokeDasharray="4 2"
      opacity="0.7"
    />
    <path
      d="M18 4L30 18L18 32L6 18Z"
      fill="url(#mathNovaGrad)"
      fillOpacity="0.25"
      stroke="url(#mathNovaGrad)"
      strokeWidth="2"
      filter="url(#glow)"
    />
    <path d="M18 4V32" stroke="url(#mathNovaGrad)" strokeWidth="1.5" opacity="0.85" />
    <path d="M6 18H30" stroke="url(#mathNovaGrad)" strokeWidth="1.5" opacity="0.85" />
    <circle cx="18" cy="18" r="3.5" fill="#06B6D4" />
  </svg>
);
