/* หน้ากราฟเสียง ตัววาดบนผืนภาพ · ตารางสี ผืนภาพความละเอียดสูง ชื่อไฟล์รูปที่บันทึก หัวรูป ปุ่มบันทึกรูป ตัววาดคลื่นสี่แบบ ไม้บรรทัดแอมพลิจูด ตารางสีความถี่
   แยกจาก GraphPage.tsx ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 · แผนแบ่งไฟล์ขั้น 1.3) ย้ายมาทั้งก้อน เนื้อโค้ดไม่เปลี่ยน */
import { createContext, useContext, useLayoutEffect, useRef, useState } from "react";
import { GRAPH_IMG_DEFAULT, pickFolder, pickSave, type GraphImg } from "../../lib/api";
import { useToast } from "../../components/Toasts";
import { Keep } from "../../components/ui";
import { useSettings } from "../../lib/settings";
import { IcFolder } from "../../components/icons";
import { IbSave } from "../../components/icons";
import { Theme, minus } from "./common";

/* ---------- วาด ---------- */
export function lut(ramp: string[]) {
  const out = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i++) {
    const p = i / 255 * (ramp.length - 1), k = Math.min(ramp.length - 2, Math.floor(p)), f = p - k;
    for (let j = 0; j < 3; j++) { const a = parseInt(ramp[k].slice(1 + j * 2, 3 + j * 2), 16), b = parseInt(ramp[k + 1].slice(1 + j * 2, 3 + j * 2), 16); out[i * 3 + j] = a * (1 - f) + b * f; }
  }
  return out;
}

export type HiCanvas = HTMLCanvasElement & { __draw?: (g: CanvasRenderingContext2D, w: number, h: number, r: number) => void };
export const screenK = () => window.devicePixelRatio || 1;
/** วาดกราฟใหม่บนผ้าใบใหม่ที่ k เท่าของขนาดบนจอ ตัวหนังสือกับเส้นคม ไม่ใช่ขยายภาพ
    แถบรูปคลื่นกับความถี่ (data-rawdraw) ไม่มีตัวหนังสือ วาดเต็มพิกเซลจริงตรง ๆ ได้รายละเอียดครบทุกคอลัมน์ */
export function hiCopy(cv: HiCanvas, k: number): HTMLCanvasElement {
  const cw = cv.clientWidth, ch = cv.clientHeight, out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(cw * k)); out.height = Math.max(1, Math.round(ch * k));
  const g = out.getContext("2d");
  if (!g) return out;
  if (!cv.__draw) { g.drawImage(cv, 0, 0, out.width, out.height); return out; }
  if (cv.dataset.rawdraw !== undefined) cv.__draw(g, out.width, out.height, 1);
  else { g.setTransform(k, 0, 0, k, 0, 0); cv.__draw(g, cw, ch, k); }
  return out;
}
const IMG_EXT: Record<GraphImg["format"], string> = { png: "png", jpg: "jpg", webp: "webp", heic: "heic", tiff: "tif" };
const IMG_LABEL: Record<GraphImg["format"], string> = { png: "รูป PNG", jpg: "รูป JPG", webp: "รูป WebP", heic: "รูป HEIC", tiff: "รูป TIFF" };
export const imgName = (base: string, view: string, o: GraphImg) => base + (o.nameGraph ? " " + view : " กราฟเสียง") + "." + IMG_EXT[o.format];
/** ที่เก็บตั้งต้นคือโฟลเดอร์ของไฟล์ที่ดูอยู่ (พี่กันสั่ง 9 พ.ย. 2569 "เอาที่อยู่ไฟล์เป็นค่าตั้งต้นด้วย") · เปลี่ยนในกล่องเลือกที่เก็บได้ */
export const beside = (file: string, name: string) => file.replace(/[^\\/]*$/, "") + name;
/** ที่อยู่ไฟล์รูปตามค่าที่ตั้ง · ถามทุกครั้งเปิดกล่องเลือกที่เก็บ · ไม่ถามบันทึกเลย ชื่อซ้ำต่อท้าย (2) ไม่เขียนทับ */
export async function imgTarget(file: string, name: string, o: GraphImg): Promise<string | null> {
  const full = o.dirMode === "folder" && o.dir ? o.dir.replace(/[\\/]+$/, "") + "\\" + name : beside(file, name);
  return o.ask ? pickSave(full, IMG_EXT[o.format], IMG_LABEL[o.format]) : full;
}
export const waitPaint = () => new Promise((r) => setTimeout(r, 40));
/** แถบหัวรูป ชื่อไฟล์ ช่วงเวลา สีของแต่ละไฟล์ · ปิดได้ในหน้าตั้งค่า */
/** พื้นหลังโปร่งใสตอนบันทึก (พี่กันสั่ง 10 พ.ย. 2569 ตั้งในหน้าตั้งค่า) · พื้นขาวกับพื้นอ่อนของกราฟ (ทุกช่องสีตั้งแต่ 245) โปร่งใสหมด
    สีอ่อนรอบเส้นกับขอบตัวหนังสือ (ตั้งแต่ 200) ถอดสีขาวออกเป็นความโปร่งใสบางส่วน ขอบจึงเนียน · สีที่เข้มกว่านั้นทึบเหมือนเดิม
    JPG กับ HEIC เก็บความโปร่งใสไม่ได้ ส่งรูปเดิม */
