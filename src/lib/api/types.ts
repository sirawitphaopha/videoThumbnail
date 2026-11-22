/* ชนิดข้อมูลพื้นฐานที่หลายหน้าใช้ ค่าตั้ง หนังในคลัง ผลตรวจ คู่เสียงซับ ผลเช็กรุ่น เหตุที่เปลี่ยนชื่อไม่ได้
   ไฟล์ย่อยอื่นในโฟลเดอร์นี้ import แบบชนิดอย่างเดียว (import type) ไม่เกิดการโหลดวนตอนรัน
   แยกจาก src/lib/api.ts ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 · แผนแบ่งไฟล์ขั้น 6.1) ย้ายมาทั้งก้อน เนื้อโค้ดไม่เปลี่ยน · ไฟล์อื่น import ผ่าน src/lib/api (index.ts ส่งต่อทุกชื่อ) */
import type { CheckSpan } from "./check";
import type { GraphImg } from "./graph";
import type { Geometry } from "./poster";


export type Settings = {
  folders: string[];
  rescanOnStart: boolean;
  checkSourceBefore: boolean;
  checkOutputAfter: boolean;
  outputFormat: "mkv" | "mp4";
  originalAfter: "keep" | "trash";
  originalsFolder: string;
  posterFormat: "jpg" | "png";
  jpgQuality: number;
  shrinkLargePosters: boolean;
  defaultCheck: "quick" | "full";
  quickCheckOnStart: boolean;
  recheckReminderDays: 0 | 7 | 30 | 90;
  coverSize: "s" | "m" | "l";
  showNames: boolean;
  showDots: boolean;
  showFrames: boolean;
  /** หน้ากราฟเสียง ซูมเหมือนกันทุกกราฟ */
  graphZoomAll: boolean;
  graphImg: GraphImg;
  /** ว่าง = โปรแกรมเลือกเอง MPC-HC ก่อน · "system" = โปรแกรมหลักของ Windows · นอกนั้นคือที่อยู่โปรแกรม */
  playerPath: string;
  /** โปรแกรมเล่นที่เพิ่มเอง */
  players: string[];
  sidebarCollapsed: boolean;
  viewMode: "grid" | "table";
  sort: string;
  /** ชั้นวางดูปกตั้งหรือปกนอน · เรื่องที่มีแบบเดียวขึ้นแบบนั้น */
  coverOrient: "tall" | "wide";
  /** เก็บรูปที่จับคู่ไว้ที่ไหน beside ข้างไฟล์หนัง · app ในโปรแกรม · link จับคู่อย่างเดียว */
  /** โทนสีทั้งโปรแกรม lib/tones.ts */
  tone: string;
  linkStore: "beside" | "app" | "link";
  /** แบบที่ติ๊กไว้ เลือกได้หลายแบบพร้อมกัน · linkStore คือแบบหลักที่คิดจากค่านี้ */
  linkStores: ("beside" | "app" | "link")[];
  /** กระดานจับคู่ list รายการ · only แค่รูป */
  linkBoardImages: "list" | "only";
  linkBoardMovies: "list" | "only";
  /** บันทึกไฟล์ .sha256 ถามที่บันทึกทุกครั้ง · ปิด = บันทึกข้างไฟล์หนังทันที (BUGS ข้อ 30) */
  hashSaveAsk: boolean;
  /** ปิดโปรแกรมตอนขยายเต็มจอ เปิดครั้งหน้าขยายเต็มจอ ฝั่ง Rust จำเองตอนกดปิด (BUGS ข้อ 89) */
  windowMaximized?: boolean;
  /** ตัวเล่นหนังในหน้าแก้ซับ mpv ฝัง libmpv (ค่าตั้งต้น) · aegisub อ่านภาพทีละเฟรมเดินตามเสียง (BUGS ข้อ 111) */
  subPlayer?: "mpv" | "aegisub";
  /** รูปแบบชื่อไฟล์แทร็กที่แยกออกจากหนัง แบบ gMKVExtractGUI (BUGS ข้อ 130 · lib/extractName.ts) */
  extractPattern?: string;
};

export type LoadedFrom = "file" | "backup" | "defaults" | "new" | "partial";
/** ความจุไดรฟ์ที่โฟลเดอร์หนังอยู่ กับไดรฟ์ที่โปรแกรมเก็บข้อมูล (BUGS ข้อ 88) · app = ไดรฟ์นี้เก็บค่าตั้ง คลังหนัง และภาพปกของโปรแกรม */
export type DriveSpace = { root: string; total: number; free: number; folders: string[]; app: boolean };
export type ToolCheck = { name: string; ok: boolean; version: string };

