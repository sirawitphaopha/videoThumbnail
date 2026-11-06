/* ทางเดียวที่หน้าจอคุยกับฝั่ง Rust
   เปิดในโปรแกรมจริง = เรียกคำสั่งฝั่ง Rust · เปิดในเบราว์เซอร์ (ตรวจหน้าตา) = ใช้ข้อมูลจำลองใน mock.ts
   หน้าจอห้ามเรียก invoke เองที่อื่น จะได้มีที่เดียวให้ตรวจว่าเรียกอะไรบ้าง */
import { convertFileSrc, invoke, isTauri } from "@tauri-apps/api/core";
import { mock } from "./mock";

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
  playerPath: string;
  sidebarCollapsed: boolean;
  viewMode: "grid" | "table";
  sort: string;
};

export type LoadedFrom = "file" | "backup" | "defaults" | "new";
export type ToolCheck = { name: string; ok: boolean; version: string };

export type Track = { lang: string | null; codec: string; layout: string | null };
export type MovieStatus = "unchecked" | "ok" | "bad" | "changed";
export type Movie = {
  id: string; path: string; root: string; name: string; ext: string;
  size: number; mtime: number; added: number; year: number | null; duration: number | null;
  video: string | null; videoShort: string | null; audio: Track[]; subs: Track[];
  images: number; hasCover: boolean; coverName: string | null; coverSha256: string | null; thumb: string | null;
  status: MovieStatus; check: CheckInfo | null; sha256: string | null; missing: boolean; error: string | null;
};
/** ผลตรวจครั้งล่าสุด (ขั้น 6) */
export type CheckInfo = { at: number; mode: "quick" | "full"; result: "ok" | "bad" | "changed"; summary?: string; spans?: { from: number; to: number; what: string }[] };
export type FolderState = { path: string; ok: boolean; count: number; error: string | null };
export type LibraryReply = { movies: Movie[]; folders: FolderState[]; scanning: boolean };

export const inApp = isTauri();

async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!inApp) return mock<T>(cmd, args);
  return invoke<T>(cmd, args);
}

export const api = {
  getSettings: () => call<{ settings: Settings; loadedFrom: LoadedFrom }>("get_settings"),
  setSettings: (patch: Partial<Settings>) => call<Settings>("set_settings", { patch }),
  checkTools: () => call<ToolCheck[]>("check_tools"),
  /** มีงานกำลังรันอยู่กี่งาน · ใช้ตอนกดปิดโปรแกรม */
  runningJobs: () => call<number>("running_jobs"),
  /** ปิดโปรแกรมจริง หลังผู้ใช้ยืนยันในหน้าต่างถาม */
  forceClose: () => call<void>("force_close"),
  getLibrary: () => call<LibraryReply>("get_library"),
  /** เริ่มอ่านโฟลเดอร์เบื้องหลัง · ผลมาทางเหตุการณ์ movie-updated scan-progress scan-finished */
  scanLibrary: () => call<void>("scan_library"),
  playMovie: (path: string) => call<void>("play_movie", { path }),
  revealMovie: (path: string) => call<void>("reveal_movie", { path }),
  /** เช็กชื่อใหม่ตอนพิมพ์ (ไม่รวมนามสกุล) · null = ใช้ได้ หรือชื่อเหมือนเดิม · ตัวเช็กอยู่ฝั่ง Rust ที่เดียว (rename.rs) */
  checkRename: (id: string, stem: string) => call<RenameProblem | null>("check_rename", { id, stem }),
  /** เปลี่ยนชื่อไฟล์จริงแบบไม่เขียนทับ · ไม่สำเร็จ promise ล้มพร้อม RenameProblem */
  renameMovie: (id: string, stem: string) => call<Movie>("rename_movie", { id, stem }),
};

