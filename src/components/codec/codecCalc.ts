/* ฟังก์ชันล้วนของแผงตั้งค่าเสียง ตัวแปลงที่ใช้ได้ ชุดค่า ค่าที่จำ จัดการ์ด แบ่งคำสั่ง และรูปแบบไฟล์ที่จะได้
   แยกจาก CodecPanel.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 9) เนื้อโค้ดยกมาทั้งก้อน */
import { type EncodeSpec, type EncoderInfo } from "../../lib/api";
import { type Codec } from "../../lib/codecs";
import { ADV, cardDefaults, cardValue, cardsFor, optLabel, optVal, type Card, type Vals } from "../../lib/codecAdv";

export const baseName = (p: string) => p.split(/[\\/]/).pop() ?? p;
export const SPEC_KEYS = ["channels", "bits", "rate"];
export const LAST_KEY = "ms.codecLast";
export type Last = { eng: string | null; vals: Vals; tab: "easy" | "adv" };

export function engines(c: Codec, encs: EncoderInfo[] | null): { value: string; label: string; ok: boolean; miss?: string }[] {
  const has = (n: string) => !!encs?.find((e) => e.name === n && e.ok);
  const ver = (n: string) => encs?.find((e) => e.name === n)?.version ?? "";
  const ff = { value: "ffmpeg", label: `ffmpeg ${ver("ffmpeg")}`.trim(), ok: true };
  // Monkey's Audio กับ TAK ffmpeg อ่านได้อย่างเดียว เขียนไม่ได้ · มีแต่ตัวต้นฉบับ
  if (c.only && c.native) return [{ value: "native", label: c.id === "ape" ? `Monkey's Audio ${ver(c.native)} (MACDll64.dll)`.trim() : `${c.native} ${ver(c.native)}`.trim(), ok: has(c.native) }];
  // วาง qaac แล้วแต่ไม่มีไฟล์ของ Apple บอกว่าต้องติดตั้ง iTunes ไม่ใช่ยังไม่ได้ใส่ (ข้อ 28 ลอง 10 พ.ย. 2569)
  const qmiss = encs?.find((e) => e.name === "qaac64")?.problem?.startsWith("ต้องติดตั้ง iTunes") ? "ต้องติดตั้ง iTunes" : undefined;
  if (c.id === "aac") return [{ value: "qaac", label: "qaac (Apple)", ok: has("qaac64"), miss: qmiss }, { value: "fdkaac", label: "fdkaac", ok: has("fdkaac") }, ff];
  if (!c.native) return [ff];
  // refalac ใช้ตัวเข้ารหัส ALAC ของ Apple บอกในวงเล็บแบบ qaac (Apple) (พี่กันถาม 10 พ.ย. 2569 "วงเล็บ apple ดีมะ")
  return [{ value: "native", label: `${c.native} ${ver(c.native)}${c.id === "alac" ? " (Apple)" : ""}`.replace(/\s+/g, " ").trim(), ok: has(c.native) }, ff];
}

/** ค่าในการ์ดของชุดค่าแบบง่าย · ช่องลดลงเฉพาะเมื่อต้นทางมีช่องมากกว่า */
export function presetVals(c: Codec, i: number, srcCh: number | null): Vals {
  const pr = c.presets[i] ?? c.presets[c.preset];
  const v: Vals = { ...cardDefaults(c.id), ...(pr.p as Vals) };
  v.channels = pr.channels && (srcCh ?? 2) > pr.channels ? String(pr.channels) : "src";
  return v;
}
/** ชุดค่าแบบง่ายเป็นค่าที่ส่งฝั่ง Rust · ใช้กับดรอปดาวน์หน้าแปลงเสียง เลือกได้โดยไม่ต้องเปิดแผง · ตัวแปลงใช้ตัวต้นฉบับถ้ามี */
export function presetSpec(c: Codec, i: number, encs: EncoderInfo[] | null): EncodeSpec {
  const eng = engines(c, encs).find((e) => e.ok)?.value ?? "ffmpeg", v = presetVals(c, i, null), pp: Record<string, string | number> = {};
  for (const k of cardsFor(c.id, eng, v)) {
    if (!SPEC_KEYS.includes(k.key)) pp[k.key] = cardValue(k, v, k.kind === "step" ? undefined : (k.opts ?? []).map((o) => [optVal(o), optLabel(o)] as [string, string]));
  }
  return { codec: c.id, encoder: eng, p: pp, channels: null, bits: null, rate: null, gain: 0, loudnorm: false, speed: null, keepPitch: false };
}

