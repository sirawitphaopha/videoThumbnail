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
};

export type LoadedFrom = "file" | "backup" | "defaults" | "new" | "partial";
/** ความจุไดรฟ์ที่โฟลเดอร์หนังอยู่ กับไดรฟ์ที่โปรแกรมเก็บข้อมูล (BUGS ข้อ 88) · app = ไดรฟ์นี้เก็บค่าตั้ง คลังหนัง และภาพปกของโปรแกรม */
export type DriveSpace = { root: string; total: number; free: number; folders: string[]; app: boolean };
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
export type CheckInfo = { at: number; mode: "quick" | "full"; result: "ok" | "bad" | "changed"; summary?: string; spans?: CheckSpan[] };
export type FolderState = { path: string; ok: boolean; count: number; error: string | null };
export type LibraryReply = { movies: Movie[]; folders: FolderState[]; scanning: boolean };

export const inApp = isTauri();

async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!inApp) return mock<T>(cmd, args);
  return invoke<T>(cmd, args);
}

export const api = {
  getSettings: () => call<{ settings: Settings; loadedFrom: LoadedFrom; recoveredFolders?: number }>("get_settings"),
  /** ความจุไดรฟ์ของโฟลเดอร์หนังกับไดรฟ์ของโปรแกรม อ่านอย่างเดียว (BUGS ข้อ 88) */
  driveSpace: (folders: string[]) => call<DriveSpace[]>("drive_space", { folders }),
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
  /** ให้คะแนนดาว · 0 ล้างคะแนน */
  setRating: (id: string, stars: number) => call<Movie>("set_rating", { id, stars }),
  /** เช็กชื่อใหม่ตอนพิมพ์ (ไม่รวมนามสกุล) · null = ใช้ได้ หรือชื่อเหมือนเดิม · ตัวเช็กอยู่ฝั่ง Rust ที่เดียว (rename.rs) */
  checkRename: (id: string, stem: string) => call<RenameProblem | null>("check_rename", { id, stem }),
  /** เปลี่ยนชื่อไฟล์จริงแบบไม่เขียนทับ · ไม่สำเร็จ promise ล้มพร้อม RenameProblem */
  renameMovie: (id: string, stem: string) => call<Movie>("rename_movie", { id, stem }),
};

/* ---------- หน้าใส่โปสเตอร์ (poster.rs · poster_image.rs) ---------- */
/** mode crop ตัดให้พอดี 2:3 · pad เติมขอบ · original ตามรูปเดิม คงสัดส่วน (ปกแนวนอนเป็นแนวนอน) */
export type Geometry = { rotate: 0 | 90 | 180 | 270; flip: boolean; mode: "crop" | "pad" | "original"; x: number; y: number; w: number; h: number; pad: string; tilt?: number; aspect?: string };
export type PosterInfo = {
  path: string; name: string; ext: string; attachable: boolean; width: number; height: number;
  aspect: string; twoThree: boolean; preview: string; fileSize: number; exif: number; icc: boolean; crop: [number, number, number, number];
};
export type ViewInfo = { preview: string; width: number; height: number; fileSize: number; ext: string };
export type RenderInfo = { bytes: number; width: number; height: number; cropW: number; cropH: number; small: boolean; preview: string; sizes: [number, number][] };
export type FolderImage = { path: string; name: string; ext: string; width: number; height: number; thumb: string | null; attachable: boolean; error: string | null };
export type StreamInfo = { index: number; kind: "video" | "audio" | "subtitle"; codec: string; lang: string | null; mp4: "ok" | "style" | "no"; why: string | null };
export type Counts = { video: number; audio: number; subs: number };
export type MovieInfo = { path: string; name: string; ext: string; size: number; duration: number | null; width: number; height: number; streams: StreamInfo[]; counts: Counts; free: number; drive: string };
export type ApplyReq = { path: string; output: "mkv" | "mp4"; checkSource: boolean; checkOutput: boolean; original: "keep" | "trash"; drop: number[]; name?: string };
export type ApplyProblem = { kind: string; title: string; detail: string[] };
export type ApplyResult = { mode: "cover" | "wrap" | "mp4"; output: string; counts: Counts; verified: boolean; original: "kept" | "trash" | "none"; originalTo: string | null; notes: string[] };
export type PosterProgress = { phase: string; percent: number; eta: number | null; next: string | null };

/** ปลายทางของรูปที่ครอป · ไม่ส่ง = หน้าใส่โปสเตอร์ · cover กับ cover_land = ช่องปกตั้งกับปกนอนของหน้าเสียงและซับ (ที่เก็บรูปแยกกัน ไม่ทับกัน) */
export type CoverTarget = "cover" | "cover_land";
/** หน้าครอปใช้กับหน้าไหน · link ระบบจับคู่รูปปก เก็บแค่ค่าครอป */
export type CropTarget = CoverTarget | "link";
export const posterApi = {
  open: (path: string, target?: CropTarget) => call<PosterInfo>("poster_open", { path, target: target ?? null }),
  render: (geo: Geometry, format: "jpg" | "png", quality: number, opts: { choose?: boolean; sizes?: boolean; target?: CropTarget } = {}) =>
    call<RenderInfo>("poster_render", { req: { geo, format, quality, choose: !!opts.choose, sizes: !!opts.sizes, target: opts.target ?? null } }),
  clear: (target?: CropTarget) => call<void>("poster_clear", { target: target ?? null }),
  /** รูปใหญ่ของตัวดูรูปเต็มจอ · ส่งค่าครอปมาได้ภาพหลังครอป · ไม่แตะรูปที่ค้างในหน้าอื่น */
  view: (path: string, geo: Geometry | null) => call<ViewInfo>("poster_view", { path, geo }),
  folderImages: (movie: string) => call<FolderImage[]>("poster_folder_images", { movie }),
  inspect: (path: string) => call<MovieInfo>("poster_inspect", { path }),
  /** ไม่สำเร็จ promise ล้มพร้อม ApplyProblem */
  apply: (req: ApplyReq) => call<ApplyResult>("poster_apply", { req }),
  cancel: () => call<void>("poster_cancel"),
  /** เช็กชื่อไฟล์ใหม่ตอนพิมพ์ · ไม่มีปัญหาคืนค่าว่าง */
  checkName: (path: string, output: "mkv" | "mp4", name: string) => call<RenameProblem | null>("poster_check_name", { path, output, name }),
};

