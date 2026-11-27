/* คำสั่งของหน้าใส่โปสเตอร์และหน้าครอป (posterApi) กับชนิดข้อมูล
   แยกจาก src/lib/api.ts ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 · แผนแบ่งไฟล์ขั้น 6.1) ย้ายมาทั้งก้อน เนื้อโค้ดไม่เปลี่ยน · ไฟล์อื่น import ผ่าน src/lib/api (index.ts ส่งต่อทุกชื่อ) */
import { call } from "./core";
import type { RenameProblem } from "./types";

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
/** final = งานรวมไฟล์เลยจุดที่หยุดได้แล้ว ไฟล์เดิมกำลังย้าย (AUDIT ข้อ 14 · มีเฉพาะ merge-progress) */
export type PosterProgress = { phase: string; percent: number; eta: number | null; next: string | null; final?: boolean };

/** ปลายทางของรูปที่ครอป · ไม่ส่ง = หน้าใส่โปสเตอร์ · cover กับ cover_land = ช่องปกตั้งกับปกนอนของหน้าเสียงและซับ (ที่เก็บรูปแยกกัน ไม่ทับกัน) */
export type CoverTarget = "cover" | "cover_land";
/** หน้าครอปใช้กับหน้าไหน · link ระบบจับคู่รูปปก เก็บแค่ค่าครอป */
export type CropTarget = CoverTarget | "link";
export const posterApi = {
  open: (path: string, target?: CropTarget) => call<PosterInfo>("poster_open", { path, target: target ?? null }),
  render: (geo: Geometry, format: "jpg" | "png", quality: number, opts: { choose?: boolean; sizes?: boolean; target?: CropTarget } = {}) =>
    call<RenderInfo>("poster_render", { req: { geo, format, quality, choose: !!opts.choose, sizes: !!opts.sizes, target: opts.target ?? null } }),
  clear: (target?: CropTarget) => call<void>("poster_clear", { target: target ?? null }),
  /** ยกเลิกหน้าครอปของรูปที่เปิดใหม่ คืนรูปที่กดใช้ไว้ก่อนเปิด · false ไม่มีอะไรให้คืน (AUDIT ข้อ 42) */
  restore: () => call<boolean>("poster_restore"),
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
