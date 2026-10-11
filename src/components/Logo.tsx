/** The Everton OS mark: an "E" drawn with three bars. */
export function Logo({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <rect width="24" height="24" rx="6.5" fill="var(--accent)" />
      <path d="M7.5 7.5h9M7.5 12h6M7.5 16.5h9" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  )
}
