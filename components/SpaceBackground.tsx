export function SpaceBackground() {
  return (
    <div className="fixed inset-0 -z-10 pointer-events-none overflow-hidden">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="100%"
        height="100%"
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          {/* Left planet */}
          <radialGradient id="pl" cx="38%" cy="32%" r="60%">
            <stop offset="0%"   stopColor="#2ee6a6" stopOpacity="0.55" />
            <stop offset="45%"  stopColor="#0d5c43" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#021a17" stopOpacity="0"    />
          </radialGradient>
          {/* Right planet */}
          <radialGradient id="pr" cx="38%" cy="32%" r="60%">
            <stop offset="0%"   stopColor="#2ee6a6" stopOpacity="0.42" />
            <stop offset="55%"  stopColor="#0a3d2e" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#021a17" stopOpacity="0"    />
          </radialGradient>
          {/* Nebula left */}
          <radialGradient id="nbl" cx="5%"  cy="50%" r="25%">
            <stop offset="0%"   stopColor="#1a7a5e" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#021a17" stopOpacity="0"    />
          </radialGradient>
          {/* Nebula right */}
          <radialGradient id="nbr" cx="95%" cy="40%" r="25%">
            <stop offset="0%"   stopColor="#2ee6a6" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#021a17" stopOpacity="0"    />
          </radialGradient>
          {/* Nebula bottom center */}
          <radialGradient id="nbc" cx="50%" cy="95%" r="40%">
            <stop offset="0%"   stopColor="#0d4a38" stopOpacity="0.30" />
            <stop offset="100%" stopColor="#021a17" stopOpacity="0"    />
          </radialGradient>

          <filter id="glow-s" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="2.5" result="b"/>
            <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          <filter id="glow-p" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="18" result="b"/>
            <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          <filter id="glow-r" x="-5%" y="-60%" width="110%" height="220%">
            <feGaussianBlur stdDeviation="2" />
          </filter>
        </defs>

        {/* Nebula washes */}
        <rect width="1440" height="900" fill="url(#nbl)" />
        <rect width="1440" height="900" fill="url(#nbr)" />
        <rect width="1440" height="900" fill="url(#nbc)" />

        {/* ── Wide orbital rings that always span the viewport ──── */}
        {/* Upper sweep — glow then sharp */}
        <ellipse cx="720" cy="260" rx="850" ry="200"
          fill="none" stroke="#2ee6a6" strokeWidth="5" opacity="0.07"
          transform="rotate(-12 720 260)" filter="url(#glow-r)" />
        <ellipse cx="720" cy="260" rx="850" ry="200"
          fill="none" stroke="#2ee6a6" strokeWidth="1" opacity="0.25"
          transform="rotate(-12 720 260)" />

        {/* Lower sweep */}
        <ellipse cx="720" cy="720" rx="780" ry="175"
          fill="none" stroke="#2ee6a6" strokeWidth="4" opacity="0.07"
          transform="rotate(8 720 720)" filter="url(#glow-r)" />
        <ellipse cx="720" cy="720" rx="780" ry="175"
          fill="none" stroke="#2ee6a6" strokeWidth="0.9" opacity="0.20"
          transform="rotate(8 720 720)" />

        {/* Tight right-gutter orbit */}
        <ellipse cx="1390" cy="420" rx="145" ry="38"
          fill="none" stroke="#2ee6a6" strokeWidth="0.8" opacity="0.28"
          transform="rotate(-30 1390 420)" />

        {/* ── LEFT GUTTER PLANET (always visible) ──────────────── */}
        <circle cx="72" cy="460" r="95"
          fill="url(#pl)" filter="url(#glow-p)" />
        <circle cx="72" cy="460" r="95"
          fill="none" stroke="#2ee6a6" strokeWidth="1.2" opacity="0.35" />
        {/* Surface bands */}
        <ellipse cx="72" cy="460" rx="95" ry="26"
          fill="none" stroke="#2ee6a6" strokeWidth="0.5" opacity="0.15" />
        <ellipse cx="72" cy="460" rx="68" ry="16"
          fill="none" stroke="#2ee6a6" strokeWidth="0.4" opacity="0.12" />
        {/* Ring */}
        <ellipse cx="72" cy="460" rx="148" ry="30"
          fill="none" stroke="#2ee6a6" strokeWidth="1.4" opacity="0.32"
          transform="rotate(-15 72 460)" />
        {/* Ring hidden-half */}
        <ellipse cx="72" cy="460" rx="148" ry="30"
          fill="none" stroke="#021a17" strokeWidth="9" opacity="0.80"
          transform="rotate(-15 72 460)"
          strokeDasharray="230 266" />

        {/* ── RIGHT GUTTER PLANET ───────────────────────────────── */}
        <circle cx="1378" cy="340" r="72"
          fill="url(#pr)" filter="url(#glow-p)" />
        <circle cx="1378" cy="340" r="72"
          fill="none" stroke="#2ee6a6" strokeWidth="1" opacity="0.28" />
        {/* Ring */}
        <ellipse cx="1378" cy="340" rx="112" ry="22"
          fill="none" stroke="#2ee6a6" strokeWidth="1.1" opacity="0.28"
          transform="rotate(-18 1378 340)" />
        <ellipse cx="1378" cy="340" rx="112" ry="22"
          fill="none" stroke="#021a17" strokeWidth="7" opacity="0.78"
          transform="rotate(-18 1378 340)"
          strokeDasharray="172 182" />

        {/* ── Satellite dots on orbits ─────────────────────────── */}
        <circle cx="1520" cy="222" r="3.5" fill="#2ee6a6" opacity="0.80" filter="url(#glow-s)" />
        <circle cx="-82"  cy="298" r="3"   fill="#2ee6a6" opacity="0.70" filter="url(#glow-s)" />
        <circle cx="258"  cy="756" r="3"   fill="#2ee6a6" opacity="0.72" filter="url(#glow-s)" />
        <circle cx="1182" cy="738" r="2.8" fill="#2ee6a6" opacity="0.68" filter="url(#glow-s)" />

        {/* ── Constellation — left side ────────────────────────── */}
        <line x1="78"  y1="155" x2="195" y2="225" stroke="white" strokeWidth="0.5" opacity="0.22" />
        <line x1="195" y1="225" x2="158" y2="312" stroke="white" strokeWidth="0.5" opacity="0.20" />
        <line x1="158" y1="312" x2="245" y2="368" stroke="white" strokeWidth="0.5" opacity="0.20" />
        <circle cx="78"  cy="155" r="2.2" fill="white"   opacity="0.75" />
        <circle cx="195" cy="225" r="2.8" fill="#2ee6a6" opacity="0.85" filter="url(#glow-s)" />
        <circle cx="158" cy="312" r="2.0" fill="white"   opacity="0.65" />
        <circle cx="245" cy="368" r="2.2" fill="white"   opacity="0.72" />

        {/* ── Constellation — right side ───────────────────────── */}
        <line x1="1268" y1="598" x2="1362" y2="655" stroke="white" strokeWidth="0.5" opacity="0.20" />
        <line x1="1362" y1="655" x2="1415" y2="590" stroke="white" strokeWidth="0.5" opacity="0.20" />
        <line x1="1362" y1="655" x2="1340" y2="740" stroke="white" strokeWidth="0.5" opacity="0.18" />
        <circle cx="1268" cy="598" r="2.0" fill="white"   opacity="0.68" />
        <circle cx="1362" cy="655" r="2.8" fill="#2ee6a6" opacity="0.82" filter="url(#glow-s)" />
        <circle cx="1415" cy="590" r="2.0" fill="white"   opacity="0.65" />
        <circle cx="1340" cy="740" r="2.2" fill="white"   opacity="0.70" />

        {/* ── Shooting star ────────────────────────────────────── */}
        <line x1="580" y1="820" x2="760" y2="870"
          stroke="white" strokeWidth="1" opacity="0.18" strokeLinecap="round" />
        <circle cx="580" cy="820" r="1.8" fill="white" opacity="0.45" />

        {/* ── Star field — LEFT gutter (x 0–200) ───────────────── */}
        <circle cx="18"  cy="82"  r="1.4" fill="white" opacity="0.65" />
        <circle cx="145" cy="55"  r="1.0" fill="white" opacity="0.52" />
        <circle cx="38"  cy="148" r="1.2" fill="white" opacity="0.58" />
        <circle cx="172" cy="172" r="0.9" fill="white" opacity="0.48" />
        <circle cx="55"  cy="245" r="1.4" fill="white" opacity="0.62" />
        <circle cx="192" cy="288" r="1.0" fill="white" opacity="0.50" />
        <circle cx="22"  cy="338" r="1.2" fill="white" opacity="0.55" />
        <circle cx="162" cy="375" r="0.9" fill="white" opacity="0.48" />
        <circle cx="45"  cy="548" r="1.2" fill="white" opacity="0.55" />
        <circle cx="178" cy="572" r="1.0" fill="white" opacity="0.50" />
        <circle cx="28"  cy="628" r="1.4" fill="white" opacity="0.60" />
        <circle cx="155" cy="665" r="0.9" fill="white" opacity="0.48" />
        <circle cx="62"  cy="738" r="1.2" fill="white" opacity="0.55" />
        <circle cx="188" cy="762" r="1.0" fill="white" opacity="0.50" />
        <circle cx="32"  cy="828" r="1.4" fill="white" opacity="0.62" />
        <circle cx="165" cy="858" r="0.9" fill="white" opacity="0.48" />

        {/* ── Star field — RIGHT gutter (x 1240–1440) ──────────── */}
        <circle cx="1258" cy="68"  r="1.2" fill="white" opacity="0.58" />
        <circle cx="1392" cy="48"  r="1.4" fill="white" opacity="0.65" />
        <circle cx="1278" cy="148" r="1.0" fill="white" opacity="0.52" />
        <circle cx="1422" cy="175" r="1.2" fill="white" opacity="0.55" />
        <circle cx="1248" cy="238" r="1.4" fill="white" opacity="0.62" />
        <circle cx="1402" cy="265" r="0.9" fill="white" opacity="0.48" />
        <circle cx="1262" cy="485" r="1.2" fill="white" opacity="0.55" />
        <circle cx="1418" cy="508" r="1.0" fill="white" opacity="0.50" />
        <circle cx="1252" cy="568" r="1.4" fill="white" opacity="0.60" />
        <circle cx="1388" cy="742" r="1.2" fill="white" opacity="0.55" />
        <circle cx="1258" cy="798" r="1.0" fill="white" opacity="0.50" />
        <circle cx="1412" cy="832" r="1.4" fill="white" opacity="0.62" />
        <circle cx="1268" cy="868" r="0.9" fill="white" opacity="0.48" />

        {/* ── Star field — BOTTOM center (below content) ───────── */}
        <circle cx="285"  cy="778" r="1.2" fill="white" opacity="0.55" />
        <circle cx="448"  cy="752" r="1.4" fill="white" opacity="0.62" />
        <circle cx="612"  cy="798" r="1.0" fill="white" opacity="0.50" />
        <circle cx="775"  cy="768" r="1.2" fill="white" opacity="0.55" />
        <circle cx="938"  cy="792" r="1.4" fill="white" opacity="0.60" />
        <circle cx="1098" cy="758" r="1.0" fill="white" opacity="0.50" />
        <circle cx="325"  cy="845" r="1.0" fill="white" opacity="0.48" />
        <circle cx="502"  cy="868" r="1.4" fill="white" opacity="0.62" />
        <circle cx="678"  cy="845" r="1.2" fill="white" opacity="0.55" />
        <circle cx="848"  cy="872" r="1.0" fill="white" opacity="0.50" />
        <circle cx="1018" cy="848" r="1.4" fill="white" opacity="0.60" />
        <circle cx="1185" cy="868" r="1.2" fill="white" opacity="0.55" />

        {/* ── Bright accent stars spread across gutters ────────── */}
        <circle cx="112"  cy="92"  r="2.8" fill="#e8fff8" opacity="0.88" filter="url(#glow-s)" />
        <circle cx="38"   cy="398" r="2.5" fill="#2ee6a6" opacity="0.80" filter="url(#glow-s)" />
        <circle cx="178"  cy="680" r="2.8" fill="white"   opacity="0.85" filter="url(#glow-s)" />
        <circle cx="1312" cy="112" r="2.8" fill="#e8fff8" opacity="0.85" filter="url(#glow-s)" />
        <circle cx="1428" cy="455" r="2.5" fill="#2ee6a6" opacity="0.80" filter="url(#glow-s)" />
        <circle cx="1295" cy="798" r="2.8" fill="white"   opacity="0.82" filter="url(#glow-s)" />
        <circle cx="620"  cy="838" r="3.0" fill="#2ee6a6" opacity="0.78" filter="url(#glow-s)" />
        <circle cx="905"  cy="858" r="2.5" fill="#e8fff8" opacity="0.80" filter="url(#glow-s)" />
      </svg>
    </div>
  );
}