export function alphaOf(cv: HTMLCanvasElement, o: GraphImg): HTMLCanvasElement {
  if (!o.transparent || o.format === "jpg" || o.format === "heic") return cv;
  const g = cv.getContext("2d"); if (!g) return cv;
  const im = g.getImageData(0, 0, cv.width, cv.height), d = im.data;
  for (let i = 0; i < d.length; i += 4) {
    const lo = Math.min(d[i], d[i + 1], d[i + 2]);
    if (lo >= 245) { d[i + 3] = 0; continue; }
    if (lo < 200) continue;
    const a = Math.max(255 - d[i], 255 - d[i + 1], 255 - d[i + 2]) / 255;
    for (let c = 0; c < 3; c++) d[i + c] = Math.round(255 - (255 - d[i + c]) / a);
    d[i + 3] = Math.round(a * d[i + 3]);
  }
  const out = document.createElement("canvas"); out.width = cv.width; out.height = cv.height;
  out.getContext("2d")?.putImageData(im, 0, 0);
  return out;
}
export function withHeader(cv: HTMLCanvasElement, title: string, sub: string, legend: [string, string][] = []): HTMLCanvasElement {
  const k = Math.max(1, cv.width / 1000), band = Math.round(50 * k), out = document.createElement("canvas");
  out.width = cv.width; out.height = cv.height + band;
  const g = out.getContext("2d"); if (!g) return cv;
  g.fillStyle = "#fff"; g.fillRect(0, 0, out.width, out.height);
  g.textBaseline = "alphabetic"; g.textAlign = "left";
  g.fillStyle = "#4a2b38"; g.font = "700 " + 15 * k + "px Sarabun, sans-serif"; g.fillText(title, 10 * k, 22 * k);
  g.fillStyle = "#6b4a58"; g.font = 12 * k + "px Sarabun, sans-serif"; g.fillText(sub, 10 * k, 40 * k);
  let x = out.width - 10 * k;
  g.textAlign = "right"; g.font = "600 " + 12.5 * k + "px Sarabun, sans-serif";
  for (let i = legend.length - 1; i >= 0; i--) {
    const [txt, col] = legend[i], tw = g.measureText(txt).width;
    g.fillStyle = "#4a2b38"; g.fillText(txt, x, 28 * k); x -= tw + 6 * k;
    g.fillStyle = col; g.fillRect(x - 14 * k, 21 * k, 14 * k, 4 * k); x -= 14 * k + 14 * k;
  }
  g.drawImage(cv, 0, band);
  return out;
}
/** ป้ายแกนเวลาจากแถบเวลาบนจอ */
export function drawRuler(g: CanvasRenderingContext2D, ruler: Element | null | undefined, x: number, w: number, y: number) {
  if (!ruler) return;
  g.fillStyle = "#6b4a58"; g.font = "600 12px Sarabun, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
  // ตำแหน่งอยู่ที่ขีด <i class="tk" style="left"> ตัวแม่ของ span ตั้งแต่ทำขีดแบบไม้บรรทัด (bae81f7) · เดิมอ่านจาก span ได้ NaN ทุกตัว รูปไม่มีเลขเวลา (AUDIT ข้อ 19)
  // อ่านจาก span ก่อนเผื่อแกนแบบเก่าที่ยังใส่ left ที่ span
  for (const sp of ruler.querySelectorAll<HTMLElement>("span")) {
    const p = parseFloat(sp.style.left || (sp.parentElement as HTMLElement | null)?.style.left || "");
    if (!Number.isNaN(p)) g.fillText(sp.innerText, x + p / 100 * w, y);
  }
  g.textAlign = "left";
}
/** กำลังบันทึกอยู่ไหม ปุ่มบันทึกทุกกราฟอ่านจากตัวนี้ */
export const SavingCtx = createContext(false);
/** ปุ่มบันทึกเป็นรูป · ระหว่างบันทึกไอคอนเป็นวงกลมหมุน (พี่กันสั่ง 9 พ.ย. 2569 "เราขอปุ่มหมุน ๆ ที่ปุ่มนี้ วงกลมเหมือนเส้นแปลง") */
export function SaveBtn({ onClick }: { onClick: () => void }) {
  const busy = useContext(SavingCtx);
  // ปุ่มเปลี่ยนที่บันทึกอยู่ติดกัน ใช้ค่าเดียวกับหน้าตั้งค่า (พี่กันสั่ง 9 พ.ย. 2569 "ข้าง ๆ ปุ่มเราอยากให้มีปุ่มเปลี่ยนที่บันทึกด้วย")
  const { settings, update } = useSettings();
  const toast = useToast();
  const o = settings?.graphImg ?? GRAPH_IMG_DEFAULT;
  const inFolder = o.dirMode === "folder" && !!o.dir;
  const changeDir = async () => {
    const d = await pickFolder("เลือกโฟลเดอร์เก็บรูปกราฟ"); if (!d) return;
    if (await update({ graphImg: { ...o, dirMode: "folder", dir: d } })) toast({ kind: "ok", title: "รูปกราฟจะเก็บที่โฟลเดอร์นี้", detail: d });
  };
  return <span style={{ display: "inline-flex", gap: 4 }}>
    <button type="button" className="btn btn-ghost btn-sm" style={{ width: 32, padding: 0, flex: "none" }} aria-label="เปลี่ยนที่บันทึกรูป" title={(inFolder ? "เก็บรูปที่ " + o.dir : "เก็บรูปข้างไฟล์ที่ดูอยู่") + "\nกดเพื่อเปลี่ยนที่บันทึก และกลับไปเก็บข้างไฟล์ได้ที่หน้าตั้งค่า"} onClick={changeDir} data-graphsavedir><IcFolder size={15} /></button>
    <button type="button" className={"btn btn-ghost btn-sm" + (busy ? " pressed" : "")} aria-disabled={busy || undefined} aria-busy={busy || undefined} onClick={() => { if (!busy) onClick(); }} data-graphsave>
    {busy ? <span className="spinner" aria-hidden="true" /> : <IbSave size={15} />}<Keep all={["กำลังบันทึก…", "บันทึกเป็นรูป"]}>{busy ? "กำลังบันทึก…" : "บันทึกเป็นรูป"}</Keep></button></span>;
}
export function useCanvas(draw: (g: CanvasRenderingContext2D, w: number, h: number, r: number) => void, deps: unknown[]) {
  const ref = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => { if (ref.current) (ref.current as HiCanvas).__draw = draw; });
  const [w, setW] = useState(0);
  const [cssH, setCssH] = useState(0);
  useLayoutEffect(() => {
    const cv = ref.current; if (!cv) return;
    const read = () => { setW(cv.clientWidth); setCssH(cv.clientHeight); };
    const ro = new ResizeObserver(read); ro.observe(cv); read();
    return () => ro.disconnect();
  }, []);
  useLayoutEffect(() => {
    const cv = ref.current; if (!cv || !w) return;
    const r = window.devicePixelRatio || 1, h = cv.clientHeight;
    cv.width = Math.round(w * r); cv.height = Math.round(h * r);
    const g = cv.getContext("2d"); if (!g) return;
    g.setTransform(r, 0, 0, r, 0, 0); draw(g, w, h, r);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [w, cssH, ...deps]);
  return ref;
}

