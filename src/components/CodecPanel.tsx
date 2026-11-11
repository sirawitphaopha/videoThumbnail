/* แผงตั้งค่าเสียง แบบง่ายกับขั้นสูง (มอคอัปหัวข้อ 2 · แผนเสียงและซับ ขั้น 4)
   เลือกชนิด Lossy (Opus AAC MP3 AC-3) หรือ Lossless (FLAC WavPack) · ตัวแปลง (ตัวต้นฉบับเป็นค่าตั้งต้น ffmpeg เป็นตัวรอง)
   แบบง่าย ชุดค่า 4 ชุดพร้อมขนาดที่คาด · ขั้นสูง การ์ดละช่อง ชื่อ ⓘ และค่าอยู่หัวการ์ด แถบเลื่อนเป็นขั้นพร้อมช่องพิมพ์ค่าเอง ขนาดที่คาดเปลี่ยนตามค่าทันที
   เริ่มจากแบบง่ายแล้วเปิดขั้นสูงแก้ต่อได้ ค่าที่เลือกไม่หาย · การ์ดเปลี่ยนตามตัวแปลงที่เลือก · ตัวย่อมีคำเต็มครั้งแรกที่เจอในแต่ละการ์ด
   แทร็กในหนัง เลือกเพิ่มคู่กับแทร็กเดิม (ค่าตั้งต้นที่พี่กันเคาะ) หรือแทนที่ · คำสั่งที่จะรันจริงจากฝั่ง Rust (encode_preview) พร้อมปุ่มคัดลอก
   ค่าที่กดใช้จำไว้เป็นค่าตั้งต้นของชนิดนั้นครั้งหน้า */
import { useEffect, useMemo, useState } from "react";
import Dialog from "./Dialog";
import Dropdown from "./Dropdown";
import InfoTip, { abbrer } from "./InfoTip";
import { CardIcon, Keep, Phr, Range, Seg } from "./ui";
import { encodeApi, type EncodePlan, type EncodeSpec, type EncoderInfo, type MergeTrack } from "../lib/api";
import { CODECS, codecOf, type Codec } from "../lib/codecs";
import { ADV, TIPS, advSize, aacKbps, cardDefaults, cardValue, cardsFor, optLabel, optVal, type Card, type SizeCtx, type Vals } from "../lib/codecAdv";
import { ftName, isLossless } from "../lib/ftypes";
import { fmtSize } from "../lib/format";
import { IbTick, IcCopy, IcSettings } from "./icons";
import { IcPlus, IbSwap } from "./icons";

const baseName = (p: string) => p.split(/[\\/]/).pop() ?? p;
const SPEC_KEYS = ["channels", "bits", "rate"];
const LAST_KEY = "ms.codecLast";
type Last = { eng: string | null; vals: Vals; tab: "easy" | "adv" };

