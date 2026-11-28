/* ค่าตั้งของการเล่นเสียงในหน้ากราฟ (BUGS ข้อ 164.3 · พี่กันสั่ง 28 พ.ย. 2569 "สร้างหน้าตั้งค่าเรื่องการเล่นเสียง ให้ทุกแง่มุม และเลือกตัวถอดได้")
   เก็บในเครื่องแบบค่าตั้งอื่นของหน้ากราฟ (graph-prefs graph-ov-start) · หน้าตั้งค่าหัวข้อการเล่นเสียงแก้ หน้ากราฟอ่านตอนเล่น เปลี่ยนแล้วมีผลทันที
   ความดังลำโพงกับเล่นวนอยู่ใน graphPlay.ts (ms.graphVol ms.graphLoop) หน้าตั้งค่าแก้ผ่านตัวนั้น */
import { useSyncExternalStore } from "react";

/** ชนิดไฟล์ที่มีตัวถอดของ codec เอง · ชนิดอื่นใช้ ffmpeg อย่างเดียว */
export type DecKind = "flac" | "ape" | "tak" | "mp3" | "wv";
export const DEC_KINDS: { kind: DecKind; name: string; ext: string; own: string; ownName: string; seek: boolean }[] = [
  { kind: "flac", name: "FLAC", ext: "flac", own: "flac", ownName: "flac.exe", seek: true },
  { kind: "ape", name: "Monkey's Audio", ext: "ape", own: "mac", ownName: "Monkey's Audio", seek: true },
  { kind: "tak", name: "TAK", ext: "tak", own: "takc", ownName: "Takc.exe", seek: false },
  { kind: "mp3", name: "MP3", ext: "mp3", own: "lame", ownName: "lame.exe", seek: false },
  { kind: "wv", name: "WavPack", ext: "wv", own: "wvunpack", ownName: "wvunpack.exe", seek: true },
];

export type PlayPrefs = {
  /** ตัวถอดทีละชนิด ffmpeg หรือชื่อตัวถอดของ codec (flac mac takc lame wvunpack) */
  dec: Record<DecKind, string>;
  /** ขีดตำแหน่งเล่นเลยขอบขวาของช่วงที่ซูมอยู่ กราฟเลื่อนตาม */
  follow: boolean;
  /** ปุ่มหยุดกลับไปจุดที่เริ่มเล่นแบบ Audacity · false ค้างที่จุดที่หยุด */
  stopBack: boolean;
  /** ออกจากหน้ากราฟแล้วหยุดเล่น · false เล่นต่อ */
  stopOnLeave: boolean;
  /** แถบวัดระดับเสียงข้างชื่อช่อง */
  meter: boolean;
  /** ขีดค้างที่ดังสุดกี่วินาที */
  hold: number;
  /** ล่างสุดของแถบวัด dB */
  floor: number;
};
export const PLAY_DEFAULT: PlayPrefs = {
  dec: { flac: "ffmpeg", ape: "ffmpeg", tak: "ffmpeg", mp3: "ffmpeg", wv: "ffmpeg" },
  follow: true, stopBack: true, stopOnLeave: true, meter: true, hold: 1.5, floor: -60,
};
const KEY = "ms.playPrefs";

function load(): PlayPrefs {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<PlayPrefs> | null;
    if (v && typeof v === "object") return { ...PLAY_DEFAULT, ...v, dec: { ...PLAY_DEFAULT.dec, ...(v.dec ?? {}) } };
  } catch { /* ค่าเสียหรืออ่านไม่ได้ ใช้ค่าตั้งต้น */ }
  return PLAY_DEFAULT;
}
let now = load();
const subs = new Set<() => void>();
export const getPlayPrefs = () => now;
export const usePlayPrefs = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => now);
export function setPlayPrefs(p: Partial<PlayPrefs>) {
  now = { ...now, ...p, dec: { ...now.dec, ...(p.dec ?? {}) } };
  try { localStorage.setItem(KEY, JSON.stringify(now)); } catch { /* จำไม่ได้ ใช้ค่านี้ถึงปิดโปรแกรม */ }
  subs.forEach((f) => f());
}
export function resetPlayPrefs() {
  now = PLAY_DEFAULT;
  try { localStorage.removeItem(KEY); } catch { /* ไม่มีที่เก็บ */ }
  subs.forEach((f) => f());
}

/** ตัวถอดของไฟล์นี้ตามค่าตั้ง · ตัวถอดของ codec ใช้ได้เฉพาะไฟล์ชนิดนั้นตรง ๆ แทร็กแรก (play.rs fits) */
export function decoderFor(path: string, track: number): { dec: string; name: string } {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const k = DEC_KINDS.find((d) => d.ext === ext);
  if (!k || track !== 0) return { dec: "ffmpeg", name: "ffmpeg" };
  const dec = now.dec[k.kind];
  return dec === k.own ? { dec, name: k.ownName } : { dec: "ffmpeg", name: "ffmpeg" };
}