/* ---------- หน้าเสียงและซับ (merge.rs · แผนเสียงและซับ) ---------- */
/** แทร็กหนึ่งแทร็ก ทั้งในหนังและในไฟล์ที่เพิ่ม · หน้าจอแก้ lang name default delay keep แล้วส่งกลับทั้งรายการตามลำดับใหม่ */
export type MergeTrack = {
  src: string; tid: number; ff: number | null; kind: "video" | "audio" | "subtitle"; codec: string; profile: string | null;
  lang: string; name: string; default: boolean; forced: boolean;
  /** ภาษาแบบละเอียด BCP 47 ที่ไฟล์บอก (zh-Hant es-419) · langWas ภาษาสามตัวตอนอ่าน หน้าจอเปลี่ยนภาษาแล้วใช้ภาษาสามตัวแทน (BUGS ข้อ 114) */
  langIetf?: string; langWas?: string;
  /** ป้ายพิเศษของแทร็ก ซับคนหูหนวก คนตาบอด คำบรรยายภาพ ภาษาต้นฉบับ เสียงบรรยาย */
  hearingImpaired?: boolean; visualImpaired?: boolean; textDescriptions?: boolean; original?: boolean; commentary?: boolean;
  channels: number | null; layout: string | null; rate: number | null; bits: number | null; bitrate: number | null;
  width: number | null; height: number | null; fps: number | null; duration: number | null; bytes: number | null; frames: number | null;
  mp4: "ok" | "style" | "no"; why: string | null; charset: string | null; delay: number; keep: boolean; inMovie: boolean;
  /** แปลงชนิดเสียงตอนรวม · null = ไม่แปลง · pair แทร็กในหนังแปลงแล้วเพิ่มคู่กับแทร็กเดิม (ค่าตั้งต้นที่พี่กันเคาะ) · convName ชื่อแทร็กใหม่แบบเพิ่มคู่ */
  convert?: EncodeSpec | null; pair?: boolean; convName?: string;
};
/* ---------- ตัวแปลงเสียง (encode.rs · แผนเสียงและซับ ขั้น 3) ---------- */
/** ค่าในแผงตั้งค่าเสียง · codec opus aac mp3 ac3 eac3 flac wv · encoder native ffmpeg qaac fdkaac · p ค่าของการ์ดแต่ละใบ ชื่อเดียวกับมอคอัป */
export type EncodeSpec = {
  codec: string; encoder: string; channels?: number | null; bits?: number | null; rate?: number | null;
  gain?: number; loudnorm?: boolean; speed?: [number, number] | null; p: Record<string, string | number | boolean>;
  /** เปลี่ยนความเร็วแล้วคงระดับเสียงแบบในไฟล์ · ไม่ส่งหรือ false = คืนระดับเสียง (ข้อ 29) */
  keepPitch?: boolean;
};
export type EncodeStep = { tool: string; args: string[] };
/** คำสั่งที่จะรันจริง · text แบบพิมพ์ใน Command Prompt ได้ */
export type EncodePlan = { steps: EncodeStep[]; piped: boolean; text: string; note: string };
export type EncoderInfo = { name: string; codecs: string; source: "bundled" | "user" | "missing"; version: string | null; ok: boolean; problem: string | null; dir: string; coreAudio: string | null };
/** บันทึกการใช้งาน (actlog.rs) · ไฟล์ข้อความรายเดือนในเครื่อง จดงานที่เขียน ย้าย หรือลบไฟล์ */
export type LogInfo = { dir: string; monthLines: number };
/** เปิดรากไดรฟ์ใน Explorer จากคำเตือนไดรฟ์ใกล้เต็ม เปิดได้เฉพาะไดรฟ์ในรายการความจุ (BUGS ข้อ 88) */
export const driveApi = {
  open: (root: string) => call<void>("drive_open", { root }),
  /** ที่ว่างของไดรฟ์ที่ไฟล์หรือโฟลเดอร์นี้อยู่ ตัวเลขเดียวกับที่งานเช็กตอนเริ่ม (BUGS ข้อ 94) */
  free: (path: string) => call<FreeInfo>("drive_free", { path }),
};
export type FreeInfo = { free: number; drive: string };

export const logApi = {
  info: () => call<LogInfo>("actlog_info"),
  openDir: () => call<string>("actlog_open_dir"),
};