export type Track = { lang: string | null; codec: string; layout: string | null };
/** partial ตรวจแบบเร็วบอกไม่ได้ว่าไฟล์ครบ จดค่า hash ไว้แล้ว ควรตรวจละเอียด (AUDIT ข้อ 28) */
export type MovieStatus = "unchecked" | "ok" | "bad" | "changed" | "partial";
export type Movie = {
  id: string; path: string; root: string; name: string; ext: string;
  size: number; mtime: number; added: number; year: number | null; duration: number | null;
  video: string | null; videoShort: string | null; audio: Track[]; subs: Track[];
  images: number; hasCover: boolean; coverName: string | null; coverSha256: string | null; thumb: string | null;
  /** กว้างหารสูงของปก · ตั้งแต่ 1 คือปกแนวนอน ชั้นวางวางเป็นกรอบแนวนอน */
  coverAspect?: number | null;
  /** ปกที่สอง (ปกนอน) เมื่อไฟล์มีทั้งปกตั้งและปกนอน · thumb เป็นปกตั้งเสมอ */
  thumb2?: string | null;
  cover2Name?: string | null;
  cover2Aspect?: number | null;
  status: MovieStatus; check: CheckInfo | null; sha256: string | null; missing: boolean; error: string | null;
  /** เสียงกับซับที่จับคู่ไว้ ไม่รวมเข้าไฟล์ (แผนเสียงและซับ ขั้น 7) */
  pairs?: Pair[];
  /** ปกที่จับคู่ไว้ ไม่ได้อยู่ในไฟล์ (แผนจับคู่รูปปก) */
  linked?: LinkedCover[];
  /** เรื่องที่มีสองปก "file" แสดงปกในไฟล์ · ว่าง แสดงปกจับคู่ */
  coverPick?: string;
  /** คะแนนดาว 0 ถึง 5 · 0 ยังไม่ให้ */
  rating?: number;
  /** ชั้นวางคำนวณเอง ไม่ได้มาจากคลัง · ปกจับคู่ที่กำลังแสดง ไม่มีคือแสดงปกในไฟล์หรือไม่มีปก */
  shownLink?: LinkedCover | null;
  /** ชั้นวางคำนวณเอง · มีปกในไฟล์ไหม */
  fileCover?: boolean;
};
export type LinkedCover = { orient: "tall" | "wide"; source: string; geo: Geometry | null; store: "beside" | "app" | "link"; file: string | null; owned: boolean; sha256: string | null; appCopy?: string | null; thumb: string; aspect: number; at: number; cropped?: boolean };
export type Pair = { path: string; kind: "audio" | "subtitle"; lang: string; name: string; delay: number };
export type PairPlay = { player: string; cmd: string; notes: string[]; sent: number; opened: boolean };
/** ผลตรวจครั้งล่าสุด (ขั้น 6) */
export type CheckInfo = { at: number; mode: "quick" | "full"; result: "ok" | "bad" | "changed" | "partial"; summary?: string; spans?: CheckSpan[]; basis?: "full" };
export type FolderState = { path: string; ok: boolean; count: number; error: string | null };
export type LibraryReply = { movies: Movie[]; folders: FolderState[]; scanning: boolean };
/** ผลเช็กรุ่นล่าสุด · state ok ตรงกับล่าสุด · new มีรุ่นใหม่ · ahead ที่ใช้อยู่ใหม่กว่าหน้าเว็บ · missing ยังไม่ได้ใส่ · error เช็กไม่ได้ */
export type LatestInfo = { name: string; installed: string | null; latest: string | null; state: "ok" | "new" | "ahead" | "missing" | "error"; from: string; error: string | null };
/** เหตุที่เปลี่ยนชื่อไม่ได้ · inuse denied missing busy other ขึ้นการ์ดแดงพร้อมปุ่มลองใหม่ · ที่เหลือขึ้นใต้ช่องพิมพ์ */
export type RenameProblem = {
  kind: "empty" | "chars" | "invisible" | "reserved" | "trailing" | "long" | "duplicate" | "inuse" | "denied" | "missing" | "busy" | "other";
  title: string;
  detail: string | null;
};

