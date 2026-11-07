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
  /** ชั้นวางดูปกตั้งหรือปกนอน · เรื่องที่มีแบบเดียวขึ้นแบบนั้น */
  coverOrient: "tall" | "wide";
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
  /** กว้างหารสูงของปก · ตั้งแต่ 1 คือปกแนวนอน ชั้นวางวางเป็นกรอบแนวนอน */
  coverAspect?: number | null;
  /** ปกที่สอง (ปกนอน) เมื่อไฟล์มีทั้งปกตั้งและปกนอน · thumb เป็นปกตั้งเสมอ */
  thumb2?: string | null;
  cover2Name?: string | null;
  cover2Aspect?: number | null;
  status: MovieStatus; check: CheckInfo | null; sha256: string | null; missing: boolean; error: string | null;
};
/** ผลตรวจครั้งล่าสุด (ขั้น 6) */
export type CheckInfo = { at: number; mode: "quick" | "full"; result: "ok" | "bad" | "changed"; summary?: string; spans?: CheckSpan[] };
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
  /** ลง Icaros แล้วหรือยัง (หน้าตั้งค่า การ์ดเครื่องมือเบื้องหลัง) */
  checkIcaros: () => call<boolean>("check_icaros"),
  /** เปิดหน้าเว็บผู้พัฒนา Icaros ในเบราว์เซอร์หลัก (ที่อยู่ตายตัวในฝั่ง Rust) */
  openIcarosPage: () => call<void>("open_icaros_page"),
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
/** mode crop ตัดให้พอดี 2:3 · pad เติมขอบ · original ตามรูปเดิม คงสัดส่วน (ปกแนวนอนเป็นแนวนอน) */
export type Geometry = { rotate: 0 | 90 | 180 | 270; flip: boolean; mode: "crop" | "pad" | "original"; x: number; y: number; w: number; h: number; pad: string };
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

/** ปลายทางของรูปที่ครอป · ไม่ส่ง = หน้าใส่โปสเตอร์ · cover กับ cover_land = ช่องปกตั้งกับปกนอนของหน้าเสียงและซับ (ที่เก็บรูปแยกกัน ไม่ทับกัน) */
export type CoverTarget = "cover" | "cover_land";
export const posterApi = {
  open: (path: string, target?: CoverTarget) => call<PosterInfo>("poster_open", { path, target: target ?? null }),
  render: (geo: Geometry, format: "jpg" | "png", quality: number, opts: { choose?: boolean; sizes?: boolean; target?: CoverTarget } = {}) =>
    call<RenderInfo>("poster_render", { req: { geo, format, quality, choose: !!opts.choose, sizes: !!opts.sizes, target: opts.target ?? null } }),
  clear: (target?: CoverTarget) => call<void>("poster_clear", { target: target ?? null }),
  folderImages: (movie: string) => call<FolderImage[]>("poster_folder_images", { movie }),
  inspect: (path: string) => call<MovieInfo>("poster_inspect", { path }),
  /** ไม่สำเร็จ promise ล้มพร้อม ApplyProblem */
  apply: (req: ApplyReq) => call<ApplyResult>("poster_apply", { req }),
  cancel: () => call<void>("poster_cancel"),
};

/* ---------- หน้าเสียงและซับ (merge.rs · แผนเสียงและซับ) ---------- */
/** แทร็กหนึ่งแทร็ก ทั้งในหนังและในไฟล์ที่เพิ่ม · หน้าจอแก้ lang name default delay keep แล้วส่งกลับทั้งรายการตามลำดับใหม่ */
export type MergeTrack = {
  src: string; tid: number; ff: number | null; kind: "video" | "audio" | "subtitle"; codec: string; profile: string | null;
  lang: string; name: string; default: boolean; forced: boolean;
  channels: number | null; layout: string | null; rate: number | null; bits: number | null; bitrate: number | null;
  width: number | null; height: number | null; fps: number | null; duration: number | null; bytes: number | null; frames: number | null;
  mp4: "ok" | "style" | "no"; why: string | null; charset: string | null; delay: number; keep: boolean; inMovie: boolean;
};
export type MergeAttachment = { id: number; name: string; mime: string; size: number };
export type MergeMovie = { path: string; name: string; ext: string; size: number; duration: number | null; tracks: MergeTrack[]; attachments: MergeAttachment[]; free: number; drive: string; mp4Ok: boolean };
export type AddedFile = { path: string; name: string; ext: string; size: number; tracks: MergeTrack[]; delayFromName: number | null; langFromName: string | null; longerBy: number | null; notes: string[] };
/** keep ใช้ของเดิม · remove เอาออก · new ใช้รูปที่ครอปไว้ในช่องนั้น */
export type CoverMode = "keep" | "remove" | "new";
export type MergeReq = { movie: string; tracks: MergeTrack[]; covers: { portrait: CoverMode; land: CoverMode }; output: "mkv" | "mp4"; original: "keep" | "trash"; checkSource: boolean; checkOutput: boolean };
export type MergeResult = { mode: "mkv" | "mp4"; output: string; counts: Counts; verified: boolean; original: "kept" | "trash" | "none"; originalTo: string | null; notes: string[] };
export type CoverPreview = { preview: string; width: number; height: number; bytes: number };