export const same = (a: Vals, b: Vals) => Object.keys({ ...a, ...b }).every((k) => String(a[k] ?? "") === String(b[k] ?? ""));
export const matchPreset = (c: Codec, v: Vals, srcCh: number | null) => c.presets.findIndex((_, i) => same(presetVals(c, i, srcCh), v));

export function loadLast(id: string): Last | null {
  try { return (JSON.parse(localStorage.getItem(LAST_KEY) ?? "{}") as Record<string, Last>)[id] ?? null; } catch { return null; }
}
export function saveLast(id: string, l: Last) {
  try { const all = JSON.parse(localStorage.getItem(LAST_KEY) ?? "{}"); all[id] = l; localStorage.setItem(LAST_KEY, JSON.stringify(all)); } catch { /* ที่เก็บของหน้าใช้ไม่ได้ ไม่เป็นไร */ }
}

/** ค่าในการ์ดจากค่าที่ตั้งไว้แล้วของแทร็ก (เปิดแผงแก้อีกรอบต้องได้ค่าเดิมทุกช่อง) */
export function valsOf(spec: EncodeSpec): Vals {
  const v: Vals = { ...cardDefaults(spec.codec as Codec["id"]), ...(spec.p as Vals) };
  v.channels = spec.channels ? String(spec.channels) : "src";
  // ใส่ bits rate เฉพาะชนิดที่มีการ์ดนั้น · เดิมใส่ทุกชนิด Opus ที่ไม่มีการ์ดสองใบนี้เลยไม่ตรงชุดค่าไหน เปิดแผงซ้ำแล้วเด้งไปขั้นสูง (เจอตอนเทสหน้าแปลงเสียง)
  const has = new Set(ADV[spec.codec as Codec["id"]]?.cards.map((k) => k.key) ?? []);
  if (has.has("bits")) v.bits = spec.bits ? String(spec.bits) : "src";
  if (has.has("rate")) v.rate = spec.rate ? String(spec.rate) : "src";
  return v;
}

export const fmtNum = (s: number, signed?: boolean) => (s < 0 ? "−" + Math.abs(s) : (signed && s > 0 ? "+" : "") + s);
export const nearestIdx = (stops: number[], x: number) => stops.reduce((bi, s, i) => (Math.abs(s - x) < Math.abs(stops[bi] - x) ? i : bi), 0);
export const CH_NAME: Record<number, string> = { 1: "ช่องเดียว", 2: "2.0 ch", 3: "2.1 ch", 6: "5.1 ch", 7: "6.1 ch", 8: "7.1 ch" };
export const chName = (n: number) => CH_NAME[n] ?? `${n} ช่อง`;

/** จัดการ์ดไม่ให้เหลือช่องว่าง (พี่กันสั่ง 8 พ.ย. 2569 "ไปเรียงมาดีๆ ที่ว่างโคตรเยอะ") · แถบเลื่อนกับตัวเลือกยาวแถวละ 2 · ตัวเลือกสั้นแถวละ 3 · เศษท้ายยืดเต็มแถว */
export function arrange(cards: Card[]): [Card, number][] {
  const long = (k: Card) => k.kind === "step" || (k.kind === "seg" && (k.opts ?? []).reduce((n, o) => n + optLabel(o).length, 0) > 28);
  const a = cards.filter(long), b = cards.filter((k) => !long(k));
  const r = b.length % 3, plain = r === 1 && b.length > 1 ? b.length - 4 : b.length - r;
  return [
    ...a.map((k, i): [Card, number] => [k, a.length % 2 && i === a.length - 1 ? 12 : 6]),
    ...b.map((k, i): [Card, number] => [k, i < plain ? 4 : b.length - plain === 1 ? 12 : 6]),
  ];
}

/* ---------- ไฟล์ที่จะได้ ช่อง อัตราสุ่ม บิต ตามที่ตัวแปลงแต่ละตัวออกจริง ----------
   ทุกค่ามาจากการแปลงไฟล์ทดสอบจริงด้วยคำสั่งชุดเดียวกับ encode.rs แล้วอ่านไฟล์ที่ได้ (11 พ.ย. 2569 พี่กันสั่ง "ไปดูดีๆนะ … เอาให้ถูกต้อง ตามเเต่ละ codec")
   ต้นทาง 96 88.2 48 44.1 32 22.05 192 kHz · 2 6 8 ช่อง · 16 กับ 24 บิต */