export const encodeApi = {
  preview: (spec: EncodeSpec, srcName: string, stream: number, channels: number | null, bits: number | null, rate: number | null) => call<EncodePlan>("encode_preview", { spec, srcName, stream, channels, bits, rate }),
  status: () => call<EncoderInfo[]>("encoders_status"),
  openDir: () => call<string>("encoders_open_dir"),
  userDir: () => call<string>("encoders_user_dir"),
  /** เช็กรุ่นล่าสุดจากหน้าเว็บผู้ทำ (latest.rs) · ออกเน็ตเฉพาะตอนเรียก */
  latest: () => call<LatestInfo[]>("encoders_latest"),
  /** เปิดหน้าโหลดของตัวแปลง · ที่อยู่ตายตัวฝั่ง Rust */
  openPage: (name: string) => call<void>("encoders_open_page", { name }),
  /** เปิดหน้าโหลด iTunes (qaac ต้องใช้ไฟล์ของ Apple) · ที่อยู่ตายตัวฝั่ง Rust */
  openItunes: () => call<void>("open_itunes_page"),
  thanksOpen: (link: string) => call<void>("thanks_open", { link }),
};
/** ผลเช็กรุ่นล่าสุด · state ok ตรงกับล่าสุด · new มีรุ่นใหม่ · ahead ที่ใช้อยู่ใหม่กว่าหน้าเว็บ · missing ยังไม่ได้ใส่ · error เช็กไม่ได้ */
export type LatestInfo = { name: string; installed: string | null; latest: string | null; state: "ok" | "new" | "ahead" | "missing" | "error"; from: string; error: string | null };
/* ---------- แปลงเสียงเป็นคิว หน้ากราฟเสียง (convert.rs · แผนเสียงและซับ ขั้น 8) ---------- */
/** ข้อมูลเพลงหนึ่งช่อง · key ชื่อกลาง title artist album album_artist date track disc genre composer comment replaygain_* */
export type AudioTag = { key: string; value: string };
/** ไฟล์เสียงหนึ่งไฟล์ในคิว · แทร็กเสียงแรกของไฟล์ · stream เลขสตรีมของ ffprobe · codec ชื่อของ ffprobe */
export type AudioFile = {
  path: string; name: string; size: number; duration: number; audioOnly: boolean; stream: number; codec: string; profile: string;
  layout: string; channels: number; rate: number; bits: number | null; bitrate: number | null;
  tags: AudioTag[]; tagsInStream: boolean; cover: { codec: string; width: number; height: number; stream: number } | null;
};
export type CoverData = { url: string; bytes: number; codec: string; width: number; height: number };
export type ConvReq = { id: string; path: string; spec: EncodeSpec; outDir: string | null };
/** same เสียงตรงกับต้นฉบับทุกบิตไหม (BUGS ข้อ 121) · null ไม่ได้เทียบ เหตุผลอยู่ sameNote */
export type ConvResult = { out: string; size: number; srcSize: number; tags: number; cover: boolean; notes: string[]; tool: string; cmd: string; secs: number; same: boolean | null; sameNote: string };
export type ConvProgress = { id: string; percent: number; eta: number | null; phase: string };
export const convertApi = {
  probe: (path: string) => call<AudioFile>("convert_probe", { path }),
  /** ขนาดที่คาดจากการลองแปลงจริง 4 ช่วง ช่วงละ 10 วินาที แล้วคูณขยาย (BUGS ข้อ 120) · bytes เสียงล้วน · cover ขนาดปกเมื่อขอ withCover */
  sizeProbe: (path: string, stream: number, spec: EncodeSpec, channels: number | null, bits: number | null, rate: number | null, duration: number, withCover: boolean) =>
    call<{ bytes: number; cover: number; whole: boolean }>("convert_size_probe", { path, stream, spec, channels, bits, rate, duration, withCover }),
  cover: (path: string) => call<CoverData | null>("convert_cover", { path }),
  /** ไม่สำเร็จ promise ล้มพร้อม ApplyProblem */
  one: (req: ConvReq) => call<ConvResult>("convert_one", { req }),
  cancel: () => call<void>("convert_cancel"),
};
export type MergeAttachment = { id: number; name: string; mime: string; size: number };
export type MergeMovie = { path: string; name: string; ext: string; size: number; duration: number | null; tracks: MergeTrack[]; attachments: MergeAttachment[]; free: number; drive: string; mp4Ok: boolean };
export type AddedFile = { path: string; name: string; ext: string; size: number; tracks: MergeTrack[]; delayFromName: number | null; langFromName: string | null; longerBy: number | null; notes: string[]; fonts: FontHit[] };
/** ฟอนต์ที่ซับ ASS ใช้ (fonts.rs) · from folder ข้างไฟล์ซับ · user ลงเฉพาะผู้ใช้ · system ของ Windows · added ลากมาเพิ่มเอง · ว่าง = ไม่เจอ */
export type FontHit = { name: string; file: string | null; from: "folder" | "user" | "system" | "added" | ""; size: number };
/** ไฟล์ฟอนต์ที่ลากมาเพิ่มเอง · names ชื่อที่อ่านจากในไฟล์ */
export type FontFile = { path: string; file: string; names: string[]; size: number };
export const FONT_EXT = ["ttf", "otf", "ttc", "otc"];
/** keep ใช้ของเดิม · remove เอาออก · new ใช้รูปที่ครอปไว้ในช่องนั้น */
export type CoverMode = "keep" | "remove" | "new";
export type MergeReq = { movie: string; tracks: MergeTrack[]; covers: { portrait: CoverMode; land: CoverMode }; output: "mkv" | "mp4"; original: "keep" | "trash"; checkSource: boolean; checkOutput: boolean; fonts: string[]; chapters?: Chapter[] | null };
/** บทของหนัง เวลาเริ่มเป็นวินาที (BUGS ข้อ 99) */
export type Chapter = { start: number; title: string };
export type MergeResult = { mode: "mkv" | "mp4"; output: string; counts: Counts; verified: boolean; original: "kept" | "trash" | "none"; originalTo: string | null; notes: string[] };
export type CoverPreview = { preview: string; width: number; height: number; bytes: number };

