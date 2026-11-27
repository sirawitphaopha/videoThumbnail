/* ค่าที่เลือกในแผงตั้งค่าเสียง ชนิด ตัวแปลง ชุดค่า การ์ด ความเร็ว Gain และค่าที่ส่งฝั่ง Rust
   แยกจาก CodecPanel.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 9) เนื้อโค้ดยกมาทั้งก้อน */
import { useMemo, useState } from "react";
import { type EncodePlan, type EncodeSpec, type EncoderInfo, type MergeTrack } from "../../lib/api";
import { codecOf, type Codec } from "../../lib/codecs";
import { cardValue, cardsFor, engVals, optLabel, optVal, type Card, type Vals } from "../../lib/codecAdv";
import { SPEC_KEYS, engines, presetVals, matchPreset, loadLast, valsOf, chName } from "./codecCalc";

export type CpProps = {
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
};

export function useCodecVals(p: CpProps) {
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
  // ค่าตามที่ตัวแปลงนี้ใช้จริง โหมดของการ์ดกับการ์ดที่แสดงมาจากค่าชุดเดียวกัน (AUDIT ข้อ 16)
  const ev = engVals(c.id, engUse, vals);
  /** ค่าที่ใช้จริงของการ์ดที่แสดงอยู่ · ค่าที่ไม่อยู่ในตัวเลือกกลับเป็นค่าตั้งต้น · การ์ดที่ตัวแปลงนี้ไม่มี ไม่ส่งไปฝั่ง Rust */
  const live: Vals = {};
  for (const k of shown) live[k.key] = cardValue(k, ev, k.kind === "step" ? undefined : optsOf(k).filter((o) => !o.off).map((o) => [o.value, o.label] as [string, string]));
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

  const speedOpts = [{ value: "", label: "ไม่เปลี่ยน" }, { value: "25>23.976", label: "25 → 23.976 (แผ่นยุโรป PAL)" }, { value: "24>23.976", label: "24 → 23.976" },
    { value: "23.976>25", label: "23.976 → 25" }, { value: "23.976>24", label: "23.976 → 24" }];
  return { t, srcCh, init, cid, setCid, c, engs, firstOk, eng, setEng, noEng, setNoEng, vals, setVals, pi, setPi, tab, setTab, pair, setPair, plan, setPlan, planErr, setPlanErr, copied, setCopied, gain, setGain, loud, setLoud, speed, setSpeed, keepPitch, setKeepPitch, pickCodec, pickPreset, setVal, engUse, missingNative, blocked, coreAudio, caBad, qaacCbrOff, optsOf, shown, live, has, numOr, liveKey, spec, speedOpts, p };
}
