/* คำสั่งของตัวดูซับ หน้าแก้ซับ ภาพหนัง เสียงของหน้าแก้ซับ ส่งออก PGS แปลงซับภาพ (frameApi subApi subDocApi vidApi audApi pgsApi imgApi) กับชนิดข้อมูล
   แยกจาก src/lib/api.ts ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 · แผนแบ่งไฟล์ขั้น 6.1) ย้ายมาทั้งก้อน เนื้อโค้ดไม่เปลี่ยน · ไฟล์อื่น import ผ่าน src/lib/api (index.ts ส่งต่อทุกชื่อ) */
import { call } from "./core";

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
  imageTimes: (path: string, ff: number) => call<SubImg[]>("sub_image_times", { path, ff }),
  /** ยกเลิกการเปิดซับรูปที่ค้างอยู่ คำสั่งที่รอตอบว่า IMG_CANCELLED (BUGS ข้อ 162.8) */
  cancelImages: () => call<void>("sub_images_cancel"),
};
/** ข้อความที่ฝั่ง Rust ตอบตอนยกเลิกการเปิดซับรูป (IMG_CANCELLED ใน subtitle/vobsub.rs) */
export const IMG_CANCELLED = "ยกเลิกการเปิดซับรูปแล้ว";
export const isImgCancelled = (e: unknown) => String(e).includes(IMG_CANCELLED);

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
export type PgsOut = { path: string; images: number; reduced: number; merged: number; maxColors: number; bytes: number; palUpdates: number; reused: number; late: number };
/** ส่วนปรับแต่ง PGS (pgs.rs PgsOpts) · ตัวในโปรแกรมใช้ colors ถึง windows · SUPer ใช้ compression ถึง ahead */
export type PgsOpts = { colors: number; matrix: "auto" | "709" | "601"; vsfilter: boolean; vivid: number; dither: boolean; windows: number; compression: number; quantizer: number; layout: number; redraw: number; maxKbps: number; allowNormal: boolean; ahead: boolean };
/** หน้าตาซับ SRT ตอนทำเป็นภาพ (pgs.rs SrtStyle) · ขนาด ขอบ เงา ระยะ คิดที่ภาพสูง 1080 · สี #RRGGBB
    align แป้นตัวเลข 1 ถึง 9 · lineSpacing contentAlign box* มีเฉพาะ Subtitle Edit (SeConv) */
export type SrtStyle = { font: string; size: number; bold: boolean; italic: boolean; color: string; outlineColor: string; outline: number; shadow: number; shadowColor: string; shadowOpacity: number; marginV: number;
  align: number; marginH: number; lineSpacing: number; contentAlign: "left" | "center" | "right" | "from-alignment"; boxType: "none" | "one-box" | "box-per-line"; boxColor: string; boxOpacity: number; boxPadding: number; boxRadius: number };
/** shelf ตัวในโปรแกรม · super SUPer · seconv Subtitle Edit */
export type PgsEngine = "shelf" | "super" | "seconv";
export type PgsReq = { target: string; w: number; h: number; fpsNum: number; fpsDen: number; movie: string | null; engine?: PgsEngine; opts?: PgsOpts; style?: SrtStyle | null };
/** ขนาดไฟล์ที่คาด (pgs.rs estimate) */
export type PgsEstimate = { images: number; bytes: number; sampled: number };
/** สีหลักสีหนึ่งของ ASS กับสีเดียวกันใน PGS · de ความต่างแบบ ΔE · share สัดส่วนของจุดทึบในซับ % */
export type PgsColorPair = { ass: string; pgs: string; de: number; share: number };
export type PgsPreview = { ass: string | null; pgs: string; pgsAlpha: string; w: number; h: number; colors: PgsColorPair[]; mean: number; max: number; before: number; after: number; bg: "movie" | "plain"; empty: boolean; mangled: boolean };
export const pgsApi = {
  export: (doc: SubDoc, req: PgsReq) => call<PgsOut>("pgs_export", { doc, req }),
  cancel: () => call<void>("pgs_cancel"),
  /** ภาพตัวอย่างที่เวลา at ms · sample ประโยคตัวอย่างของ SRT */
  preview: (doc: SubDoc, req: PgsReq, at: number, sample: string | null) => call<PgsPreview>("pgs_preview", { doc, req, at, sample }),
  engines: () => call<{ superOk: boolean; seconvOk: boolean }>("pgs_engines"),
  estimate: (doc: SubDoc, req: PgsReq) => call<PgsEstimate>("pgs_estimate", { doc, req }),
};

/* ---------- แปลงซับภาพเป็นซับภาพ (imgconv.rs · BUGS ข้อ 125) ---------- */
/** ตัวเลือกตรงกับ ImgReq ใน imgconv.rs · ชื่อตัวเลือกของ BDSup2Sub++ อยู่ในคอมเมนต์ฝั่ง Rust */
export type ImgReq = {
  src: string; inMovie: boolean; tid: number; ff: number; kind: "pgs" | "vobsub"; target: string; engine: "bdsup" | "seconv";
  resolution: "keep" | "1080" | "1440x1080" | "720" | "576" | "480"; fpsSource: string; fpsTarget: string; delay: number;
  filter: string; palette: "keep" | "create" | "dither"; fixShort: boolean; minTime: number;
  moveY: "none" | "inside" | "outside" | "up" | "down"; ratio: number; moveYOffset: number; moveX: "none" | "left" | "right" | "center" | "origin"; moveXOffset: number; cropY: number;
  alphaThr: number; lumLow: number; lumHi: number; forced: "all" | "only" | "exclude"; forceAll: "" | "set" | "clear"; language: string; scaleX: number; scaleY: number; fixInvisible: boolean;
};
export type ImgOut = { files: string[]; images: number; w: number; h: number; bytes: number; warnings: string[] };
export type ImgPreview = { total: number; index: number; w: number; h: number; start: number; end: number; forced: boolean; graphics: { png: string; x: number; y: number; w: number; h: number }[]; warnings: string[] };
export const imgApi = {
  convert: (req: ImgReq) => call<ImgOut>("imgsub_convert", { req }),
  cancel: () => call<void>("imgsub_cancel"),
  tools: () => call<{ bdsupOk: boolean; seconvOk: boolean }>("imgsub_tools"),
  /** ภาพตัวอย่างของผลที่จะได้ ภาพที่ index (เริ่ม 0) */
  preview: (req: ImgReq, index: number) => call<ImgPreview>("imgsub_preview", { req, index }),
};


/** ฉบับบันทึกอัตโนมัติ · at วันเวลาเครื่อง · seq ลำดับที่บันทึก */
export type SubAutosave = { path: string; name: string; source: SubSource | null; at: string; events: number; seq: number; /** ตัวนับโควตาต่อไฟล์ กับรหัสอักษรที่เขียนจริง (BUGS ข้อ 162.10) */ key?: string; charset?: string | null };
