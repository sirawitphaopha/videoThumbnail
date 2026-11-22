/* คำสั่งของระบบ OCR ซับรูป (ocrApi) กับชนิดข้อมูล
   แยกจาก src/lib/api.ts ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 · แผนแบ่งไฟล์ขั้น 6.1) ย้ายมาทั้งก้อน เนื้อโค้ดไม่เปลี่ยน · ไฟล์อื่น import ผ่าน src/lib/api (index.ts ส่งต่อทุกชื่อ) */
import type { SubDoc, SubImg } from "./subs";
import { call } from "./core";

/* ---------- OCR ซับรูป (แผน OCR ขั้น 1 กับขั้น 10 · ocrsrc.rs ocrjob.rs suspect.rs) ---------- */
/** ภาพหนึ่งบรรทัดของ OCR · an ตำแหน่งแบบ ASS 1–9 (2 คือกลางล่าง) */
export type OcrItem = { n: number; start: number; end: number | null; w: number; h: number; canvas: [number, number]; at: [number, number]; forced: boolean; an: number };
export type OcrSource = { kind: "pgs" | "vobsub" | "bdn" | "png" | "other"; items: OcrItem[] };
export type OcrEngine = "paddle" | "tesseract" | "nocr" | "binary" | "own";
export type OcrPrep = { cropTransparent: boolean; invert: boolean; binarize: boolean; removeBorders: boolean; borderSize: number; toOneColor: boolean; oneColorThreshold: number; upscaleTo: number };
export type OcrPaddleOpts = { lang: string; size: "tiny" | "small" | "medium"; vertical: "auto" | "on" | "off"; orientation: boolean };
export type OcrTessOpts = { lang: string; oem: number; perLine: boolean; vertical: "auto" | "on" | "off" };
/** ค่าตั้งของงาน OCR ส่งไปทุกคำสั่ง (OcrCfg ใน ocrjob.rs) */
export type OcrCfg = {
  engine: OcrEngine; paddle: OcrPaddleOpts; tess: OcrTessOpts;
  nocrDb: string; maxWrong: number; italic: boolean; spacePx: number; lastDitch: boolean;
  binDb: string; binMaxErr: number; binSpacePx: number; ownDb: string;
  fallback: boolean; teach: boolean; lines: number; algo: "Random" | "SkeletonDistance" | "EdgeHough";
  /** ตัวช่วยตรวจ paddle:tiny paddle:small paddle:medium tesseract nocr binary own */
  helpers: string[]; prep: OcrPrep;
  fix: boolean; lang3: string; dict: string; guess: boolean; confMin: number; autoBreak: boolean;
};
/** เหตุที่บรรทัดน่าสงสัย (suspect.rs Reason) */
export type OcrReason =
  | { kind: "disagree"; engine: string; text: string }
  | { kind: "unknown"; words: string[] }
  | { kind: "nameVariant"; word: string; other: string; count: number }
  | { kind: "lowConf"; conf: number }
  | { kind: "unreadable" }
  | { kind: "empty" };
export type OcrLine = {
  index: number; text: string; raw: string; conf: number | null; reasons: OcrReason[]; unknown: string[];
  guesses: [string, string][]; fixes: [string, string][]; helpers: [string, string][];
  an: number; anLines: number[] | null; unreadable: number; ms: number;
};
/** คำขอสอนหนึ่งตัว · image ภาพตัวขาวบนพื้นใส boxes กรอบของทุกชิ้น x y กว้าง สูง (เว้นวรรคเป็น null) */
export type OcrTeachReq = {
  index: number; engine: OcrEngine; db: string; letter: number; image: string; width: number; height: number;
  boxes: ([number, number, number, number] | null)[]; expandMax: number; top: number; guess: string;
};
export type OcrReadResult = ({ kind: "done" } & OcrLine) | ({ kind: "teach" } & OcrTeachReq);
/** คำตอบของหน้าต่างสอน · expand จำนวนชิ้นถัดไปที่รวมเป็นตัวเดียวกัน · lines เส้นที่วาดเอง (พิกัดในตัวอักษร) */
export type OcrTeachAnswer =
  | { kind: "learn"; text: string; italic: boolean; expand: number; lines?: { fg: [number, number, number, number][]; bg: [number, number, number, number][] } }
  | { kind: "once"; text: string; expand: number }
  | { kind: "skip" }
  | { kind: "stop" };
