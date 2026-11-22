/* คำสั่งของหน้าเสียงและซับ งานรวมไฟล์ ตัวแปลงเสียง แปลงเสียงเป็นคิว จับคู่ไว้ไม่รวม ตัวช่วยหาดีเลย์ (mergeApi encodeApi convertApi pairApi delayApi) กับชนิดข้อมูล
   แยกจาก src/lib/api.ts ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 · แผนแบ่งไฟล์ขั้น 6.1) ย้ายมาทั้งก้อน เนื้อโค้ดไม่เปลี่ยน · ไฟล์อื่น import ผ่าน src/lib/api (index.ts ส่งต่อทุกชื่อ) */
import { call } from "./core";
import type { LatestInfo, Movie, Pair, PairPlay } from "./types";
import type { Counts, CoverTarget } from "./poster";

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
/* ---------- แปลงเสียงเป็นคิว หน้ากราฟเสียง (convert.rs · แผนเสียงและซับ ขั้น 8) ---------- */
/** ข้อมูลเพลงหนึ่งช่อง · key ชื่อกลาง title artist album album_artist date track disc genre composer comment replaygain_* */
export type AudioTag = { key: string; value: string };
/** ไฟล์เสียงหนึ่งไฟล์ในคิว · แทร็กเสียงที่เลือก · stream เลขสตรีมของ ffprobe · codec ชื่อของ ffprobe · track ลำดับแทร็กเสียงนับจาก 0 tracks จำนวนแทร็กเสียงทั้งไฟล์ (AUDIT ข้อ 22) */
export type AudioFile = {
  path: string; name: string; size: number; duration: number; audioOnly: boolean; stream: number; codec: string; profile: string;
  layout: string; channels: number; rate: number; bits: number | null; bitrate: number | null;
  tags: AudioTag[]; tagsInStream: boolean; cover: { codec: string; width: number; height: number; stream: number } | null;
  track: number; tracks: number;
};
export type CoverData = { url: string; bytes: number; codec: string; width: number; height: number };
export type ConvReq = { id: string; path: string; spec: EncodeSpec; outDir: string | null; track?: number };
/** same เสียงตรงกับต้นฉบับทุกบิตไหม (BUGS ข้อ 121) · null ไม่ได้เทียบ เหตุผลอยู่ sameNote */
export type ConvResult = { out: string; size: number; srcSize: number; tags: number; cover: boolean; notes: string[]; tool: string; cmd: string; secs: number; same: boolean | null; sameNote: string };
export type ConvProgress = { id: string; percent: number; eta: number | null; phase: string };
export const convertApi = {
  probe: (path: string, track = 0) => call<AudioFile>("convert_probe", { path, track }),
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
  /** view หน้าซับไตเติลเปิดเพื่อดูและแปลง รับซับ HD DVD ที่ใส่ในหนังไม่ได้เพิ่ม (BUGS ข้อ 129) */
  addFile: (path: string, movieDuration: number | null, view?: boolean) => call<AddedFile>("merge_add_file", { path, movieDuration, view: view ?? null }),
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