export type Src = { env: number[][]; cols: number; t0: number; t1: number };
/** รูปคลื่นของช่วง a–b ที่ n จุดภาพ จากข้อมูลที่มี (ภาพรวมหรือช่วงที่ซูม) */
export function sample(src: Src, ch: number, a: number, b: number, n: number) {
  const mx = new Float32Array(n), mn = new Float32Array(n), rm = new Float32Array(n);
  const e = src.env[ch], span = src.t1 - src.t0 || 1;
  if (!e) return { mx, mn, rm };
  for (let x = 0; x < n; x++) {
    const ta = a + (b - a) * x / n, tb = a + (b - a) * (x + 1) / n;
    let c0 = Math.floor((ta - src.t0) / span * src.cols), c1 = Math.ceil((tb - src.t0) / span * src.cols);
    c0 = Math.max(0, Math.min(src.cols - 1, c0)); c1 = Math.max(c0 + 1, Math.min(src.cols, c1));
    let hi = -1, lo = 1, sq = 0;
    for (let c = c0; c < c1; c++) { hi = Math.max(hi, e[c * 3]); lo = Math.min(lo, e[c * 3 + 1]); sq += e[c * 3 + 2] ** 2; }
    mx[x] = Math.max(0, hi); mn[x] = Math.max(0, -lo); rm[x] = Math.sqrt(sq / (c1 - c0));
  }
  return { mx, mn, rm };
}