function engines(c: Codec, encs: EncoderInfo[] | null): { value: string; label: string; ok: boolean; miss?: string }[] {
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
function presetVals(c: Codec, i: number, srcCh: number | null): Vals {
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

const same = (a: Vals, b: Vals) => Object.keys({ ...a, ...b }).every((k) => String(a[k] ?? "") === String(b[k] ?? ""));
const matchPreset = (c: Codec, v: Vals, srcCh: number | null) => c.presets.findIndex((_, i) => same(presetVals(c, i, srcCh), v));

function loadLast(id: string): Last | null {
  try { return (JSON.parse(localStorage.getItem(LAST_KEY) ?? "{}") as Record<string, Last>)[id] ?? null; } catch { return null; }
}
function saveLast(id: string, l: Last) {
  try { const all = JSON.parse(localStorage.getItem(LAST_KEY) ?? "{}"); all[id] = l; localStorage.setItem(LAST_KEY, JSON.stringify(all)); } catch { /* ที่เก็บของหน้าใช้ไม่ได้ ไม่เป็นไร */ }
}

/** ค่าในการ์ดจากค่าที่ตั้งไว้แล้วของแทร็ก (เปิดแผงแก้อีกรอบต้องได้ค่าเดิมทุกช่อง) */
function valsOf(spec: EncodeSpec): Vals {
  const v: Vals = { ...cardDefaults(spec.codec as Codec["id"]), ...(spec.p as Vals) };
  v.channels = spec.channels ? String(spec.channels) : "src";
  // ใส่ bits rate เฉพาะชนิดที่มีการ์ดนั้น · เดิมใส่ทุกชนิด Opus ที่ไม่มีการ์ดสองใบนี้เลยไม่ตรงชุดค่าไหน เปิดแผงซ้ำแล้วเด้งไปขั้นสูง (เจอตอนเทสหน้าแปลงเสียง)
  const has = new Set(ADV[spec.codec as Codec["id"]]?.cards.map((k) => k.key) ?? []);
  if (has.has("bits")) v.bits = spec.bits ? String(spec.bits) : "src";
  if (has.has("rate")) v.rate = spec.rate ? String(spec.rate) : "src";
  return v;
}

const fmtNum = (s: number, signed?: boolean) => (s < 0 ? "−" + Math.abs(s) : (signed && s > 0 ? "+" : "") + s);
const nearestIdx = (stops: number[], x: number) => stops.reduce((bi, s, i) => (Math.abs(s - x) < Math.abs(stops[bi] - x) ? i : bi), 0);
const CH_NAME: Record<number, string> = { 1: "ช่องเดียว", 2: "2.0", 3: "2.1", 6: "5.1", 7: "6.1", 8: "7.1" };
const chName = (n: number) => CH_NAME[n] ?? `${n} ช่อง`;

/** ช่องพิมพ์ค่าเอง · พิมพ์ค่าที่ไม่อยู่ในขั้น แถบชี้ขั้นที่ใกล้ที่สุด · ช่องที่ตัวแปลงปัดค่าเอง (snap) ปัดให้เห็นเลย */
function VBox({ k, value, onCommit }: { k: Card; value: number; onCommit: (v: number) => void }) {
  const show = fmtNum(value, k.signed);
  const [txt, setTxt] = useState(show);
  useEffect(() => setTxt(show), [show]);
  const stops = k.stops!;
  const w = Math.max(...stops.map((s) => fmtNum(s, k.signed).length), k.free ? String(k.free[1]).length : 0) + 0.8;
  const commit = () => {
    let x = parseFloat(txt.replace("−", "-").replace(/[^\d.+-]/g, ""));
    if (Number.isNaN(x)) x = value;
    const [lo, hi] = k.free ?? [stops[0], stops[stops.length - 1]];
    x = Math.round(Math.min(hi, Math.max(lo, x)));
    const v = k.free && !k.snap ? x : stops[nearestIdx(stops, x)];
    setTxt(fmtNum(v, k.signed));
    if (v !== value) onCommit(v);
  };
  return (
    <span className="vbox">{k.pre && <span className="px">{k.pre}</span>}
      <input value={txt} inputMode="numeric" aria-label={`พิมพ์ค่า ${k.label} เอง`} style={{ width: `${w}ch` }} data-vin={k.key}
        onChange={(e) => setTxt(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } }} />
      {k.unit && <span className="u">{k.unit}</span>}</span>
  );
}

/** แถบเลื่อนเป็นขั้นตามค่าที่ตัวแปลงใช้ได้จริง ขีดทุกขั้น ป้ายเฉพาะขั้นหลัก */
function StepCtl({ k, value, onChange }: { k: Card; value: number; onChange: (v: number) => void }) {
  const stops = k.stops!, n = stops.length, major = k.major ?? stops;
  const pct = (i: number) => `${(i / (n - 1)) * 100}%`;
  const lbl = (s: number) => (k.pre ?? "") + fmtNum(s, k.signed);
  return (
    <div className="stepw" data-step={k.key}>
      <Range label={k.label} min={0} max={n - 1} value={nearestIdx(stops, value)} onChange={(i) => onChange(stops[i])} format={(i) => `${lbl(stops[i])}${k.unit ? " " + k.unit : ""}`} />
      <div className="ticks" aria-hidden="true">{stops.map((s, i) => <i key={s} style={{ left: pct(i) }} className={major.includes(s) ? "mj" : undefined} />)}</div>
      <div className="tlabels" aria-hidden="true">{major.map((s) => <span key={s} style={{ left: pct(stops.indexOf(s)) }}>{lbl(s)}</span>)}</div>
    </div>
  );
}

/** จัดการ์ดไม่ให้เหลือช่องว่าง (พี่กันสั่ง 8 พ.ย. 2569 "ไปเรียงมาดีๆ ที่ว่างโคตรเยอะ") · แถบเลื่อนกับตัวเลือกยาวแถวละ 2 · ตัวเลือกสั้นแถวละ 3 · เศษท้ายยืดเต็มแถว */
function arrange(cards: Card[]): [Card, number][] {
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
function cmdGroups(line: string): string[] {
  const out: string[] = [];
  const w = line.split(" ");
  for (let i = 0; i < w.length; i++) {
    const nx = w[i + 1];
    if (/^-{1,2}[A-Za-z]/.test(w[i]) && nx !== undefined && nx !== "" && !/^-{1,2}[A-Za-z]/.test(nx) && nx !== "|" && nx !== "-") { out.push(w[i] + " " + nx); i++; }
    else out.push(w[i]);
  }
  return out;
}

const MP3_RATES = [48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000];
/** lame ลดอัตราสุ่มเองตามบิตเรตหรือระดับ V (ลองทุกระดับ V0 ถึง V9 กับ 32 ถึง 320 kbps ทั้ง CBR ABR สเตอริโอและโมโน · Lowpass ไม่มีผล) */
function lameRate(v: Vals): number | null {
  if ((v.mode ?? "VBR") === "VBR") return ({ 7: 32000, 8: 24000, 9: 22050 } as Record<number, number>)[Number(v.vbrq ?? 2)] ?? null;
  const b = Number(v.bitrate ?? 192);
  if (v.stereo === "Mono") return b <= 32 ? 22050 : b <= 40 ? 24000 : b <= 56 ? 32000 : null;
  return b <= 40 ? 16000 : b <= 48 ? 22050 : b <= 64 ? 24000 : b <= 96 ? 32000 : b <= 112 ? 44100 : null;
}
function outFormat(id: string, eng: string, v: Vals, src: { ch: number; rate: number | null; bits: number | null }) {
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

export default function CodecPanel(p: {
  track: MergeTrack;
  encoders: EncoderInfo[] | null;
  onApply: (convert: EncodeSpec | null, pair: boolean, convName: string) => void;
  onClose: () => void;
  /** ความเร็วเสียงตั้งต้น เช่น 25>23.976 จากตัวช่วยหาดีเลย์ · ไม่ส่ง = ตามค่าที่ตั้งไว้ของแทร็ก */
  speed?: string | null;
  /** เปิดจากหน้าแปลงเสียง (หน้ากราฟเสียง) · มี Monkey's Audio กับ TAK เพิ่ม */
  convertPage?: boolean;
  /** หัวแผงแทนชื่อแทร็ก เช่น ตั้งทีเดียวทั้งคิว */
  title?: string;
}) {
  const t = p.track;
  const srcCh = t.channels;
  // เปิดครั้งแรก · แทร็กที่ตั้งไว้แล้วได้ค่าเดิมทุกช่อง · ยังไม่ได้ตั้ง ใช้ค่าที่กดใช้ครั้งล่าสุดของชนิดนั้น ไม่มีใช้ชุดค่าตั้งต้น
  const [init] = useState(() => {
    if (t.convert) {
      const c = codecOf(t.convert.codec), v = valsOf(t.convert), i = matchPreset(c, v, srcCh);
      return { cid: c.id, eng: t.convert.encoder || null, vals: v, pi: i, tab: (i >= 0 ? "easy" : "adv") as "easy" | "adv" };
    }
    const c = codecOf("opus"), l = loadLast(c.id);
    if (l) { const i = matchPreset(c, l.vals, srcCh); return { cid: c.id, eng: l.eng, vals: l.vals, pi: i, tab: l.tab }; }
    return { cid: c.id, eng: null, vals: presetVals(c, c.preset, srcCh), pi: c.preset, tab: "easy" as const };
  });
  const [cid, setCid] = useState<Codec["id"]>(init.cid);
  const c = codecOf(cid);
  const engs = engines(c, p.encoders);
  const firstOk = engs.find((e) => e.ok)?.value ?? "ffmpeg";
  /** ตัวแปลงที่กดเลือกเอง · ยังไม่ได้เลือก = ใช้ตัวต้นฉบับถ้ามี ไม่มีใช้ ffmpeg (คิดใหม่ทุกครั้ง รายชื่อตัวแปลงมาทีหลังแผงเปิดได้) */
  const [eng, setEng] = useState<string | null>(init.eng);
  /** ตัวแปลงที่กดแล้วยังใช้ไม่ได้ · ขึ้นหน้าต่างบอกเหตุ */
  const [noEng, setNoEng] = useState<string | null>(null);
  const [vals, setVals] = useState<Vals>(init.vals);
  const [pi, setPi] = useState<number>(init.pi);
  const [tab, setTab] = useState<"easy" | "adv">(init.tab);
  const [pair, setPair] = useState(t.pair ?? true);
  const [plan, setPlan] = useState<EncodePlan | null>(null);
  const [planErr, setPlanErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  /** ใช้กับทุกชนิด (มอคอัป GAIN LOUD กับความเร็วเสียง) */
  const [gain, setGain] = useState<number>(t.convert?.gain ?? 0);
  const [loud, setLoud] = useState<boolean>(t.convert?.loudnorm ?? false);
  const [speed, setSpeed] = useState<string>(p.speed ?? (t.convert?.speed ? t.convert.speed.join(">") : ""));
  /** เปลี่ยนความเร็วแล้วคงระดับเสียงแบบในไฟล์ · ค่าตั้งต้นคืนระดับเสียง (ข้อ 29 · พี่กันเคาะ 8 พ.ย. 2569) */
  const [keepPitch, setKeepPitch] = useState<boolean>(t.convert?.keepPitch ?? false);

  // เปลี่ยนชนิด · ค่าของชนิดเดิมไม่ติดมา (form-input สลับประเภทต้องล้างค่าเก่าจริง) · ใช้ค่าที่จำไว้ของชนิดนั้นถ้ามี
  const pickCodec = (id: Codec["id"]) => {
    const nc = codecOf(id), l = loadLast(id);
    setCid(id);
    if (l) { setVals(l.vals); setEng(l.eng); setPi(matchPreset(nc, l.vals, srcCh)); }
    else { setVals(presetVals(nc, nc.preset, srcCh)); setEng(null); setPi(nc.preset); }
  };
  const pickPreset = (i: number) => { setPi(i); setVals(presetVals(c, i, srcCh)); };
  const setVal = (key: string, v: string | number) => setVals((o) => {
    const n = { ...o, [key]: v };
    setPi(matchPreset(c, n, srcCh));
    return n;
  });
  const engUse = eng && engs.some((e) => e.value === eng && e.ok) ? eng : firstOk;
  /** ชนิดที่มีแต่ตัวต้นฉบับ แต่หาตัวแปลงไม่เจอ (TAK แตกจาก zip ที่แนบมา · Monkey's Audio เป็น DLL ในโฟลเดอร์เครื่องมือ) */
  const missingNative = c.only && !engs.some((e) => e.ok) ? (c.id === "tak" ? "หา Takc.exe ไม่เจอ แตกจากชุด TAK ที่แนบมาไม่ได้ ให้วาง Takc.exe ในโฟลเดอร์ตัวแปลง แล้วกดตรวจตัวแปลงใหม่ในหน้าตั้งค่า" : "หา MACDll64.dll ในโฟลเดอร์เครื่องมือไม่เจอ") : null;
  const blocked = planErr ?? missingNative;

  /** ตัวเลือกของการ์ดที่ขึ้นกับแทร็ก · ช่องลดได้ต่ำกว่าต้นทางเท่านั้น (AC-3 ได้สูงสุด 5.1) · อัตราสุ่มที่ต่างจากต้นทาง */
  // qaac กับ CoreAudioToolbox 7.9.8 ขึ้นไป AAC แบบ CBR เสียงผิดเพี้ยน (README ของ qaac · เทสกับเพลงของพี่กัน 10 พ.ย. 2569 เจอจริง) · ปิดตัวเลือก CBR
  const coreAudio = p.encoders?.find((e) => e.name === "qaac64")?.coreAudio ?? null;
  const caBad = (() => { if (!coreAudio) return false; const n = coreAudio.split(".").map(Number); return (n[0] ?? 0) > 7 || ((n[0] ?? 0) === 7 && ((n[1] ?? 0) > 9 || ((n[1] ?? 0) === 9 && (n[2] ?? 0) >= 8))); })();
  const qaacCbrOff = c.id === "aac" && engUse === "qaac" && caBad ? `ปิดไว้ เพราะ CoreAudioToolbox ${coreAudio} ทำให้ AAC แบบ CBR เสียงผิดเพี้ยน` : null;
  const optsOf = (k: Card): { value: string; label: string; off?: string }[] => {
    if (k.key === "channels") {
      const s = srcCh ?? 2, cap = c.id === "ac3" ? 6 : 8;
      const first = { value: "src", label: s > cap ? `ตามต้นฉบับ (${chName(s)} ลดเป็น ${chName(cap)})` : `ตามต้นฉบับ (${chName(s)})` };
      return [first, ...[6, 2, 1].filter((n) => n < Math.min(s, cap)).map((n) => ({ value: String(n), label: `ลดเป็น ${chName(n)}` }))];
    }
    if (k.key === "rate") {
      const r = t.rate ?? 48000;
      return [{ value: "src", label: `ตามต้นฉบับ (${r / 1000} kHz)` }, ...[48000, 44100].filter((x) => x !== r).map((x) => ({ value: String(x), label: `${x / 1000} kHz` }))];
    }
    return (k.opts ?? []).map((o) => ({ value: optVal(o), label: optLabel(o), off: k.key === "mode" && optVal(o) === "CBR" ? qaacCbrOff ?? undefined : undefined }));
  };

  const shown = cardsFor(c.id, engUse, vals);
  /** ค่าที่ใช้จริงของการ์ดที่แสดงอยู่ · ค่าที่ไม่อยู่ในตัวเลือกกลับเป็นค่าตั้งต้น · การ์ดที่ตัวแปลงนี้ไม่มี ไม่ส่งไปฝั่ง Rust */
  const live: Vals = {};
  for (const k of shown) live[k.key] = cardValue(k, vals, k.kind === "step" ? undefined : optsOf(k).filter((o) => !o.off).map((o) => [o.value, o.label] as [string, string]));
  const has = (key: string) => shown.some((k) => k.key === key);
  const numOr = (key: string) => (has(key) && live[key] !== "src" && live[key] != null ? Number(live[key]) : null);
  const liveKey = JSON.stringify(live);
  const spec: EncodeSpec = useMemo(() => {
    const pp: Record<string, string | number> = {};
    for (const [k, v] of Object.entries(live)) if (!SPEC_KEYS.includes(k)) pp[k] = v;
    return {
      codec: c.id, encoder: engUse, p: pp,
      channels: numOr("channels"), bits: numOr("bits"), rate: numOr("rate"),
      gain, loudnorm: loud, speed: speed ? (speed.split(">").map(Number) as [number, number]) : null, keepPitch: !!speed && keepPitch,
    };
  }, [c.id, engUse, liveKey, gain, loud, speed, keepPitch]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let alive = true;
    setPlanErr(null);
    encodeApi.preview(spec, baseName(t.src), t.ff ?? t.tid, t.channels, t.bits, t.rate).then((r) => { if (alive) setPlan(r); }, (e) => { if (alive) { setPlan(null); setPlanErr(String(e)); } });
    return () => { alive = false; };
  }, [spec, t.src, t.ff, t.tid, t.channels, t.bits, t.rate]);

  // ขนาดที่คาด · ความยาวหลังเปลี่ยนความเร็ว ช่องกับอัตราสุ่มของไฟล์ใหม่ ความลึกบิตที่ตัวแปลงได้รับ
  const ctxOf = (v: Vals): SizeCtx | null => {
    if (!t.duration) return null;
    const sp = speed ? speed.split(">").map(Number) : null;
    let ch = v.channels && v.channels !== "src" ? Number(v.channels) : srcCh ?? 2;
    if (c.id === "mp3") ch = v.stereo === "Mono" ? 1 : Math.min(2, ch);
    if (c.id === "ac3") ch = Math.min(6, ch);
    const bits = v.bits && v.bits !== "src" ? Number(v.bits) : t.bits && t.bits <= 16 ? 16 : 24;
    return { secs: t.duration * (sp ? sp[0] / sp[1] : 1), ch, rate: v.rate && v.rate !== "src" ? Number(v.rate) : t.rate ?? 48000, bits };
  };
  const ctx = ctxOf(live);
  const headBytes = ctx ? advSize(c.id, engUse, live, ctx) : null;

  const srcFt = ftName("audio", t.codec, t.profile);
  const srcLossless = isLossless(srcFt);
  const warn = !t.codec ? null : !srcLossless && !c.lossless ? `ต้นทาง ${srcFt} เป็นแบบเสียคุณภาพ การแปลงเป็น ${c.name} เป็นการเสียคุณภาพซ้อน เสียงจะต่างจากต้นฉบับมากขึ้น`
    : !srcLossless && c.lossless ? `ต้นทาง ${srcFt} เป็นแบบเสียคุณภาพ การแปลงเป็น ${c.name} ทำให้ไฟล์ใหญ่ขึ้น แต่คุณภาพเสียงไม่ดีขึ้น` : null;
  const name = `${t.name || ""} ${c.name}`.trim();
  // การ์ดเทียบต้นฉบับกับไฟล์ที่จะได้ แถวที่เปลี่ยนเน้นสี (พี่กันสั่ง 11 พ.ย. 2569 "อยากให้มันเป้นการ์ด … เทียบต้นฉบับกับตัวที่กำลังจะแปลง ว่าอะไรเปลี่ยน")
  const { ch: outCh, rate: outRate, bits: outBits } = outFormat(c.id, engUse, live, { ch: srcCh ?? 2, rate: t.rate ?? null, bits: t.bits ?? null });
  const outSecs = t.duration ? t.duration * (speed ? Number(speed.split(">")[0]) / Number(speed.split(">")[1]) : 1) : null;
  const outKbps = headBytes && outSecs ? headBytes * 8 / outSecs / 1000 : null;
  const chTxt = (n: number | null | undefined) => (n ? (n === 1 ? "โมโน" : n === 2 ? "2.0" : n === 6 ? "5.1" : n === 8 ? "7.1" : `${n} ช่อง`) : "—");
  const khz = (r: number | null | undefined) => (r ? `${+(r / 1000).toFixed(1)} kHz` : "—");
  const kbps = (k: number | null | undefined) => (k ? `${Math.round(k).toLocaleString("en-US")} kbps` : "—");
  const mins = (x: number | null | undefined) => (x ? `${Math.floor(x / 60)}:${String(Math.round(x % 60)).padStart(2, "0")}` : "—");
  const cols: { k: string; a: string; b: string; approx?: boolean }[] = [
    { k: "ชนิด", a: srcFt || "—", b: c.name },
    { k: "ช่อง", a: chTxt(srcCh), b: chTxt(outCh) },
    { k: "อัตราสุ่ม", a: khz(t.rate), b: khz(outRate) },
    { k: "บิต", a: srcLossless && t.bits ? `${t.bits}-bit` : "—", b: outBits ? `${outBits}-bit` : "—" },
    { k: "บิตเรต", a: kbps(t.bitrate ? t.bitrate / 1000 : null), b: kbps(outKbps), approx: true },
    { k: "ขนาด", a: t.bytes ? fmtSize(t.bytes) : "—", b: headBytes ? fmtSize(headBytes) : "—", approx: true },
    { k: "ความยาว", a: mins(t.duration), b: mins(outSecs) },
  ];
  const sizePct = t.bytes && headBytes ? Math.round((headBytes / t.bytes - 1) * 100) : null;
  const cmpCard = (
    <div className="cpcmp" data-cpcmp>
      <div className="cpcmp-grid" style={{ gridTemplateColumns: `auto repeat(${cols.length}, minmax(0, 1fr))` }}>
        <span className="h"></span>{cols.map((x) => <span key={x.k} className="h">{x.k}</span>)}
        <span className="rl">ต้นฉบับ</span>{cols.map((x) => <span key={x.k} className="a" data-cmpa={x.k}>{x.a}</span>)}
        <span className="rl">ไฟล์ที่จะได้<InfoTip title="ต้นฉบับกับไฟล์ที่จะได้" tip={{ w: "เทียบเสียงต้นฉบับกับไฟล์ที่จะได้ตามค่าที่ตั้งอยู่ตอนนี้ ช่องที่เปลี่ยนจะเน้นสี บิตเรตกับขนาดของไฟล์ใหม่เป็นค่าประมาณ ของจริงขึ้นกับเสียงในแทร็ก ส่วนบิตมีเฉพาะแบบไม่เสียคุณภาพ เพราะแบบเสียคุณภาพเก็บเสียงคนละวิธีจึงไม่นับเป็นบิต" }} /></span>
        {cols.map((x) => { const on = x.a !== x.b; return <span key={x.k} className={"b" + (on ? " on" : "")} data-cmpb={x.k} data-changed={on || undefined}>{x.approx && x.b !== "—" ? "≈ " : ""}{x.b}</span>; })}
      </div>
      {sizePct != null && <span className={"cpcmp-sum" + (sizePct > 0 ? " up" : "")} data-cmpsum>{sizePct <= 0 ? `เล็กลงราว ${-sizePct}%` : `ใหญ่ขึ้นราว ${sizePct}%`}</span>}
    </div>
  );
  const apply = () => {
    if (blocked) return;
    saveLast(c.id, { eng, vals, tab });
    p.onApply(spec, pair, pair && t.inMovie ? name : "");
  };

  const cardEl = (k: Card, span: number) => {
    const ex = abbrer();
    const label = ex(k.label);
    const v = live[k.key];
    let ctl: React.ReactNode = null, head: React.ReactNode = null;
    if (k.kind === "step") {
      ctl = <StepCtl k={k} value={Number(v)} onChange={(x) => setVal(k.key, x)} />;
      head = <VBox k={k} value={Number(v)} onCommit={(x) => setVal(k.key, x)} />;
    } else if (k.kind === "seg") {
      ctl = <div style={{ display: "flex", flexWrap: "wrap" }}><Seg small label={k.label} value={String(v)} onChange={(x) => setVal(k.key, x)} options={optsOf(k)} /></div>;
    } else {
      ctl = <div style={{ display: "flex" }}><Dropdown label={k.label} value={String(v)} onChange={(x) => setVal(k.key, x)} options={optsOf(k)} /></div>;
    }
    let size: React.ReactNode;
    if (typeof k.size === "function") {
      const bytes = ctx ? k.size(live, ctx) : null;
      const avg = ctx && bytes && ["tvbr", "vbr", "vbrq"].includes(k.key) ? Math.round(bytes * 8 / ctx.secs / 1000) : null;
      size = <div className="asz"><span>ขนาดที่คาด</span><b data-sz={k.key}>{bytes ? `ทั้งแทร็กราว ${fmtSize(bytes)}` : "ไม่รู้ความยาวแทร็ก"}</b>{avg ? <span className="avg">เฉลี่ยราว {avg} kbps</span> : null}</div>;
    } else if (k.size) size = <div className="asz"><span>ขนาดไฟล์</span><div>{ex(k.size)}</div></div>;
    else size = <div className="asz none">ไม่เปลี่ยนขนาดไฟล์</div>;
    return (
      <div className="acard" key={k.key + k.label} data-card={k.key} style={{ gridColumn: `span ${span}` }}>
        <div className="ach"><span className="lbl ilbl">{label}<InfoTip title={k.label} tip={k.tip} /></span>{head}</div>
        {ctl}{size}
        <div className="small" style={{ margin: 0 }}>{ex(k.note)}</div>
      </div>
    );
  };

  const speedOpts = [{ value: "", label: "ไม่เปลี่ยน" }, { value: "25>23.976", label: "จาก 25 เป็น 23.976 (แผ่นยุโรป PAL)" }, { value: "24>23.976", label: "จาก 24 เป็น 23.976" },
    { value: "23.976>25", label: "จาก 23.976 เป็น 25" }, { value: "23.976>24", label: "จาก 23.976 เป็น 24" }];
  // ระดับเสียงหลังเปลี่ยนความเร็ว (ผู้ช่วยตรวจขั้น 10 ข้อ 29 · พี่กันเคาะ 8 พ.ย. 2569 ให้มีให้เลือก ค่าตั้งต้นคืนระดับเสียง)
  const speedNote = speed && (
    <div data-pitch-box>
      <div className="small ilbl" style={{ marginBottom: 4 }}><b style={{ color: "var(--txt2)" }}>ระดับเสียงหลังเปลี่ยนความเร็ว</b><InfoTip title="ระดับเสียงหลังเปลี่ยนความเร็ว" tip={TIPS.pitch} /></div>
      <div style={{ display: "flex" }}><Seg small label="ระดับเสียงหลังเปลี่ยนความเร็ว" value={keepPitch ? "keep" : "restore"} onChange={(v) => setKeepPitch(v === "keep")}
        options={[{ value: "restore", label: "คืนระดับเสียงเดิม (แนะนำ)" }, { value: "keep", label: "คงระดับเสียงแบบในไฟล์" }]} /></div>
      <div className="small" style={{ marginTop: 4 }} data-pitch-note><Phr>{`${keepPitch
        ? "ยืดเวลาอย่างเดียวและคงระดับเสียงเท่าในไฟล์ ใช้กับแผ่นที่สตูดิโอแก้ระดับเสียงมาแล้ว"
        : "เล่นช้าลงหรือเร็วขึ้นแบบหมุนแผ่น ระดับเสียงจึงกลับเป็นแบบเดิมก่อนทำแผ่น แผ่น PAL ส่วนใหญ่ต้องใช้แบบนี้"}${t.duration ? ` ความยาวจะเปลี่ยนจาก ${Math.round(t.duration)} เป็นราว ${Math.round(t.duration * Number(speed.split(">")[0]) / Number(speed.split(">")[1]))} วินาที` : ""}`}</Phr></div>
    </div>
  );
  const gainCard: Card = { key: "gain", label: "Gain", kind: "step", def: 0, stops: Array.from({ length: 25 }, (_, i) => i - 12), unit: "dB", signed: true, major: [-12, -9, -6, -3, 0, 3, 6, 9, 12], note: "เพิ่มหรือลดความดังทีละ 1 dB ใช้ได้กับทุกชนิด", tip: TIPS.gain };
  const exTop = abbrer();

  return (
    <>
    {noEng && (() => {
      // กดตัวแปลงที่ยังใช้ไม่ได้ ขึ้นหน้าต่างบอกเหตุกับทางแก้ (เดิมกดแล้วเงียบ)
      const reg = noEng === "qaac" ? "qaac64" : noEng === "native" ? (c.native ?? "") : noEng;
      const info = p.encoders?.find((e) => e.name === reg);
      const itunes = noEng === "qaac" && !!info?.problem?.startsWith("ต้องติดตั้ง iTunes");
      const label = engs.find((e) => e.value === noEng)?.label ?? reg;
      const close = () => setNoEng(null);
      return (
        <Dialog open onClose={close} confirm width={520} title={itunes ? "AAC ของ Apple ต้องติดตั้ง iTunes ก่อน" : `ยังไม่ได้ใส่ ${label}`}
          // ปุ่มสามปุ่มกว้างเท่ากัน (พี่กันสั่ง 10 พ.ย. 2569 "เท่ากันที") · แบ่งเต็มแถวสามส่วนเท่ากัน (พี่กันสั่ง 11 พ.ย. 2569 "เเบ่งสามส่วนเท่ากัน")
          actions={<div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, width: "100%" }} data-noeng-acts>
            <button type="button" className="btn btn-ghost btn-sm" onClick={close}>ปิด</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setEng("ffmpeg"); close(); }} data-noeng-ffmpeg>ใช้ ffmpeg แทน</button>
            <button type="button" className="btn btn-main btn-sm" onClick={() => { void (itunes ? encodeApi.openItunes() : encodeApi.openPage(reg)).catch(() => {}); }} data-noeng-open>{itunes ? "เปิดหน้าโหลด iTunes" : `เปิดหน้าโหลด ${reg}`}</button>
          </div>}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13.5 }} data-noeng={noEng}>
            {itunes ? <>
              <p style={{ margin: 0 }}><Phr>{"qaac ไม่มีตัวเข้ารหัสอยู่ในตัว ต้องเรียกใช้ตัวเข้ารหัส AAC ของ Apple ที่มากับ iTunes แต่เครื่องนี้ยังไม่มี iTunes จึงแปลงด้วย qaac ไม่ได้"}</Phr></p>
              <p style={{ margin: 0 }}><Phr>{"กดเปิดหน้าโหลด เลือกโหลด iTunes สำหรับ Windows ติดตั้งให้เสร็จ แล้วเปิดหน้าต่างนี้ใหม่ โปรแกรมจะหาเจอเอง ไม่ต้องตั้งค่าเพิ่ม"}</Phr></p>
              <p className="small" style={{ margin: 0 }}><Phr>{"ระหว่างนี้ใช้ ffmpeg แปลง AAC แทนได้ แต่เสียงด้อยกว่าตัวของ Apple เมื่อบิตเรตต่ำ ส่วน ALAC ใช้ refalac ได้โดยไม่ต้องมี iTunes"}</Phr></p>
            </> : <>
              <p style={{ margin: 0 }}><Phr>{info?.problem ?? `ยังไม่เจอ ${reg}.exe ในโฟลเดอร์ตัวแปลง ให้โหลดชุดของผู้ทำ แล้ววางทุกไฟล์ที่มากับชุดไว้ในโฟลเดอร์ตัวแปลง ซึ่งเปิดได้จากปุ่มในหน้าตั้งค่า หัวข้อตัวแปลง`}</Phr></p>
              {noEng === "qaac" && <p className="small" style={{ margin: 0 }}><Phr>{"qaac ต้องติดตั้ง iTunes ด้วย"}</Phr></p>}
              <p className="small" style={{ margin: 0 }}><Phr>{"ระหว่างนี้ใช้ ffmpeg แทนได้"}</Phr></p>
            </>}
          </div>
        </Dialog>
      );
    })()}
    <Dialog open onClose={p.onClose} width={900} height="calc(100vh - 32px)" title={<span>ตั้งค่าแปลงเสียง <span className="cpfile" data-cpfile style={{ overflowWrap: "anywhere" }}>{p.title ?? (t.inMovie ? (t.name || "เสียงในหนัง") : baseName(t.src))}</span></span>}
      actions={<>
        <span className="small" style={{ marginRight: "auto", alignSelf: "center" }}>ค่าที่กดใช้จำไว้เป็นค่าตั้งต้นของชนิดนี้ครั้งหน้า ขนาดเป็นค่าประมาณ ของจริงขึ้นกับเสียงในแทร็ก</span>
        {t.convert && <button type="button" className="btn btn-ghost btn-sm" onClick={() => p.onApply(null, pair, "")} data-conv-off>ไม่แปลง</button>}
        <button type="button" className="btn btn-ghost btn-sm" onClick={p.onClose}>ยกเลิก</button>
        <button type="button" className={"btn btn-sm " + (blocked ? "btn-wait" : "btn-main")} aria-disabled={!!blocked || undefined} title={blocked ?? undefined} onClick={apply} data-conv-use>ใช้ค่านี้</button>
      </>}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, flex: "1 0 auto" }} data-codec-panel data-tab={tab}>
        {t.codec && cmpCard}
        <div className="cp2">
          <div><div className="small ilbl" style={{ marginBottom: 4 }}><b style={{ color: "var(--txt2)" }}>Lossy</b>&nbsp;(เสียคุณภาพ ไฟล์เล็ก)<InfoTip title="Lossy" tip={TIPS.lossy} /></div>
            <Seg small label="ชนิดแบบเสียคุณภาพ" value={c.lossless ? ("" as Codec["id"]) : c.id} onChange={pickCodec} options={CODECS.filter((x) => !x.lossless).map((x) => ({ value: x.id, label: x.name }))} /></div>
          <div><div className="small ilbl" style={{ marginBottom: 4 }}><b style={{ color: "var(--txt2)" }}>Lossless</b>&nbsp;(ไม่เสียคุณภาพ)<InfoTip title="Lossless" tip={TIPS.lossless} /></div>
            <Seg small label="ชนิดแบบไม่เสียคุณภาพ" value={c.lossless ? c.id : ("" as Codec["id"])} onChange={pickCodec} options={CODECS.filter((x) => x.lossless && (!x.only || p.convertPage)).map((x) => ({ value: x.id, label: x.name }))} /></div>
        </div>
        <div className="small ilbl" style={{ display: "block" }}><b style={{ color: "var(--txt)" }}>{c.name}</b> <span className="ab">({c.full})</span><InfoTip title={c.name} tip={ADV[c.id].tip} /> <Phr>{c.brief}</Phr></div>
        <div className="cpsep" aria-hidden="true" />
        <div className="cp2">
          <div><div className="small ilbl" style={{ marginBottom: 4 }}><b style={{ color: "var(--txt2)" }}>Encoder</b>&nbsp;(ตัวแปลง)<InfoTip title="Encoder" tip={TIPS.engine} /></div>
            <Seg small label="ตัวแปลง" value={engUse} onChange={(v) => { if (engs.find((e) => e.value === v)?.ok) setEng(v); else setNoEng(v); }}
              options={engs.map((e) => ({ value: e.value, label: e.ok ? e.label : `${e.label} (${e.miss ?? "ยังไม่ได้ใส่"})` }))} /></div>
          <div><div className="cphead"><span className="small ilbl"><b style={{ color: "var(--txt2)" }}>แบบตั้งค่า</b><InfoTip title="แบบง่ายกับขั้นสูง" tip={TIPS.mode} /></span>
              <span className="small" data-headsz>ขนาดที่คาดของแทร็กนี้ <b style={{ color: "var(--txt)" }}>{headBytes ? `ราว ${fmtSize(headBytes)}` : "ไม่รู้ความยาวแทร็ก"}</b>
                {c.id === "aac" && ctx ? `, เฉลี่ยราว ${Math.round(aacKbps(live, engUse, ctx.ch))} kbps` : ""}</span></div>
            <Seg small label="แบบตั้งค่า" value={tab} onChange={setTab} options={[{ value: "easy", label: <><IbTick size={14} />แบบง่าย</> }, { value: "adv", label: <><IcSettings size={14} />ขั้นสูง</> }]} /></div>
        </div>
        {tab === "easy" ? (<>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }} role="radiogroup" aria-label="ชุดค่า">
            {c.presets.map((x, i) => {
              const pv = presetVals(c, i, srcCh), pc = ctxOf(pv);
              const sz = pc ? advSize(c.id, engUse, pv, pc) : null;
              return (
                <button key={x.label} type="button" role="radio" aria-checked={i === pi} onClick={() => pickPreset(i)} data-preset={i}
                  className={"btn preset" + (i === pi ? " on" : "")} style={{ height: "auto", flexDirection: "column", alignItems: "flex-start", gap: 2, padding: "8px 10px", textAlign: "left" }}>
                  <b style={{ fontSize: 13.5 }}>{x.label}</b>
                  <span className="small" style={{ color: "var(--txt2)" }}>{x.detail}</span>
                  <span className="small">{sz ? `ทั้งแทร็กราว ${fmtSize(sz)}` : ""}</span>
                </button>
              );
            })}
          </div>
          <div className="small"><Phr>{`${pi < 0 ? "ค่าที่แก้ในขั้นสูงยังไม่ตรงกับชุดไหน กดชุดค่าเพื่อกลับไปใช้ชุดนั้นได้ " : ""}ชุดค่าตั้งตามคำแนะนำของผู้ทำตัวแปลง กดขั้นสูงเพื่อดูหรือแก้ทุกตัวเลือกของชุดที่เลือก`}</Phr></div>
          <div className="cpsep" aria-hidden="true" />
          <div className="cp3" data-extra>
            <div><div className="small ilbl" style={{ marginBottom: 4 }}><b style={{ color: "var(--txt2)" }}>ความเร็วเสียง</b>&nbsp;(เสียงที่เหลื่อมเพิ่มขึ้นเรื่อย ๆ)<InfoTip title="ความเร็วเสียง" tip={TIPS.speed} /></div>
              <Dropdown label="ความเร็วเสียง" value={speed} onChange={setSpeed} options={speedOpts} /></div>
            <div><div className="small ilbl" style={{ marginBottom: 4 }}><b style={{ color: "var(--txt2)" }}>Gain</b>&nbsp;(ปรับความดัง dB)<InfoTip title="Gain" tip={TIPS.gain} /></div>
              <div className="delay"><button type="button" aria-label="ลดความดัง 1 dB" onClick={() => setGain((g) => Math.max(-12, g - 1))}>−</button>
                <span className="avnum" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", flex: 1 }} data-gain>{gain > 0 ? `+${gain}` : gain} dB</span>
                <button type="button" aria-label="เพิ่มความดัง 1 dB" onClick={() => setGain((g) => Math.min(12, g + 1))}>+</button></div></div>
            <div><div className="small ilbl" style={{ marginBottom: 4 }}><b style={{ color: "var(--txt2)" }}>Loudness normalize</b>&nbsp;(ความดังมาตรฐาน)<InfoTip title="Loudness normalize" tip={TIPS.loud} /></div>
              <div style={{ display: "flex" }}><Seg small label="ความดังมาตรฐาน" value={loud ? "on" : "off"} onChange={(v) => setLoud(v === "on")}
                options={[{ value: "off", label: "Off" }, { value: "on", label: "EBU R128 −23 LUFS" }]} /></div></div>
          </div>
        </>) : (<>
          <div className="cards acards" data-cards>{arrange(shown).map(([k, span]) => cardEl(k, span))}</div>
          {c.id === "wv" && <div className="small">{exTop("WavPack แบบ Hybrid ได้สองไฟล์ (.wv กับไฟล์แก้ .wvc) ใส่ในไฟล์หนังได้แค่ไฟล์แรก จึงไม่มีในหน้านี้ แต่ใช้ได้ในหน้าแปลงเสียง")}</div>}
          {engUse === "ffmpeg" && c.native && <div className="small">{exTop(`ffmpeg ไม่มีบางช่องของตัวต้นฉบับ ${c.native} การ์ดที่ไม่มีจึงไม่แสดง`)}</div>}
          <div className="cgroup">ใช้กับทุกชนิด</div>
          <div className="cards acards">
            <div className="acard" data-card="gain" style={{ gridColumn: "span 4" }}>
              <div className="ach"><span className="lbl ilbl">Gain<InfoTip title="Gain" tip={TIPS.gain} /></span><VBox k={gainCard} value={gain} onCommit={setGain} /></div>
              <StepCtl k={gainCard} value={gain} onChange={setGain} />
              <div className="asz none">ไม่เปลี่ยนขนาดไฟล์</div>
              <div className="small" style={{ margin: 0 }}>{abbrer()(gainCard.note)}</div>
            </div>
            <div className="acard" data-card="loud" style={{ gridColumn: "span 4" }}>
              <div className="ach"><span className="lbl ilbl">Loudness normalize<InfoTip title="Loudness normalize" tip={TIPS.loud} /></span></div>
              <div style={{ display: "flex" }}><Seg small label="ความดังมาตรฐาน" value={loud ? "on" : "off"} onChange={(v) => setLoud(v === "on")} options={[{ value: "off", label: "Off" }, { value: "on", label: "EBU R128 −23 LUFS" }]} /></div>
              <div className="asz none">ไม่เปลี่ยนขนาดไฟล์</div>
              <div className="small" style={{ margin: 0 }}>{abbrer()("ปรับความดังตามมาตรฐาน EBU R128 ให้ได้ −23 LUFS ทุกแทร็กจึงดังพอ ๆ กัน ใช้ได้กับทุกชนิด")}</div>
            </div>
            <div className="acard" data-card="speed" style={{ gridColumn: "span 4" }}>
              <div className="ach"><span className="lbl ilbl">ความเร็วเสียง<InfoTip title="ความเร็วเสียง" tip={TIPS.speed} /></span></div>
              <div style={{ display: "flex" }}><Dropdown label="ความเร็วเสียง" value={speed} onChange={setSpeed} options={speedOpts} /></div>
              <div className="asz"><span>ขนาดไฟล์</span><div><Phr>{"ความยาวเปลี่ยนตามความเร็ว ขนาดไฟล์จึงเปลี่ยนตาม"}</Phr></div></div>
              <div className="small" style={{ margin: 0 }}>{abbrer()("ใช้แก้เสียงที่ค่อย ๆ เหลื่อมจากภาพ มากขึ้นเรื่อย ๆ จนถึงท้ายเรื่อง และเลือกได้ข้างล่างว่าจะคืนหรือคงระดับเสียง")}</div>
            </div>
          </div>
        </>)}
        {speedNote}
        {t.inMovie && (
          <div><div className="small" style={{ marginBottom: 4 }}><b style={{ color: "var(--txt2)" }}>แทร็กเดิมในหนัง หลังแปลงจะ</b></div>
            <div style={{ display: "flex" }}><Seg small label="แปลงแล้วจะ" value={pair ? "pair" : "replace"} onChange={(v) => setPair(v === "pair")}
              options={[{ value: "pair", label: <><IcPlus size={14} />เพิ่มคู่กับแทร็กเดิม</> }, { value: "replace", label: <><IbSwap size={14} />แทนที่แทร็กเดิม</> }]} /></div>
            <div className="small" style={{ marginTop: 4 }}>{pair ? `แทร็กใหม่ชื่อ ${name} ต่อท้ายแทร็กเดิม แทร็กเดิมอยู่ครบ` : "แทร็กเดิมถูกแทนที่ด้วยแทร็กที่แปลง"}</div></div>
        )}
        {missingNative && <div className="stat warn" data-native-missing><CardIcon kind="warn" /><div><b>{c.name} ยังใช้ไม่ได้</b><Phr>{missingNative}</Phr></div></div>}
        {/* qaac แบบ CBR กับ CoreAudioToolbox 7.9.8 ขึ้นไป เสียงผิดเพี้ยน (README ของ qaac ประกาศ 21 ธ.ค. 2567 · พี่กันสั่ง 10 พ.ย. 2569 "ต้อง note ของเราด้วย") */}
        {qaacCbrOff && tab === "adv" && <div className="stat info" data-qaac-cbr><CardIcon kind="info" /><div><b>ปิดโหมด CBR ของ qaac ไว้</b><Phr>{`เครื่องนี้ใช้ CoreAudioToolbox ${coreAudio} ซึ่งผู้ทำ qaac แจ้งว่ารุ่น 7.9.8 ขึ้นไปทำให้ AAC แบบ CBR มีเสียงผิดเพี้ยนเป็นช่วง ๆ และทดสอบกับเพลงจริงแล้วพบจริง ให้ใช้ TVBR CVBR หรือ ABR แทน`}</Phr></div></div>}
        {warn && <div className="stat warn"><CardIcon kind="warn" /><div><Phr>{warn}</Phr> <Phr>ยังแปลงต่อได้ตามปกติ</Phr></div></div>}
        {/* ALAC 8 ช่องติดป้ายเป็น 7.1 ลำโพงหน้าคู่กลาง (encode.rs wide71) · พี่กันถาม 11 พ.ย. 2569 "ต้องมีเตือนบอกไหม" */}
        {c.id === "alac" && outCh === 8 && <div className="stat warn" data-alac71><CardIcon kind="warn" /><div>
          <b>ALAC เก็บเสียง 8 ช่องได้แบบเดียว คือ 7.1 แบบลำโพงหน้าคู่กลาง</b>
          <Phr>เสียงลำโพงข้างของต้นฉบับจะติดป้ายเป็นลำโพงหน้าคู่กลาง เสียงครบทุกช่องและไม่เสียคุณภาพ แต่เครื่องเล่นจะส่งเสียงข้างไปออกลำโพงหน้า ถ้าจะเล่นกับชุดลำโพง 7.1 เลือก FLAC หรือ WavPack แทน</Phr></div></div>}
        <div className="cpsep" aria-hidden="true" />
        {/* กล่องคำสั่งยืดรับที่เหลือของหน้าต่าง ไม่ให้เหลือที่ว่างล่าง */}
        <div style={{ display: "flex", flexDirection: "column", flex: "1 1 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <span className="small ilbl"><b style={{ color: "var(--txt2)" }}>คำสั่งที่จะรัน</b>&nbsp;(Command line)<InfoTip title="Command line" tip={TIPS.cmd} /></span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { if (plan) navigator.clipboard?.writeText(plan.text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {}); }} data-copy><Keep icon={<IcCopy size={14} />} all={["คัดลอกแล้ว", "คัดลอก"]}>{copied ? "คัดลอกแล้ว" : "คัดลอก"}</Keep></button>
          </div>
          <pre data-cmd style={{ flex: 1, minHeight: 40, margin: 0, whiteSpace: "pre-wrap", overflowWrap: "break-word", fontFamily: "var(--mono)", fontSize: 12, lineHeight: 1.55, background: "#fff", border: "1px solid var(--line)", borderRadius: 8, padding: "8px 10px", userSelect: "text", color: "var(--txt)" }}>
            {planErr ?? (plan
              // ตัดบรรทัดเฉพาะตรงเว้นวรรค · เดิมตัดหลังขีด -i กลายเป็นสองบรรทัด อ่านผิดคำสั่ง (เจอตอนตรวจภาพ) · คัดลอกใช้ plan.text ตรงตัว
              // ตัวเลือกที่ขึ้นต้นด้วยขีดติดกับค่าของมัน "-f wav" ไม่แยกบรรทัด (ตัดบรรทัดตามความหมาย CLAUDE.md)
              ? plan.text.split("\n").map((line, li) => <span key={li}>{li > 0 && <br />}{cmdGroups(line).map((w, wi) => <span key={wi}>{wi > 0 ? " " : ""}<span style={{ whiteSpace: "nowrap" }}>{w}</span></span>)}</span>)
              : "กำลังสร้างคำสั่ง")}</pre>
          {plan && <div className="small" style={{ marginTop: 4 }}><Phr>{plan.note}</Phr></div>}
        </div>
      </div>
    </Dialog>
    </>
  );
}