/* จับคู่ไว้ ไม่รวม (ขั้น 7 · pairs.rs) · dry มีผลเฉพาะรุ่นทดสอบ ไม่เปิดโปรแกรมเล่น */
export const pairApi = {
  set: (movie: string, pairs: Pair[]) => call<Movie>("pair_set", { movie, pairs }),
  check: (paths: string[]) => call<boolean[]>("pair_check", { paths }),
  play: (movie: string, dry?: boolean) => call<PairPlay>("pair_play", { movie, dry: dry ?? null }),
};

/* จับคู่รูปปก (แผนจับคู่รูปปก · link.rs) · ทุกวิธีจับคู่ไปรอที่ตารางตรวจผล ยืนยันแล้วค่อยเก็บรูปจริง */
export type LinkPick = { path: string; name: string; folder: string; width: number; height: number; thumb: string | null; geo: Geometry | null; cropThumb?: string | null };
export type LinkStatus = "sure" | "unsure" | "none" | "manual" | "saved";
export type LinkRow = {
  id: string; movie: string; title: string; hasCover: boolean; status: LinkStatus; reason: string; via: "auto" | "board" | "explorer" | "shelf";
  tall: LinkPick | null; wide: LinkPick | null; derivedTall: boolean; candidates: LinkPick[]; score: number; ticked: boolean;
  error: string | null; prev: unknown | null; conflict: string | null; storeOverride: string | null; touched?: boolean;
};
export type LinkReplyData = { rows: LinkRow[]; imageFolders: string[]; loose: string[]; scope: "nocover" | "all"; waiting: number };
export type LinkImage = { path: string; name: string; folder: string; width: number; height: number; thumb: string | null; used: boolean; error: string | null };
export type AutoSummary = { images: number; sure: number; unsure: number; none: number; tall: number; wide: number; reply: LinkReplyData };
export type ConfirmResult = { done: number; failed: number; stopped: boolean; notes: string[]; reply: LinkReplyData };
export type LinkProgress = { done: number; total: number; title: string };
export type RowPatch = { ticked?: boolean; choose?: string; orient?: "tall" | "wide"; geo?: Geometry; skip?: boolean };
export const linkApi = {
  state: () => call<LinkReplyData>("link_state"),
  titles: (paths: string[]) => call<string[]>("link_titles", { paths }),
  isDir: (paths: string[]) => call<boolean[]>("link_is_dir", { paths }),
  images: () => call<LinkImage[]>("link_images"),
  addImages: (paths: string[]) => call<LinkReplyData>("link_add_images", { paths }),
  removeImages: (path: string) => call<LinkReplyData>("link_remove_images", { path }),
  auto: (scope: "nocover" | "all") => call<AutoSummary>("link_auto", { scope }),
  pair: (id: string, paths: string[], via: "board" | "explorer" | "shelf") => call<LinkReplyData>("link_pair", { id, paths, via }),
  undo: (id: string) => call<LinkReplyData>("link_undo", { id }),
  update: (id: string, patch: RowPatch) => call<LinkReplyData>("link_row_update", { id, patch }),
  setCrop: (id: string, orient: "tall" | "wide", geo: Geometry) => call<LinkReplyData>("link_set_crop", { id, orient, geo }),
  /** ticked ที่ติ๊กไว้ · all ทั้งหมด · ไม่งั้นเป็นเลขแถว */
  confirm: (which: string) => call<ConfirmResult>("link_confirm", { which }),
  cancel: () => call<void>("link_cancel"),
  resolve: (id: string, how: "use" | "app") => call<LinkReplyData>("link_resolve", { id, how }),
  unsave: (id: string) => call<{ notes: string[]; reply: LinkReplyData }>("link_unsave", { id }),
  remove: (id: string) => call<{ notes: string[]; reply: LinkReplyData }>("link_remove", { id }),
  openRow: (id: string) => call<LinkReplyData>("link_open_row", { id }),
  coverPick: (id: string, pick: "file" | "linked") => call<Movie>("link_cover_pick", { id, pick }),
  migrate: (to: "beside" | "app" | "link") => call<{ done: number; failed: number; notes: string[] }>("link_migrate", { to }),
};

/* ตัวดูซับ (แผนเสียงและซับ ขั้น 6 · subs.rs) · เวลาเป็นวินาทีตามไฟล์ ยังไม่บวกดีเลย์ */
export type Cue = { n: number; start: number; end: number; text: string };
export type SubText = { raw: string; kind: "srt" | "ass" | "vtt"; charset: string; cues: Cue[] };
export type SubImg = { n: number; start: number; end: number | null; w: number; h: number; canvas: [number, number]; at: [number, number]; png: string };
/** ภาพสุ่มจากหนัง แสดงแทนแถบทะแยงในเรื่องที่ยังไม่มีปก · null = ดึงไม่ได้ */
export const frameApi = {
  movie: (path: string, duration: number) => call<string | null>("movie_frame", { path, duration }),
};

export const subApi = {
  text: (path: string, inMovie: boolean, tid: number, ff: number) => call<SubText>("sub_text", { path, inMovie, tid, ff }),
  frame: (movie: string, t: number, h?: number) => call<string>("sub_frame", { movie, t, h: h ?? null }),
  wave: (movie: string, stream: number, t0: number, t1: number, cols: number) => call<number[]>("sub_wave", { movie, stream, t0, t1, cols }),
  images: (path: string, ff: number, page: number, per: number) => call<{ total: number; items: SubImg[] }>("sub_images", { path, ff, page, per }),
};

