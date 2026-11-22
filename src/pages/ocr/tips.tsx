/* หน้า OCR คำอธิบาย ⓘ เหตุที่ตัวชี้จุดสงสัยฟ้อง ภาษา ตัวตั้งค่า ตัวจัดรูปเวลา
   แยกจาก OcrPage.tsx ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 · แผนแบ่งไฟล์ขั้น 7.1) ย้ายมาทั้งก้อน เนื้อโค้ดไม่เปลี่ยน */
import type { Tip } from "../../lib/codecAdv";
import { type OcrCfg, type OcrReason } from "../../lib/api";
import { getOcrJob, setOcrCfg } from "../../lib/ocrJob";

/* ---------- คำอธิบาย ⓘ (ข้อความเดียวกับมอคอัปที่พี่กันดูแล้ว ตัวเลขจากผลเทสจริง) ---------- */
export const ENGINE_TIP: Tip = { w: "ตัวอ่านคือโปรแกรมที่ดูภาพซับแล้วเขียนออกมาเป็นตัวหนังสือ ทุกตัวทำงานในเครื่อง ไม่ส่งภาพออกเน็ต", o: [
  ["PaddleOCR", "อ่านจากภาพทั้งบรรทัดด้วยโมเดลที่ฝึกมาแล้ว อ่านอังกฤษ ญี่ปุ่น จีน และภาษาไทยได้", "แม่นที่สุดตอนเทสซับอังกฤษ 439 ภาพ ถูก 436–438 ภาพ", "ไม่บอกว่าบรรทัดไหนเป็นตัวเอียง"],
  ["Tesseract", "ตัวอ่านเก่าแก่ที่ Subtitle Edit ใช้เป็นหลัก มีชุดภาษาให้โหลดกว่าร้อยภาษา", "อ่านภาษาแปลก ๆ ได้", "ซับชุดเทสถูก 360 จาก 439 ภาพ อ่านตัว I เป็นขีดตั้งบ่อย"],
  ["nOCR และ Binary OCR", "ตัวสอนเองของ Subtitle Edit จำรูปร่างตัวอักษรของซับเรื่องนั้นแล้วอ่านเองครั้งต่อไป", "บอกได้ว่าบรรทัดไหนเป็นตัวเอียง", "ฐานใหม่ต้องสอนก่อนถึงจะใช้ได้"],
  ["ตัวสอนเองของชั้นหนัง", "ตัวสอนเองที่รู้จักสระและวรรณยุกต์ไทยที่ซ้อนบนล่าง", "ใช้กับ VobSub ไทยความละเอียดต่ำได้", "ต้องสอนหรือฝึกจากฟอนต์ก่อน"],
], r: "PaddleOCR ขนาด small" };
export const SIZE_TIP: Tip = { w: "ขนาดของโมเดล PaddleOCR ยิ่งใหญ่ยิ่งแม่นแต่ช้ากว่า ตัวเลขวัดจากซับอังกฤษ 439 ภาพ", o: [
  ["tiny", "โมเดลเล็กสุด", "เร็วสุด", "อ่านพลาดมากกว่าขนาดอื่น"],
  ["small", "โมเดลกลาง", "ถูก 436 ถึง 438 ภาพ", ""],
  ["medium", "โมเดลใหญ่", "ถูก 437 ภาพ แม่นสุด", "ช้ากว่า small ราวสองเท่าครึ่ง"],
], r: "small" };
export const CHECK_TIP: Tip = { w: "ตัวช่วยตรวจอ่านภาพเดียวกันอีกรอบ แต่ไม่ได้เขียนลงไฟล์ ภาพที่อ่านได้ไม่ตรงกับตัวหลักขึ้นให้ตรวจ\nตอนเทสซับอังกฤษ ทุกภาพที่ตัวหลักอ่านผิดถูกชี้ครบ", r: "Tesseract หรือ PaddleOCR ขนาดที่ต่างจากตัวหลัก" };
export const FLAG_TIP: Tip = { w: "จุดที่ต้องตรวจคือบรรทัดที่ระบบสงสัยว่าอ่านผิด เห็นแล้วแก้หรือกดว่าถูกแล้ว", o: [
  ["ตัวช่วยอ่านไม่ตรง", "ตัวหลักกับตัวช่วยตรวจอ่านภาพเดียวกันได้ไม่เหมือนกัน", "", ""],
  ["คำที่ไม่รู้จัก", "คำที่ไม่มีในพจนานุกรม เช่นเว้นวรรคหายจนคำติดกัน หรือชื่อเฉพาะ", "", ""],
  ["ชื่อเขียนสองแบบ", "ชื่อเดียวกันในไฟล์เดียวกันเขียนต่างกัน เช่น Mais กับ Maïs", "", ""],
  ["ตัวอ่านไม่มั่นใจ", "PaddleOCR ให้คะแนนความมั่นใจของบรรทัดนี้ต่ำกว่าเกณฑ์", "", ""],
  ["มีตัวที่อ่านไม่ออก", "ตัวสอนเองไม่รู้จักตัวนี้ ใส่ * ไว้แทน", "", ""],
] };
export const POS_TIP: Tip = { w: "ซับบางภาพไม่ได้อยู่ล่างจอ เช่นชื่อสถานที่บนจอหรือป้ายชื่อตัวละคร โปรแกรมดูจากพิกัดในไฟล์ซับรูปแล้วติดป้ายบนจอให้\nตอนส่งออกเป็นซับตัวหนังสือ บรรทัดบนจอจะเก็บตำแหน่งไว้ให้อยู่ที่เดิม" };
export const BINERR_TIP: Tip = { w: "Binary OCR เทียบภาพตัวอักษรกับภาพในฐานทีละจุด\nค่านี้คือเปอร์เซ็นต์ของจุดที่ต่างได้มากสุดที่ยังนับเป็นตัวเดียวกัน", r: "ใช้ค่าตั้งต้นก่อน ถ้าหยุดสอนบ่อยจึงค่อยเพิ่มทีละน้อย ตั้งสูงไปตัวที่คล้ายกันจะอ่านสลับกัน" };
export const FORCED_TIP: Tip = { w: "ซับบังคับ (forced) คือบรรทัดที่ขึ้นบนจอแม้ผู้ชมปิดซับ เช่นคำแปลป้ายหรือบทพูดภาษาต่างประเทศในเรื่อง ไฟล์ซับรูปติดธงนี้ไว้ทีละภาพ" };
export const SPACE_TIP: Tip = { w: "ช่องห่างระหว่างตัวอักษรกว้างเกินกี่จุดถึงนับเป็นเว้นวรรค ใส่ 0 ให้ตัวอ่านตัดสินเองจากความสูงของตัว" };
export const LINES_TIP: Tip = { w: "ตัวสอนเองจำตัวอักษรเป็นเส้นสั้น ๆ ที่ลากผ่านภาพ ตอนอ่านจะเทียบว่าเส้นตกที่เดิมไหม", o: [
  ["เส้นเขียว", "ต้องผ่านเนื้อตัวอักษร", "", ""],
  ["เส้นแดง", "ต้องผ่านที่ว่าง ไม่โดนตัวอักษร", "", ""],
  ["จุดผิดที่ยอม", "จำนวนจุดบนเส้นที่ไม่ตรงได้ ยิ่งมากยิ่งจับคู่ง่ายแต่ผิดง่าย", "", ""],
], r: "จุดผิดที่ยอม 25 ตามค่าตั้งต้นของ Subtitle Edit" };

