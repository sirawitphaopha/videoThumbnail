/* คำสั่งของหน้ากราฟเสียง (graphApi) กับหน้าบิตเรต (bitrateApi) และชนิดข้อมูล
   แยกจาก src/lib/api.ts ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 · แผนแบ่งไฟล์ขั้น 6.1) ย้ายมาทั้งก้อน เนื้อโค้ดไม่เปลี่ยน · ไฟล์อื่น import ผ่าน src/lib/api (index.ts ส่งต่อทุกชื่อ) */
import { call } from "./core";

/* ---------- หน้ากราฟเสียง (audiograph.rs) ---------- */
export type GTrack = { index: number; codec: string; layout: string; names: string[]; lang: string | null; title: string | null; rate: number; bits: number | null; bitrate: number | null };
export type GInfo = { duration: number; size: number; audioOnly: boolean; tracks: GTrack[] };
/** env ต่อช่อง ทีละคอลัมน์ 3 ค่า ยอดบน ยอดล่าง RMS · spec ต่อช่อง base64 เลข 0–255 (−120 ถึง 0 dB) */
export type GOverview = {
  duration: number; cols: number; env: number[][]; specCols: number; specBins: number; spec: string[];
  loud: number[]; integrated: number | null; lra: number | null; truePeak: number | null;
  peaks: number[]; rms: number[]; clips: number[]; silences: [number, number][]; readTo: number;
};
export type GWindow = { t0: number; t1: number; cols: number; env: number[][]; bins: number; spec: string[] };
/** short ช่วงสั้นกว่าขนาด FFT คิดแบบเติมศูนย์ · need ความยาวอย่างน้อยที่ขนาดนี้ใช้ วินาที (AUDIT ข้อ 107) */
export type GPsd = { size: number; rate: number; short?: boolean; need?: number; db: number[][] };
export type GProgress = { path: string; track: number; percent: number };

/** รูปกราฟที่บันทึก ตั้งในหน้าตั้งค่า · ค่าตั้งต้นตรงกับ graphimg.rs */
export type GraphImg = { width: number; format: "png" | "jpg" | "webp" | "heic" | "tiff"; bits: 8 | 16; gray: boolean; dpi: number; quality: number; subsampling: "444" | "420"; compress: "fast" | "default" | "best"; title: boolean; nameGraph: boolean; dirMode: "beside" | "folder"; dir: string; ask: boolean; transparent: boolean };
export const GRAPH_IMG_DEFAULT: GraphImg = { width: 2560, format: "png", bits: 8, gray: false, dpi: 300, quality: 92, subsampling: "444", compress: "default", title: true, nameGraph: true, dirMode: "beside", dir: "", ask: true, transparent: false };
export type SavedImg = { path: string; size: number; width: number; height: number };
/** หน้าบิตเรตวิดีโอ แบบ Bitrate Viewer */
/** แทร็กที่ดูบิตเรตได้ · id เป็น v หรือ a0 a1 … */
export type BrTrack = { id: string; label: string };
export type BrInfo = { run: number; kind: "video" | "audio"; track: string; tracks: BrTrack[]; sample_rate: number; channels: number; layout: string; lang: string; duration: number; size: number; codec: string; tag: string; profile: string; format: string; width: number; height: number; fps: number; video: number; audio: number; pix_fmt: string; bit_depth: number; primaries: string; transfer: string; field_order: string; stream_bitrate: number };
export const bitrateApi = {
  /** mode pkt อ่านแพ็กเก็ต (เร็ว รู้แค่คีย์เฟรม) · frm ถอดภาพเอาชนิดเฟรม I P B */
  /** run เลขรอบที่หน้าจอกำหนดเอง ตั้งก่อนเรียก ข้อมูลที่มาก่อนคำสั่งตอบกลับจะไม่ถูกทิ้ง */
  /** track v หรือ a0 a1 … · ไม่ส่ง = วิดีโอถ้ามี ไม่มีใช้เสียงแทร็กแรก */
  start: (path: string, mode: "pkt" | "frm" = "pkt", run?: number, track?: string) => call<BrInfo>("bitrate_start", { path, mode, run, track }),
  /** รายชื่อแทร็กที่ดูได้ · มีมากกว่าหนึ่ง หน้าจอถามก่อนเปิด */
  tracks: (path: string) => call<BrTrack[]>("bitrate_tracks", { path }),
  /** เลขรอบใหม่ ไม่ซ้ำกับรอบก่อน */
  nextRun: (() => { let n = 0; return () => Date.now() * 100 + (n = (n + 1) % 100); })(),
  stop: () => call<void>("bitrate_stop"),
};

export const graphApi = {
  saveImage: (path: string, b64: string, opt: GraphImg) => call<SavedImg>("graph_save_image", { path, b64, opt }),
  info: (path: string) => call<GInfo>("graph_info", { path }),
  /** รายละเอียด codec ของแทร็กเสียงจาก MediaInfo เช่น MPEG-1 Layer 3 (LAME 3.99r) เรียงตามแทร็กเสียง */
  codecDetail: (path: string) => call<(string | null)[]>("audio_codec_detail", { path }),
  /** ไฟล์ยังอยู่ไหม เรียงตามรายการที่ส่งไป · ใช้บอกในรายการเปิดล่าสุดก่อนกด */
  exist: (paths: string[]) => call<boolean[]>("graph_exist", { paths }),
  overview: (path: string, track: number) => call<GOverview | null>("graph_overview", { path, track }),
  /** nospec ไม่ต้องใช้ภาพความถี่ (บันทึกรูปคลื่น) ฝั่ง Rust ไม่จองที่เก็บ (AUDIT ข้อ 108) */
  window: (path: string, track: number, t0: number, t1: number, cols: number, bins: number, log: boolean, full = false, nospec = false) => call<GWindow | null>("graph_window", { path, track, t0, t1, cols, bins, log, full, nospec }),
  /** ผลอ่านคลื่นที่เก็บไว้ในเครื่อง จำนวนไฟล์กับขนาดรวม · ล้างได้จากหน้าตั้งค่า */
  cacheInfo: () => call<{ files: number; bytes: number }>("graph_cache_info"),
  cacheClear: () => call<{ files: number; bytes: number }>("graph_cache_clear"),
  /** ms = คู่ช่องซ้ายขวา ได้เส้นกลางกับเส้นข้างเพิ่มท้าย 2 เส้น */
  psd: (path: string, track: number, t0: number, t1: number, series: number[][], size: number, ms: number[] | null = null) => call<GPsd | null>("graph_psd", { path, track, t0, t1, series, size, ms }),
  cancel: () => call<void>("graph_cancel"),
  /** replace ผ่านกล่องเลือกที่บันทึกที่ถามเขียนทับแล้ว เขียนตามชื่อที่เลือก (AUDIT ข้อ 112) */
  save: (path: string, b64: string | null, text: string | null, replace = false) => call<string>("graph_save", { path, b64, text, replace }),
};