/** style fine เส้นละเอียด · bars แท่ง · aud แบบ Audacity · vz ขยายแนวตั้ง (0.125 ถึง 8 เท่า ตาม VZ_MIN VZ_MAX ใน zoom.tsx ต่ำกว่า 1 คือบีบ) */
export function drawWave(g: CanvasRenderingContext2D, w: number, h: number, d: ReturnType<typeof sample>, th: Theme, style: WaveStyle, vz = 1) {
  g.fillStyle = th.lane; g.fillRect(0, 0, w, h);
  const mid = h / 2, A = (h / 2 - 2) * vz;
  if (style === "real") {
    // หน้าตาแบบหน้าจอโปรแกรม Audacity จริง (BUGS ข้อ 12 · พี่กันส่งภาพ Audacity "เราอยากได้กราฟแบบนี้มั่ง" · "จะสีอะไรก็ได้ เเค่เอารูปแบบมา")
    // ต่างจากแบบหลัก คลื่นสีเดียวทึบ ไม่มีแถบดังเฉลี่ย · เส้นแนวตั้งคมทีละจุด ไม่ลากเป็นรูปทรงเรียบ · พื้นขาว ไม่มีเส้นตาราง · ช่องคั่นเท่าแบบอื่น (เดิมติดกัน พี่กันทัก "มันไม่เท่ากันเลย")
    // (11 พ.ย. 2569 พี่กันทัก "เต็มช่อง กับ รูปคลื่น ไม่เห็นต่างกันเลย" รอบแรกต่างกันแค่สีพื้น)
    g.fillStyle = "white"; g.fillRect(0, 0, w, h);
    g.fillStyle = th.rms;
    for (let x = 0; x < w; x++) {
      const up = Math.min(h / 2, d.mx[x] * A), dn = Math.min(h / 2, d.mn[x] * A);
      g.fillRect(x, Math.floor(mid - up), 1, Math.max(1, Math.ceil(up + dn)));
    }
    return;
  }
  if (style === "aud") {
    // แบบ Audacity (พี่กันส่งภาพหน้าคลื่นของ Audacity 7 พ.ย. 2569) · คลื่นยอดสีเข้ม ความดังเฉลี่ยสีอ่อนกว่าข้างใน · เส้นศูนย์ เส้นครึ่ง · ตัวเลขความสูงคลื่นทางซ้าย
    // สีตามชุดสีของโปรแกรม ไม่ใช้สีฟ้าของ Audacity (พี่กัน *"ไม่ต้องคล้ายแบบ 100% เเค่ปรับให้เข้ากับธีมเว็บเรา"*)
    // ตัวเลขความสูงคลื่นอยู่ไม้บรรทัดแนวตั้งนอกกราฟ (drawAmpRuler) ไม่ทับคลื่น (พี่กัน 7 พ.ย. 2569 *"เอาตัวนี้ออกมาข้างนอก ไม่เอาทับกราฟ"*) · ในกราฟเหลือเส้นจางตรงค่าเดียวกับไม้บรรทัด
    const lim = (v: number) => Math.min(h / 2 - 1, v * A);
    g.fillStyle = "rgba(74,43,56,.10)";
    for (const t of ampTicks(h, vz).major) if (t.v !== 0) g.fillRect(0, Math.round(t.y), w, 1);
    g.fillStyle = "rgba(74,43,56,.28)"; g.fillRect(0, Math.round(mid), w, 1);
    const band = (top: Float32Array, bot: Float32Array, col: string) => { g.fillStyle = col; g.beginPath(); g.moveTo(0, mid); for (let x = 0; x < w; x++) g.lineTo(x + 0.5, mid - lim(top[x])); for (let x = w - 1; x >= 0; x--) g.lineTo(x + 0.5, mid + lim(bot[x])); g.closePath(); g.fill(); };
    band(d.mx, d.mn, th.rms); band(d.rm, d.rm, th.ramp[5]);
    return;
  }
  if (style === "bars") {
    const BW = 3, GAP = 3, n = Math.floor(w / (BW + GAP)), grad = g.createLinearGradient(0, 4, 0, h - 4);
    grad.addColorStop(0, th.peak); grad.addColorStop(0.5, th.rms); grad.addColorStop(1, th.peak); g.fillStyle = grad;
    for (let i = 0; i < n; i++) {
      let m = 0; const x0 = Math.floor(i * d.mx.length / n), x1 = Math.max(x0 + 1, Math.floor((i + 1) * d.mx.length / n));
      for (let x = x0; x < x1; x++) m = Math.max(m, d.mx[x], d.mn[x]);
      // ช่วงที่เงียบเหลือจุดจาง ไม่ให้ดูเหมือนมีเสียง (ช่องที่เงียบทั้งไฟล์เคยเป็นจุดเข้มเท่าช่องที่มีเสียง เจอตอนตรวจภาพ)
      g.globalAlpha = m < 0.001 ? 0.3 : 1;
      // ซูมแนวตั้ง vz ขยายแท่งด้วย ไม่เกินกรอบ (BUGS ข้อ 13)
      const bh = Math.min(h - 4, Math.max(BW, m * (h - 8) * vz)); g.beginPath(); g.roundRect(i * (BW + GAP) + GAP / 2, mid - bh / 2, BW, bh, BW / 2); g.fill();
    }
    g.globalAlpha = 1;
    return;
  }
  g.fillStyle = "rgba(74,43,56,.07)"; g.fillRect(0, Math.round(mid), w, 1);
  const band = (top: Float32Array, bot: Float32Array, col: string) => { g.fillStyle = col; g.beginPath(); g.moveTo(0, mid); for (let x = 0; x < w; x++) g.lineTo(x + 0.5, mid - Math.min(h / 2 - 1, top[x] * A)); for (let x = w - 1; x >= 0; x--) g.lineTo(x + 0.5, mid + Math.min(h / 2 - 1, bot[x] * A)); g.closePath(); g.fill(); };
  band(d.mx, d.mn, th.peak); band(d.rm, d.rm, th.rms);
}