export const REASON_NAME: Record<OcrReason["kind"], string> = { disagree: "ตัวช่วยอ่านไม่ตรง", unknown: "คำที่ไม่รู้จัก", nameVariant: "ชื่อเขียนสองแบบ", lowConf: "ตัวอ่านไม่มั่นใจ", unreadable: "มีตัวที่อ่านไม่ออก", empty: "ไม่มีข้อความ" };
const REASON_CLS: Record<OcrReason["kind"], string> = { disagree: "", unknown: " f-word", nameVariant: " f-name", lowConf: "", unreadable: " f-word", empty: "" };
export const kinds = (rs: OcrReason[]) => [...new Set(rs.map((r) => r.kind))];
export const TEACH_OFF = "สอนได้เฉพาะตัวสอนเอง เลือก nOCR Binary OCR หรือตัวสอนเองของชั้นหนังก่อน";
/** รายละเอียดของเหตุ คำไหนไม่รู้จัก ชื่อไหนเขียนสองแบบ ความมั่นใจเท่าไหร่ */
export function whyText(rs: OcrReason[]): string {
  const out: string[] = [];
  for (const r of rs) {
    if (r.kind === "unknown") out.push(`ไม่รู้จัก ${r.words.join(" ")}`);
    else if (r.kind === "nameVariant") out.push(`${r.word} คล้าย ${r.other} ที่เจอ ${r.count} ครั้ง`);
    else if (r.kind === "lowConf") out.push(`ความมั่นใจ ${Math.round(r.conf * 100)}%`);
  }
  return out.join(" และ ");
}
export const FlagChips = ({ rs }: { rs: OcrReason[] }) => <>{kinds(rs).map((k) => <span key={k} className={"ocr-flag" + REASON_CLS[k]}>{REASON_NAME[k]}</span>)}</>;

/* ---------- ภาษา ---------- */
export const PADDLE_LANGS: { value: string; label: string; fix: [string, string] }[] = [
  { value: "", label: "อังกฤษ ญี่ปุ่น จีน", fix: ["eng", "en_US"] }, { value: "th", label: "ไทย", fix: ["tha", ""] }, { value: "ko", label: "เกาหลี", fix: ["kor", ""] },
  { value: "latin", label: "ภาษาอักษรละตินอื่น", fix: ["", ""] }, { value: "ru", label: "รัสเซีย", fix: ["rus", ""] }, { value: "uk", label: "ยูเครน", fix: ["ukr", ""] },
  { value: "ar", label: "อาหรับ", fix: ["ara", ""] }, { value: "hi", label: "ฮินดี", fix: ["hin", ""] }, { value: "el", label: "กรีก", fix: ["ell", ""] },
  { value: "ta", label: "ทมิฬ", fix: ["tam", ""] }, { value: "te", label: "เตลูกู", fix: ["tel", ""] },
];
/** ภาษาของตัวแก้คำกับพจนานุกรมตามตัวอ่านและภาษาที่เลือก · พจนานุกรมที่แนบมามีอังกฤษ ไทยยังไม่ตรวจคำ (㉘) */
export function fixLangOf(c: OcrCfg): [string, string] {
  if (c.engine === "paddle") return PADDLE_LANGS.find((l) => l.value === c.paddle.lang)?.fix ?? ["eng", "en_US"];
  if (c.engine === "tesseract") { const l = c.tess.lang.split("+")[0]; return [l, l === "eng" ? "en_US" : ""]; }
  if (c.engine === "own") return ["tha", ""];
  return ["eng", "en_US"];
}
export function setCfg(patch: Partial<OcrCfg>) {
  const next = { ...getOcrJob().cfg, ...patch };
  const [lang3, dict] = fixLangOf(next);
  setOcrCfg({ ...patch, lang3, dict });
}

/* ---------- เวลา ---------- */
export const ts = (t: number) => { const m = Math.floor(t / 60), s = t - m * 60; return `${m}:${s.toFixed(2).padStart(5, "0")}`; };
export const dur = (ms: number) => { const s = Math.round(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
