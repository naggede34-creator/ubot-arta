import React from "react";
import { AbsoluteFill, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig, Easing } from "remotion";

// ====== Pengaturan isi (ubah di sini) ======
const BOT = "@artapediaubot";
const BOT_URL = "t.me/artapediaubot";
const BRAND = "ARTA PEDIA";

const C = {
  bg1: "#0b0620", bg2: "#1a0b4a", purple: "#7c3aed", violet: "#a78bfa", green: "#22c55e", gold: "#fbbf24",
  blue: "#38bdf8", white: "#ffffff", dim: "rgba(255,255,255,0.72)", card: "rgba(255,255,255,0.08)", line: "rgba(255,255,255,0.16)",
};
const FONT = "ArtaSans, 'Liberation Sans', 'DejaVu Sans', sans-serif";

// Durasi adegan (30 fps)
const S = { hook: 90, noktel: 225, ubot: 210, bonus: 105, cta: 150 };
const OVER = 12; // tumpang-tindih antar adegan (crossfade)
const starts = (() => {
  let t = 0;
  const o: Record<keyof typeof S, number> = { hook: 0, noktel: 0, ubot: 0, bonus: 0, cta: 0 };
  (Object.keys(S) as (keyof typeof S)[]).forEach((k) => { o[k] = t; t += S[k] - OVER; });
  return o;
})();
export const PROMO_DURATION = starts.cta + S.cta;

