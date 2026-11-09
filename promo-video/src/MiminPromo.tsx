import React from "react";
import { AbsoluteFill, Audio, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig, delayRender, continueRender, Easing } from "remotion";
import MOUTH from "./mouth.json"; // bukaan mulut per frame (dihitung dari volume dubbing)

// ===== Video promosi 3D komik bersama MIMIN ARTA (dubbing: public/dub.mp3) =====
const FPS = 30;
const AUDIO_SEC = 82.21;
export const MIMIN_DURATION = Math.ceil(AUDIO_SEC * FPS) + 30;
const BOT = "@artapediaubot";
const t = (s: number) => Math.round(s * FPS);

// muat font komik sebelum render
if (typeof document !== "undefined" && typeof FontFace !== "undefined") {
  const h = delayRender("font");
  const list: [string, string, string][] = [["Bangers", "Bangers.woff2", "400"], ["Nunito", "Nunito900.woff2", "900"], ["Nunito", "Nunito800.woff2", "800"]];
  Promise.all(list.map(([fam, file, w]) => new FontFace(fam, `url(${staticFile(file)})`, { weight: w }).load().then((f) => (document.fonts as any).add(f))))
    .catch((e) => console.error("font gagal", e))
    .finally(() => continueRender(h));
}

// teks dubbing (ditranskrip dari audio lalu dirapikan) + waktunya (detik)
const SUBS: [number, number, string][] = [
  [0.0, 1.81, "Eh, bentar, bentar!"],
  [1.81, 9.23, "Butuh akun Telegram siap pakai? Atau mau userbot auto promosi yang kerja sendiri pas lu tidur?"],
  [9.23, 12.43, "Semua ada di @artapediaubot."],
  [12.43, 13.41, "Nih, lihat!"],
  [13.41, 19.5, "Di sini bisa beli akun Telegram. Gampang banget! Lu tinggal bayar pakai QRIS atau saldo."],
  [19.5, 26.06, "Ting! Pembayaran berhasil, langsung dikirim akun plus PIN 2FA-nya. Instan!"],
  [26.06, 27.62, "Terus OTP-nya..."],
  [27.62, 33.81, "Muncul angka per angka, diterusin langsung sama botnya. Enak banget kan?"],
  [33.81, 39.17, "Nah, ini role ubot-nya, yang auto share promosi."],
  [39.17, 42.84, "Nah, kalau mau yang lebih gacor, bikin ubot!"],
  [42.84, 48.59, "Ada LITE, ada GOLD yang paling laris ini, sama PLATINUM paling lengkap."],
  [48.59, 50.41, "Fiturnya ratusan."],
  [50.41, 55.45, "Ada .bc, .autobc, .cfd, semua ada."],
  [55.45, 61.14, "Beli atau Up Role langsung aktif instan, aman dan privat pula."],
  [61.14, 71.29, "Eits, belum selesai! Ada kode voucher dan diskon, notif stok baru, ada saldo, ada riwayat pesanan juga. Lengkap banget!"],
  [71.29, 78.73, "Udah, jangan mikir kelamaan. Langsung aja klik /start sekarang di @artapediaubot."],
  [78.73, 79.67, "Gas!"],
  [79.67, AUDIO_SEC + 1, "Yuk, beli sekarang, bre!"],
];
const HOT = /^(telegram|siap|pakai\??|userbot|auto|promosi|@artapediaubot\.?|qris|saldo\.?|ting!?|instan!?|otp-nya\.*|gacor,?|ubot!?|lite,?|gold|platinum|ratusan\.?|\.bc,?|\.autobc,?|\.cfd,?|voucher|diskon,?|lengkap|banget!?|\/start|gas!?|sekarang,?|2fa-nya\.?|aman|privat)$/i;

const C = { ink: "#1b0f1f", yellow: "#ffd400", pink: "#ff3d7f", purple: "#7c3aed", blue: "#2f6bff", green: "#16c35b", paper: "#fff8e7", sky: "#3cc8ff" };
const BANG = "Bangers, 'Liberation Sans', sans-serif";
const NUN = "Nunito, 'Liberation Sans', sans-serif";

