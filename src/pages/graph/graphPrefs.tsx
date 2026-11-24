/* ของระดับไฟล์ของหน้ากราฟเสียง ไฟล์ล่าสุด ค่าที่จำในเครื่อง ไอคอนชุดสีกับแบบรูปคลื่น
   แยกจาก GraphPage.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 4) เนื้อโค้ดยกมาทั้งก้อน */
import { type Tip } from "../../lib/codecAdv";
import { Prefs, CUSTOM, THEMES } from "./common";

/* ---------- หน้า ---------- */

/** ไฟล์ที่เคยเปิดในหน้ากราฟ ขึ้นในหน้ารวมกราฟเสียง รวมไฟล์เสียงที่ไม่ได้อยู่บนชั้นวาง (พี่กัน 7 พ.ย. 2569
    *"หาวิธีที่เราจะกดกลับไปน้าเสียงรวมที ตอนที่เราอยู่หน้านี้ เเละไฟล์เสียงไหนที่เราโหลดเข้ามาเเล้ว ทำไมมันไม่อยู่ในหน้ารวมเสียงเลย"*)
    เก็บในเครื่องนี้ 12 ไฟล์ล่าสุด · เดิมหน้ารวมดึงจากชั้นวางอย่างเดียว ไฟล์ที่เปิดจากเครื่องไม่ถูกจดไว้ */
export type Recent = { path: string; name: string; size: number; duration: number; audioOnly: boolean; layout?: string; at: number };
export const RECENT_KEY = "graph-recent";
export function loadRecent(): Recent[] {
  try { const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]"); return Array.isArray(v) ? v.filter((r) => r && typeof r.path === "string" && typeof r.name === "string") : []; } catch { return []; }
}
export function saveRecent(list: Recent[]) {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 12))); } catch { /* เก็บไม่ได้ ใช้รายการในหน้านี้ไปก่อน */ }
}

/** แถบสีตัวอย่างบนปุ่มเลือกสี ใช้สีชุดเดียวกับที่วาดกราฟจริง */
export const Swatch = ({ ramp }: { ramp: readonly string[] }) => <i className="cswatch" data-keepcolor aria-hidden="true" style={{ background: `linear-gradient(90deg,${ramp.join(",")})` }} />;
/** คำอธิบายสีของรูปคลื่น (BUGS ข้อ 11 · พี่กัน "ยอดเสียง อ่านเเล้วงง" · "เอาไว้ด้วย") */
export const PEAK_RMS_TIP: Tip = { w: "ดังสุด (Peak) คือจุดที่ดังที่สุดแวบเดียวในช่วงนั้น ส่วนดังเฉลี่ย (RMS) คือความดังเฉลี่ยของช่วงนั้น ซึ่งใกล้กับที่หูได้ยิน",
  p: "ถ้าดังสุดชนขอบบนล่าง แปลว่ายอดคลื่นแตะเพดานและเสียงอาจแตก ถ้าดังเฉลี่ยหนาเกือบเท่าดังสุด แปลว่าเพลงถูกบีบให้ดังเท่ากันทั้งเพลง และถ้าดังเฉลี่ยบางกว่าดังสุดมาก แปลว่าเสียงมีช่วงดังเบาเป็นธรรมชาติ" };
export const WaveIc = ({ d }: { d: string }) => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;

export const PREF_KEY = "graph-prefs";
/** ค่าตั้งต้นของหน้าความถี่ ละเอียดหรือภาพรวม ตั้งที่หน้าตั้งค่า (BUGS ข้อ 14 พี่กัน "อันนี้ตั้งค่าได้ ว่าจะให้เเสดงกราฟไหนตั้งต้น") */
export const SPEK_RES_KEY = "graph-spek-res";
export function loadPrefs(): Prefs {
  const d: Prefs = { view: "wave", theme: "ชมพู", style: "aud", cmap: "theme", scmap: "heat", spekLight: false, wide: false, spekAxis: "lin", customColor: "#7a4fd0" };
  // ค่าเดิมที่จำเส้นละเอียดไว้ เปิดมาเป็นแบบหลัก (พี่กันเคาะ "เอาของ audacity เป็นอันหลักเลย")
  try { const p = JSON.parse(localStorage.getItem(PREF_KEY) ?? "{}"); const r: Prefs = { ...d, ...p, theme: THEMES[p.theme] || p.theme === CUSTOM ? p.theme : d.theme }; if (!["aud", "bars", "real"].includes(r.style)) r.style = "aud"; if (r.view === "spec") r.view = "spek"; if (r.view === "cmp") r.view = "loud"; if (r.spekAxis !== "log") r.spekAxis = "lin"; return r; } catch { return d; }
}

