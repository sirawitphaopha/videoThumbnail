/* หน้าบิตเรตตอนดูแทร็กเสียง มีรูปคลื่นเสียงใต้แถบภาพรวม (BUGS ข้อ 163.6 · ROADMAP ข้อ 44)
   พี่กันแทรก 10 พ.ย. 2569 "ถ้าตอนดูบิตเรต ไฟล์นั้นคือเสียง นอกจากมันจะขึ้นกราฟมินิ ให้ขึ้นกราฟเสียงด้วย เเละทั้งสองกราฟนี้ ย่อยุบได้"
   ข้อมูลชุดเดียวกับหน้ากราฟเสียง (graph_overview ทั้งไฟล์ ซูมลึกอ่าน graph_window เฉพาะช่วง) วาดแบบ Audacity ยอดสีเข้ม ดังเฉลี่ยสีอ่อน
   ช่วงเวลาเดียวกับกราฟบิตเรต ขอบซ้ายขวาตรงกับกราฟบิตเรต (L R ของ useBrStats) ชี้ตรงไหนขีดตรงกันทั้งสองกราฟ
   ไฟล์วิดีโอไม่ขึ้น · แบบ Bitrate Viewer เดิมไม่แตะ */
import { useEffect, useRef, useState } from "react";
import { graphApi, type GOverview, type GWindow } from "../../lib/api";

type Env = { env: number[][]; cols: number; t0: number; t1: number };
export const WAVE_FOLD_KEY = "br-wave-fold";
export const OV_FOLD_KEY = "br-ov-fold";
const H = 76;

/** พับหรือกาง จำไว้ในเครื่อง */
export function useFold(key: string): [boolean, (v: boolean) => void] {
  const [v, setV] = useState(() => { try { return localStorage.getItem(key) === "1"; } catch { return false; } });
  return [v, (x) => { setV(x); try { localStorage.setItem(key, x ? "1" : "0"); } catch { /* จำไม่ได้ ใช้ค่าในหน้าไปก่อน */ } }];
}

/** ปุ่มพับกางแบบปุ่มพับภาพรวมของหน้ากราฟเสียง */
export function FoldBtn({ fold, onToggle, what, data }: { fold: boolean; onToggle: () => void; what: string; data: string }) {
  return (
    <button type="button" className="brn-fold" onClick={onToggle} aria-expanded={!fold} title={fold ? `กาง${what}` : `พับ${what}`} {...{ [data]: fold ? "fold" : "open" }}>
      <span>{what}</span>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={fold ? "M6 9l6 6 6-6" : "M6 15l6-6 6 6"} /></svg>
    </button>
  );
}

/** ยอดบวก ยอดลบ ดังเฉลี่ย ของช่วง a ถึง b ที่ n จุดภาพ รวมทุกช่องที่ส่งมา */
function sampleMix(src: Env, chs: number[], a: number, b: number, n: number) {
  const mx = new Float32Array(n), mn = new Float32Array(n), rm = new Float32Array(n), span = src.t1 - src.t0 || 1;
  for (let x = 0; x < n; x++) {
    const ta = a + (b - a) * x / n, tb = a + (b - a) * (x + 1) / n;
    let c0 = Math.floor((ta - src.t0) / span * src.cols), c1 = Math.ceil((tb - src.t0) / span * src.cols);
    c0 = Math.max(0, Math.min(src.cols - 1, c0)); c1 = Math.max(c0 + 1, Math.min(src.cols, c1));
    let hi = 0, lo = 0, sq = 0, k = 0;
    for (const ch of chs) { const e = src.env[ch]; if (!e) continue; for (let c = c0; c < c1; c++) { hi = Math.max(hi, e[c * 3]); lo = Math.min(lo, e[c * 3 + 1]); sq += e[c * 3 + 2] ** 2; k++; } }
    mx[x] = hi; mn[x] = -lo; rm[x] = k ? Math.sqrt(sq / k) : 0;
  }
  return { mx, mn, rm };
}