export type OcrWordAction = "changeAll" | "skipAll" | "addName" | "addWord";
/** ตัวที่สอนไปแล้ว · png ภาพตัวที่สอน · at เวลาที่สอน (มิลลิวินาที) */
export type OcrTaught = { index: number; engine: OcrEngine; db: string; text: string; italic: boolean; pieces: number; png: string; at: number };
export type OcrDbKind = "nocr" | "binary" | "own";
/** ผลฝึกจากฟอนต์ · stopped กดหยุดกลางทาง (บันทึกเท่าที่ได้) */
/** ส่งออกผล OCR (ขั้น 12) · an ตำแหน่งแบบ ASS ต่อบรรทัดของข้อความ · fmt รหัสชนิดของ SeConv · top tag แยกแถวเก็บไว้บนจอ down รวมไว้ล่างจอ */
export type OcrExpRow = { start: number; end: number | null; text: string; an: number[] };
export type OcrExpReq = { rows: OcrExpRow[]; fmt: string; top: "tag" | "down"; italic: boolean; enc: "utf8bom" | "utf8" | "utf16" | "tis"; canvas: [number, number] };
export type OcrExpFormat = { id: string; name: string; ext: string };
export type OcrExpOut = { path: string; lines: number; bytes: number };
export type OcrHtmlOut = { folder: string; html: string; images: number; empty: number };
export type OcrTrainDone = { name: string; learned: number; skipped: number; total: number; stopped: boolean };
export type OcrTrainReq = { kind: OcrDbKind; name: string; base: string; overwrite: boolean; fonts: string[]; sizes: number[]; bold: boolean; italic: boolean; lines: number; chars: string; merged: string };
/** ผลย่อฐาน · backup ชื่อไฟล์สำรองของฐานเดิม */
export type OcrOptimizeDone = { linesBefore: number; linesAfter: number; entries: number; backup: string };
/** หน้าต่างตรวจบรรทัด · เส้นเทียบในพิกัดของภาพที่แสดง (x1 y1 x2 y2) · inDb ตัวนี้อยู่ในฐาน แก้หรือลบได้ */
export type OcrInspMatch = { text: string; italic: boolean; w: number; h: number; top: number; expand: number; fg: [number, number, number, number][]; bg: [number, number, number, number][]; inDb: boolean };
/** ชิ้นหนึ่งของบรรทัด · special เว้นวรรคหรือ 
 · cont ชิ้นที่ตัวขยายจับก่อนหน้ากินไป */
export type OcrInspLetter = { special: string | null; cont: boolean; x: number; y: number; w: number; h: number; top: number; png: string; m: OcrInspMatch | null };
export type OcrInspView = { index: number; engine: OcrEngine; db: string; sentence: string; sentW: number; sentH: number; letters: OcrInspLetter[] };
/** รูปแบบหนึ่งตัวในฐาน · key ลำดับในรายการรวม · fg bg เส้นเทียบ nOCR (x1 y1 x2 y2 พิกัดของตัว) · png ภาพของ Binary OCR */
export interface OcrDbItem { key: number; text: string; w: number; h: number; top: number; italic: boolean; expand: number; fg: [number, number, number, number][]; bg: [number, number, number, number][]; png: string | null }
export interface OcrDbChars { name: string; total: number; bundled: boolean; saved: boolean; items: OcrDbItem[] }
export type OcrDbList = { nocr: string[]; binary: string[]; own: string[] };

