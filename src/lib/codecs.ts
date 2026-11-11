/* ชนิดเสียงที่แปลงได้ กับชุดค่าแบบง่าย (มอคอัป docs/mockups/audio-merge.html CODECS presets)
   ชุดค่าแบบง่ายแปลงเป็นค่าในการ์ดของ EncodeSpec · ตัวสร้างคำสั่งอยู่ฝั่ง Rust ที่เดียว (encode.rs)
   การ์ดขั้นสูง คำอธิบาย ⓘ ตัวย่อ และขนาดที่คาด อยู่ codecAdv.ts */
import type { EncodeSpec } from "./api";

export type Preset = { label: string; detail: string; mbPerHour?: number; pctWav?: number; p: EncodeSpec["p"]; channels?: number };
export type Codec = {
  id: "opus" | "aac" | "mp3" | "ac3" | "flac" | "alac" | "wv" | "ape" | "tak";
  name: string;
  full: string;
  lossless: boolean;
  /** ตัวต้นฉบับ (ชื่อในทะเบียนตัวแปลง) · ไม่มี = ใช้ ffmpeg อย่างเดียว */
  native: string | null;
  mp4: boolean;
  ch: string;
  why: string;
  /** แถบสั้นบรรทัดเดียวใต้ชื่อชนิดในหน้าต่างตั้งค่า · รายละเอียดครบอยู่ในกล่อง ⓘ (ADV ใน codecAdv.ts) */
  brief: string;
  presets: Preset[];
  preset: number;
  /** ใช้ได้เฉพาะหน้าแปลงเสียง (ใส่ในไฟล์หนังไม่ได้) */
  only?: boolean;
};