// ====== pembantu animasi ======
const useSpring = (delay = 0, damping = 14) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: f - delay, fps, config: { damping, mass: 0.8 } });
};
const SceneFade: React.FC<{ dur: number; children: React.ReactNode }> = ({ dur, children }) => {
  const f = useCurrentFrame();
  const o = interpolate(f, [0, OVER, dur - OVER, dur], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const s = interpolate(f, [0, OVER], [1.04, 1], { extrapolateRight: "clamp" });
  return <AbsoluteFill style={{ opacity: o, transform: `scale(${s})` }}>{children}</AbsoluteFill>;
};
const Pop: React.FC<{ delay?: number; children: React.ReactNode; from?: number; style?: React.CSSProperties }> = ({ delay = 0, children, from = 60, style }) => {
  const p = useSpring(delay);
  return <div style={{ opacity: p, transform: `translateY(${(1 - p) * from}px) scale(${0.85 + 0.15 * p})`, ...style }}>{children}</div>;
};

// ====== ikon SVG (tanpa font emoji) ======
const Icon: React.FC<{ kind: "check" | "bolt" | "phone" | "key" | "lock" | "robot" | "crown" | "gift" | "bell" | "rocket" | "qr"; color: string; size?: number }> = ({ kind, color, size = 72 }) => {
  const p: Record<string, React.ReactNode> = {
    check: <path d="M5 12.5l4.5 4.5L19 7.5" stroke={C.white} strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" />,
    bolt: <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" fill={C.white} />,
    phone: <><rect x="7" y="2.5" width="10" height="19" rx="2.5" stroke={C.white} strokeWidth={2.2} fill="none" /><circle cx="12" cy="18" r="1.2" fill={C.white} /></>,
    key: <><circle cx="8" cy="12" r="4" stroke={C.white} strokeWidth={2.4} fill="none" /><path d="M12 12h9M18 12v3M21 12v2" stroke={C.white} strokeWidth={2.4} strokeLinecap="round" /></>,
    lock: <><rect x="5" y="11" width="14" height="10" rx="2" fill={C.white} /><path d="M8 11V8a4 4 0 018 0v3" stroke={C.white} strokeWidth={2.4} fill="none" /></>,
    robot: <><rect x="4" y="8" width="16" height="11" rx="3" fill={C.white} /><circle cx="9" cy="13.5" r="1.6" fill={color} /><circle cx="15" cy="13.5" r="1.6" fill={color} /><path d="M12 4v4" stroke={C.white} strokeWidth={2.2} /><circle cx="12" cy="3.5" r="1.6" fill={C.white} /></>,
    crown: <path d="M3 18l2-10 5 5 2-7 2 7 5-5 2 10z" fill={C.white} />,
    gift: <><rect x="4" y="10" width="16" height="10" rx="1.5" fill={C.white} /><rect x="3" y="7" width="18" height="4" rx="1" fill={C.white} /><path d="M12 7v13" stroke={color} strokeWidth={2.2} /></>,
    bell: <><path d="M6 16V11a6 6 0 0112 0v5l2 2H4z" fill={C.white} /><circle cx="12" cy="20.5" r="1.8" fill={C.white} /></>,
    rocket: <><path d="M12 2c4 3 5 8 4 13H8C7 10 8 5 12 2z" fill={C.white} /><circle cx="12" cy="9" r="1.8" fill={color} /><path d="M8 15l-3 4h4M16 15l3 4h-4" fill={C.white} /></>,
    qr: <><rect x="3" y="3" width="7" height="7" fill={C.white} /><rect x="14" y="3" width="7" height="7" fill={C.white} /><rect x="3" y="14" width="7" height="7" fill={C.white} /><rect x="14" y="14" width="3" height="3" fill={C.white} /><rect x="18" y="18" width="3" height="3" fill={C.white} /></>,
  };
  return (
    <div style={{ width: size, height: size, borderRadius: size * 0.3, background: color, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 10px 30px ${color}66`, flexShrink: 0 }}>
      <svg viewBox="0 0 24 24" width={size * 0.6} height={size * 0.6}>{p[kind]}</svg>
    </div>
  );
};

// ====== latar belakang ======
const Background: React.FC = () => {
  const f = useCurrentFrame();
  const blob = (x: number, y: number, r: number, col: string, sp: number, ph: number) => (
    <div style={{ position: "absolute", left: x + Math.sin(f / sp + ph) * 80, top: y + Math.cos(f / sp + ph) * 80, width: r, height: r, borderRadius: "50%", background: col, filter: "blur(120px)", opacity: 0.55 }} />
  );
  return (
    <AbsoluteFill style={{ background: `linear-gradient(160deg, ${C.bg1} 0%, ${C.bg2} 55%, #05030f 100%)`, overflow: "hidden" }}>
      {blob(-200, 100, 700, C.purple, 40, 0)}
      {blob(500, 1100, 750, "#2563eb", 50, 2)}
      {blob(300, 600, 500, "#db2777", 60, 4)}
      <AbsoluteFill style={{ backgroundImage: `linear-gradient(${C.line} 1px, transparent 1px), linear-gradient(90deg, ${C.line} 1px, transparent 1px)`, backgroundSize: "90px 90px", opacity: 0.18, transform: `translateY(${(f * 1.2) % 90}px)` }} />
    </AbsoluteFill>
  );
};

const Badge: React.FC<{ text: string; color: string }> = ({ text, color }) => (
  <div style={{ display: "inline-block", padding: "14px 34px", borderRadius: 999, background: `${color}22`, border: `3px solid ${color}`, color, fontSize: 38, fontWeight: 800, letterSpacing: 3 }}>{text}</div>
);
const Brand: React.FC = () => (
  <div style={{ position: "absolute", top: 80, width: "100%", textAlign: "center", color: C.dim, fontSize: 34, fontWeight: 700, letterSpacing: 8 }}>UBOT {BRAND}</div>
);

// ====== ADEGAN 1: pembuka ======
const Hook: React.FC = () => {
  const f = useCurrentFrame();
  const q = useSpring(0, 10);
  const shake = f > 40 && f < 52 ? Math.sin(f * 3) * 6 : 0;
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", padding: 80, textAlign: "center" }}>
      <Brand />
      <div style={{ transform: `scale(${q}) rotate(${shake / 3}deg)`, fontSize: 92, fontWeight: 900, color: C.white, lineHeight: 1.1 }}>
        Butuh <span style={{ color: C.gold }}>akun Telegram</span> siap pakai?
      </div>
      <Pop delay={28} style={{ marginTop: 60 }}>
        <div style={{ fontSize: 80, fontWeight: 900, color: C.white, lineHeight: 1.1 }}>
          Atau <span style={{ color: C.green }}>userbot</span> auto promosi?
        </div>
      </Pop>
      <Pop delay={55} style={{ marginTop: 90 }}>
        <Badge text={`SEMUA ADA DI ${BOT.toUpperCase()}`} color={C.violet} />
      </Pop>
    </AbsoluteFill>
  );
};

// ====== ADEGAN 2: beli noktel ======
const Bubble: React.FC<{ delay: number; title: string; lines: [string, string][]; color: string }> = ({ delay, title, lines, color }) => {
  const p = useSpring(delay, 16);
  return (
    <div style={{ opacity: p, transform: `translateX(${(1 - p) * -120}px)`, background: "#1e1b3a", border: `2px solid ${C.line}`, borderRadius: 28, padding: "22px 28px", marginBottom: 20, borderTopLeftRadius: 6 }}>
      <div style={{ color, fontSize: 30, fontWeight: 800, marginBottom: 10 }}>{title}</div>
      {lines.map(([k, v]) => (
        <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 27, color: C.dim, padding: "4px 0" }}>
          <span>{k}</span><span style={{ color: C.white, fontWeight: 700, fontFamily: "'DejaVu Sans Mono', monospace" }}>{v}</span>
        </div>
      ))}
    </div>
  );
};
const OtpDigits: React.FC<{ delay: number }> = ({ delay }) => {
  const f = useCurrentFrame();
  const code = "52814";
  return (
    <div style={{ display: "flex", gap: 14, justifyContent: "center", marginTop: 8 }}>
      {code.split("").map((d, i) => {
        const on = f > delay + i * 5;
        return <div key={i} style={{ width: 70, height: 88, borderRadius: 16, background: on ? C.green : "#2a2650", color: C.white, fontSize: 50, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", transform: `scale(${on ? 1 : 0.85})`, transition: "none" }}>{on ? d : ""}</div>;
      })}
    </div>
  );
};
const Phone: React.FC = () => {
  const p = useSpring(10, 15);
  return (
    <div style={{ width: 620, height: 1000, borderRadius: 70, background: "#0f0d22", border: "10px solid #2d2a4f", boxShadow: "0 40px 120px rgba(0,0,0,0.6)", padding: "70px 34px 34px", transform: `translateY(${(1 - p) * 400}px) rotate(${(1 - p) * 8}deg)`, opacity: p, position: "relative" }}>
      <div style={{ position: "absolute", top: 22, left: "50%", marginLeft: -70, width: 140, height: 26, borderRadius: 20, background: "#2d2a4f" }} />
      <div style={{ display: "flex", alignItems: "center", gap: 16, paddingBottom: 22, borderBottom: `2px solid ${C.line}`, marginBottom: 24 }}>
        <Icon kind="robot" color={C.purple} size={64} />
        <div><div style={{ color: C.white, fontSize: 32, fontWeight: 800 }}>{BRAND} Bot</div><div style={{ color: C.green, fontSize: 24 }}>{BOT} · online</div></div>
      </div>
      <Bubble delay={40} title="Pembayaran Berhasil" color={C.green} lines={[["Pesanan", "NKO-0021"], ["Bayar", "QRIS / Saldo"]]} />
      <Bubble delay={75} title="Data Akun Noktel" color={C.gold} lines={[["Nomor", "+62 812-xxxx"], ["ID Telegram", "68xxxxxx21"], ["PIN 2FA", "dikirim"]]} />
      <Bubble delay={115} title="Kode OTP diteruskan bot" color={C.blue} lines={[]} />
      <OtpDigits delay={125} />
    </div>
  );
};
const Point: React.FC<{ delay: number; icon: Parameters<typeof Icon>[0]["kind"]; color: string; text: string }> = ({ delay, icon, color, text }) => (
  <Pop delay={delay} from={40} style={{ display: "flex", alignItems: "center", gap: 22, marginBottom: 26 }}>
    <Icon kind={icon} color={color} size={70} />
    <div style={{ fontSize: 40, fontWeight: 800, color: C.white }}>{text}</div>
  </Pop>
);
const Noktel: React.FC = () => (
  <AbsoluteFill style={{ alignItems: "center", padding: "150px 70px 0" }}>
    <Pop delay={0}><Badge text="BELI NOKTEL" color={C.gold} /></Pop>
    <Pop delay={6} style={{ marginTop: 26, textAlign: "center" }}>
      <div style={{ fontSize: 84, fontWeight: 900, color: C.white, lineHeight: 1.05 }}>Akun Telegram <span style={{ color: C.gold }}>Siap Pakai</span></div>
    </Pop>
    <div style={{ marginTop: 50 }}><Phone /></div>
    <div style={{ marginTop: 50, alignSelf: "flex-start", paddingLeft: 40 }}>
      <Point delay={60} icon="qr" color={C.purple} text="Bayar QRIS otomatis / saldo" />
      <Point delay={90} icon="bolt" color={C.green} text="Akun + PIN 2FA dikirim instan" />
      <Point delay={120} icon="key" color={C.blue} text="Kode OTP diteruskan bot" />
    </div>
  </AbsoluteFill>
);

// ====== ADEGAN 3: beli ubot ======
const RoleCard: React.FC<{ delay: number; name: string; color: string; lines: string[]; best?: boolean }> = ({ delay, name, color, lines, best }) => {
  const p = useSpring(delay, 13);
  const f = useCurrentFrame();
  const glow = best ? 0.55 + 0.45 * Math.sin(f / 6) : 0;
  return (
    <div style={{ width: 300, padding: "34px 24px", borderRadius: 34, background: C.card, border: `4px solid ${color}`, transform: `perspective(900px) rotateY(${(1 - p) * 80}deg) scale(${best ? 1.08 : 1})`, opacity: p, boxShadow: best ? `0 0 ${60 * glow}px ${color}` : "none", textAlign: "center", position: "relative" }}>
      {best && <div style={{ position: "absolute", top: -26, left: "50%", transform: "translateX(-50%)", background: color, color: "#1a1200", fontSize: 22, fontWeight: 900, padding: "6px 18px", borderRadius: 999, whiteSpace: "nowrap" }}>TERLARIS</div>}
      <Icon kind="crown" color={color} size={84} />
      <div style={{ marginTop: 18, fontSize: 44, fontWeight: 900, color }}>{name}</div>
      {lines.map((l) => <div key={l} style={{ marginTop: 12, fontSize: 25, color: C.dim, lineHeight: 1.25 }}>{l}</div>)}
    </div>
  );
};
const Ubot: React.FC = () => (
  <AbsoluteFill style={{ alignItems: "center", padding: "150px 50px 0" }}>
    <Pop delay={0}><Badge text="BUAT UBOT" color={C.green} /></Pop>
    <Pop delay={6} style={{ marginTop: 26, textAlign: "center" }}>
      <div style={{ fontSize: 82, fontWeight: 900, color: C.white, lineHeight: 1.05 }}>Userbot <span style={{ color: C.green }}>Auto Promosi</span> di Akunmu</div>
    </Pop>
    <div style={{ display: "flex", gap: 26, marginTop: 90, alignItems: "flex-end" }}>
      <RoleCard delay={25} name="LITE" color={C.blue} lines={["Gratis", "Share auto", "promosi"]} />
      <RoleCard delay={40} name="GOLD" color={C.gold} lines={["Tanpa", "watermark", "AI & Web"]} best />
      <RoleCard delay={55} name="PLATINUM" color={C.violet} lines={["Semua fitur", "terbuka", "+ AI Rich"]} />
    </div>
    <div style={{ marginTop: 90, alignSelf: "flex-start", paddingLeft: 50 }}>
      <Point delay={80} icon="rocket" color={C.green} text="Ratusan fitur: .bc .autobc .cfd" />
      <Point delay={105} icon="bolt" color={C.gold} text="Beli / Up Role, aktif instan" />
      <Point delay={130} icon="lock" color={C.purple} text="Aman, data privat, auto hidup" />
    </div>
  </AbsoluteFill>
);

// ====== ADEGAN 4: bonus ======
const Bonus: React.FC = () => (
  <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", padding: 70 }}>
    <Pop delay={0} style={{ textAlign: "center" }}><div style={{ fontSize: 86, fontWeight: 900, color: C.white }}>Plus <span style={{ color: C.gold }}>Bonus!</span></div></Pop>
    <div style={{ marginTop: 70 }}>
      <Point delay={12} icon="gift" color="#ec4899" text="Kode voucher & diskon" />
      <Point delay={26} icon="bell" color={C.blue} text="Notif stok baru otomatis" />
      <Point delay={40} icon="check" color={C.green} text="Saldo & riwayat pesanan" />
    </div>
  </AbsoluteFill>
);

// ====== ADEGAN 5: ajakan ======
const Cta: React.FC = () => {
  const f = useCurrentFrame();
  const p = useSpring(4, 9);
  const pulse = 1 + 0.05 * Math.sin(f / 4);
  const sweep = interpolate(f % 60, [0, 60], [-120, 220]);
  const tap = interpolate(f, [70, 80, 90], [0, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.quad) });
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", padding: 70, textAlign: "center" }}>
      <Brand />
      <Pop delay={0}><div style={{ fontSize: 64, fontWeight: 800, color: C.dim }}>Order sekarang di</div></Pop>
      <div style={{ marginTop: 30, transform: `scale(${p})`, fontSize: 118, fontWeight: 900, color: C.white, position: "relative", overflow: "hidden", padding: "10px 20px" }}>
        {BOT}
        <div style={{ position: "absolute", top: 0, bottom: 0, left: `${sweep}%`, width: "30%", background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.45), transparent)", transform: "skewX(-20deg)" }} />
      </div>
      <Pop delay={18} style={{ marginTop: 70 }}>
        <div style={{ transform: `scale(${pulse - tap * 0.08})`, background: `linear-gradient(90deg, ${C.green}, #16a34a)`, color: C.white, fontSize: 56, fontWeight: 900, padding: "36px 70px", borderRadius: 999, boxShadow: `0 20px 60px ${C.green}88` }}>
          KLIK /start SEKARANG
        </div>
      </Pop>
      <Pop delay={30} style={{ marginTop: 60 }}>
        <div style={{ fontSize: 46, color: C.blue, fontWeight: 800 }}>{BOT_URL}</div>
      </Pop>
      <Pop delay={42} style={{ marginTop: 50, display: "flex", gap: 20, justifyContent: "center" }}>
        <Badge text="NOKTEL" color={C.gold} />
        <Badge text="UBOT" color={C.green} />
        <Badge text="QRIS" color={C.violet} />
      </Pop>
    </AbsoluteFill>
  );
};

// ====== komposisi utama ======
export const Promo: React.FC = () => (
  <AbsoluteFill style={{ fontFamily: FONT, backgroundColor: C.bg1 }}>
    <style>{`@font-face{font-family:ArtaSans;src:url(${staticFile("LiberationSans-Bold.ttf")}) format("truetype");font-weight:700 900;}@font-face{font-family:ArtaSans;src:url(${staticFile("LiberationSans-Regular.ttf")}) format("truetype");font-weight:400 600;}`}</style>
    <Background />
    <Sequence from={starts.hook} durationInFrames={S.hook}><SceneFade dur={S.hook}><Hook /></SceneFade></Sequence>
    <Sequence from={starts.noktel} durationInFrames={S.noktel}><SceneFade dur={S.noktel}><Noktel /></SceneFade></Sequence>
    <Sequence from={starts.ubot} durationInFrames={S.ubot}><SceneFade dur={S.ubot}><Ubot /></SceneFade></Sequence>
    <Sequence from={starts.bonus} durationInFrames={S.bonus}><SceneFade dur={S.bonus}><Bonus /></SceneFade></Sequence>
    <Sequence from={starts.cta} durationInFrames={S.cta}><SceneFade dur={S.cta + OVER}><Cta /></SceneFade></Sequence>
  </AbsoluteFill>
);