/** ชุดภาษาของ Tesseract · have bundled แนบมา downloaded โหลดแล้ว ว่างคือยังไม่มี */
export type OcrTessLang = { code: string; name: string; have: "" | "bundled" | "downloaded" };
/** โมเดลภาษาของ PaddleOCR ที่โหลดเพิ่มได้ (BUGS ข้อ 152) · mb ขนาดที่ต้องโหลด · have มีในเครื่องแล้ว */
export type OcrPaddleLang = { code: string; name: string; mb: number; have: boolean };
export const ocrApi = {
  paddleLangs: () => call<OcrPaddleLang[]>("ocr_paddle_langs"),
  /** โหลดโมเดลภาษา · ความคืบหน้าทางเหตุการณ์ ocr-paddle-progress { code percent } */
  paddleDownload: (code: string) => call<void>("ocr_paddle_download", { code }),
  paddleCancel: () => call<void>("ocr_paddle_cancel"),
  tessLangs: () => call<OcrTessLang[]>("ocr_tess_langs"),
  /** โหลดชุดภาษา · ความคืบหน้าทางเหตุการณ์ ocr-tess-progress { code percent } */
  tessDownload: (code: string) => call<void>("ocr_tess_download", { code }),
  tessCancel: () => call<void>("ocr_tess_cancel"),
  /** เปิดซับรูป · ความคืบหน้าทางเหตุการณ์ subimg-progress · ภาพเก็บไว้ฝั่ง Rust ให้ read อ่านต่อ */
  source: (path: string, ff: number) => call<OcrSource>("ocr_source", { path, ff }),
  sourcePngs: (files: string[]) => call<OcrSource>("ocr_source_pngs", { files }),
  /** อ่านหนึ่งภาพ (นับจาก 0) · ได้ผลหรือคำขอสอน */
  read: (index: number, cfg: OcrCfg) => call<OcrReadResult>("ocr_read", { index, cfg }),
  teach: (answer: OcrTeachAnswer, cfg: OcrCfg) => call<void>("ocr_teach", { answer, cfg }),
  word: (action: OcrWordAction, word: string, to?: string) => call<void>("ocr_word", { action, word, to: to ?? null }),
  suggest: (word: string) => call<string[]>("ocr_suggest", { word }),
  /** ชื่อเดียวกันเขียนสองแบบ ดูทั้งไฟล์ */
  names: (lines: string[]) => call<OcrReason[][]>("ocr_names", { lines }),
  dbs: () => call<OcrDbList>("ocr_dbs"),
  history: () => call<OcrTaught[]>("ocr_history"),
  /** แก้ข้อความกับตัวเอียงของตัวที่สอนไปแล้วลำดับ k (ลำดับในรายการที่ history คืน) */
  historyUpdate: (k: number, text: string, italic: boolean) => call<void>("ocr_history_update", { k, text, italic }),
  historyDelete: (k: number) => call<void>("ocr_history_delete", { k }),
  /** เปิดหน้าต่างตรวจบรรทัดของภาพลำดับ index */
  inspect: (index: number, cfg: OcrCfg) => call<OcrInspView>("ocr_inspect", { index, cfg }),
  inspectUpdate: (li: number, text: string, italic: boolean, lines: { fg: [number, number, number, number][]; bg: [number, number, number, number][] } | null, cfg: OcrCfg) => call<OcrInspView>("ocr_inspect_update", { li, text, italic, lines, cfg }),
  inspectDelete: (li: number, cfg: OcrCfg) => call<OcrInspView>("ocr_inspect_delete", { li, cfg }),
  /** วาดเส้นใหม่ตามจำนวน ยังไม่บันทึก */
  inspectDraw: (li: number, lines: number, cfg: OcrCfg) => call<{ fg: [number, number, number, number][]; bg: [number, number, number, number][] }>("ocr_inspect_draw", { li, lines, cfg }),
  /** คำขอสอนของชิ้น li (เพิ่มคู่ที่ดีกว่า) ตอบผ่าน teach ตามปกติ */
  inspectTeach: (li: number, cfg: OcrCfg) => call<OcrTeachReq>("ocr_inspect_teach", { li, cfg }),
  inspectReload: (cfg: OcrCfg) => call<OcrInspView>("ocr_inspect_reload", { cfg }),
  /** ฝึกฐานจากฟอนต์ · ความคืบหน้าส่งทาง ocr-train-progress */
  train: (req: OcrTrainReq) => call<OcrTrainDone>("ocr_train", { req }),
  trainCancel: () => call<void>("ocr_train_cancel"),
  trainPreview: (font: string, size: number, bold: boolean, italic: boolean, text: string) => call<string>("ocr_train_preview", { font, size, bold, italic, text }),
  fontFamilies: () => call<string[]>("font_families"),
  /** ย่อฐาน nOCR สำรองไฟล์เดิมก่อน · ความคืบหน้าส่งทาง ocr-optimize-progress */
  dbOptimize: (name: string, maxWrong: number) => call<OcrOptimizeDone>("ocr_db_optimize", { name, maxWrong }),
  /** วาดภาพ VobSub ทั้งไฟล์ใหม่ด้วยสีสี่ช่อง (null ใช้จานสีของไฟล์) · ข้อความที่อ่านไว้ไม่หาย */
  vobsubRecolor: (path: string, ff: number, colors: [number, number, number, number][] | null) => call<SubImg[]>("ocr_vobsub_recolor", { path, ff, colors }),
  /** ลบภาพลำดับที่ระบุออกจากงาน OCR */
  removeItems: (idx: number[]) => call<void>("ocr_remove_items", { idx }),
  exportFormats: () => call<OcrExpFormat[]>("ocr_export_formats"),
  exportPreview: (req: OcrExpReq) => call<string>("ocr_export_preview", { req }),
  /** ไฟล์ชื่อนี้มีอยู่แล้วตอบผิดพลาด exists ไม่เขียนทับ */
  exportFile: (req: OcrExpReq, target: string) => call<OcrExpOut>("ocr_export", { req, target }),
  exportDoc: (req: OcrExpReq) => call<SubDoc>("ocr_export_doc", { req }),
  /** ความคืบหน้าทางเหตุการณ์ ocr-html-progress */
  saveHtml: (texts: string[], folder: string, source: string) => call<OcrHtmlOut>("ocr_save_html", { texts, folder, source }),
  vobsubPreview: (path: string, ff: number, n: number, colors: [number, number, number, number][] | null) => call<string>("ocr_vobsub_preview", { path, ff, n, colors }),
  stop: () => call<void>("ocr_stop"),
  /** ภาพที่แต่งแล้วของภาพลำดับ index (นับจาก 0) */
  prepPreview: (index: number, prep: OcrPrep) => call<string>("ocr_prep_preview", { index, prep }),
  paddleModels: () => call<string[]>("ocr_paddle_models"),
  /** คัดลอกภาพซับลงคลิปบอร์ดหรือบันทึกเป็น PNG · คืนที่อยู่ไฟล์ที่ได้ (ชื่อชนต่อท้ายเลข) */
  imageOut: (index: number, dest: "copy" | "save", path: string | null, dry = false) => call<string>("ocr_image_out", { index, dest, path, dry }),
  /** ลบฐานของผู้ใช้ลงถังขยะ · kind nocr binary own */
  dbDelete: (kind: OcrDbKind, name: string) => call<void>("ocr_db_delete", { kind, name }),
  /** สร้างฐานว่างในโฟลเดอร์ของผู้ใช้ · ชื่อซ้ำตอบผิดพลาด */
  dbNew: (kind: OcrDbKind, name: string) => call<void>("ocr_db_new", { kind, name }),
  /** เปลี่ยนชื่อฐานของผู้ใช้ · ฐานที่แนบมาเปลี่ยนไม่ได้ */
  dbRename: (kind: OcrDbKind, from: string, to: string) => call<void>("ocr_db_rename", { kind, from, to }),
  /** ทุกรูปแบบในฐาน (หน้าต่างแก้ฐาน) */
  dbChars: (kind: OcrDbKind, name: string) => call<OcrDbChars>("ocr_db_chars", { kind, name }),
  /** แก้ข้อความกับตัวเอียงของรูปแบบ key · was ข้อความเดิม กันฐานเปลี่ยนระหว่างเปิดหน้าต่าง */
  dbCharUpdate: (kind: OcrDbKind, name: string, key: number, was: string, text: string, italic: boolean) => call<void>("ocr_db_char_update", { kind, name, key, was, text, italic }),
  dbCharDelete: (kind: OcrDbKind, name: string, key: number, was: string) => call<void>("ocr_db_char_delete", { kind, name, key, was }),
};