// ---------------------------------------------------------------- pembantu
const useSpr = (startFrame: number, damping = 11) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: f - startFrame, fps, config: { damping, mass: 0.7 } });
};
const win = (f: number, a: number, b: number, fade = 8) =>
  interpolate(f, [a - fade, a, b, b + fade], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
const ramp = (f: number, ranges: [number, number][], fade = 8) => Math.max(0, ...ranges.map(([a, b]) => win(f, t(a), t(b), fade)));

const Halftone: React.FC<{ color: string; size?: number; opacity?: number }> = ({ color, size = 22, opacity = 0.25 }) => (
  <AbsoluteFill style={{ backgroundImage: `radial-gradient(${color} 28%, transparent 30%)`, backgroundSize: `${size}px ${size}px`, opacity }} />
);

// ledakan teks komik (TING!, GAS!, EITS!)
const Burst: React.FC<{ at: number; text: string; x: number; y: number; size?: number; color?: string; rot?: number; dur?: number }> = ({ at, text, x, y, size = 300, color = C.yellow, rot = -8, dur = 2 }) => {
  const f = useCurrentFrame();
  const p = useSpr(t(at), 8);
  const vis = win(f, t(at), t(at + dur), 6);
  if (vis <= 0) return null;
  const pts = Array.from({ length: 28 }, (_, i) => { const r = i % 2 ? 0.62 : 1; const a = (i / 28) * Math.PI * 2; return `${50 + Math.cos(a) * 50 * r},${50 + Math.sin(a) * 50 * r}`; }).join(" ");
  const shake = Math.sin(f * 1.7) * 3;
  return (
    <div style={{ position: "absolute", left: x - size / 2, top: y - size / 2, width: size, height: size, transform: `scale(${p * vis}) rotate(${rot + shake}deg)`, zIndex: 30 }}>
      <svg viewBox="0 0 100 100" style={{ position: "absolute", inset: 0 }}><polygon points={pts} fill={color} stroke={C.ink} strokeWidth={3} strokeLinejoin="round" /></svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: BANG, fontSize: size * 0.27, color: "#fff", WebkitTextStroke: `${size * 0.018}px ${C.ink}`, textShadow: `${size * 0.02}px ${size * 0.02}px 0 ${C.ink}`, letterSpacing: 2 }}>{text}</div>
    </div>
  );
};

// panel komik (bingkai hitam tebal, bayangan keras)
const Panel: React.FC<{ from: number; to: number; children: React.ReactNode; bg?: string; tilt?: number }> = ({ from, to, children, bg = C.paper, tilt = -1.2 }) => {
  const f = useCurrentFrame();
  const vis = win(f, t(from), t(to), 7);
  const p = useSpr(t(from), 12);
  if (vis <= 0) return null;
  return (
    <div style={{ position: "absolute", left: 50, top: 150, width: 980, height: 860, transform: `rotate(${tilt}deg) scale(${0.8 + 0.2 * p})`, opacity: vis, border: `10px solid ${C.ink}`, borderRadius: 26, background: bg, boxShadow: `18px 18px 0 ${C.ink}`, overflow: "hidden" }}>
      <Halftone color="#ffb3c9" size={20} opacity={0.35} />
      {children}
    </div>
  );
};
const Title: React.FC<{ at: number; text: string; color?: string; size?: number; top?: number }> = ({ at, text, color = C.pink, size = 110, top = 30 }) => {
  const p = useSpr(t(at), 9);
  return (
    <div style={{ position: "absolute", top, width: "100%", textAlign: "center", fontFamily: BANG, fontSize: size, color, WebkitTextStroke: `5px ${C.ink}`, textShadow: `8px 8px 0 ${C.ink}`, transform: `scale(${p}) rotate(${(1 - p) * -10}deg)`, letterSpacing: 3, lineHeight: 1 }}>{text}</div>
  );
};
const Chip: React.FC<{ at: number; text: string; color: string; style?: React.CSSProperties; size?: number }> = ({ at, text, color, style, size = 46 }) => {
  const p = useSpr(t(at), 10);
  return (
    <div style={{ display: "inline-block", fontFamily: NUN, fontWeight: 900, fontSize: size, color: "#fff", background: color, border: `6px solid ${C.ink}`, borderRadius: 22, padding: "12px 26px", boxShadow: `8px 8px 0 ${C.ink}`, opacity: p, transform: `translateX(${(1 - p) * 120}px) scale(${0.6 + 0.4 * p})`, ...style }}>{text}</div>
  );
};
const Stamp: React.FC<{ at: number; text: string; color?: string; x: number; y: number; rot?: number; size?: number }> = ({ at, text, color = C.green, x, y, rot = -10, size = 80 }) => {
  const f = useCurrentFrame();
  const p = interpolate(f, [t(at), t(at) + 6], [3, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.back(2)) });
  if (f < t(at)) return null;
  return <div style={{ position: "absolute", left: x, top: y, transform: `translate(-50%,-50%) rotate(${rot}deg) scale(${p})`, fontFamily: BANG, fontSize: size, color, border: `8px solid ${color}`, borderRadius: 16, padding: "4px 26px", background: "rgba(255,255,255,0.9)", whiteSpace: "nowrap", zIndex: 20, letterSpacing: 3 }}>{text}</div>;
};
// screenshot asli bot di dalam bingkai HP
const PhoneShot: React.FC<{ src: string; w: number; h: number; at: number; x: number; y: number; scroll?: [number, number, number, number] }> = ({ src, w, h, at, x, y, scroll }) => {
  const f = useCurrentFrame();
  const p = useSpr(t(at), 13);
  const dy = scroll ? interpolate(f, [t(scroll[0]), t(scroll[1])], [0, scroll[2] - scroll[3]], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.cubic) }) : 0;
  return (
    <div style={{ position: "absolute", left: x, top: y, width: w + 36, height: h + 36, borderRadius: 50, background: "#121022", border: `8px solid ${C.ink}`, padding: 18, boxShadow: `14px 14px 0 ${C.ink}`, transform: `translateY(${(1 - p) * 500}px) rotate(${(1 - p) * 12 + 2}deg)`, overflow: "hidden" }}>
      <div style={{ width: w, height: h, overflow: "hidden", borderRadius: 30 }}>
        <Img src={staticFile(src)} style={{ width: w, transform: `translateY(${-dy}px)` }} />
      </div>
    </div>
  );
};

