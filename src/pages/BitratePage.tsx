/* หน้าบิตเรตวิดีโอ แบบ Bitrate Viewer
   พี่กันสั่ง 9 พ.ย. 2569 "สร้าง bitrate viewer จากรูปที่ให้ไป UI UX เหมือนกันขึ้นมาเลย เอาใส่สักหน้านึงในโปรแกรมก่อน ค่อยย้าย"
   · "ตอนที่มันรัน มันจะค่อย ๆ อ่านจากซ้ายมาขวานะ" · "ระบบอ่าน bitrate แปลงจาก ffmpeg เลย"
   ฝั่ง Rust ใช้ ffprobe ของชุด ffmpeg ที่แนบมา อ่านขนาดแพ็กเก็ตวิดีโอ ส่งเป็นไบต์ต่อวินาทีทีละช่วง (bitrate.rs)
   สีวัดจากภาพหน้าจอ Bitrate Viewer ที่พี่กันส่ง (ROADMAP หัวข้อกราฟบิตเรต) · สีเป็นเนื้อหา ไม่เปลี่ยนตามโทน จึงเขียนในไฟล์นี้ ไม่ใส่ในไฟล์สไตล์ */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { bitrateApi, inApp, pickFile, type BrInfo } from "../lib/api";

const C = {
  win: "rgb(240,240,240)", plot: "rgb(255,255,255)", frame: "rgb(160,160,160)",
  purpleLo: "rgb(129,127,255)", purpleHi: "rgb(170,127,215)", pinkHi: "rgb(220,127,166)", pinkLo: "rgb(208,138,183)", over: "rgb(254,127,138)",
  red: "rgb(230,30,30)", mid: "rgb(0,0,0)", grid: "rgb(190,190,190)", avg: "rgb(140,140,140)", cursor: "rgb(0,0,0)",
  head1: "rgb(140,146,255)", head2: "rgb(205,208,255)", text: "rgb(0,0,0)", sample: "rgb(0,128,0)", key: "rgb(40,40,120)",
};
const FONT = `"Segoe UI", Tahoma, sans-serif`;

type Prog = { run: number; from: number; bytes: number[]; keys: number[]; frames: number; readTo: number };
type Done = { run: number; ok: boolean; stopped?: boolean; error?: string; frames?: number };