export const mergeApi = {
  inspect: (path: string) => call<MergeMovie>("merge_inspect", { path }),
  addFile: (path: string, movieDuration: number | null) => call<AddedFile>("merge_add_file", { path, movieDuration }),
  /** ไม่สำเร็จ promise ล้มพร้อม ApplyProblem · ความคืบหน้ามาทางเหตุการณ์ merge-progress */
  apply: (req: MergeReq) => call<MergeResult>("merge_apply", { req }),
  cancel: () => call<void>("merge_cancel"),
  coverPreview: (path: string, id: number, slot: CoverTarget) => call<CoverPreview>("merge_cover_preview", { path, id, slot }),
  coverDrop: (slot: CoverTarget | null) => call<void>("merge_cover_drop", { slot }),
};
/** ไฟล์เสียงกับซับที่เพิ่มเข้าหนังได้ (มอคอัป ช่องลากไฟล์ของตารางแทร็ก) */
export const ADD_EXT = ["ac3", "eac3", "ec3", "dts", "dtshd", "thd", "truehd", "mlp", "aac", "m4a", "flac", "wav", "w64", "mp3", "mp2", "opus", "ogg", "oga", "mka", "wv", "tta",
  "srt", "ass", "ssa", "vtt", "sup", "idx", "sub", "mks"];

/* ---------- หน้าข้อมูลไฟล์ (fileinfo.rs · hashes.rs · extract.rs) ---------- */
export type MiSection = { title: string; kind: "general" | "video" | "audio" | "text" | "menu" | "attachment" | string; rows: [string, string][]; ext: string | null; lang: string | null };
export type Hashes = { md5: string | null; sha1: string | null; sha256: string | null; crc32: string | null; sha512: string | null; bytes: number; seconds: number };
export type HashCompare = { algo: string | null; same: boolean; diff: string | null };
export type ExtractItem = { kind: string; nth: number; ext: string; lang: string | null; name: string | null };
export type ExtractResult = { folder: string; states: string[]; files: (string | null)[]; error: string | null };
export const infoApi = {
  mediaInfo: (path: string) => call<{ text: string; sections: MiSection[] }>("media_info", { path }),
  hash: (path: string, algos: string[]) => call<Hashes | null>("hash_file", { path, algos }),
  hashCancel: () => call<void>("hash_cancel"),
  compare: (pasted: string, hashes: Hashes) => call<HashCompare>("hash_compare", { pasted, hashes }),
  saveSha256: (path: string, sha256: string) => call<string>("hash_save", { path, sha256 }),
  defaultFolder: (path: string) => call<string>("extract_default_folder", { path }),
  extract: (path: string, folder: string | null, items: ExtractItem[], policy: string[]) => call<ExtractResult>("extract_start", { req: { path, folder, items, policy } }),
  extractCancel: () => call<void>("extract_cancel"),
  /** งานแยกไฟล์หรือ hash ที่เริ่มไว้ก่อนเปลี่ยนหน้ายังทำอยู่ไหม · ฝั่ง Rust ไม่ให้เริ่มซ้อน */
  extractRunning: () => call<boolean>("extract_running"),
  hashRunning: () => call<boolean>("hash_running"),
};

const MOVIE_EXT = ["mkv", "mp4", "m4v", "mov", "avi", "webm", "ts", "m2ts", "mpg", "mpeg", "vob", "flv"];
/** ไฟล์เสียงที่หน้ากราฟเสียงเปิดได้ (มอคอัปกราฟเสียง) */
export const AUDIO_EXT = ["mp3", "flac", "wav", "m4a", "aac", "ac3", "eac3", "dts", "ogg", "opus", "mka", "wma"];

/** เลือกไฟล์จากเครื่อง · kind = movie image หรือ media (หนังหรือไฟล์เสียง ของหน้ากราฟเสียง) */
export async function pickFile(kind: "movie" | "image" | "media"): Promise<string | null> {
  if (!inApp) return null;
  const { open } = await import("@tauri-apps/plugin-dialog");
  const r = await open({
    multiple: false, directory: false,
    title: kind === "movie" ? "เลือกไฟล์หนัง" : kind === "media" ? "เลือกไฟล์หนังหรือไฟล์เสียง" : "เลือกรูปโปสเตอร์",
    filters: kind === "movie"
      ? [{ name: "ไฟล์หนัง", extensions: MOVIE_EXT }]
      : kind === "media"
        ? [{ name: "ไฟล์หนังและไฟล์เสียง", extensions: [...MOVIE_EXT, ...AUDIO_EXT] }]
        : [{ name: "รูปโปสเตอร์", extensions: ["jpg", "jpeg", "png", "webp", "bmp", "tif", "tiff", "heic", "heif"] }],
  });
  return typeof r === "string" ? r : null;
}

