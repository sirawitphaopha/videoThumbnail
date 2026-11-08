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
import { CardIcon, Phr, Range, Seg } from "./ui";
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

function engines(c: Codec, encs: EncoderInfo[] | null): { value: string; label: string; ok: boolean }[] {
  const has = (n: string) => !!encs?.find((e) => e.name === n && e.ok);
  const ver = (n: string) => encs?.find((e) => e.name === n)?.version ?? "";
  const ff = { value: "ffmpeg", label: `ffmpeg ${ver("ffmpeg")}`.trim(), ok: true };
  // Monkey's Audio กับ TAK ffmpeg อ่านได้อย่างเดียว เขียนไม่ได้ · มีแต่ตัวต้นฉบับ
  if (c.only && c.native) return [{ value: "native", label: c.id === "ape" ? `Monkey's Audio ${ver(c.native)} (MACDll64.dll)`.trim() : `${c.native} ${ver(c.native)}`.trim(), ok: has(c.native) }];
  if (c.id === "aac") return [{ value: "qaac", label: "qaac (Apple)", ok: has("qaac64") }, { value: "fdkaac", label: "fdkaac", ok: has("fdkaac") }, ff];
  if (!c.native) return [ff];
  return [{ value: "native", label: `${c.native} ${ver(c.native)}`.trim(), ok: has(c.native) }, ff];
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
  const missingNative = c.only && !engs.some((e) => e.ok) ? (c.id === "tak" ? "หา Takc.exe ไม่เจอ แตกจากชุด TAK ที่แนบมาไม่ได้ · วาง Takc.exe ในโฟลเดอร์ตัวแปลงแล้วกดตรวจตัวแปลงใหม่ในหน้าตั้งค่า" : "หา MACDll64.dll ในโฟลเดอร์เครื่องมือไม่เจอ") : null;
  const blocked = planErr ?? missingNative;

  /** ตัวเลือกของการ์ดที่ขึ้นกับแทร็ก · ช่องลดได้ต่ำกว่าต้นทางเท่านั้น (AC-3 ได้สูงสุด 5.1) · อัตราสุ่มที่ต่างจากต้นทาง */
  const optsOf = (k: Card): { value: string; label: string }[] => {
    if (k.key === "channels") {
      const s = srcCh ?? 2, cap = c.id === "ac3" ? 6 : 8;
      const first = { value: "src", label: s > cap ? `ตามต้นฉบับ (${chName(s)} ลดเป็น ${chName(cap)})` : `ตามต้นฉบับ (${chName(s)})` };
      return [first, ...[6, 2, 1].filter((n) => n < Math.min(s, cap)).map((n) => ({ value: String(n), label: `ลดเป็น ${chName(n)}` }))];
    }
    if (k.key === "rate") {
      const r = t.rate ?? 48000;
      return [{ value: "src", label: `ตามต้นฉบับ (${r / 1000} kHz)` }, ...[48000, 44100].filter((x) => x !== r).map((x) => ({ value: String(x), label: `${x / 1000} kHz` }))];
    }
    return (k.opts ?? []).map((o) => ({ value: optVal(o), label: optLabel(o) }));
  };

  const shown = cardsFor(c.id, engUse, vals);
  /** ค่าที่ใช้จริงของการ์ดที่แสดงอยู่ · ค่าที่ไม่อยู่ในตัวเลือกกลับเป็นค่าตั้งต้น · การ์ดที่ตัวแปลงนี้ไม่มี ไม่ส่งไปฝั่ง Rust */
  const live: Vals = {};
  for (const k of shown) live[k.key] = cardValue(k, vals, k.kind === "step" ? undefined : optsOf(k).map((o) => [o.value, o.label] as [string, string]));
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
  const warn = !t.codec ? null : !srcLossless && !c.lossless ? `แปลงแบบเสียคุณภาพซ้อน ${srcFt} เป็น ${c.name} เสียงต่างจากต้นฉบับมากขึ้นอีกนิด`
    : !srcLossless && c.lossless ? `${srcFt} เป็นแบบเสียคุณภาพอยู่แล้ว แปลงเป็น ${c.name} ไฟล์ใหญ่ขึ้น คุณภาพไม่กลับมา` : null;
  const name = `${t.name || ""} ${c.name}`.trim();
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

  const speedOpts = [{ value: "", label: "ไม่เปลี่ยน" }, { value: "25>23.976", label: "25 → 23.976 (แผ่นยุโรป PAL)" }, { value: "24>23.976", label: "24 → 23.976" },
    { value: "23.976>25", label: "23.976 → 25" }, { value: "23.976>24", label: "23.976 → 24" }];
  // ระดับเสียงหลังเปลี่ยนความเร็ว (ผู้ช่วยตรวจขั้น 10 ข้อ 29 · พี่กันเคาะ 8 พ.ย. 2569 ให้มีให้เลือก ค่าตั้งต้นคืนระดับเสียง)
  const speedNote = speed && (
    <div data-pitch-box>
      <div className="small ilbl" style={{ marginBottom: 4 }}><b style={{ color: "var(--txt2)" }}>ระดับเสียงหลังเปลี่ยนความเร็ว</b><InfoTip title="ระดับเสียงหลังเปลี่ยนความเร็ว" tip={TIPS.pitch} /></div>
      <div style={{ display: "flex" }}><Seg small label="ระดับเสียงหลังเปลี่ยนความเร็ว" value={keepPitch ? "keep" : "restore"} onChange={(v) => setKeepPitch(v === "keep")}
        options={[{ value: "restore", label: "คืนระดับเสียงเดิม (แนะนำ)" }, { value: "keep", label: "คงระดับเสียงแบบในไฟล์" }]} /></div>
      <div className="small" style={{ marginTop: 4 }} data-pitch-note><Phr>{`${keepPitch
        ? "ยืดเวลาอย่างเดียว ระดับเสียงเท่าในไฟล์ · ใช้กับแผ่นที่สตูดิโอแก้ระดับเสียงมาแล้ว"
        : "เล่นช้าลงหรือเร็วขึ้นแบบหมุนแผ่น ระดับเสียงกลับเป็นแบบเดิมก่อนทำแผ่น · แผ่น PAL ส่วนใหญ่ต้องใช้แบบนี้"} · ความยาวเปลี่ยนจาก ${t.duration ? Math.round(t.duration) : "?"} เป็นราว ${t.duration ? Math.round(t.duration * Number(speed.split(">")[0]) / Number(speed.split(">")[1])) : "?"} วินาที`}</Phr></div>
    </div>
  );
  const gainCard: Card = { key: "gain", label: "Gain", kind: "step", def: 0, stops: Array.from({ length: 25 }, (_, i) => i - 12), unit: "dB", signed: true, major: [-12, -9, -6, -3, 0, 3, 6, 9, 12], note: "เพิ่มลดความดังทีละ 1 dB · ใช้กับทุกชนิด", tip: TIPS.gain };
  const exTop = abbrer();

  return (
    <Dialog open onClose={p.onClose} width={900} height="min(680px, calc(100vh - 48px))" title={<span>ตั้งค่าแปลงเสียง · <span style={{ overflowWrap: "anywhere" }}>{p.title ?? (t.inMovie ? (t.name || "เสียงในหนัง") : baseName(t.src))}</span></span>}
      actions={<>
        <span className="small" style={{ marginRight: "auto", alignSelf: "center" }}>ค่าที่กดใช้จำไว้เป็นค่าตั้งต้นของชนิดนี้ครั้งหน้า · ขนาดเป็นค่าประมาณ ของจริงขึ้นกับเสียงในแทร็ก</span>
        {t.convert && <button type="button" className="btn btn-ghost btn-sm" onClick={() => p.onApply(null, pair, "")} data-conv-off>ไม่แปลง</button>}
        <button type="button" className="btn btn-ghost btn-sm" onClick={p.onClose}>ยกเลิก</button>
        <button type="button" className={"btn btn-sm " + (blocked ? "btn-wait" : "btn-main")} aria-disabled={!!blocked || undefined} title={blocked ?? undefined} onClick={apply} data-conv-use>ใช้ค่านี้</button>
      </>}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, flex: "1 0 auto" }} data-codec-panel data-tab={tab}>
        {t.codec && <div className="small">ต้นทาง <b style={{ color: "var(--txt2)" }}>{srcFt}</b>{t.channels ? ` · ${t.channels} ช่อง` : ""}{t.rate ? ` · ${t.rate / 1000} kHz` : ""}{t.bits && srcLossless ? ` · ${t.bits}-bit` : ""}{t.duration ? ` · ${Math.round(t.duration / 60)} นาที` : ""}</div>}
        <div className="cp2">
          <div><div className="small ilbl" style={{ marginBottom: 4 }}><b style={{ color: "var(--txt2)" }}>Lossy</b>&nbsp;(เสียคุณภาพ ไฟล์เล็ก)<InfoTip title="Lossy" tip={TIPS.lossy} /></div>
            <Seg small label="ชนิดแบบเสียคุณภาพ" value={c.lossless ? ("" as Codec["id"]) : c.id} onChange={pickCodec} options={CODECS.filter((x) => !x.lossless).map((x) => ({ value: x.id, label: x.name }))} /></div>
          <div><div className="small ilbl" style={{ marginBottom: 4 }}><b style={{ color: "var(--txt2)" }}>Lossless</b>&nbsp;(ไม่เสียคุณภาพ)<InfoTip title="Lossless" tip={TIPS.lossless} /></div>
            <Seg small label="ชนิดแบบไม่เสียคุณภาพ" value={c.lossless ? c.id : ("" as Codec["id"])} onChange={pickCodec} options={CODECS.filter((x) => x.lossless && (!x.only || p.convertPage)).map((x) => ({ value: x.id, label: x.name }))} /></div>
        </div>
        <div className="small ilbl" style={{ display: "block" }}><b style={{ color: "var(--txt)" }}>{c.name}</b> <span className="ab">({c.full})</span><InfoTip title={c.name} tip={ADV[c.id].tip} /> · <Phr>{`${c.why} · ${c.ch}${c.only ? " · ใส่ไฟล์หนังไม่ได้ ใช้เฉพาะหน้าแปลงเสียง" : c.mp4 ? "" : " · ใส่ MP4 ไม่ได้"}`}</Phr></div>
        <div className="cp2">
          <div><div className="small ilbl" style={{ marginBottom: 4 }}><b style={{ color: "var(--txt2)" }}>Encoder</b>&nbsp;(ตัวแปลง)<InfoTip title="Encoder" tip={TIPS.engine} /></div>
            <Seg small label="ตัวแปลง" value={engUse} onChange={(v) => { if (engs.find((e) => e.value === v)?.ok) setEng(v); }}
              options={engs.map((e) => ({ value: e.value, label: e.ok ? e.label : `${e.label} (ยังไม่ได้ใส่)` }))} /></div>
          <div><div className="cphead"><span className="small ilbl"><b style={{ color: "var(--txt2)" }}>แบบตั้งค่า</b><InfoTip title="แบบง่ายกับขั้นสูง" tip={TIPS.mode} /></span>
              <span className="small" data-headsz>ขนาดที่คาดของแทร็กนี้ <b style={{ color: "var(--txt)" }}>{headBytes ? `ราว ${fmtSize(headBytes)}` : "ไม่รู้ความยาวแทร็ก"}</b>
                {c.id === "aac" && ctx ? ` · เฉลี่ยราว ${Math.round(aacKbps(live, engUse, ctx.ch))} kbps` : ""}</span></div>
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
          <div className="small">{pi < 0 ? "ค่าที่แก้ในขั้นสูงยังไม่ตรงกับชุดไหน กดชุดค่าเพื่อกลับไปใช้ชุดนั้น · " : ""}ชุดค่าตั้งจากค่าที่ผู้ทำตัวแปลงแนะนำ · กด ขั้นสูง เพื่อดูหรือแก้ทุกตัวเลือกของชุดที่เลือก</div>
          <div className="cp3" data-extra>
            <div><div className="small ilbl" style={{ marginBottom: 4 }}><b style={{ color: "var(--txt2)" }}>ความเร็วเสียง</b>&nbsp;· เสียงที่เหลื่อมเพิ่มขึ้นเรื่อย ๆ<InfoTip title="ความเร็วเสียง" tip={TIPS.speed} /></div>
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
          {c.id === "wv" && <div className="small">{exTop("WavPack แบบ Hybrid ได้สองไฟล์ (.wv กับไฟล์แก้ .wvc) ใส่ในไฟล์หนังได้แค่ไฟล์แรก จึงไม่มีในหน้านี้ · ใช้ได้ในหน้าแปลงเสียง")}</div>}
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
              <div className="small" style={{ margin: 0 }}>{abbrer()("ปรับความดังตามมาตรฐาน EBU R128 ให้ได้ −23 LUFS ทุกแทร็กดังพอ ๆ กัน · ใช้กับทุกชนิด")}</div>
            </div>
            <div className="acard" data-card="speed" style={{ gridColumn: "span 4" }}>
              <div className="ach"><span className="lbl ilbl">ความเร็วเสียง<InfoTip title="ความเร็วเสียง" tip={TIPS.speed} /></span></div>
              <div style={{ display: "flex" }}><Dropdown label="ความเร็วเสียง" value={speed} onChange={setSpeed} options={speedOpts} /></div>
              <div className="asz"><span>ขนาดไฟล์</span><div>ยาวขึ้นหรือสั้นลงตามความเร็ว ขนาดเปลี่ยนตาม</div></div>
              <div className="small" style={{ margin: 0 }}>{abbrer()("เสียงที่เหลื่อมเพิ่มขึ้นเรื่อย ๆ จากต้นเรื่องถึงท้ายเรื่อง · เลือกคืนหรือคงระดับเสียงได้ข้างล่าง")}</div>
            </div>
          </div>
        </>)}
        {speedNote}
        {t.inMovie && (
          <div><div className="small" style={{ marginBottom: 4 }}><b style={{ color: "var(--txt2)" }}>แทร็กที่อยู่ในหนังแล้ว · แปลงแล้วจะ</b></div>
            <div style={{ display: "flex" }}><Seg small label="แปลงแล้วจะ" value={pair ? "pair" : "replace"} onChange={(v) => setPair(v === "pair")}
              options={[{ value: "pair", label: <><IcPlus size={14} />เพิ่มคู่กับแทร็กเดิม</> }, { value: "replace", label: <><IbSwap size={14} />แทนที่แทร็กเดิม</> }]} /></div>
            <div className="small" style={{ marginTop: 4 }}>{pair ? `แทร็กใหม่ชื่อ ${name} ต่อท้ายแทร็กเดิม แทร็กเดิมอยู่ครบ` : "แทร็กเดิมถูกแทนที่ด้วยแทร็กที่แปลง"}</div></div>
        )}
        {missingNative && <div className="stat warn" data-native-missing><CardIcon kind="warn" /><div><b>{c.name} ยังใช้ไม่ได้</b><Phr>{missingNative}</Phr></div></div>}
        {warn && <div className="stat warn"><CardIcon kind="warn" /><div><Phr>{warn}</Phr> · <Phr>ไม่ห้าม แค่บอก</Phr></div></div>}
        {/* กล่องคำสั่งยืดรับที่เหลือของหน้าต่าง ไม่ให้เหลือที่ว่างล่าง */}
        <div style={{ display: "flex", flexDirection: "column", flex: "1 1 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <span className="small ilbl"><b style={{ color: "var(--txt2)" }}>คำสั่งที่จะรัน</b>&nbsp;· Command line<InfoTip title="Command line" tip={TIPS.cmd} /></span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { if (plan) navigator.clipboard?.writeText(plan.text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {}); }} data-copy><IcCopy size={14} />{copied ? "คัดลอกแล้ว" : "คัดลอก"}</button>
          </div>
          <pre data-cmd style={{ flex: 1, minHeight: 40, margin: 0, whiteSpace: "pre-wrap", overflowWrap: "break-word", fontFamily: "var(--mono)", fontSize: 12, lineHeight: 1.55, background: "#fff", border: "1px solid var(--line)", borderRadius: 8, padding: "8px 10px", userSelect: "text", color: "var(--txt)" }}>
            {planErr ?? (plan
              // ตัดบรรทัดเฉพาะตรงเว้นวรรค · เดิมตัดหลังขีด -i กลายเป็นสองบรรทัด อ่านผิดคำสั่ง (เจอตอนตรวจภาพ) · คัดลอกใช้ plan.text ตรงตัว
              ? plan.text.split("\n").map((line, li) => <span key={li}>{li > 0 && <br />}{line.split(" ").map((w, wi) => <span key={wi}>{wi > 0 ? " " : ""}<span style={{ whiteSpace: "nowrap" }}>{w}</span></span>)}</span>)
              : "…")}</pre>
          {plan && <div className="small" style={{ marginTop: 4 }}>{plan.note}</div>}
        </div>
      </div>
    </Dialog>
  );
}