export const CODECS: Codec[] = [
  { id: "opus", brief: "เสียงดีที่สุดในกลุ่ม Lossy เมื่อบิตเรตเท่ากัน", name: "Opus", full: "Opus Interactive Audio Codec", lossless: false, native: "opusenc", mp4: true, ch: "เก็บได้สูงสุด 255 ช่อง รวมถึงเสียง 7.1 ch",
    why: "บิตเรตเท่ากันเสียงดีที่สุดในกลุ่ม Lossy แต่ทีวีและเครื่องเล่นรุ่นเก่าบางรุ่นเล่นไม่ได้",
    presets: [
      { label: "เสียงพูด", detail: "VBR 64 kbps เสียง 2.0 ch", mbPerHour: 29, p: { bitrate: 64, mode: "VBR" }, channels: 2 },
      { label: "เพลงคุณภาพดี", detail: "VBR 160 kbps เสียง 2.0 ch", mbPerHour: 72, p: { bitrate: 160, mode: "VBR" }, channels: 2 },
      { label: "หนัง 5.1 ch ดี", detail: "VBR 256 kbps เสียง 5.1 ch", mbPerHour: 115, p: { bitrate: 256, mode: "VBR" } },
      { label: "หนัง 5.1 ch ดีมาก", detail: "VBR 384 kbps เสียง 5.1 ch", mbPerHour: 173, p: { bitrate: 384, mode: "VBR" } },
    ], preset: 3 },
  { id: "aac", brief: "เล่นได้แทบทุกเครื่อง ทั้งทีวี มือถือ และเครื่องของ Apple", name: "AAC", full: "Advanced Audio Coding", lossless: false, native: "qaac64", mp4: true, ch: "เก็บเสียง 7.1 ch ได้",
    why: "เล่นได้แทบทุกเครื่อง qaac ของ Apple ต้องติดตั้ง iTunes ก่อน fdkaac ต้องวางเอง ส่วน ffmpeg เสียงด้อยกว่าเมื่อบิตเรตต่ำ",
    presets: [
      { label: "เสียงพูด", detail: "96 kbps เสียง 2.0 ch", mbPerHour: 43, p: { mode: "CVBR", bitrate: 96, tvbr: 45 }, channels: 2 },
      { label: "เพลงคุณภาพดี", detail: "TVBR 91 ราว 190 kbps เสียง 2.0 ch", mbPerHour: 85, p: { mode: "TVBR", tvbr: 91, bitrate: 192 }, channels: 2 },
      { label: "หนัง 5.1 ch ดี", detail: "TVBR 91 ราว 355 kbps เสียง 5.1 ch", mbPerHour: 160, p: { mode: "TVBR", tvbr: 91, bitrate: 355 } },
      { label: "หนัง 5.1 ch ดีมาก", detail: "TVBR 109 ราว 465 kbps เสียง 5.1 ch", mbPerHour: 210, p: { mode: "TVBR", tvbr: 109, bitrate: 465 } },
    ], preset: 2 },
  { id: "mp3", brief: "เล่นได้ทุกเครื่องบนโลก แต่เก็บได้แค่ 2 ช่อง", name: "MP3", full: "MPEG-1 Audio Layer III", lossless: false, native: "lame", mp4: true, ch: "แต่เก็บได้สูงสุด 2 ช่อง เสียง 5.1 ch จะถูกรวมเป็น 2 ช่อง",
    why: "เล่นได้ทุกเครื่องบนโลก",
    presets: [
      { label: "เสียงพูด", detail: "V7 ราว 100 kbps", mbPerHour: 45, p: { mode: "VBR", vbrq: 7 } },
      { label: "ทั่วไป", detail: "V2 ราว 190 kbps", mbPerHour: 85, p: { mode: "VBR", vbrq: 2 } },
      { label: "ดีมาก", detail: "V0 ราว 245 kbps", mbPerHour: 110, p: { mode: "VBR", vbrq: 0 } },
      { label: "สูงสุด", detail: "CBR 320 kbps", mbPerHour: 144, p: { mode: "CBR", bitrate: 320 } },
    ], preset: 1 },
  { id: "ac3", brief: "เสียงมาตรฐานของดีวีดี ทีวีและเครื่องเสียงรับได้แทบทุกตัว", name: "AC-3", full: "Dolby Digital", lossless: false, native: null, mp4: true, ch: "เก็บได้สูงสุดเสียง 5.1 ch",
    why: "ทีวี ซาวด์บาร์ และเครื่องเสียงรับได้แทบทุกตัว แปลงด้วย ffmpeg เพราะไม่มีตัวแปลงต้นฉบับ",
    presets: [
      { label: "เสียง 2.0 ch ทั่วไป", detail: "192 kbps เสียง 2.0 ch", mbPerHour: 86, p: { bitrate: 192 }, channels: 2 },
      { label: "เสียง 5.1 ch แบบดีวีดี", detail: "448 kbps เสียง 5.1 ch", mbPerHour: 200, p: { bitrate: 448 } },
      { label: "เสียง 5.1 ch สูงสุด", detail: "640 kbps เสียง 5.1 ch", mbPerHour: 288, p: { bitrate: 640 } },
      { label: "เสียง 5.1 ch ทีวีบางรุ่น", detail: "384 kbps เสียง 5.1 ch", mbPerHour: 173, p: { bitrate: 384 } },
    ], preset: 2 },
  { id: "flac", brief: "ไม่เสียคุณภาพ เล่นได้เกือบทุกโปรแกรม และนิยมที่สุด", name: "FLAC", full: "Free Lossless Audio Codec", lossless: true, native: "flac", mp4: true, ch: "และเก็บได้สูงสุด 8 ช่อง",
    why: "ไม่เสียคุณภาพ ถอดเร็ว และเล่นได้เกือบทุกโปรแกรม แต่ไฟล์ใหญ่ราวครึ่งหนึ่งของ WAV",
    presets: [
      { label: "เร็ว", detail: "Level 0", pctWav: 60, p: { level: 0 } },
      { label: "มาตรฐาน", detail: "Level 5", pctWav: 55, p: { level: 5 } },
      { label: "เล็กสุด", detail: "Level 8", pctWav: 53, p: { level: 8 } },
      { label: "เก็บถาวร", detail: "Level 8 พร้อม Verify", pctWav: 53, p: { level: 8, verify: "On" } },
    ], preset: 1 },
  // ALAC ด้วย refalac ที่มากับชุด qaac (พี่กันสั่ง 10 พ.ย. 2569 "เอาใส่เลย") · ไม่มีตัวต้นฉบับใช้ ffmpeg
  { id: "alac", brief: "ไม่เสียคุณภาพ และเล่นบนเครื่องของ Apple ได้เลย", name: "ALAC", full: "Apple Lossless Audio Codec", lossless: true, native: "refalac64", mp4: true, ch: "และเก็บได้สูงสุด 8 ช่อง",
    why: "Lossless ของ Apple เล่นบน iPhone iPad Mac และ Apple Music ได้เลย แต่ไฟล์ใหญ่กว่า FLAC เล็กน้อย",
    presets: [
      { label: "มาตรฐาน", detail: "ค่าตั้งต้น", pctWav: 56, p: { speed: "Normal" } },
      { label: "แปลงเร็ว", detail: "Fast", pctWav: 69, p: { speed: "Fast" } },
    ], preset: 0 },
  { id: "wv", brief: "ไม่เสียคุณภาพ และบีบได้เล็กกว่า FLAC เล็กน้อย", name: "WavPack", full: "WavPack Hybrid Lossless", lossless: true, native: "wavpack", mp4: false, ch: "เก็บได้หลายช่อง",
    why: "โหมดสูงบีบได้เล็กกว่า FLAC เล็กน้อย",
    presets: [
      { label: "เร็ว", detail: "Fast (-f)", pctWav: 58, p: { mode: "Fast" } },
      { label: "มาตรฐาน", detail: "Normal", pctWav: 55, p: { mode: "Normal" } },
      { label: "เล็ก", detail: "High (-h)", pctWav: 54, p: { mode: "High" } },
      { label: "เล็กสุด", detail: "Very High (-hh -x6)", pctWav: 53, p: { mode: "Very High", extra: 6 } },
    ], preset: 1 },
  { id: "ape", brief: "ไม่เสียคุณภาพ บีบแน่นกว่า FLAC และใช้ได้เฉพาะหน้าแปลงเสียง", name: "Monkey's Audio", full: "Monkey's Audio Lossless (APE)", lossless: true, native: "MACDll64", mp4: false, ch: "เก็บได้หลายช่อง", only: true,
    why: "บีบแน่นกว่า FLAC เล็กน้อย แต่ตอนเล่นใช้แรงเครื่องมากกว่าและเครื่องเล่นที่รองรับมีน้อย",
    presets: [
      { label: "เร็ว", detail: "Fast", pctWav: 57, p: { level: "Fast" } },
      { label: "มาตรฐาน", detail: "Normal", pctWav: 54, p: { level: "Normal" } },
      { label: "เล็ก", detail: "High", pctWav: 53, p: { level: "High" } },
      { label: "เล็กสุด", detail: "Extra High", pctWav: 52, p: { level: "Extra High" } },
    ], preset: 1 },
  { id: "tak", brief: "ไม่เสียคุณภาพ เล็กเท่า Monkey's Audio แต่ถอดเร็วกว่า", name: "TAK", full: "Tom's lossless Audio Kompressor", lossless: true, native: "Takc", mp4: false, ch: "เก็บได้สูงสุด 6 ช่อง", only: true,
    why: "เล็กพอ ๆ กับ Monkey's Audio แต่ถอดเร็วกว่ามาก ส่วนเครื่องเล่นที่รองรับมีน้อย",
    presets: [
      { label: "เร็ว", detail: "-p0", pctWav: 56, p: { preset: 0, eval: "Normal" } },
      { label: "มาตรฐาน", detail: "-p2", pctWav: 54, p: { preset: 2, eval: "Normal" } },
      { label: "เล็ก", detail: "-p4", pctWav: 53, p: { preset: 4, eval: "Normal" } },
      { label: "เล็กสุด", detail: "-p4m", pctWav: 52, p: { preset: 4, eval: "Max" } },
    ], preset: 1 },
];

export const codecOf = (id: string) => CODECS.find((c) => c.id === id) ?? CODECS[0];

/** ป้ายสั้นในช่องแปลงของตาราง เช่น Opus 384 · AC-3 640 · FLAC L5 */
export function convertLabel(spec: EncodeSpec): string {
  const c = codecOf(spec.codec);
  const p = spec.p;
  const v = c.id === "mp3" ? (p.mode === "CBR" ? `CBR ${p.bitrate}` : `V${p.vbrq ?? 2}`)
    : c.id === "flac" ? `L${p.level ?? 5}` : c.id === "alac" ? (p.speed === "Fast" ? "Fast" : "") : c.id === "wv" ? String(p.mode ?? "Normal") : c.id === "ape" ? String(p.level ?? "Normal")
    : c.id === "tak" ? `-p${p.preset ?? 2}${p.eval === "Max" ? "m" : p.eval === "Extra" ? "e" : ""}`
    : c.id === "aac" && spec.encoder === "qaac" && p.mode === "TVBR" ? `TVBR ${p.tvbr}` : String(p.bitrate ?? "");
  return `${c.name} ${v}`.trim();
}