/** แบ่งคำสั่งเป็นก้อนที่ห้ามตัดบรรทัด · ตัวเลือก -x ติดกับค่าที่ตามมา (ค่าที่ไม่ขึ้นต้นด้วยขีดและไม่ใช่ท่อ) */
export function cmdGroups(line: string): string[] {
  const out: string[] = [];
  const w = line.split(" ");
  for (let i = 0; i < w.length; i++) {
    const nx = w[i + 1];
    if (/^-{1,2}[A-Za-z]/.test(w[i]) && nx !== undefined && nx !== "" && !/^-{1,2}[A-Za-z]/.test(nx) && nx !== "|" && nx !== "-") { out.push(w[i] + " " + nx); i++; }
    else out.push(w[i]);
  }
  return out;
}

export const MP3_RATES = [48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000];
/** lame ลดอัตราสุ่มเองตามบิตเรตหรือระดับ V (ลองทุกระดับ V0 ถึง V9 กับ 32 ถึง 320 kbps ทั้ง CBR ABR สเตอริโอและโมโน · Lowpass ไม่มีผล) */
export function lameRate(v: Vals): number | null {
  if ((v.mode ?? "VBR") === "VBR") return ({ 7: 32000, 8: 24000, 9: 22050 } as Record<number, number>)[Number(v.vbrq ?? 2)] ?? null;
  const b = Number(v.bitrate ?? 192);
  if (v.stereo === "Mono") return b <= 32 ? 22050 : b <= 40 ? 24000 : b <= 56 ? 32000 : null;
  return b <= 40 ? 16000 : b <= 48 ? 22050 : b <= 64 ? 24000 : b <= 96 ? 32000 : b <= 112 ? 44100 : null;
}
export function outFormat(id: string, eng: string, v: Vals, src: { ch: number; rate: number | null; bits: number | null }) {
  let ch = v.channels && v.channels !== "src" ? Math.min(Number(v.channels), src.ch) : src.ch;
  let rate = v.rate && v.rate !== "src" ? Number(v.rate) : src.rate;
  let bits: number | null = null;
  if (id === "mp3") ch = v.stereo === "Mono" ? 1 : Math.min(2, ch);
  if (id === "ac3" || id === "tak") ch = Math.min(6, ch);
  if (id === "alac") ch = Math.min(8, ch); // 8 ช่องติดป้าย 7.1 ลำโพงหน้าคู่กลาง (encode.rs wide71)
  if (rate) {
    if (id === "opus") rate = 48000; // Opus ถอดออกมา 48 kHz เสมอ ทั้ง opusenc และ ffmpeg
    else if (id === "mp3") {
      // อัตราที่ MP3 เก็บได้ ไม่เกินต้นทาง · ffmpeg ไม่ลดตามบิตเรต lame ลด
      const base = MP3_RATES.find((x) => x <= rate!) ?? 8000;
      const cut = eng === "native" ? lameRate(v) : null;
      rate = cut ? Math.min(cut, base) : base;
    } else if (id === "ac3") rate = [48000, 44100, 32000].includes(rate) ? rate : rate > 32000 ? 48000 : 32000; // 88.2 ได้ 48 · 22.05 ได้ 32
    else if (id === "aac") rate = eng === "ffmpeg" ? Math.min(rate, 96000) : Math.min(rate, 48000); // qaac ลดเป็น 48 kHz (HE-AAC ลดที่ ffmpeg ก่อน encode.rs)
  }
  if (id === "flac" || id === "alac" || id === "wv" || id === "ape" || id === "tak") {
    bits = v.bits && v.bits !== "src" ? Number(v.bits) : src.bits && src.bits <= 16 ? 16 : 24;
    // WavPack ของ ffmpeg เขียนเสียง 24 บิตเป็น 32 บิต ตัวอย่างเสียงตรงกันทุกตัว ไฟล์เล็กกว่าแบบ 24 บิต
    if (id === "wv" && eng === "ffmpeg" && bits > 16) bits = 32;
  }
  return { ch, rate, bits };
}
