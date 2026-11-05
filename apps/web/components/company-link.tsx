export function CompanyLink() {
  return (
    <a className="erax-company-logo" href="https://erax.digital/" target="_blank" rel="noopener noreferrer">
      <svg viewBox="0 0 360 96" role="img" aria-label="EraX Digital">
        <g fill="none" stroke="#E4D0A4" strokeWidth="1.4" strokeLinejoin="round">
          <path d="M18 50 L34 28 L52 46 L40 62 L22 58 Z" />
          <path d="M34 28 L58 22" />
          <path d="M52 46 L70 40" />
          <path d="M40 62 L62 68" />
          <path d="M58 22 L70 40 L62 68 L46 74" />
          <path d="M22 58 L46 74" />
        </g>
        <g fill="#F3E6CC">
          <circle cx="18" cy="50" r="2.4" />
          <circle cx="34" cy="28" r="2.6" />
          <circle cx="52" cy="46" r="2.2" />
          <circle cx="40" cy="62" r="2.2" />
          <circle cx="22" cy="58" r="2" />
          <circle cx="58" cy="22" r="2.3" />
          <circle cx="70" cy="40" r="2.5" />
          <circle cx="62" cy="68" r="2.2" />
          <circle cx="46" cy="74" r="2" />
        </g>
        <text x="92" y="46" fill="currentColor" fontFamily="Georgia, 'Times New Roman', serif" fontSize="34" fontWeight="600" letterSpacing="-0.03em">
          EraX
        </text>
        <text x="94" y="74" fill="#C6A36A" fontFamily="Segoe UI, Helvetica, Arial, sans-serif" fontSize="16" fontWeight="600" letterSpacing="0.22em">
          DIGITAL
        </text>
      </svg>
    </a>
  )
}