/** รูปคลื่นเสียงช่วง z0 ถึง z1 · hoverT เวลาที่ชี้ในกราฟบิตเรต · onHover ชี้ในรูปคลื่นแล้วบอกกราฟบิตเรต */
export default function BrWave({ path, track, z0, z1, L, R, hoverT, onHover }: { path: string; track: number; z0: number; z1: number; L: number; R: number; hoverT: number | null; onHover: (t: number | null, x: number) => void }) {
  const cv = useRef<HTMLCanvasElement>(null);
  const [ov, setOv] = useState<GOverview | null>(null);
  const [win, setWin] = useState<GWindow | null>(null);
  const [err, setErr] = useState("");
  const [w, setW] = useState(0);
  // ภาพรวมทั้งไฟล์อ่านครั้งเดียวต่อไฟล์และแทร็ก (เก็บไว้ในเครื่องแบบหน้ากราฟเสียง เปิดครั้งหน้าเร็ว)
  useEffect(() => {
    let live = true;
    setOv(null); setWin(null); setErr("");
    graphApi.overview(path, track).then((o) => { if (live) { if (o) setOv(o); else setErr("ยกเลิกการอ่าน"); } }).catch((e) => { if (live) setErr(String(e)); });
    return () => { live = false; };
  }, [path, track]);
  useEffect(() => {
    const el = cv.current?.parentElement; if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth)); ro.observe(el); setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  // ซูมลึกกว่าความละเอียดของภาพรวม อ่านเฉพาะช่วงที่ดู (รอให้หยุดเลื่อนก่อน)
  const pw = Math.max(1, w - L - R);
  useEffect(() => {
    if (!ov) return;
    if ((z1 - z0) / ov.duration * ov.cols >= pw * 0.8) { setWin(null); return; }
    let live = true;
    const id = window.setTimeout(() => { graphApi.window(path, track, z0, z1, Math.min(4096, Math.round(pw)), 16, true, false, true).then((x) => { if (live && x) setWin(x); }).catch(() => { /* ใช้ภาพรวมต่อ */ }); }, 250);
    return () => { live = false; clearTimeout(id); };
  }, [ov, path, track, z0, z1, pw]);
  useEffect(() => {
    const c = cv.current; if (!c || !w) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(w * dpr); c.height = Math.round(H * dpr);
    const g = c.getContext("2d"); if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, H);
    const css = getComputedStyle(c), acc = css.getPropertyValue("--accent").trim() || "#a8436a", soft = css.getPropertyValue("--accent-soft").trim() || "#f7e4ea";
    g.fillStyle = soft; g.globalAlpha = 0.45; g.fillRect(L, 0, pw, H); g.globalAlpha = 1;
    const mid = H / 2;
    g.fillStyle = "rgba(74,43,56,.25)"; g.fillRect(L, Math.round(mid), pw, 1);
    g.font = "11px Sarabun, sans-serif"; g.fillStyle = css.getPropertyValue("--txt3").trim() || "#86636f"; g.textAlign = "right"; g.textBaseline = "middle";
    g.fillText("1.0", L - 6, 6); g.fillText("0.0", L - 6, mid); g.fillText("−1.0", L - 6, H - 6);
    const src: Env | null = win && win.t0 <= z0 + 1e-6 && win.t1 >= z1 - 1e-6 ? win : ov ? { env: ov.env, cols: ov.cols, t0: 0, t1: ov.duration } : null;
    if (!src) return;
    const n = Math.round(pw), d = sampleMix(src, src.env.map((_, i) => i), z0, z1, n), A = mid - 2;
    const band = (top: Float32Array, bot: Float32Array, col: string, alpha: number) => {
      g.fillStyle = col; g.globalAlpha = alpha; g.beginPath(); g.moveTo(L, mid);
      for (let x = 0; x < n; x++) g.lineTo(L + x + 0.5, mid - Math.min(A, top[x] * A));
      for (let x = n - 1; x >= 0; x--) g.lineTo(L + x + 0.5, mid + Math.min(A, bot[x] * A));
      g.closePath(); g.fill(); g.globalAlpha = 1;
    };
    band(d.mx, d.mn, acc, 0.85); band(d.rm, d.rm, "#ffffff", 0.45);
  }, [ov, win, w, z0, z1, L, R, pw]);
  const x = hoverT != null && hoverT >= z0 && hoverT <= z1 ? L + (hoverT - z0) / (z1 - z0 || 1) * pw : null;
  const move = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect(), mx = e.clientX - r.left;
    if (mx < L || mx > L + pw) { onHover(null, mx); return; }
    onHover(z0 + (mx - L) / pw * (z1 - z0), mx);
  };
  return (
    <div className="brn-waverow" data-brnwave>
      <div className="brn-wave" onMouseMove={move} onMouseLeave={() => onHover(null, 0)} title="รูปคลื่นเสียงของช่วงเดียวกับกราฟบิตเรต รวมทุกช่อง">
        <canvas ref={cv} style={{ width: "100%", height: H, display: "block" }} data-brnwavecv={ov ? "ready" : "wait"} />
        {x != null && <div className="brn-wavexh" style={{ left: x }} data-brnwavexh />}
        {!ov && <span className="brn-wavemsg small" data-brnwavemsg>{err ? `อ่านรูปคลื่นไม่ได้ ${err}` : "กำลังอ่านรูปคลื่น…"}</span>}
      </div>
      <span className="brn-wavepad" aria-hidden="true" />
    </div>
  );
}