/* ตัวอ่านเขียนซับของหน้าแก้ซับ (แผนหน้าแก้ซับ ขั้น 1 · subdoc.rs) · เวลาเป็นมิลลิวินาทีตามไฟล์
   raw กับ pre คือข้อความเดิมจากไฟล์ ส่งกลับไปตามเดิมห้ามแก้ ฝั่ง Rust ใช้เทียบว่าบรรทัดไหนไม่ได้แก้ แล้วเขียนข้อความเดิมกลับทุกไบต์ */
export type SubRaw = { t: string; e: string };
export type SubEnc = { charset: "UTF-8" | "UTF-16LE" | "UTF-16BE" | "TIS-620" | "Windows-1252"; bom: boolean };
export type SubStyle = { id: number; fields: string[]; pre: SubRaw[]; raw: SubRaw[] };
export type SubEvent = {
  id: number; comment: boolean; layer: number; start: number; end: number; style: string; actor: string;
  marginL: number; marginR: number; marginV: number; effect: string;
  /** ASS ข้อความพร้อมแท็กและ \N · SRT VTT ข้อความพร้อมแท็ก ขึ้นบรรทัดด้วย \n */
  text: string;
  ident: string | null; suffix: string; pre: SubRaw[]; raw: SubRaw[];
};
export type SubItem = { k: "line"; t: string; e: string } | { k: "styles" } | { k: "events" };
export type SubSource = { path: string; inMovie: boolean; size: number; mtime: number; /** เลขแทร็กของซับในหนัง ใส่กลับเข้าหนังใช้เลขนี้ (F18) · ไม่มี = ไฟล์ซับ หรือฉบับบันทึกอัตโนมัติรุ่นก่อน */ tid?: number | null };
export type SubDoc = {
  kind: "ass" | "ssa" | "srt" | "vtt"; enc: SubEnc; eol: string;
  /** false = ไฟล์มีอักษรเสีย เข้ารหัสกลับไม่ได้ไบต์เดิม ต้องเตือนก่อนบันทึก */
  exact: boolean;
  /** บรรทัดที่อ่านไม่ออก เก็บไว้ตามเดิมแต่ไม่ขึ้นในตาราง */
  bad: number; renumber: boolean;
  skeleton: SubItem[]; styleFormat: string[]; eventFormat: string[]; styles: SubStyle[]; events: SubEvent[]; source: SubSource | null;
};
/** สิ่งที่หายตอนเปลี่ยน ASS เป็น SRT · key comment actor layer style effect margin tags fonts settings */
export type SubLost = { key: string; n: number };
export type SubSaved = { path: string; enc: SubEnc; badChar: string | null; source: SubSource };
export const subDocApi = {
  open: (path: string, inMovie: boolean, tid: number, ff: number, charset?: string) => call<SubDoc>("subdoc_open", { path, inMovie, tid, ff, charset: charset ?? null }),
  /** mode replace เขียนทับไฟล์ที่เปิด (ไฟล์เดิมลงถังขยะ) · new ไฟล์ใหม่ · ข้อผิดพลาด "exists" "changed" "missing" ให้หน้าจอถาม */
  save: (doc: SubDoc, target: string, mode: "replace" | "new", force?: boolean) => call<SubSaved>("subdoc_save", { doc, target, mode, force: force ?? null }),
  convert: (doc: SubDoc, to: "srt" | "ass", playRes?: [number, number]) => call<{ doc: SubDoc; lost: SubLost[] }>("subdoc_convert", { doc, to, playRes: playRes ?? null }),
  freeName: (path: string) => call<string>("subdoc_free_name", { path }),
  render: (doc: SubDoc) => call<string>("subdoc_render", { doc }),
  /** ขนาดกับเวลาแก้ของไฟล์ · หาไม่เจอ [0, 0] (เทียบหนังก่อนใส่ซับกลับ R3) */
  stamp: (path: string) => call<[number, number]>("subdoc_stamp", { path }),
  /** ซับเป็นไฟล์ชั่วคราวในโฟลเดอร์ tmp ของโปรแกรม ใช้ใส่กลับเข้าหนัง (ขั้น 9) */
  temp: (doc: SubDoc) => call<string>("subdoc_temp", { doc }),
  parseText: (text: string, kind: SubDoc["kind"], enc: SubEnc, source: SubSource | null) => call<SubDoc>("subdoc_parse_text", { text, kind, enc, source }),
  /** บอกฝั่ง Rust ว่ามีซับที่แก้แล้วยังไม่บันทึก ตัวกันปิดจะถามก่อนปิดโปรแกรม · null = ไม่มี */
  setDirty: (name: string | null) => call<void>("subdoc_set_dirty", { name }),
  autosave: (doc: SubDoc, name: string) => call<SubAutosave>("subdoc_autosave", { doc, name }),
  autosaves: () => call<SubAutosave[]>("subdoc_autosaves"),
  openAutosave: (path: string) => call<SubDoc>("subdoc_open_autosave", { path }),
  /** ชื่อตระกูลฟอนต์ที่ลงในเครื่อง (ปุ่ม fn) */
  fontFamilies: () => call<string[]>("font_families"),
};
/** ตารางเฟรมของหนัง (vidframes.rs) · times เวลาเริ่มของทุกเฟรม ms เฟรม 0 อยู่ที่ 0 · keys เลขเฟรม keyframe
    base เวลาเฟรมแรกในไฟล์ ms · start start_time ของไฟล์ วินาที · fps อัตราเฉลี่ยแบบ Aegisub · rate อัตราที่ไฟล์บอก เช่น 24000/1001 */