/** ขีดของไม้บรรทัดความสูงคลื่น · ระยะขีดเลือกจาก 1 2 2.5 5 ให้ตัวเลขห่างกันอย่างน้อย 20 px · ขอบกรอบคือ 1 ÷ vz */
const AMP_STEPS = [0.01, 0.02, 0.025, 0.05, 0.1, 0.2, 0.25, 0.5, 1, 2, 2.5, 5];
function ampTicks(h: number, vz: number) {
  const mid = h / 2, ppu = (h / 2 - 2) * vz, top = (h / 2 - 1) / ppu;
  const step = AMP_STEPS.find((s) => s * ppu >= 20) ?? 5;
  let d = 1; while (d < 4 && Math.abs(Math.round(step * 10 ** d) - step * 10 ** d) > 1e-9) d++;
  const list = (st: number) => { const out: { v: number; y: number }[] = []; for (let k = -Math.floor(top / st + 1e-9); k * st <= top + 1e-9; k++) out.push({ v: k * st, y: mid - k * st * ppu }); return out; };
  return { major: list(step), minor: list(step / 2), d };
}
export const RUL_W = 40;
/** ไม้บรรทัดแนวตั้งทางซ้ายของรูปคลื่นแบบ Audacity · ตัวเลขชิดขวา ขีดยาวที่ตัวเลข ขีดสั้นตรงกลาง */
export function drawAmpRuler(g: CanvasRenderingContext2D, w: number, h: number, vz: number) {
  g.clearRect(0, 0, w, h);
  const { major, minor, d } = ampTicks(h, vz);
  g.fillStyle = "#e3bccb"; g.fillRect(w - 1, 0, 1, h);
  g.fillStyle = "#d9a9bb"; for (const t of minor) g.fillRect(w - 4, Math.round(t.y), 3, 1);
  g.font = "600 10.5px Sarabun, sans-serif"; g.textAlign = "right"; g.textBaseline = "middle";
  for (const t of major) {
    g.fillStyle = "#c48aa1"; g.fillRect(w - 7, Math.round(t.y), 6, 1);
    g.fillStyle = "#7a5666"; g.fillText(minus(t.v.toFixed(d)), w - 9, Math.max(6, Math.min(h - 6, t.y)));
  }
}

