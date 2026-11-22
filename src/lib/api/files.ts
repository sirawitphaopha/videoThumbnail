/* นามสกุลไฟล์ที่แต่ละหน้ารับ กับกล่องเลือกไฟล์ เลือกโฟลเดอร์ บันทึกไฟล์ของ Windows และที่อยู่ภาพเล็ก
   รายการนามสกุล *_EXT ใน latest.rs (cargo test file_types_match_frontend) กับ check-settings.mjs อ่านจากไฟล์นี้
   แยกจาก src/lib/api.ts ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 · แผนแบ่งไฟล์ขั้น 6.1) ย้ายมาทั้งก้อน เนื้อโค้ดไม่เปลี่ยน · ไฟล์อื่น import ผ่าน src/lib/api (index.ts ส่งต่อทุกชื่อ) */
import { convertFileSrc } from "@tauri-apps/api/core";
import { inApp } from "./core";

export const FONT_EXT = ["ttf", "otf", "ttc", "otc"];
/** เลือกไฟล์ keyframe (ชนิดที่ Aegisub เปิดได้) · ยกเลิก = null */
export async function pickKeyframes(): Promise<string | null> {
  if (!inApp) return null;
  const { open } = await import("@tauri-apps/plugin-dialog");
  const r = await open({ multiple: false, directory: false, title: "เลือกไฟล์ keyframe", filters: [{ name: "ไฟล์ keyframe", extensions: KEYFRAME_EXT }, { name: "ทุกไฟล์", extensions: ["*"] }] });
  return typeof r === "string" ? r : null;
}
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
/** ไฟล์หนังที่ทุกหน้ารับ · ตรงกับ library.rs ACCEPTED (cargo test ตรวจว่าตรงกัน) · ที่เดียวของรายการนี้ หน้าอื่นนำเข้าจากที่นี่ (BUGS ข้อ 127) */
export const MOVIE_EXT = ["mkv", "mp4", "m4v", "mov", "avi", "webm", "ts", "m2ts", "mpg", "mpeg", "vob", "flv"];
/** รูปโปสเตอร์ที่รับ · ตรงกับ poster_image.rs ACCEPTED */
export const IMAGE_EXT = ["jpg", "jpeg", "png", "webp", "bmp", "tif", "tiff", "heic", "heif"];
/** ไฟล์ที่ตัวแปลงเสียงทำได้ · ตรงกับ encode.rs ext */
export const ENCODE_OUT_EXT = ["opus", "m4a", "mp3", "ac3", "eac3", "flac", "wv", "ape", "tak"];
/** ไฟล์ keyframe ที่หน้าแก้ซับเปิดได้ (แบบ Aegisub) */
export const KEYFRAME_EXT = ["txt", "pass", "stats", "log"];
/** ไฟล์เสียงที่หน้ากราฟเสียงเปิดได้ (มอคอัปกราฟเสียง) */
export const AUDIO_EXT = ["mp3", "flac", "wav", "m4a", "aac", "ac3", "eac3", "dts", "ogg", "opus", "mka", "wma", "wv", "ape", "tak"];

/** เลือกไฟล์จากเครื่อง · kind = movie image หรือ media (หนังหรือไฟล์เสียง ของหน้ากราฟเสียง) */
/** ไฟล์ซับที่หน้าซับไตเติลรับ (BUGS ข้อ 104) · ซับข้อความแบบอื่นเปิดแล้วแปลงเป็น ASS หรือ SRT ฝั่ง Rust (subs.rs FF_TEXT OWN_TEXT · BUGS ข้อ 123) */
export const SUB_EXT = ["srt", "ass", "ssa", "vtt", "sup", "sub", "idx", "smi", "sami", "lrc", "rt", "jss", "aqt", "pjs", "mpl", "sbv", "ttml", "dfxp", "scc"];

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
        : [{ name: "รูปโปสเตอร์", extensions: IMAGE_EXT }],
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

/** เลือกไฟล์ MKV หลายไฟล์ไว้แยกแบบเดียวกัน (BUGS ข้อ 130) · ตัวตรวจส่งรายการผ่าน window.__extractFiles ไม่เปิดกล่องเลือกไฟล์ */
export async function pickMkvFiles(): Promise<string[]> {
  const w = window as unknown as { __extractFiles?: string[] };
  if (import.meta.env.DEV && w.__extractFiles) return w.__extractFiles;
  if (!inApp) return [];
  const { open } = await import("@tauri-apps/plugin-dialog");
  const r = await open({ multiple: true, directory: false, title: "เลือกไฟล์ MKV ที่จะแยกแบบเดียวกัน", filters: [{ name: "ไฟล์ MKV", extensions: ["mkv"] }] });
  return Array.isArray(r) ? r : typeof r === "string" ? [r] : [];
}

/** เลือกไฟล์เสียงหรือซับหลายไฟล์ (หน้าเสียงและซับ) · ยกเลิก = [] */
export async function pickAddFiles(): Promise<string[]> {
  if (!inApp) return [];
  const { open } = await import("@tauri-apps/plugin-dialog");
  const r = await open({ multiple: true, directory: false, title: "เลือกไฟล์เสียงหรือซับ", filters: [{ name: "ไฟล์เสียงและซับ", extensions: ADD_EXT }] });
  return Array.isArray(r) ? r : typeof r === "string" ? [r] : [];
}

/** กล่องบันทึกไฟล์ของ Windows · ยกเลิก = null */
export async function pickSave(defaultName: string, ext: string, label: string): Promise<string | null> {
  if (!inApp) return null;
  const { save } = await import("@tauri-apps/plugin-dialog");
  const r = await save({ defaultPath: defaultName, filters: [{ name: label, extensions: [ext] }] });
  return typeof r === "string" ? r : null;
}
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