export type VidTable = { key: string; times: number[]; keys: number[]; base: number; start: number; w: number; h: number; sar: string; dar: string; codec: string; rate: string; fps: number; duration: number; partial: boolean };
export type MpvRect = { x: number; y: number; w: number; h: number; show: boolean; zoom: number; panX: number; panY: number };
export type MpvPlayReq = Omit<MpvRect, "show"> & { movie: string; t0: number; audioFf: number | null; audioFile: string | null; sub: string | null; subDelay: number; volume: number };
export const vidApi = {
  /** อ่านครั้งเดียวต่อไฟล์ เก็บไว้ในเครื่อง · ระหว่างอ่านส่ง vid-table-progress · หยุดแล้วตอบ "stopped" */
  table: (movie: string) => call<VidTable>("vid_table", { movie }),
  tableStop: () => call<void>("vid_table_stop"),
  /** ภาพต่อกัน count เฟรมตั้งแต่เวลา ss (คิดจาก seekOf ใน vidFrames.ts) สูง h จุด */
  frames: (movie: string, ss: number, count: number, h: number) => call<string[]>("vid_frames", { movie, ss, count, h }),
  /** หาจุดเปลี่ยนฉาก ถอดภาพทั้งเรื่อง · ระหว่างหาส่ง vid-scenes-progress · คืนเลขเฟรมแรกของแต่ละฉาก */
  scenes: (movie: string, threshold?: number) => call<number[]>("vid_scenes", { movie, threshold: threshold ?? null }),
  scenesStop: () => call<void>("vid_scenes_stop"),
  /** เล่นภาพต่อเนื่องจากเวลา ss (คิดแบบ seekOf) สูง h จุด · onFrame ได้ไบต์ JPEG ทีละเฟรมตามลำดับ · จบเรื่องหรือหยุดแล้ว promise จบ (vidplay.rs) */
  play: async (movie: string, ss: number, h: number, onFrame: (b: ArrayBuffer) => void) => {
    const { Channel } = await import("@tauri-apps/api/core");
    const ch = new Channel<ArrayBuffer>();
    ch.onmessage = onFrame;
    return call<void>("vid_play", { movie, ss, h, out: ch });
  },
  playStop: () => call<void>("vid_play_stop"),
  /** ตัวเล่น mpv (mpvplay.rs) เวลาเป็นวินาทีแบบ ffmpeg -ss · ตำแหน่งกรอบเป็นจุดจริงของจอ */
  mpvPlay: (a: MpvPlayReq) => call<void>("mpv_play", a),
  mpvState: () => call<{ t: number | null; eof: boolean; paused: boolean }>("mpv_state"),
  mpvRect: (r: MpvRect) => call<void>("mpv_rect", r),
  mpvSub: (sub: string | null, subDelay: number) => call<void>("mpv_sub", { sub, subDelay }),
  mpvVolume: (volume: number) => call<void>("mpv_volume", { volume }),
  mpvStop: (unload: boolean) => call<number | null>("mpv_stop", { unload }),
  mpvAvailable: () => call<boolean>("mpv_available"),
  keysLoad: (path: string) => call<number[]>("vid_keys_load", { path }),
  keysSave: (path: string, keys: number[]) => call<string>("vid_keys_save", { path, keys }),
  /** ค่า YCbCr Matrix จากชนิดสีของหนัง แบบ Aegisub (TV.709 TV.601 PC.709 PC.601 หรือ None) · หน้าต่างคุณสมบัติสคริปต์ */
  colorspace: (movie: string) => call<string>("vid_colorspace", { movie }),
  /** ภาพเฉพาะซับพื้นโปร่งใสที่วางทับภาพนิ่ง วาดด้วย libass (subshot.rs) · t เวลาของซับ ms · w h ขนาดที่วาด · ow oh ขนาดจริงของภาพหนัง */
  subOverlay: (doc: SubDoc, t: number, w: number, h: number, ow: number, oh: number, movie: string | null) =>
    call<string>("sub_overlay", { doc, t, w, h, ow, oh, movie }),
  /** บันทึกภาพ PNG ข้างหนัง หรือคัดลอกภาพ แบบมีซับ ไม่มีซับ เฉพาะซับ (เมนูคลิกขวาบนภาพ แบบ Aegisub) · bg ภาพวิดีโอจำลองขนาดเต็ม */
  snapshot: (req: SnapReq, doc: SubDoc | null, bg: string | null) => call<{ path: string | null; w: number; h: number; bytes: number }>("vid_snapshot", { req, doc, bg }),
};
export type SnapReq = {
  movie: string | null; ss: number; t: number; w: number; h: number; ow: number; oh: number;
  mode: "subs" | "raw" | "only"; frame: number; dest: "save" | "copy"; dir: string | null; dry?: boolean;
};

/** เสียงของหน้าแก้ซับ (subaudio.rs) · pcm ได้ไบต์ s16le สองช่อง 48 kHz ตรง ๆ ไม่ผ่านข้อความ */
/** map ตัวเลือกแทร็กแบบ ffmpeg · 0:2 คือแทร็กที่ 2 ของทั้งไฟล์ (เสียงในหนัง) · 0:a:0 คือแทร็กเสียงแรก (ไฟล์เสียงแยก) */
export const audApi = {
  /** zero เวลาเฟรมแรกของภาพในไฟล์ วินาที · เสียงในหนังเลื่อนให้เวลา 0 ตรงเฟรมแรกของภาพ (BUGS ข้อ 115) · null นับจากต้นไฟล์ */
  pcm: (path: string, map: string, t0: number, dur: number, zero: number | null = null) => call<ArrayBuffer>("sub_pcm", { path, map, t0, dur, zero }),
  /** คลื่นเสียงช่วง t0 ถึง t1 วินาที ได้ cols คอลัมน์พอดี ค่า 0 ถึง 1 */
  peaks: (path: string, map: string, t0: number, t1: number, cols: number, zero: number | null = null) => call<number[]>("sub_peaks", { path, map, t0, t1, cols, zero }),
  /** บันทึกเสียงช่วงเป็น WAV · ไฟล์ปลายทางที่มีอยู่แล้วลงถังขยะ */
  save: (path: string, map: string, t0: number, t1: number, target: string, zero: number | null = null) => call<string>("sub_audio_save", { path, map, t0, t1, target, zero }),
};