/** ภาพความถี่ cols × rows ลงขนาดกรอบ · getRow(row, col) คืนเลข 0–255 */
export function drawMatrix(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, cols: number, rows: number, colors: Uint8ClampedArray, get: (row: number, col: number) => number) {
  if (cols < 1 || rows < 1) return;
  const off = document.createElement("canvas"); off.width = cols; off.height = rows;
  const og = off.getContext("2d"); if (!og) return;
  const img = og.createImageData(cols, rows);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const v = get(rows - 1 - r, c), o = (r * cols + c) * 4;
    img.data[o] = colors[v * 3]; img.data[o + 1] = colors[v * 3 + 1]; img.data[o + 2] = colors[v * 3 + 2]; img.data[o + 3] = 255;
  }
  og.putImageData(img, 0, 0); g.imageSmoothingEnabled = true; g.drawImage(off, x, y, w, h);
}

/** ปุ่มตัวเลือกกราฟ กางแผงสวิตช์ แบบเดียวกับปุ่มการแสดงผลของชั้นวาง */
/** aud รูปคลื่นแบบหลัก (ตามโปรแกรม Audacity) · bars แท่ง · real คลื่นเต็มช่องแบบหน้าจอ Audacity จริง · fine เส้นละเอียดเดิม เลิกให้เลือกแล้ว (BUGS ข้อ 12) */
export type WaveStyle = "fine" | "bars" | "aud" | "real";