/* ---------- หน้าใส่โปสเตอร์ (poster.rs · poster_image.rs) ---------- */
export type Geometry = { rotate: 0 | 90 | 180 | 270; flip: boolean; mode: "crop" | "pad"; x: number; y: number; w: number; h: number; pad: string };
export type PosterInfo = {
  path: string; name: string; ext: string; attachable: boolean; width: number; height: number;
  aspect: string; twoThree: boolean; preview: string; fileSize: number; exif: number; icc: boolean; crop: [number, number, number, number];
};
export type RenderInfo = { bytes: number; width: number; height: number; cropW: number; cropH: number; small: boolean; preview: string; sizes: [number, number][] };
export type FolderImage = { path: string; name: string; ext: string; width: number; height: number; thumb: string | null; attachable: boolean; error: string | null };
export type StreamInfo = { index: number; kind: "video" | "audio" | "subtitle"; codec: string; lang: string | null; mp4: "ok" | "style" | "no"; why: string | null };
export type Counts = { video: number; audio: number; subs: number };
export type MovieInfo = { path: string; name: string; ext: string; size: number; duration: number | null; width: number; height: number; streams: StreamInfo[]; counts: Counts; free: number; drive: string };
export type ApplyReq = { path: string; output: "mkv" | "mp4"; checkSource: boolean; checkOutput: boolean; original: "keep" | "trash"; drop: number[] };
export type ApplyProblem = { kind: string; title: string; detail: string[] };
export type ApplyResult = { mode: "cover" | "wrap" | "mp4"; output: string; counts: Counts; verified: boolean; original: "kept" | "trash" | "none"; originalTo: string | null; notes: string[] };
export type PosterProgress = { phase: string; percent: number; eta: number | null; next: string | null };

export const posterApi = {
  open: (path: string) => call<PosterInfo>("poster_open", { path }),
  render: (geo: Geometry, format: "jpg" | "png", quality: number, opts: { choose?: boolean; sizes?: boolean } = {}) =>
    call<RenderInfo>("poster_render", { req: { geo, format, quality, choose: !!opts.choose, sizes: !!opts.sizes } }),
  clear: () => call<void>("poster_clear"),
  folderImages: (movie: string) => call<FolderImage[]>("poster_folder_images", { movie }),
  inspect: (path: string) => call<MovieInfo>("poster_inspect", { path }),
  /** ไม่สำเร็จ promise ล้มพร้อม ApplyProblem */
  apply: (req: ApplyReq) => call<ApplyResult>("poster_apply", { req }),
  cancel: () => call<void>("poster_cancel"),
};

/** เลือกไฟล์จากเครื่อง · kind = movie หรือ image */
export async function pickFile(kind: "movie" | "image"): Promise<string | null> {
  if (!inApp) return null;
  const { open } = await import("@tauri-apps/plugin-dialog");
  const r = await open({
    multiple: false, directory: false,
    title: kind === "movie" ? "เลือกไฟล์หนัง" : "เลือกรูปโปสเตอร์",
    filters: kind === "movie"
      ? [{ name: "ไฟล์หนัง", extensions: ["mkv", "mp4", "m4v", "mov", "avi", "webm", "ts", "m2ts", "mpg", "mpeg", "vob", "flv"] }]
      : [{ name: "รูปโปสเตอร์", extensions: ["jpg", "jpeg", "png", "webp", "bmp", "tif", "tiff", "heic", "heif"] }],
  });
  return typeof r === "string" ? r : null;
}

/** เหตุที่เปลี่ยนชื่อไม่ได้ · inuse denied missing busy other ขึ้นการ์ดแดงพร้อมปุ่มลองใหม่ · ที่เหลือขึ้นใต้ช่องพิมพ์ */
export type RenameProblem = {
  kind: "empty" | "chars" | "invisible" | "reserved" | "trailing" | "long" | "duplicate" | "inuse" | "denied" | "missing" | "busy" | "other";
  title: string;
  detail: string | null;
};

/** ที่อยู่ภาพเล็กของปกสำหรับแท็ก img · ผ่าน asset protocol ที่อนุญาตเฉพาะโฟลเดอร์ thumbs */
export function thumbUrl(path: string | null): string | null {
  if (!path) return null;
  return inApp ? convertFileSrc(path) : path;
}

/** กล่องเลือกโฟลเดอร์ของ Windows · ยกเลิก = null */
export async function pickFolder(title: string): Promise<string | null> {
  if (!inApp) return "D:\\หนัง";
  const { open } = await import("@tauri-apps/plugin-dialog");
  const r = await open({ directory: true, multiple: false, title });
  return typeof r === "string" ? r : null;
}