// ---------------------------------------------------------------- adegan
const SceneHook: React.FC = () => (
  <>
    <Panel from={0} to={12.43} bg="#fff2b3">
      <Title at={0.05} text="EH, BENTAR!" size={140} top={40} />
      <div style={{ position: "absolute", top: 240, left: 50, right: 50, display: "flex", flexDirection: "column", gap: 40 }}>
        <Chip at={1.9} text="Butuh AKUN TELEGRAM siap pakai?" color={C.blue} size={50} />
        <Chip at={5.2} text="Mau USERBOT AUTO PROMOSI?" color={C.purple} size={50} />
        <Chip at={7.4} text="Kerja sendiri pas lu tidur!" color={C.pink} size={50} />
      </div>
      <Stamp at={9.3} text={`SEMUA ADA DI ${BOT}`} x={490} y={740} size={70} color={C.green} rot={-6} />
    </Panel>
  </>
);
const OtpRow: React.FC<{ at: number }> = ({ at }) => {
  const f = useCurrentFrame();
  return (
    <div style={{ display: "flex", gap: 14 }}>
      {"52814".split("").map((d, i) => {
        const on = f >= t(at + i * 0.9);
        const p = on ? Math.min(1, (f - t(at + i * 0.9)) / 6) : 0;
        return <div key={i} style={{ width: 72, height: 96, borderRadius: 16, border: `6px solid ${C.ink}`, background: on ? C.green : "#e5e0d0", fontFamily: BANG, fontSize: 70, color: "#fff", WebkitTextStroke: `3px ${C.ink}`, display: "flex", alignItems: "center", justifyContent: "center", transform: `scale(${0.7 + 0.3 * p}) translateY(${(1 - p) * -30}px)` }}>{on ? d : ""}</div>;
      })}
    </div>
  );
};
const SceneNoktel: React.FC = () => (
  <Panel from={12.43} to={33.81} tilt={1}>
    <Title at={12.5} text="BELI NOKTEL" size={104} top={22} color={C.yellow} />
    <PhoneShot src="ss-noktel.jpg" w={430} h={560} at={12.6} x={30} y={175} scroll={[20, 23, 562, 560]} />
    <div style={{ position: "absolute", left: 530, top: 180, right: 30, display: "flex", flexDirection: "column", gap: 18, alignItems: "flex-start" }}>
      <Chip at={14.2} text="Gampang banget!" color={C.pink} size={36} />
      <Chip at={16.6} text="Bayar QRIS / Saldo" color={C.blue} size={36} />
      <Chip at={21.0} text="Akun + PIN 2FA" color={C.purple} size={36} />
      <Chip at={24.6} text="INSTAN!" color={C.green} size={40} />
    </div>
    <div style={{ position: "absolute", left: 525, top: 665, opacity: interpolate(useCurrentFrame(), [t(26), t(26.4)], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
      <div style={{ fontFamily: BANG, fontSize: 56, color: C.ink, marginBottom: 10, letterSpacing: 2 }}>KODE OTP:</div>
      <OtpRow at={27.8} />
    </div>
  </Panel>
);
const RoleCard: React.FC<{ at: number; name: string; color: string; note: string; tag?: string; tagAt?: number; big?: boolean }> = ({ at, name, color, note, tag, tagAt = 0, big }) => {
  const f = useCurrentFrame();
  const p = useSpr(t(at), 10);
  const glow = big && f > t(tagAt) ? 0.5 + 0.5 * Math.sin(f / 5) : 0;
  return (
    <div style={{ width: 280, height: 420, borderRadius: 28, border: `8px solid ${C.ink}`, background: `linear-gradient(160deg, #fff 0%, ${color} 70%)`, boxShadow: `10px 10px 0 ${C.ink}, 0 0 ${70 * glow}px ${color}`, transform: `perspective(900px) rotateY(${(1 - p) * 90}deg) scale(${big ? 1.1 : 1})`, opacity: p, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", position: "relative" }}>
      {tag && f >= t(tagAt) && <div style={{ position: "absolute", top: -34, background: C.pink, color: "#fff", fontFamily: BANG, fontSize: 36, padding: "4px 18px", border: `5px solid ${C.ink}`, borderRadius: 14, whiteSpace: "nowrap", letterSpacing: 2 }}>{tag}</div>}
      <svg viewBox="0 0 24 24" width={110} height={110}><path d="M3 18l2-10 5 5 2-7 2 7 5-5 2 10z" fill="#fff" stroke={C.ink} strokeWidth={1.4} strokeLinejoin="round" /></svg>
      <div style={{ fontFamily: BANG, fontSize: 66, color: "#fff", WebkitTextStroke: `3px ${C.ink}`, letterSpacing: 2 }}>{name}</div>
      <div style={{ fontFamily: NUN, fontWeight: 900, fontSize: 28, color: C.ink, textAlign: "center", padding: "0 16px" }}>{note}</div>
    </div>
  );
};
const SceneUbot: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <>
      <Panel from={33.81} to={42.84} bg="#e3f2ff">
        <Title at={33.9} text="ROLE UBOT" size={110} top={22} color={C.sky} />
        <PhoneShot src="ss-dashboard.jpg" w={840} h={600} at={34} x={50} y={175} />
        <Stamp at={39.4} text="LEBIH GACOR? BIKIN UBOT!" x={490} y={780} size={66} color={C.pink} rot={-7} />
      </Panel>
      <Panel from={42.84} to={50.41} bg="#f1e8ff" tilt={1}>
        <Title at={42.9} text="PILIH ROLE-MU" size={100} top={28} color={C.yellow} />
        <div style={{ position: "absolute", top: 260, width: "100%", display: "flex", justifyContent: "center", gap: 30, alignItems: "center" }}>
          <RoleCard at={43.0} name="LITE" color="#5ac8fa" note="Gratis, share auto promosi" />
          <RoleCard at={43.9} name="GOLD" color="#ffc400" note="Tanpa watermark, AI & web" tag="PALING LARIS" tagAt={44.2} big />
          <RoleCard at={45.6} name="PLATINUM" color="#a26bff" note="Semua fitur terbuka" tag="PALING LENGKAP" tagAt={46.6} />
        </div>
        <Stamp at={48.6} text="FITURNYA RATUSAN!" x={490} y={790} size={72} color={C.purple} rot={-5} />
      </Panel>
      <Panel from={50.41} to={55.45} bg="#e6fff0">
        <Title at={50.45} text="PERINTAH ANDALAN" size={92} top={40} color={C.green} />
        <div style={{ position: "absolute", top: 230, width: "100%", display: "flex", flexDirection: "column", alignItems: "center", gap: 34 }}>
          {[[".bc", 50.9, C.blue], [".autobc", 51.9, C.purple], [".cfd", 53.0, C.pink]].map(([cmd, at, col]) => (
            <Chip key={cmd as string} at={at as number} text={`${cmd}`} color={col as string} size={92} style={{ fontFamily: BANG, letterSpacing: 4, padding: "6px 60px" }} />
          ))}
        </div>
        <Stamp at={53.9} text="SEMUA ADA!" x={490} y={780} size={84} color={C.green} rot={6} />
      </Panel>
      <Panel from={55.45} to={61.14} bg="#fff2b3" tilt={1}>
        <Title at={55.5} text="AKTIF INSTAN!" size={120} top={40} color={C.yellow} />
        <div style={{ position: "absolute", top: 260, width: "100%", display: "flex", justifyContent: "center", gap: 50 }}>
          {[["shield", "AMAN", 57.6, C.blue], ["lock", "PRIVAT", 59.2, C.purple]].map(([ic, label, at, col]) => {
            const p = spring({ frame: f - t(at as number), fps: FPS, config: { damping: 10 } });
            return (
              <div key={label as string} style={{ width: 360, height: 400, borderRadius: 40, border: `8px solid ${C.ink}`, background: col as string, boxShadow: `12px 12px 0 ${C.ink}`, transform: `scale(${p})`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                <svg viewBox="0 0 24 24" width={170} height={170}>
                  {ic === "shield" ? <path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z" fill="#fff" stroke={C.ink} strokeWidth={1.3} /> : <><rect x="5" y="11" width="14" height="10" rx="2" fill="#fff" stroke={C.ink} strokeWidth={1.3} /><path d="M8 11V8a4 4 0 018 0v3" stroke="#fff" strokeWidth={2.4} fill="none" /></>}
                  {ic === "shield" && <path d="M8.5 12l2.5 2.5 4.5-5" stroke={C.green} strokeWidth={2.4} fill="none" strokeLinecap="round" />}
                </svg>
                <div style={{ fontFamily: BANG, fontSize: 80, color: "#fff", WebkitTextStroke: `3px ${C.ink}`, letterSpacing: 3 }}>{label}</div>
              </div>
            );
          })}
        </div>
      </Panel>
    </>
  );
};
const SceneBonus: React.FC = () => (
  <Panel from={61.14} to={71.29} bg="#ffe3ee">
    <Title at={61.2} text="EITS! BELUM SELESAI!" size={92} top={36} color={C.yellow} />
    <div style={{ position: "absolute", top: 210, left: 60, right: 60, display: "flex", flexDirection: "column", gap: 30, alignItems: "flex-start" }}>
      <Chip at={63.4} text="Kode voucher & diskon" color={C.pink} size={50} />
      <Chip at={65.4} text="Notif stok baru" color={C.blue} size={50} />
      <Chip at={66.9} text="Saldo" color={C.green} size={50} />
      <Chip at={67.8} text="Riwayat pesanan" color={C.purple} size={50} />
    </div>
    <Stamp at={69.7} text="LENGKAP BANGET!" x={490} y={770} size={84} color={C.pink} rot={-6} />
  </Panel>
);
const SceneCta: React.FC = () => {
  const f = useCurrentFrame();
  const p = useSpr(t(71.4), 9);
  const pulse = 1 + 0.06 * Math.sin(f / 4);
  const tap = interpolate(f, [t(75.2), t(75.6), t(76)], [0, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const sweep = ((f * 3) % 200) - 60;
  return (
    <Panel from={71.29} to={AUDIO_SEC + 2} bg="#e9e2ff">
      <Title at={71.35} text="ORDER SEKARANG DI" size={84} top={50} color={C.sky} />
      <div style={{ position: "absolute", top: 210, width: "100%", textAlign: "center", transform: `scale(${p})` }}>
        <div style={{ display: "inline-block", position: "relative", overflow: "hidden", fontFamily: BANG, fontSize: 132, color: "#fff", WebkitTextStroke: `6px ${C.ink}`, textShadow: `10px 10px 0 ${C.ink}`, letterSpacing: 3, padding: "0 20px" }}>
          {BOT}
          <div style={{ position: "absolute", top: 0, bottom: 0, left: `${sweep}%`, width: "25%", background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.7), transparent)", transform: "skewX(-20deg)" }} />
        </div>
      </div>
      <div style={{ position: "absolute", top: 450, width: "100%", display: "flex", justifyContent: "center" }}>
        <div style={{ position: "relative", transform: `scale(${pulse - tap * 0.12})`, fontFamily: BANG, fontSize: 92, color: "#fff", WebkitTextStroke: `4px ${C.ink}`, background: C.green, border: `8px solid ${C.ink}`, borderRadius: 999, padding: "16px 70px", boxShadow: `12px 12px 0 ${C.ink}`, letterSpacing: 3 }}>
          KLIK /START
          {/* jari menekan */}
          <svg viewBox="0 0 24 24" width={120} height={120} style={{ position: "absolute", right: -50, bottom: -80, transform: `translate(${-tap * 20}px, ${-tap * 25}px) rotate(-20deg)` }}>
            <path d="M9 11V4a1.5 1.5 0 013 0v6l1-.2V8.5a1.5 1.5 0 013 .1V10l.8-.1a1.5 1.5 0 012 1.4V15c0 4-2.5 7-6.5 7S6 19 5 16l-1.4-3.4a1.4 1.4 0 012.4-1.4L8 13.5V11z" fill="#ffd9c2" stroke={C.ink} strokeWidth={1.2} strokeLinejoin="round" />
          </svg>
        </div>
      </div>
      <div style={{ position: "absolute", top: 650, width: "100%", textAlign: "center", fontFamily: NUN, fontWeight: 900, fontSize: 50, color: C.ink }}>t.me/artapediaubot</div>
      <Stamp at={79.8} text="YUK BELI SEKARANG!" x={490} y={765} size={62} color={C.pink} rot={-4} />
    </Panel>
  );
};

// subtitle gaya balon komik, kata muncul bertahap, kata penting kuning
const Subtitle: React.FC = () => {
  const f = useCurrentFrame();
  const sec = f / FPS;
  const seg = SUBS.find(([a, b]) => sec >= a && sec < b);
  if (!seg) return null;
  const [a, b, text] = seg;
  const words = text.split(" ");
  // kalimat panjang dipecah per 7 kata
  const chunk = 7;
  const groups: string[][] = [];
  for (let i = 0; i < words.length; i += chunk) groups.push(words.slice(i, i + chunk));
  const per = (b - a) / words.length;
  const idx = Math.min(words.length - 1, Math.floor((sec - a) / per));
  const g = Math.floor(idx / chunk);
  const shown = groups[g] || [];
  const appear = spring({ frame: f - t(a + g * chunk * per), fps: FPS, config: { damping: 14 } });
  return (
    <div style={{ position: "absolute", left: 40, right: 40, bottom: 70, display: "flex", justifyContent: "center", zIndex: 40 }}>
      <div style={{ position: "relative", background: "#fff", border: `7px solid ${C.ink}`, borderRadius: 40, padding: "22px 34px", boxShadow: `10px 10px 0 ${C.ink}`, transform: `scale(${0.9 + 0.1 * appear})`, maxWidth: 1000, textAlign: "center" }}>
        <div style={{ position: "absolute", left: "62%", top: -46, width: 0, height: 0, borderLeft: "30px solid transparent", borderRight: "30px solid transparent", borderBottom: `46px solid ${C.ink}` }} />
        <div style={{ position: "absolute", left: "calc(62% + 10px)", top: -30, width: 0, height: 0, borderLeft: "20px solid transparent", borderRight: "20px solid transparent", borderBottom: "34px solid #fff" }} />
        {shown.map((w, i) => {
          const wi = g * chunk + i;
          const on = wi <= idx;
          const hot = HOT.test(w);
          return (
            <span key={i} style={{ fontFamily: NUN, fontWeight: 900, fontSize: 56, lineHeight: 1.2, color: hot ? "#ff2e6e" : C.ink, opacity: on ? 1 : 0.25, textDecoration: wi === idx ? "underline 6px #ffd400" : "none", textUnderlineOffset: 8 }}>{w}{" "}</span>
          );
        })}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------- MIMIN ARTA (animasi + lip-sync)
// Pose maskot (gambar dari owner, latar sudah dihapus). mouth = posisi & lebar mulut di gambar 1600x1600 untuk lip-sync.
const POSES = {
  smile: { src: "mimin-smile.png", mouth: { x: 826, y: 607, w: 118, rot: -9, skin: "#f5d6c2" } },
  point: { src: "mimin-point.png", mouth: { x: 851, y: 611, w: 78, rot: -2, skin: "#f6d7c3" } },
  laugh: { src: "mimin-laugh.png", mouth: null },
} as const;
type PoseKey = keyof typeof POSES;
// jadwal pose (detik) mengikuti kalimat dubbing; selain ini = smile
const POSE_AT: [number, number, PoseKey][] = [
  [0, 1.81, "point"], [12.43, 13.41, "point"], [19.5, 20.8, "laugh"], [32.2, 33.81, "laugh"], [33.81, 39.17, "point"],
  [39.17, 42.84, "laugh"], [50.41, 52.0, "point"], [69.6, 71.29, "laugh"], [71.29, 78.73, "point"], [78.73, AUDIO_SEC + 2, "laugh"],
];
const poseAt = (sec: number): PoseKey => (POSE_AT.find(([a, b]) => sec >= a && sec < b) || [0, 0, "smile"])[2];

const MouthOverlay: React.FC<{ m: { x: number; y: number; w: number; rot: number; skin: string }; open: number }> = ({ m, open }) => {
  if (open < 0.08) return null;
  const rx = (m.w / 2) * (0.75 + 0.3 * open);
  const ry = 8 + open * 36;
  return (
    <svg viewBox="0 0 1600 1600" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
      <defs><filter id="feather"><feGaussianBlur stdDeviation="5" /></filter></defs>
      <g transform={`rotate(${m.rot} ${m.x} ${m.y})`}>
        {/* tutup mulut asli dengan warna kulit */}
        <ellipse cx={m.x} cy={m.y + 2} rx={m.w * 0.62} ry={34} fill={m.skin} filter="url(#feather)" />
        <ellipse cx={m.x} cy={m.y + 2} rx={m.w * 0.56} ry={28} fill={m.skin} />
        {/* mulut terbuka */}
        <path d={`M${m.x - rx} ${m.y} Q${m.x} ${m.y - 6} ${m.x + rx} ${m.y} Q${m.x + rx * 0.7} ${m.y + ry} ${m.x} ${m.y + ry + 2} Q${m.x - rx * 0.7} ${m.y + ry} ${m.x - rx} ${m.y} Z`} fill="#7a2a33" stroke="#d98a8f" strokeWidth={5} strokeLinejoin="round" />
        <path d={`M${m.x - rx * 0.85} ${m.y + 1} Q${m.x} ${m.y - 3} ${m.x + rx * 0.85} ${m.y + 1} L${m.x + rx * 0.8} ${m.y + 3 + open * 5} Q${m.x} ${m.y + 1 + open * 5} ${m.x - rx * 0.8} ${m.y + 3 + open * 5} Z`} fill="#fff" />
        {open > 0.35 && <ellipse cx={m.x} cy={m.y + ry * 0.75} rx={rx * 0.5} ry={ry * 0.28} fill="#e8707f" />}
        <path d={`M${m.x - rx} ${m.y} Q${m.x - rx * 1.08} ${m.y - 3} ${m.x - rx * 1.12} ${m.y - 8}`} stroke="#3a2420" strokeWidth={4} fill="none" strokeLinecap="round" />
        <path d={`M${m.x + rx} ${m.y} Q${m.x + rx * 1.08} ${m.y - 3} ${m.x + rx * 1.12} ${m.y - 8}`} stroke="#3a2420" strokeWidth={4} fill="none" strokeLinecap="round" />
      </g>
    </svg>
  );
};

const MiminActor: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sec = f / fps;
  const open = (MOUTH as number[])[f] || 0;
  const pose = poseAt(sec);
  // "pop" kecil setiap ganti pose
  const changes = POSE_AT.flatMap(([a, b]) => [t(a), t(b)]).filter((x) => x <= f);
  const last = changes.length ? Math.max(...changes) : -99;
  const pop = 1 + 0.05 * Math.max(0, 1 - (f - last) / 8);
  const enter = spring({ frame: f, fps, config: { damping: 12 } });
  const hop = ramp(f, [[19.5, 19.9], [39.2, 39.6], [61.1, 61.5], [78.7, 79.1]], 4) * 45;
  const sway = Math.sin(f / 24);
  const talkBob = open * 6 * Math.sin(f / 2.5);
  const outline = "drop-shadow(5px 0 0 #fff) drop-shadow(-5px 0 0 #fff) drop-shadow(0 5px 0 #fff) drop-shadow(0 -5px 0 #fff) drop-shadow(16px 18px 0 rgba(27,15,31,0.55)) drop-shadow(0 0 34px rgba(167,139,250,0.8))";
  return (
    <div style={{ position: "absolute", left: 300, top: 1000, width: 840, height: 840, zIndex: 10, perspective: 1400, transform: `translateY(${(1 - enter) * 900 - hop + talkBob}px)` }}>
      <div style={{ position: "absolute", inset: 0, transformOrigin: "50% 90%", transform: `rotateY(${sway * 7}deg) rotate(${sway * 1.6 + (pose === "laugh" ? Math.sin(f / 3) * 2 : 0)}deg) scale(${pop * (1 + Math.sin(f / 18) * 0.008)})`, filter: outline }}>
        {(Object.keys(POSES) as PoseKey[]).map((k) => (
          <div key={k} style={{ position: "absolute", inset: 0, opacity: k === pose ? 1 : 0 }}>
            <Img src={staticFile(POSES[k].src)} style={{ width: "100%", height: "100%" }} />
            {POSES[k].mouth && k === pose && <MouthOverlay m={POSES[k].mouth!} open={open} />}
          </div>
        ))}
      </div>
    </div>
  );
};
const NamePlate: React.FC = () => {
  const f = useCurrentFrame();
  const vis = win(f, t(1.8), t(6.5), 8);
  const p = useSpr(t(1.8), 10);
  if (vis <= 0) return null;
  return (
    <div style={{ position: "absolute", left: 40, top: 1120, opacity: vis, transform: `translateX(${(1 - p) * -300}px) rotate(-4deg)`, zIndex: 25 }}>
      <div style={{ fontFamily: BANG, fontSize: 96, color: C.yellow, WebkitTextStroke: `5px ${C.ink}`, textShadow: `8px 8px 0 ${C.ink}`, letterSpacing: 4, lineHeight: 1 }}>MIMIN ARTA</div>
      <div style={{ marginTop: 10, display: "inline-block", fontFamily: NUN, fontWeight: 900, fontSize: 34, color: "#fff", background: C.purple, border: `5px solid ${C.ink}`, borderRadius: 14, padding: "4px 18px" }}>Admin {BOT}</div>
    </div>
  );
};

// ---------------------------------------------------------------- latar
const Backdrop: React.FC = () => {
  const f = useCurrentFrame();
  const rays = Array.from({ length: 24 }, (_, i) => i);
  return (
    <AbsoluteFill style={{ background: "radial-gradient(circle at 50% 35%, #8b5cf6 0%, #4c1d95 45%, #1e0b3d 100%)", overflow: "hidden" }}>
      <svg viewBox="0 0 1000 1000" style={{ position: "absolute", left: -460, top: -40, width: 2000, height: 2000, transform: `rotate(${f * 0.15}deg)`, opacity: 0.22 }}>
        {rays.map((i) => <polygon key={i} points={`500,500 ${500 + Math.cos((i / 24) * Math.PI * 2) * 900},${500 + Math.sin((i / 24) * Math.PI * 2) * 900} ${500 + Math.cos(((i + 0.5) / 24) * Math.PI * 2) * 900},${500 + Math.sin(((i + 0.5) / 24) * Math.PI * 2) * 900}`} fill="#fff" />)}
      </svg>
      <Halftone color="#ffffff" size={26} opacity={0.12} />
      <div style={{ position: "absolute", top: 50, width: "100%", textAlign: "center", fontFamily: BANG, fontSize: 52, color: "#fff", letterSpacing: 8, WebkitTextStroke: `2px ${C.ink}` }}>UBOT ARTA PEDIA</div>
    </AbsoluteFill>
  );
};

export const MiminPromo: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: "#1e0b3d" }}>
    <Audio src={staticFile("dub.mp3")} />
    <Backdrop />
    <SceneHook />
    <SceneNoktel />
    <SceneUbot />
    <SceneBonus />
    <SceneCta />
    <MiminActor />
    <NamePlate />
    <Burst at={0.05} text="EH!" x={230} y={1330} size={280} color={C.pink} rot={10} dur={1.5} />
    <Burst at={19.5} text="TING!" x={220} y={1300} size={320} color={C.yellow} dur={1.8} />
    <Burst at={39.2} text="GACOR!" x={220} y={1300} size={320} color={C.green} rot={8} dur={2.2} />
    <Burst at={61.14} text="EITS!" x={220} y={1300} size={300} color={C.pink} dur={1.8} />
    <Burst at={78.73} text="GAS!" x={230} y={1290} size={360} color={C.yellow} rot={-12} dur={1.6} />
    <Subtitle />
  </AbsoluteFill>
);