/** ส่งออกซับเป็น PGS ไฟล์ .sup (pgs.rs · BUGS ข้อ 118) · ระหว่างทำส่ง pgs-progress { done total } · ไฟล์มีอยู่แล้วตอบ exists · หยุดตอบ stopped */
export type PgsOut = { path: string; images: number; reduced: number; merged: number; maxColors: number; bytes: number };
export type PgsReq = { target: string; w: number; h: number; fpsNum: number; fpsDen: number; movie: string | null };
export const pgsApi = {
  export: (doc: SubDoc, req: PgsReq) => call<PgsOut>("pgs_export", { doc, req }),
  cancel: () => call<void>("pgs_cancel"),
};

/** เลือกไฟล์ keyframe (ชนิดที่ Aegisub เปิดได้) · ยกเลิก = null */
export async function pickKeyframes(): Promise<string | null> {
  if (!inApp) return null;
  const { open } = await import("@tauri-apps/plugin-dialog");
  const r = await open({ multiple: false, directory: false, title: "เลือกไฟล์ keyframe", filters: [{ name: "ไฟล์ keyframe", extensions: ["txt", "pass", "stats", "log"] }, { name: "ทุกไฟล์", extensions: ["*"] }] });
  return typeof r === "string" ? r : null;
}

/** ฉบับบันทึกอัตโนมัติ · at วันเวลาเครื่อง · seq ลำดับที่บันทึก */
export type SubAutosave = { path: string; name: string; source: SubSource | null; at: string; events: number; seq: number };

/* ตัวช่วยหาดีเลย์ (แผนเสียงและซับ ขั้น 5 · delay.rs) · ดีเลย์เป็น ms ค่าที่ใส่ให้เสียงใหม่ ติดลบ = มาเร็วขึ้น */
export type DelayWin = { at: number; delay: number; score: number };
export type DelayFound = { delay: number; score: number; windows: DelayWin[]; speed: [number, number] | null; direct: number; uneven: boolean };
export type DelayView = { a: number[]; b: number[]; cps: number; at: number; len: number; margin: number };
export type DelayPreview = { file: string; player: string; cmd: string; opened: boolean };
export const delayApi = {
  find: (movie: string, movieStream: number, file: string, fileStream: number) => call<DelayFound>("delay_find", { movie, movieStream, file, fileStream }),
  view: (movie: string, movieStream: number, file: string, fileStream: number, at: number, len: number, margin: number, speed: [number, number] | null, cols: number) =>
    call<DelayView>("delay_view", { movie, movieStream, file, fileStream, at, len, margin, speed, cols }),
  /** dry มีผลเฉพาะรุ่นทดสอบ ทำไฟล์แต่ไม่เปิดโปรแกรมเล่น */
  preview: (movie: string, file: string, tid: number, delay: number, at: number, dry?: boolean) => call<DelayPreview>("delay_preview", { movie, file, tid, delay, at, dry: dry ?? null }),
};

export const mergeApi = {
  inspect: (path: string) => call<MergeMovie>("merge_inspect", { path }),
  addFile: (path: string, movieDuration: number | null) => call<AddedFile>("merge_add_file", { path, movieDuration }),
  /** ฟอนต์ที่ซับเรียกแต่หนังยังไม่มี ทั้งที่หาเจอในเครื่องและหาไม่เจอ (ใส่ซับกลับเข้าหนัง BUGS ข้อ 114) */
  remuxFonts: (movie: string, text: string) => call<FontHit[]>("remux_fonts", { movie, text }),
  /** ไม่สำเร็จ promise ล้มพร้อม ApplyProblem · ความคืบหน้ามาทางเหตุการณ์ merge-progress */
  apply: (req: MergeReq) => call<MergeResult>("merge_apply", { req }),
  cancel: () => call<void>("merge_cancel"),
  coverPreview: (path: string, id: number, slot: CoverTarget) => call<CoverPreview>("merge_cover_preview", { path, id, slot }),
  coverDrop: (slot: CoverTarget | null) => call<void>("merge_cover_drop", { slot }),
  /** อ่านชื่อฟอนต์ในไฟล์ฟอนต์ที่ลากมาเพิ่มเอง (fonts.rs) */
  fontInfo: (path: string) => call<FontFile>("font_info", { path }),
  /** บทของหนังในไฟล์ อ่านด้วย ffprobe (chapters.rs · BUGS ข้อ 99) */
  chapters: (path: string) => call<Chapter[]>("chapters_read", { path }),
};
/** เลือกไฟล์ฟอนต์ของซับ ASS (การ์ดฟอนต์ในหน้าเสียงและซับ) */
export async function pickFonts(): Promise<string[]> {
  if (!inApp) return [];
  const { open } = await import("@tauri-apps/plugin-dialog");
  const r = await open({ multiple: true, directory: false, title: "เลือกไฟล์ฟอนต์ของซับ", filters: [{ name: "ไฟล์ฟอนต์", extensions: FONT_EXT }] });
  return Array.isArray(r) ? r : typeof r === "string" ? [r] : [];
}
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
  /** target ว่าง = ข้างไฟล์หนัง · exists มีไฟล์ค่าเดียวกันอยู่แล้ว ไม่สร้างซ้ำ · conflict มีไฟล์ชื่อนี้แต่ค่าไม่ตรง ยังไม่เขียน ถามก่อนแล้วส่ง newName */
  saveSha256: (path: string, sha256: string, target?: string | null, newName?: boolean) =>
    call<{ path: string; status: "saved" | "exists" | "conflict" }>("hash_save", { path, sha256, target: target ?? null, newName: !!newName }),
  /** ข้อความในคลิปบอร์ด อ่านฝั่ง Rust ไม่เด้งหน้าต่างขออนุญาตของ WebView2 (BUGS ข้อ 31) */
  clipboardText: () => call<string>("clipboard_text"),
  defaultFolder: (path: string) => call<string>("extract_default_folder", { path }),
  extract: (path: string, folder: string | null, items: ExtractItem[], policy: string[]) => call<ExtractResult>("extract_start", { req: { path, folder, items, policy } }),
  extractCancel: () => call<void>("extract_cancel"),
  /** งานแยกไฟล์หรือ hash ที่เริ่มไว้ก่อนเปลี่ยนหน้ายังทำอยู่ไหม · ฝั่ง Rust ไม่ให้เริ่มซ้อน */
  extractRunning: () => call<boolean>("extract_running"),
  hashRunning: () => call<boolean>("hash_running"),
};