/** 1 2 5 คูณสิบยกกำลัง ที่ไม่น้อยกว่า x */
const niceUp = (x: number) => { if (!(x > 0)) return 1; const p = 10 ** Math.floor(Math.log10(x)); for (const m of [1, 2, 5, 10]) if (m * p >= x) return m * p; return 10 * p; };
/** 1 2 5 คูณสิบยกกำลัง ที่ใกล้ x ที่สุดแบบล็อก */
const niceNear = (x: number) => { if (!(x > 0)) return 1; const p = 10 ** Math.floor(Math.log10(x)); return [1, 2, 5, 10].map((m) => m * p).sort((a, b) => Math.abs(Math.log(a / x)) - Math.abs(Math.log(b / x)))[0]; };
const hms = (t: number) => { const ms = Math.max(0, Math.round(t * 1000)); const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60; return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}:${String(ms % 1000).padStart(3, "0")}`; };
const kb = (v: number) => `${Math.round(v)} kbps`;

export default function BitratePage() {
  const [path, setPath] = useState<string | null>(null);
  const [info, setInfo] = useState<BrInfo | null>(null);
  const [running, setRunning] = useState(false);
  const [err, setErr] = useState("");
  const [ver, setVer] = useState(0);
  const [cur, setCur] = useState<number | null>(null);
  const bins = useRef<number[]>([]);
  const keys = useRef<number[]>([]);
  const frames = useRef(0);
  const readTo = useRef(0);
  const done = useRef(false);
  const run = useRef(0);
  const plotRef = useRef<HTMLDivElement>(null);
  const cvRef = useRef<HTMLCanvasElement>(null);
  const [box, setBox] = useState({ w: 600, h: 300 });

  useLayoutEffect(() => {
    const el = plotRef.current; if (!el) return;
    const ro = new ResizeObserver(() => setBox({ w: Math.max(50, el.clientWidth), h: Math.max(50, el.clientHeight) }));
    ro.observe(el); return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!inApp) return;
    let live = true; const offs: (() => void)[] = [];
    listen<Prog>("bitrate-progress", (e) => {
      const p = e.payload; if (p.run !== run.current) return;
      bins.current.splice(p.from, bins.current.length - p.from, ...p.bytes);
      keys.current.push(...p.keys); frames.current = p.frames; readTo.current = p.readTo; setVer((v) => v + 1);
    }).then((u) => (live ? offs.push(u) : u()));
    listen<Done>("bitrate-done", (e) => {
      const d = e.payload; if (d.run !== run.current) return;
      done.current = d.ok; setRunning(false); if (d.error) setErr(d.error); setVer((v) => v + 1);
    }).then((u) => (live ? offs.push(u) : u()));
    return () => { live = false; offs.forEach((f) => f()); bitrateApi.stop().catch(() => {}); };
  }, []);

  const open = async (p: string) => {
    bins.current = []; keys.current = []; frames.current = 0; readTo.current = 0; done.current = false;
    setPath(p); setInfo(null); setErr(""); setCur(null); setRunning(true); setVer((v) => v + 1);
    try { const i = await bitrateApi.start(p); run.current = i.run; setInfo(i); }
    catch (e) { setRunning(false); setErr(String(e)); }
  };
  const load = async () => { if (running) { await bitrateApi.stop().catch(() => {}); setRunning(false); return; } const p = await pickFile("movie"); if (p) void open(p); };
  const close = () => { void bitrateApi.stop().catch(() => {}); run.current = -1; bins.current = []; keys.current = []; frames.current = 0; setPath(null); setInfo(null); setRunning(false); setErr(""); setCur(null); };

  // ตัวตรวจเปิดไฟล์ผ่านพอร์ตดีบัก แทนการลากจาก Explorer
  useEffect(() => { (window as unknown as { __bitrateOpen?: (p: string) => void }).__bitrateOpen = (p) => void open(p); });

  // ลากไฟล์มาวาง
  useEffect(() => {
    if (!inApp) return;
    let off: (() => void) | undefined, live = true;
    import("@tauri-apps/api/webview").then(({ getCurrentWebview }) => getCurrentWebview().onDragDropEvent((e) => {
      if (e.payload.type === "drop" && e.payload.paths[0] && document.querySelector("[data-bitrate]")) void open(e.payload.paths[0]);
    })).then((u) => { if (live) off = u; else u(); });
    return () => { live = false; off?.(); };
  }, []);

  // ---------- คิดแท่ง ----------
  const dur = info?.duration && info.duration > 0 ? info.duration : bins.current.length;
  const totalSec = Math.max(1, Math.ceil(dur));
  const maxBars = Math.max(10, Math.floor(box.w / 6));
  const group = Math.max(1, Math.ceil(totalSec / maxBars));
  const nBars = Math.ceil(totalSec / group);
  const complete = done.current ? bins.current.length : Math.min(bins.current.length, Math.floor(readTo.current));
  const bars: { v: number; avg: number; t0: number; t1: number }[] = [];
  let cumB = 0, cumS = 0;
  for (let b = 0; b < nBars; b++) {
    const s0 = b * group, s1 = Math.min((b + 1) * group, totalSec, complete);
    if (s1 <= s0) break;
    let sum = 0; for (let s = s0; s < s1; s++) sum += bins.current[s] ?? 0;
    const secs = s1 === totalSec && dur % 1 > 0 ? (s1 - s0 - 1) + (dur % 1) : s1 - s0;
    cumB += sum; cumS += secs;
    bars.push({ v: (sum * 8) / 1000 / Math.max(secs, 0.001), avg: (cumB * 8) / 1000 / Math.max(cumS, 0.001), t0: s0, t1: s0 + secs });
  }
  const peak = bars.reduce((m, b) => Math.max(m, b.v), 0);
  const min = bars.length ? bars.reduce((m, b) => Math.min(m, b.v), Infinity) : 0;
  const avg = cumS ? (cumB * 8) / 1000 / cumS : 0;
  const est = info && info.duration > 0 ? (info.size * 8) / 1000 / info.duration : 0;
  // เส้น Max ตั้งจากบิตเรตเฉลี่ยของทั้งไฟล์ ไม่ขยับระหว่างอ่าน · แท่งที่เกินเส้นเป็นสีแดงแบบต้นฉบับ · กรอบสูงพอให้เห็นยอด
  const maxV = niceNear(Math.max(est || avg, 1) * 2);
  const top = Math.max(maxV * 1.18, niceUp(peak) > maxV * 1.18 ? peak * 1.06 : 0);
  const yOf = (v: number) => box.h - (Math.min(v, top) / top) * box.h;
  const xOf = (t: number) => (t / totalSec) * box.w;

  // ---------- วาด ----------
  useEffect(() => {
    const cv = cvRef.current; if (!cv) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(box.w * dpr); cv.height = Math.round(box.h * dpr);
    const g = cv.getContext("2d"); if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = C.plot; g.fillRect(0, 0, box.w, box.h);
    const W = box.w, H = box.h;
    if (path) {
      // เส้นประแบ่งระดับ ทุกหนึ่งในสิบของค่าสูงสุด
      g.strokeStyle = C.grid; g.lineWidth = 1; g.setLineDash([2, 3]);
      for (let k = 1; k <= 11; k++) { if (k === 5 || k === 10) continue; const y = Math.round(yOf((maxV * k) / 10)) + 0.5; if (y < 0) continue; g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
      g.setLineDash([]);
      const purple = g.createLinearGradient(0, H, 0, yOf(maxV)); purple.addColorStop(0, C.purpleLo); purple.addColorStop(1, C.purpleHi);
      const pink = g.createLinearGradient(0, H, 0, yOf(maxV)); pink.addColorStop(0, C.pinkLo); pink.addColorStop(1, C.pinkHi);
      for (const b of bars) {
        const x0 = Math.floor(xOf(b.t0)), x1 = Math.max(x0 + 1, Math.floor(xOf(b.t1)));
        const yv = yOf(b.v), ya = yOf(Math.min(b.v, b.avg)), ym = yOf(maxV);
        g.fillStyle = purple; g.fillRect(x0, ya, x1 - x0, H - ya);
        if (b.v > b.avg) { const yTop = Math.max(yv, ym); g.fillStyle = pink; g.fillRect(x0, yTop, x1 - x0, ya - yTop); }
        if (b.v > maxV) { g.fillStyle = C.over; g.fillRect(x0, yv, x1 - x0, ym - yv); }
      }
      // ค่าเฉลี่ยสะสม
      if (bars.length) {
        g.strokeStyle = C.avg; g.lineWidth = 1; g.beginPath();
        bars.forEach((b, i) => { const x = xOf((b.t0 + b.t1) / 2), y = yOf(b.avg); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
        g.stroke();
      }
      // เส้นกลาง เส้นสูงสุด
      g.strokeStyle = C.mid; g.beginPath(); g.moveTo(0, Math.round(yOf(maxV / 2)) + 0.5); g.lineTo(W, Math.round(yOf(maxV / 2)) + 0.5); g.stroke();
      g.strokeStyle = C.red; g.beginPath(); g.moveTo(0, Math.round(yOf(maxV)) + 0.5); g.lineTo(W, Math.round(yOf(maxV)) + 0.5); g.stroke();
      // คีย์เฟรมเป็นขีดเล็กที่แกนล่าง ไม่เกิน 150 ขีด
      if (keys.current.length <= 150) { g.strokeStyle = C.key; for (const k of keys.current) { const x = Math.round(xOf(k)) + 0.5; g.beginPath(); g.moveTo(x, H); g.lineTo(x, H - 6); g.stroke(); } }
      // เคอร์เซอร์
      if (cur != null) { const x = Math.round(xOf(cur)) + 0.5; g.strokeStyle = C.cursor; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
    }
    g.strokeStyle = C.frame; g.strokeRect(0.5, 0.5, W - 1, H - 1);
  });

  const curBar = cur == null ? null : bars.find((b) => cur >= b.t0 && cur < b.t1) ?? null;
  const onMove = (e: React.MouseEvent) => { if (!path || !bars.length) return; const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); setCur(Math.max(0, Math.min(totalSec, ((e.clientX - r.left) / r.width) * totalSec))); };
  const pct = info && info.duration > 0 ? Math.min(100, Math.round((readTo.current / info.duration) * 100)) : 0;
  const codec = info ? (info.codec === "h264" ? "H.264" : info.codec === "hevc" ? "HEVC" : info.codec === "mpeg2video" ? "MPEG2" : info.codec.toUpperCase()) : "";
  const name = path ? path.split(/[\\/]/).pop() : "";
  const lab = (y: number): React.CSSProperties => ({ position: "absolute", right: 6, top: y, transform: "translateY(-50%)", whiteSpace: "nowrap" });

  return (
    <div data-bitrate style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", background: C.win, color: C.text, fontFamily: FONT, fontSize: 12.5, padding: "12px 14px 12px 6px", gap: 8 }}>
      <div style={{ fontSize: 13, paddingLeft: 8, minHeight: 18, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={path ?? undefined} data-bv-title>
        Bitrate Viewer{name ? ` - ${name}` : ""}
      </div>
      <div style={{ flex: 1, minHeight: 160, display: "flex", gap: 10 }}>
        <div style={{ width: 66, position: "relative", flex: "none" }} data-bv-axis>
          {path && <>
            <div style={lab(yOf(maxV) - 16)}>Max.</div>
            <div style={lab(yOf(maxV))}>{maxV}</div>
            <div style={lab(yOf(maxV) + 16)}>(A)</div>
            <div style={lab(yOf(maxV / 2))}>{maxV / 2}</div>
            <div style={lab(box.h)}>0</div>
            {info && <div style={{ ...lab(yOf(maxV * 0.74)), textAlign: "right", lineHeight: 1.35 }}>
              <div>{codec}</div>{info.tag && info.tag !== "[0][0][0][0]" && <div>({info.tag})</div>}
              <div title={info.profile || undefined} style={{ marginTop: 3, marginLeft: "auto", width: 58, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", background: C.head1, color: "rgb(255,255,255)", fontWeight: 700, fontSize: 11, padding: "0 4px", textAlign: "center" }}>{info.profile || "n/a"}</div>
            </div>}
            {info && <div style={{ ...lab(yOf(maxV * 0.28)), lineHeight: 1.45 }}><div>V: {info.video}</div><div>A: {info.audio}</div></div>}
          </>}
        </div>
        <div ref={plotRef} style={{ flex: 1, minWidth: 0, position: "relative", cursor: path ? "crosshair" : "pointer" }} onMouseMove={onMove} onClick={() => { if (!path) void load(); }} data-bv-plot>
          <canvas ref={cvRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" }} />
          {path && <div style={{ position: "absolute", left: 10, top: 6, color: C.sample, fontSize: 12 }} data-bv-sample>sample: {group}{running ? ` · อ่านแล้ว ${pct}%` : ""}</div>}
          {!path && <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "rgb(120,120,120)", fontSize: 14 }}>ลากไฟล์วิดีโอมาวางตรงนี้ หรือกด Load</div>}
          {err && <div style={{ position: "absolute", left: 10, bottom: 10, color: C.red }} data-bv-error>{err}</div>}
        </div>
        <div style={{ width: 150, flex: "none", display: "flex", flexDirection: "column", gap: 4 }} data-bv-panel>
          {([["Total Time", info ? hms(info.duration) : ""], ["Average Bitrate", bars.length ? kb(avg) : ""], ["Peak", bars.length ? kb(peak) : ""]] as const).map(([h, v]) => <div key={h} style={{ marginBottom: 6 }}>
            <div style={{ background: `linear-gradient(90deg, ${C.head1}, ${C.head2})`, color: "rgb(255,255,255)", fontWeight: 700, textAlign: "center", padding: "2px 0" }}>{h}</div>
            <div style={{ padding: "8px 8px 0", minHeight: 18 }}>{v}</div></div>)}
          <div style={{ marginTop: "auto" }}>
            <div style={{ background: `linear-gradient(90deg, ${C.head1}, ${C.head2})`, color: "rgb(255,255,255)", fontWeight: 700, textAlign: "center", padding: "2px 0" }}>Cursor</div>
            <div style={{ padding: "8px 8px 0", minHeight: 18 }} data-bv-curtime>{cur != null && path ? hms(cur) : ""}</div>
            <div style={{ padding: "12px 8px 0", minHeight: 18 }} data-bv-curval>{curBar ? kb(curBar.v) : ""}</div>
          </div>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 12, paddingLeft: 8 }}>
        <div style={{ flex: 1, minWidth: 0, lineHeight: 1.5 }} data-bv-stats>
          <div>{bars.length ? `MIN = ${kb(min)}  MAX = ${kb(peak)}  AVG = ${kb(avg)}  FRAMES = ${frames.current}` : " "}</div>
          <div>{info ? `${info.width} × ${info.height}, ${info.fps ? info.fps.toFixed(info.fps % 1 ? 3 : 0).replace(/0+$/, "").replace(/\.$/, "") : "n/a"} fps      (${(info.size / 1048576).toFixed(3)} MiB)` : " "}</div>
        </div>
        <button type="button" onClick={() => void load()} data-bv-load style={btn}>{running ? "Stop" : "Load"}</button>
        <button type="button" onClick={close} disabled={!path} data-bv-close style={{ ...btn, opacity: path ? 1 : 0.5 }}>Close</button>
      </div>
      <span hidden>{ver}</span>
    </div>
  );
}

const btn: React.CSSProperties = { width: 96, height: 30, flex: "none", border: "1px solid rgb(120,120,120)", borderRadius: 2, background: "linear-gradient(rgb(253,253,253), rgb(225,225,225))", color: "rgb(0,0,0)", fontFamily: FONT, fontSize: 13, cursor: "pointer" };
