/** Our own play-triangle mark in hostedmcp brand style. Not Google's logo. */
export function PlayMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true" focusable="false">
      <path d="M11 7 L34 21 L11 35 Z" transform="translate(3,3)" fill="#000" stroke="#000" strokeWidth="4" strokeLinejoin="round" />
      <path d="M11 7 L34 21 L11 35 Z" fill="#AEE5BE" stroke="#000" strokeWidth="4" strokeLinejoin="round" />
    </svg>
  );
}

export function WorksWithPlay() {
  return (
    <span className="works-with">
      <PlayMark size={22} />
      Works with Google Play Console
    </span>
  );
}