const MOVIE_EXT = ["mkv", "mp4", "m4v", "mov", "avi", "webm", "ts", "m2ts", "mpg", "mpeg", "vob", "flv"];
/** ไฟล์เสียงที่หน้ากราฟเสียงเปิดได้ (มอคอัปกราฟเสียง) */
export const AUDIO_EXT = ["mp3", "flac", "wav", "m4a", "aac", "ac3", "eac3", "dts", "ogg", "opus", "mka", "wma", "wv", "ape", "tak"];

/** เลือกไฟล์จากเครื่อง · kind = movie image หรือ media (หนังหรือไฟล์เสียง ของหน้ากราฟเสียง) */
/** ไฟล์ซับที่หน้าซับไตเติลรับ (BUGS ข้อ 104) */
export const SUB_EXT = ["srt", "ass", "ssa", "vtt", "sup", "sub", "idx"];

export async function pickFile(kind: "movie" | "image" | "media" | "subtitle"): Promise<string | null> {
  if (!inApp) return null;
  const { open } = await import("@tauri-apps/plugin-dialog");
  const r = await open({
    multiple: false, directory: false,
    title: kind === "movie" ? "เลือกไฟล์หนัง" : kind === "media" ? "เลือกไฟล์หนังหรือไฟล์เสียง" : kind === "subtitle" ? "เลือกไฟล์หนังหรือไฟล์ซับ" : "เลือกรูปโปสเตอร์",
    filters: kind === "movie"
      ? [{ name: "ไฟล์หนัง", extensions: MOVIE_EXT }]
      : kind === "subtitle"
        ? [{ name: "ไฟล์หนังและไฟล์ซับ", extensions: [...MOVIE_EXT, ...SUB_EXT] }]
      : kind === "media"
        ? [{ name: "ไฟล์หนังและไฟล์เสียง", extensions: [...MOVIE_EXT, ...AUDIO_EXT] }]
        : [{ name: "รูปโปสเตอร์", extensions: ["jpg", "jpeg", "png", "webp", "bmp", "tif", "tiff", "heic", "heif"] }],
  });
  return typeof r === "string" ? r : null;
}

/** เลือกไฟล์เสียงหลายไฟล์เข้าคิวแปลง (หน้ากราฟเสียง) · ไฟล์หนังก็ได้ แปลงแทร็กเสียงแรก · ยกเลิก = [] */
export async function pickAudioFiles(): Promise<string[]> {
  if (!inApp) return [];
  const { open } = await import("@tauri-apps/plugin-dialog");
  const r = await open({ multiple: true, directory: false, title: "เลือกไฟล์เสียงเข้าคิวแปลง", filters: [{ name: "ไฟล์เสียงและไฟล์หนัง", extensions: [...AUDIO_EXT, ...MOVIE_EXT] }] });
  return Array.isArray(r) ? r : typeof r === "string" ? [r] : [];
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
  window: (path: string, track: number, t0: number, t1: number, cols: number, bins: number, log: boolean, full = false) => call<GWindow | null>("graph_window", { path, track, t0, t1, cols, bins, log, full }),
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
export type PlayerInfo = { path: string; name: string; exists: boolean; added: boolean; isDefault: boolean; icon?: string | null };
export type PlayerList = { players: PlayerInfo[]; systemDefault: boolean; systemIcon?: string | null };

/** โปรแกรมเล่นในเครื่อง (players.rs) */
export const playerApi = {
  list: () => call<PlayerList>("list_players"),
};

export const checkApi = {
  /** เริ่มตรวจเรื่องที่เลือกเบื้องหลัง · ผลมาทางเหตุการณ์ check-started check-progress movie-updated check-item check-finished */
  start: (ids: string[], mode: CheckMode) => call<void>("check_start", { ids, mode }),
  cancel: () => call<void>("check_cancel"),
  running: () => call<boolean>("check_running"),
  /** เปิดเล่นที่วินาทีนั้น · โปรแกรมที่ตั้งไว้ หรือที่หาเจอในเครื่อง (VLC MPC-HC PotPlayer mpv) */
  playAt: (path: string, secs: number) => call<PlayResult>("play_at", { path, secs }),
};