/** เลือกไฟล์เสียงหรือซับหลายไฟล์ (หน้าเสียงและซับ) · ยกเลิก = [] */
export async function pickAddFiles(): Promise<string[]> {
  if (!inApp) return [];
  const { open } = await import("@tauri-apps/plugin-dialog");
  const r = await open({ multiple: true, directory: false, title: "เลือกไฟล์เสียงหรือซับ", filters: [{ name: "ไฟล์เสียงและซับ", extensions: ADD_EXT }] });
  return Array.isArray(r) ? r : typeof r === "string" ? [r] : [];
}

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
export type GPsd = { size: number; rate: number; db: number[][] };
export type GProgress = { path: string; track: number; percent: number };

export const graphApi = {
  info: (path: string) => call<GInfo>("graph_info", { path }),
  overview: (path: string, track: number) => call<GOverview | null>("graph_overview", { path, track }),
  window: (path: string, track: number, t0: number, t1: number, cols: number, bins: number, log: boolean) => call<GWindow | null>("graph_window", { path, track, t0, t1, cols, bins, log }),
  /** ผลอ่านคลื่นที่เก็บไว้ในเครื่อง จำนวนไฟล์กับขนาดรวม · ล้างได้จากหน้าตั้งค่า */
  cacheInfo: () => call<{ files: number; bytes: number }>("graph_cache_info"),
  cacheClear: () => call<{ files: number; bytes: number }>("graph_cache_clear"),
  /** ms = คู่ช่องซ้ายขวา ได้เส้นกลางกับเส้นข้างเพิ่มท้าย 2 เส้น */
  psd: (path: string, track: number, t0: number, t1: number, series: number[][], size: number, ms: number[] | null = null) => call<GPsd | null>("graph_psd", { path, track, t0, t1, series, size, ms }),
  cancel: () => call<void>("graph_cancel"),
  save: (path: string, b64: string | null, text: string | null) => call<string>("graph_save", { path, b64, text }),
};

/** กล่องบันทึกไฟล์ของ Windows · ยกเลิก = null */
export async function pickSave(defaultName: string, ext: string, label: string): Promise<string | null> {
  if (!inApp) return null;
  const { save } = await import("@tauri-apps/plugin-dialog");
  const r = await save({ defaultPath: defaultName, filters: [{ name: label, extensions: [ext] }] });
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

/** เลือกโปรแกรมเล่นหนังเอง (หน้าตั้งค่า) · ยกเลิก = null */
export async function pickExe(): Promise<string | null> {
  if (!inApp) return "C:\\Program Files\\VideoLAN\\VLC\\vlc.exe";
  const { open } = await import("@tauri-apps/plugin-dialog");
  const r = await open({ multiple: false, directory: false, title: "เลือกโปรแกรมเล่นหนัง", filters: [{ name: "โปรแกรม", extensions: ["exe"] }] });
  return typeof r === "string" ? r : null;
}

/** กล่องเลือกโฟลเดอร์ของ Windows · ยกเลิก = null */
export async function pickFolder(title: string): Promise<string | null> {
  if (!inApp) return "D:\\หนัง";
  const { open } = await import("@tauri-apps/plugin-dialog");
  const r = await open({ directory: true, multiple: false, title });
  return typeof r === "string" ? r : null;
}

/* ---------- หน้าตรวจไฟล์ (check.rs · ขั้น 6) ---------- */
export type CheckMode = "quick" | "full";
export type CheckSpan = { from: number; to: number; what: string; tail?: boolean };
export type CheckProgress = { id: string; percent: number; index: number; total: number };
export type CheckItem = { id: string; error: string | null };
export type CheckFinished = { mode: CheckMode; total: number; done: number; ok: number; bad: number; changed: number; failed: number; cancelled: boolean; seconds: number; at: number };
export type PlayResult = { player: string; seeked: boolean };

export const checkApi = {
  /** เริ่มตรวจเรื่องที่เลือกเบื้องหลัง · ผลมาทางเหตุการณ์ check-started check-progress movie-updated check-item check-finished */
  start: (ids: string[], mode: CheckMode) => call<void>("check_start", { ids, mode }),
  cancel: () => call<void>("check_cancel"),
  running: () => call<boolean>("check_running"),
  /** เปิดเล่นที่วินาทีนั้น · โปรแกรมที่ตั้งไว้ หรือที่หาเจอในเครื่อง (VLC MPC-HC PotPlayer mpv) */
  playAt: (path: string, secs: number) => call<PlayResult>("play_at", { path, secs }),
};
