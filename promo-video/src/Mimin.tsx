import React from "react";

// ===== MIMIN ARTA — maskot ARTA PEDIA =====
// Gaya 3D komik: shading gradasi (radial / linear), outline tebal, highlight rambut & kacamata, rim light ungu.
// Dosen muda yang rapi: rambut dicepol, kacamata, blazer navy + kemeja putih, name tag, tablet & tongkat penunjuk.
// Props animasi:
//   mouth 0..1  : bukaan mulut (dari amplitudo dubbing -> lip-sync)
//   blink 0..1  : 1 = mata tertutup
//   brow  -1..1 : alis naik (1) / turun (-1)
//   point 0..1  : lengan kanan menunjuk ke atas
//   tilt        : kemiringan kepala (derajat)
//   wave  0..1  : tangan kiri melambai (mengganti tablet)
export type MiminProps = { mouth: number; blink: number; brow: number; point: number; tilt: number; wave?: number; waveT?: number; wink?: number };

const OL = "#1b0f1f"; // warna outline
const SW = 6; // tebal outline

export const Mimin: React.FC<MiminProps & { style?: React.CSSProperties }> = ({ mouth, blink, brow, point, tilt, wave = 0, waveT = 0, wink = 0, style }) => {
  const m = Math.max(0, Math.min(1, mouth));
  const eyeL = Math.max(blink, wink);
  const armAngle = 18 - point * 128; // lengan penunjuk
  return (
    <svg viewBox="0 0 600 1000" style={{ overflow: "visible", ...style }}>
      <defs>
        <radialGradient id="skin" cx="45%" cy="38%" r="70%">
          <stop offset="0%" stopColor="#ffe9dc" />
          <stop offset="55%" stopColor="#fbcdb3" />
          <stop offset="100%" stopColor="#e39c7e" />
        </radialGradient>
        <linearGradient id="skinDark" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#d98e70" />
          <stop offset="100%" stopColor="#f3b99c" />
        </linearGradient>
        <linearGradient id="hair" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#5a2f1e" />
          <stop offset="50%" stopColor="#3a1b10" />
          <stop offset="100%" stopColor="#1e0c07" />
        </linearGradient>
        <linearGradient id="hairHi" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="50%" stopColor="#ffd6c2" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="blazer" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#3b4fc4" />
          <stop offset="45%" stopColor="#24308a" />
          <stop offset="100%" stopColor="#111a52" />
        </linearGradient>
        <linearGradient id="shirt" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#d9dcf0" />
        </linearGradient>
        <radialGradient id="iris" cx="50%" cy="35%" r="65%">
          <stop offset="0%" stopColor="#c4a3ff" />
          <stop offset="55%" stopColor="#7c3aed" />
          <stop offset="100%" stopColor="#2e1065" />
        </radialGradient>
        <linearGradient id="tablet" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#7c3aed" />
          <stop offset="100%" stopColor="#2563eb" />
        </linearGradient>
        <radialGradient id="shadow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#000" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#000" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* bayangan lantai */}
      <ellipse cx="300" cy="990" rx="260" ry="30" fill="url(#shadow)" />

      {/* rambut belakang (cepol rapi + sedikit rambut belakang leher) */}
      <g>
        <path d="M168 330 Q150 520 200 600 L400 600 Q450 520 432 330 Z" fill="url(#hair)" stroke={OL} strokeWidth={SW} strokeLinejoin="round" />
      </g>

      {/* lengan penunjuk (kanan penonton) — di belakang badan saat turun */}
      <g transform={`rotate(${armAngle} 455 640)`}>
        <path d="M425 610 Q470 600 490 640 L520 860 Q505 890 470 885 L430 660 Z" fill="url(#blazer)" stroke={OL} strokeWidth={SW} strokeLinejoin="round" />
        <path d="M468 880 L520 868 L524 890 L470 902 Z" fill="url(#shirt)" stroke={OL} strokeWidth={4} />
        {/* tangan + tongkat penunjuk */}
        <line x1="498" y1="905" x2="520" y2={905 + 190 * (0.3 + point * 0.7)} stroke="#2b2b3a" strokeWidth={9} strokeLinecap="round" />
        <circle cx="520" cy={905 + 190 * (0.3 + point * 0.7)} r={10 + point * 4} fill="#fbbf24" stroke={OL} strokeWidth={4} />
        <ellipse cx="497" cy="912" rx="30" ry="26" fill="url(#skin)" stroke={OL} strokeWidth={SW} />
      </g>

      {/* leher */}
      <path d="M262 455 L338 455 L345 580 Q300 605 255 580 Z" fill="url(#skinDark)" stroke={OL} strokeWidth={SW} strokeLinejoin="round" />

      {/* badan: blazer + kemeja */}
      <path d="M95 1000 Q90 700 150 625 Q200 585 262 568 L300 640 L338 568 Q400 585 450 625 Q510 700 505 1000 Z" fill="url(#blazer)" stroke={OL} strokeWidth={SW} strokeLinejoin="round" />
      <path d="M255 570 L300 640 L345 570 L360 600 L300 760 L240 600 Z" fill="url(#shirt)" stroke={OL} strokeWidth={5} strokeLinejoin="round" />
      {/* kerah kemeja */}
      <path d="M255 570 L300 640 L268 650 L238 598 Z" fill="#fff" stroke={OL} strokeWidth={4} strokeLinejoin="round" />
      <path d="M345 570 L300 640 L332 650 L362 598 Z" fill="#fff" stroke={OL} strokeWidth={4} strokeLinejoin="round" />
      {/* kerah blazer (lapel) */}
      <path d="M238 598 L300 770 L250 830 L205 640 Z" fill="#1a2470" stroke={OL} strokeWidth={5} strokeLinejoin="round" />
      <path d="M362 598 L300 770 L350 830 L395 640 Z" fill="#1a2470" stroke={OL} strokeWidth={5} strokeLinejoin="round" />
      {/* kilau blazer (efek 3D) */}
      <path d="M150 650 Q130 760 140 900" stroke="#8ea2ff" strokeOpacity={0.45} strokeWidth={14} fill="none" strokeLinecap="round" />
      <path d="M455 660 Q470 760 462 900" stroke="#000" strokeOpacity={0.25} strokeWidth={18} fill="none" strokeLinecap="round" />
      {/* kancing */}
      <circle cx="300" cy="835" r="9" fill="#fbbf24" stroke={OL} strokeWidth={3} />
      <circle cx="300" cy="900" r="9" fill="#fbbf24" stroke={OL} strokeWidth={3} />
      {/* name tag */}
      <g transform="rotate(-4 400 720)">
        <rect x="345" y="695" width="115" height="48" rx="8" fill="#fff" stroke={OL} strokeWidth={4} />
        <rect x="345" y="695" width="115" height="15" rx="6" fill="#7c3aed" />
        <text x="402" y="735" textAnchor="middle" fontFamily="Bangers, sans-serif" fontSize="22" fill="#1b0f1f" letterSpacing="1">MIMIN ARTA</text>
      </g>

      {/* lengan kiri: memegang tablet / melambai */}
      {wave < 0.5 ? (
        <g>
          <path d="M150 625 Q105 640 100 720 L118 870 Q150 900 185 875 L190 720 Z" fill="url(#blazer)" stroke={OL} strokeWidth={SW} strokeLinejoin="round" />
          <g transform="rotate(-12 250 860)">
            <rect x="150" y="790" width="210" height="140" rx="16" fill="#151231" stroke={OL} strokeWidth={SW} />
            <rect x="162" y="802" width="186" height="116" rx="10" fill="url(#tablet)" />
            <text x="255" y="852" textAnchor="middle" fontFamily="Bangers, sans-serif" fontSize="30" fill="#fff">ARTA PEDIA</text>
            <text x="255" y="888" textAnchor="middle" fontFamily="Nunito, sans-serif" fontWeight={900} fontSize="19" fill="#fde68a">@artapediaubot</text>
            <path d="M175 810 L215 810 L180 860 Z" fill="#fff" opacity={0.25} />
          </g>
          <ellipse cx="170" cy="880" rx="30" ry="24" fill="url(#skin)" stroke={OL} strokeWidth={SW} />
        </g>
      ) : (
        // lengan kiri terangkat, tangan melambai di samping kepala
        <g>
          <path d="M150 625 Q100 610 92 540 L88 430 Q110 405 140 425 L165 560 Q175 600 190 630 Z" fill="url(#blazer)" stroke={OL} strokeWidth={SW} strokeLinejoin="round" />
          <g transform={`rotate(${waveT * 14} 112 425)`}>
            <path d="M84 430 L130 422 L132 440 L86 448 Z" fill="url(#shirt)" stroke={OL} strokeWidth={4} />
            <ellipse cx="110" cy="395" rx="30" ry="36" fill="url(#skin)" stroke={OL} strokeWidth={SW} />
            <path d="M88 380 L80 350 M102 368 L98 335 M118 366 L120 332 M132 376 L140 348" stroke={OL} strokeWidth={5} strokeLinecap="round" />
          </g>
        </g>
      )}

      {/* ===== kepala ===== */}
      <g transform={`rotate(${tilt} 300 470)`}>
        {/* cepol */}
        <circle cx="300" cy="135" r="62" fill="url(#hair)" stroke={OL} strokeWidth={SW} />
        <path d="M262 115 Q300 85 338 115" stroke="url(#hairHi)" strokeWidth={12} fill="none" strokeLinecap="round" />
        <rect x="255" y="180" width="90" height="20" rx="10" fill="#fbbf24" stroke={OL} strokeWidth={4} />
        {/* telinga + anting */}
        <ellipse cx="175" cy="330" rx="22" ry="34" fill="url(#skinDark)" stroke={OL} strokeWidth={SW} />
        <ellipse cx="425" cy="330" rx="22" ry="34" fill="url(#skinDark)" stroke={OL} strokeWidth={SW} />
        <circle cx="175" cy="372" r="8" fill="#fbbf24" stroke={OL} strokeWidth={3} />
        <circle cx="425" cy="372" r="8" fill="#fbbf24" stroke={OL} strokeWidth={3} />
        {/* wajah */}
        <path d="M180 300 Q178 175 300 170 Q422 175 420 300 Q418 410 300 470 Q182 410 180 300 Z" fill="url(#skin)" stroke={OL} strokeWidth={SW} strokeLinejoin="round" />
        {/* pipi merona */}
        <ellipse cx="228" cy="385" rx="30" ry="15" fill="#ff7aa2" opacity={0.38} />
        <ellipse cx="372" cy="385" rx="30" ry="15" fill="#ff7aa2" opacity={0.38} />

        {/* mata */}
        {[[245, 1 - eyeL], [355, 1 - blink]].map(([cx, open], i) => (
          <g key={i} transform={`translate(${cx} 322) scale(1 ${Math.max(0.08, open as number)}) translate(${-(cx as number)} -322)`}>
            <ellipse cx={cx} cy="322" rx="30" ry="34" fill="#fff" stroke={OL} strokeWidth={4} />
            <circle cx={(cx as number) + 2} cy="326" r="23" fill="url(#iris)" />
            <circle cx={(cx as number) + 2} cy="328" r="10" fill="#14051f" />
            <circle cx={(cx as number) - 7} cy="314" r="8" fill="#fff" />
            <circle cx={(cx as number) + 10} cy="338" r="4" fill="#fff" opacity={0.85} />
            {/* bulu mata */}
            <path d={`M${(cx as number) - 34} 312 Q${cx} 278 ${(cx as number) + 34} 310`} stroke={OL} strokeWidth={9} fill="none" strokeLinecap="round" />
            <path d={`M${i === 0 ? (cx as number) - 32 : (cx as number) + 32} 310 l${i === 0 ? -12 : 12} -8`} stroke={OL} strokeWidth={6} strokeLinecap="round" />
          </g>
        ))}
        {/* garis mata tertutup */}
        {eyeL > 0.85 && <path d="M215 324 Q245 340 275 324" stroke={OL} strokeWidth={6} fill="none" strokeLinecap="round" />}
        {blink > 0.85 && <path d="M325 324 Q355 340 385 324" stroke={OL} strokeWidth={6} fill="none" strokeLinecap="round" />}

        {/* alis */}
        <path d={`M212 ${268 - brow * 12} Q245 ${252 - brow * 16} 280 ${266 - brow * 10}`} stroke="#3a1b10" strokeWidth={8} fill="none" strokeLinecap="round" />
        <path d={`M320 ${266 - brow * 10} Q355 ${252 - brow * 16} 388 ${268 - brow * 12}`} stroke="#3a1b10" strokeWidth={8} fill="none" strokeLinecap="round" />

        {/* kacamata */}
        <g>
          <rect x="200" y="282" width="92" height="80" rx="22" fill="#bfe3ff" fillOpacity={0.14} stroke="#1f1b3a" strokeWidth={7} />
          <rect x="308" y="282" width="92" height="80" rx="22" fill="#bfe3ff" fillOpacity={0.14} stroke="#1f1b3a" strokeWidth={7} />
          <path d="M292 312 Q300 302 308 312" stroke="#1f1b3a" strokeWidth={7} fill="none" />
          <path d="M200 305 L180 300 M400 305 L420 300" stroke="#1f1b3a" strokeWidth={7} strokeLinecap="round" />
          <path d="M215 345 L250 292 M232 352 L262 306" stroke="#fff" strokeWidth={6} opacity={0.5} strokeLinecap="round" />
          <path d="M323 345 L358 292" stroke="#fff" strokeWidth={6} opacity={0.5} strokeLinecap="round" />
        </g>

        {/* hidung */}
        <path d="M300 360 Q306 378 296 384" stroke="#c97a5d" strokeWidth={4} fill="none" strokeLinecap="round" />

        {/* mulut (lip-sync) */}
        {m < 0.06 ? (
          <path d="M268 410 Q300 432 332 410" stroke="#b8324f" strokeWidth={7} fill="none" strokeLinecap="round" />
        ) : (
          <g>
            <path d={`M${272 - m * 6} 408 Q300 ${400 - m * 2} ${328 + m * 6} 408 Q${322 + m * 4} ${414 + m * 34} 300 ${416 + m * 36} Q${278 - m * 4} ${414 + m * 34} ${272 - m * 6} 408 Z`} fill="#6e1424" stroke="#b8324f" strokeWidth={5} strokeLinejoin="round" />
            <path d={`M${276 - m * 4} 410 Q300 ${405} ${324 + m * 4} 410 L${322 + m * 3} ${414 + m * 4} Q300 ${410 + m * 3} ${278 - m * 3} ${414 + m * 4} Z`} fill="#fff" />
            {m > 0.35 && <ellipse cx="300" cy={414 + m * 28} rx={14 + m * 6} ry={5 + m * 6} fill="#ff6f8a" />}
          </g>
        )}

        {/* poni & rambut samping (rapi) */}
        <path d="M178 305 Q170 170 300 160 Q430 170 422 305 Q400 230 345 205 Q330 245 270 250 Q290 225 285 205 Q235 220 215 260 Q195 280 178 305 Z" fill="url(#hair)" stroke={OL} strokeWidth={SW} strokeLinejoin="round" />
        <path d="M180 300 Q165 400 192 470 Q205 420 200 330 Z" fill="url(#hair)" stroke={OL} strokeWidth={5} strokeLinejoin="round" />
        <path d="M420 300 Q435 400 408 470 Q395 420 400 330 Z" fill="url(#hair)" stroke={OL} strokeWidth={5} strokeLinejoin="round" />
        {/* kilau rambut (3D) */}
        <path d="M215 215 Q300 175 385 215" stroke="url(#hairHi)" strokeWidth={14} fill="none" strokeLinecap="round" />
      </g>
    </svg>
  );
};
