/**
 * The sign-in screen's background, promoted to a single fixed layer behind the
 * whole app so every screen (auth + workspace) shares the exact same scene:
 * the layered glow gradients (via the `.app-backdrop` CSS), the flowing wave
 * lines, and the ambient blobs. Purely decorative — sits at z-index 0 and never
 * intercepts pointer events. The workspace surfaces above are transparent /
 * lightly tinted so this reads through just as clearly as on the login screen.
 */
export function AppBackdrop() {
  return (
    <div className="app-backdrop" aria-hidden="true">
      <div className="ambient ambient-left" />
      <div className="ambient ambient-right" />
      <svg
        className="app-backdrop-waves"
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMid slice"
        fill="none"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="app-wave-l" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#c64fe0" stopOpacity="0" />
            <stop offset="0.5" stopColor="#b15cf0" stopOpacity="0.65" />
            <stop offset="1" stopColor="#7c5cff" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="app-wave-r" x1="1" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#38bdf8" stopOpacity="0" />
            <stop offset="0.5" stopColor="#5ad1ff" stopOpacity="0.65" />
            <stop offset="1" stopColor="#5b8cff" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d="M-80 140 C 260 320 180 560 520 780" stroke="url(#app-wave-l)" strokeWidth="2" />
        <path d="M-60 230 C 240 420 160 650 470 900" stroke="url(#app-wave-l)" strokeWidth="1.4" opacity="0.7" />
        <path d="M1520 200 C 1160 360 1280 600 980 840" stroke="url(#app-wave-r)" strokeWidth="2" />
        <path d="M1540 320 C 1200 460 1320 700 1040 900" stroke="url(#app-wave-r)" strokeWidth="1.4" opacity="0.7" />
        <path d="M1500 120 C 1220 280 1340 520 1080 760" stroke="url(#app-wave-r)" strokeWidth="1" opacity="0.5" />
      </svg>
    </div>
  );
}
