/* ข้อมูลของมุมมองความถี่เฉลี่ย ชุดเส้น จุดยอด เสียงฮัม ผลตรวจ ช่วงแกน
   แยกจาก PsdView.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 7) เนื้อโค้ดยกมาทั้งก้อน */
import { useEffect, useMemo, useState } from "react";
import { CMP, OVER, label, minus } from "./common";
import { useGrab, useRise, useVRange, vWindow } from "./parts";
import { LOSSLESS_CODECS } from "./SpekView";
import { PSM, cubicAt } from "./psdShared";
import { type GOverview, type GPsd } from "../../lib/api";
import { useToast } from "../../components/Toasts";
import { Theme } from "./common";
import { CommonProps } from "./LoudView";

export type PsdProps = CommonProps & { codec: string; filePath: string; onReset: () => void; resetN: number; psd: GPsd | null; names: string[]; psdCh: string; setPsdCh: (v: string) => void; psdLog: boolean; setPsdLog: (b: boolean) => void; psdSize: number; setPsdSize: (n: number) => void; th: Theme; ov: GOverview; t0: number; t1: number; zoomBox: React.ReactNode; onPick: (t: number) => void; f: number | null; setF: (f: number | null) => void; fileName: string; toast: ReturnType<typeof useToast>; };

export function usePsdData(p: PsdProps) {
  const { codec, filePath, onReset, resetN, scroller, psd, names, psdCh, setPsdCh, psdLog, setPsdLog, psdSize, setPsdSize, th, ov, t0, t1, zoomBox, onPick, f, setF, fileName, save, exportRef, plotRef, toast } = p;
  const nyq = (psd?.rate ?? 48000) / 2;
  type Series = { d: number[]; key: string; color: string; name: string; long: string };
  const series = useMemo((): Series[] => {
    if (!psd) return [];
    // ซ้อนทุกช่อง สีตามตำแหน่งช่องในแทร็ก (ซ้ายฟ้า ขวาส้ม กลางเขียวน้ำทะเล ตรงกับแบบซ้อนเทียบ) · แทร็กสองช่องมีเส้นกลางกับเส้นข้างท้าย
    if (psdCh === "all") return psd.db.map((d, i) => {
      if (i < names.length) { const l = label(names, names[i]); return { d, key: names[i], color: OVER[i % OVER.length], name: l.code, long: `${l.code} ${l.th}` }; }
      return i === names.length ? { d, key: "M", color: OVER[2], name: "M", long: "M กลาง ซ้าย+ขวา" } : { d, key: "S", color: OVER[3], name: "S", long: "S ข้าง ซ้าย−ขวา" };
    });
    return psd.db.map((d, i) => {
      const name = psd.db.length > 1 ? (i === 0 ? "ซ้าย" : "ขวา") : psdCh === "mix" ? (names.length === 1 ? "เสียงเดียว" : "รวมทุกช่อง") : label(names, psdCh).th;
      return { d, key: String(i), color: psd.db.length > 1 ? (i === 0 ? CMP.FL : CMP.FR) : th.rms, name, long: name };
    });
  }, [psd, th, psdCh, names]);
  /** เส้นที่กดซ่อนจากป้ายใต้กราฟ · เปลี่ยนแบบแล้วแสดงครบทุกเส้น · ต้องเหลืออย่างน้อยหนึ่งเส้น */
  const [off, setOff] = useState<string[]>([]);
  useEffect(() => setOff([]), [psdCh]);
  const shown = series.filter((s) => !off.includes(s.key));
  const fOf = (i: number) => i * (psd?.rate ?? 48000) / (psd?.size ?? 4096);
  // ยอดแคบ · ตำแหน่งจริงระหว่างช่องความถี่คิดจากพาราโบลาผ่าน 3 ช่อง (ช่องละ 11.7 Hz ที่ 4096 · 50 Hz ตกที่ช่อง 46.9 Hz ถ้าไม่คิดตรงนี้ เจอตอนเทส 7 พ.ย. 2569)
  // ตรวจเสียงหึ่ง ขอบบน DC จากค่ามากสุดของทุกเส้นในแบบที่เลือก เดิมดูแค่เส้นแรก (FL หรือซ้าย) หึ่งเฉพาะช่องกลางไม่เจอ (AUDIT ข้อ 103)
  const dTop = useMemo(() => (!psd ? [] : psd.db.length === 1 ? psd.db[0] : psd.db[0].map((_, i) => Math.max(...psd.db.map((d) => d[i])))), [psd]);
  const peaks = useMemo(() => {
    if (!psd) return [] as [number, number][];
    const d = dTop, out: [number, number][] = [];
    for (let i = 2; i < d.length - 3; i++) {
      // ยอดที่เบากว่า −100 dB เป็นแค่เสียงรบกวนใต้พื้นกราฟ ไม่นับ (กล่องชี้เคยบอกยอดใกล้สุด −124 dB เจอตอนเทส)
      if (!(d[i] > -100 && d[i] > d[i - 1] && d[i] >= d[i + 1] && d[i] - Math.min(d[Math.max(0, i - 3)], d[i + 3]) > 8)) continue;
      const a = d[i - 1], b = d[i], c = d[i + 1], den = a - 2 * b + c, p = den ? 0.5 * (a - c) / den : 0;
      out.push([fOf(i + Math.max(-0.5, Math.min(0.5, p))), b]);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [psd]);
  /** เสียงฮัมจากไฟบ้าน 50 Hz ของไทยกับเลขคูณ · 60 Hz ของไฟล์จากต่างประเทศ
      ต้องเจอยอดแคบในตระกูลเดียวกันอย่างน้อย 2 ยอด (เช่น 50 กับ 100) · คลาดได้ 3% หรือ 0.3 ช่องความถี่
      (เดิมยอดเดียวก็เตือน คลาดได้ 0.75 ช่อง เพลงจริง 96 kHz ช่องละ 23 Hz โน้ตเบสใกล้ 60 Hz เลยโดนเตือนว่าเป็นเสียงฮัม เจอตอนตรวจภาพ 7 พ.ย. 2569) */
  const hum = useMemo(() => {
    for (const base of [50, 60]) {
      const fam = [1, 2, 3, 4, 5, 6, 7].map((k) => base * k);
      const hit = peaks.flatMap(([fr, d]) => { const h = fam.find((x) => Math.abs(fr - x) < Math.max(x * 0.03, fOf(0.3))); return d > -70 && fr < 400 && h ? [[fr, d, h] as const] : []; });
      if (new Set(hit.map((x) => x[2])).size >= 2) return hit;
    }
    return [] as (readonly [number, number, number])[];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peaks]);
  const topF = useMemo(() => { if (!psd) return 0; const d = dTop; for (let i = d.length - 1; i > 0; i--) if (d[i] > -90) return fOf(i); return 0; /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [psd]);
  /** ตรวจเพิ่มจากข้อมูลที่กราฟคิดแล้ว ไม่โหลดอะไรใหม่ · ทุกข้อบอกว่าน่าสงสัย */
  const checks = useMemo(() => {
    const out: { k: string; warn: boolean; b: string; d?: string; title: string; tip: string }[] = [];
    if (!psd) return out;
    const rate = psd.rate, binHz = psd.rate / psd.size, d = dTop, at = (fr: number) => d[Math.max(0, Math.min(d.length - 1, Math.round(fr / binHz)))];
    const avg = (f0: number, f1: number) => { const i0 = Math.max(0, Math.floor(f0 / binHz)), i1 = Math.min(d.length - 1, Math.ceil(f1 / binHz)); let sum = 0, n = 0; for (let i = i0; i <= i1; i++) { sum += d[i]; n++; } return n ? sum / n : -150; };
    if (hum.length) out.push({ k: "hum", warn: true, b: `เสียงหึ่งจากไฟบ้าน (hum) ยอดแคบที่ ${[...new Set(hum.map((x) => x[2]))].sort((a, b) => a - b).join(" ")} Hz`, d: "มักมาจากสายไมค์หรือปลั๊กพ่วง แต่ในหนังอาจเป็นเสียงประกอบที่ตั้งใจใส่", title: "เสียงหึ่งจากไฟบ้าน", tip: "ไฟบ้านในไทยสั่น 50 ครั้งต่อวินาที (50 Hz) ถ้าสายเสียงรับไฟฟ้าเข้ามา จะได้เสียงหึ่งต่ำ ๆ เป็นยอดแคบที่ 50 100 และ 150 Hz ไฟล์จากอเมริกาและญี่ปุ่นบางส่วนเป็น 60 Hz และไม่ใช่เสียงคนฮัมเพลง" });
    // ขอบบนของเสียง เสียงสูงหายดิ่งเป็นเส้นตรง
    const top = topF, below = avg(top - 1500, top - 300), above = top + 1500 < nyq ? avg(top + 300, top + 1500) : -150, cliff = top > 1000 && top < nyq * 0.92 && below - above > 25;
    // อัปแซมเปิล ดูว่าเหนือ 25 kHz เงียบสนิทไหม ไม่ดูความดิ่ง เพราะตัวแปลงอัตราสุ่มทำให้เสียงค่อย ๆ จางจาก 20 ถึง 24 kHz (ลองกับไฟล์ที่แปลง 44.1 เป็น 96 kHz ด้วย ffmpeg เหนือ 24 kHz อยู่ที่ −140 dB)
    const hiBand = rate >= 88200 ? avg(25000, Math.min(40000, nyq * 0.9)) : 0, upsampled = rate >= 88200 && hiBand < -125 && avg(8000, 16000) > -105;
    if (upsampled) out.push({ k: "upsample", warn: true, b: `อาจเป็นไฟล์อัปแซมเปิล ไฟล์ ${(rate / 1000).toFixed(1)} kHz แต่ไม่มีเสียงเหนือ ${(top / 1000).toFixed(1)} kHz`, d: "น่าจะแปลงมาจากไฟล์ 44.1 หรือ 48 kHz ไม่ได้ละเอียดจริงตามตัวเลข", title: "อัปแซมเปิล", tip: "ไฟล์ความละเอียดสูง (88.2 ถึง 192 kHz) ที่ทำมาจริงมีเสียงเหนือ 22 kHz บ้าง ถ้าเสียงหยุดดิ่งที่ราว 22 ถึง 24 kHz พอดี มักเป็นไฟล์ 44.1 หรือ 48 kHz ที่แปลงตัวเลขให้สูงขึ้น ขนาดไฟล์ใหญ่ขึ้นแต่เสียงไม่ได้ดีขึ้น แต่เพลงบางเพลงก็ไม่มีเสียงสูงจริง จึงควรดูประกอบกับกราฟความถี่" });
    // เตือนไฟล์ไม่ลดคุณภาพปลอมเฉพาะชนิดไม่ลดคุณภาพ · MP3 AAC AC-3 ขอบบนตัดเป็นหน้าผาเป็นเรื่องปกติของชนิดนั้น
    // เดิมไม่รู้ชนิดเสียง เตือนไฟล์ MP3 AAC AC-3 ทุกไฟล์ และขัดกับหน้าความถี่ (AUDIT 12 พ.ย. 2569 ข้อ 21)
    else if (cliff && top >= 15000 && top <= 20600 && LOSSLESS_CODECS.includes(codec)) out.push({ k: "lossy", warn: true, b: `อาจเคยเป็น MP3 หรือ AAC มาก่อน เสียงสูงถูกตัดเป็นเส้นตรงที่ราว ${(top / 1000).toFixed(1)} kHz`, d: "ไฟล์ไม่ลดคุณภาพที่ทำจากต้นฉบับจริงไม่ควรถูกตัดดิ่งที่ 16 19 หรือ 20 kHz", title: "ไฟล์ไม่ลดคุณภาพปลอม", tip: "MP3 และ AAC ตัดเสียงสูงทิ้งเป็นเส้นตรงที่ราว 16 kHz เมื่อใช้ 128 kb/s และราว 19 ถึง 20 kHz เมื่อใช้ 320 kb/s ถ้าไฟล์ FLAC WAV หรือไฟล์ไม่ลดคุณภาพแบบอื่นมีรอยตัดแบบนี้ มักแปลงมาจาก MP3 หรือ AAC อีกที คุณภาพจึงไม่เกินต้นทาง ส่วนเสียงที่ค่อย ๆ จางลงตามธรรมชาติไม่นับ" });
    // เกือบโมโน ดูได้เมื่อมีเส้น S (โหมดซ้อนทุกช่องของไฟล์สองช่อง)
    const iM = series.findIndex((sr) => sr.key === "M"), iS = series.findIndex((sr) => sr.key === "S");
    if (iM >= 0 && iS >= 0) {
      const m = series[iM].d, sd = series[iS].d; let dm = 0, n = 0;
      for (let i = Math.round(100 / binHz); i < Math.min(m.length, Math.round(10000 / binHz)); i++) { dm += sd[i] - m[i]; n++; }
      const gap = n ? dm / n : 0;
      if (gap < -30) out.push({ k: "mono", warn: true, b: `เกือบเป็นโมโน เสียงข้าง (S) เบากว่าเสียงกลาง (M) ราว ${Math.round(-gap)} dB`, d: "ซ้ายกับขวาแทบเหมือนกัน อาจเป็นเสียงโมโนที่ทำเป็นสองช่อง", title: "เกือบเป็นโมโน", tip: "S คือส่วนที่ซ้ายกับขวาต่างกัน ถ้า S เบากว่า M เกิน 30 dB ทั้งย่าน แปลว่าสองช่องแทบเหมือนกัน ฟังแล้วเสียงไม่กว้าง มักเป็นไฟล์โมโนที่คัดลอกเป็นสองช่อง ดูข้อนี้ได้ในโหมดซ้อนทุกช่อง" });
    }
    // DC offset พลังงานกองที่ 0 Hz
    const dc = d[0], low = avg(20, 200);
    if (dc > -60 && dc - low > 15) out.push({ k: "dc", warn: true, b: `อาจมี DC offset พลังงานกองที่ 0 Hz (${minus(dc.toFixed(0))} dB)`, d: "คลื่นเสียงทั้งเส้นเยื้องจากศูนย์ อาจทำให้มีเสียงป๊อกตอนเริ่มหรือตัดต่อ", title: "DC offset", tip: "คลื่นเสียงปกติแกว่งรอบศูนย์ ถ้าทั้งเส้นเยื้องขึ้นหรือลง (DC offset) จะเห็นพลังงานสูงที่ 0 Hz มักมาจากอุปกรณ์อัดเสียงที่ปรับไม่ดี และแก้ได้ด้วยตัวกรองตัดความถี่ต่ำมาก" });
    // ไม่พบอะไร เหลือบรรทัดสั้นบรรทัดเดียว รายละเอียดอยู่ใน ⓘ (พี่กันทัก "กินที่จัง ที่บอกไม่มีอะไร่นาสงสัย")
    if (!out.length) out.push({ k: "ok", warn: false, b: "ไม่พบอะไรน่าสงสัย", title: "สิ่งที่ตรวจ", tip: (iS >= 0 ? "" : "เรื่องเกือบเป็นโมโนดูได้ในโหมดซ้อนทุกช่อง ") + "ตรวจจากกราฟความถี่เฉลี่ยของช่วงที่เลือก 5 อย่าง ได้แก่ เสียงหึ่งจากไฟบ้าน ไฟล์ไม่ลดคุณภาพปลอม อัปแซมเปิล เกือบเป็นโมโน และ DC offset ทุกข้อเป็นแค่สิ่งที่น่าสงสัย ไม่ได้ตัดสินเด็ดขาด" });
    void at;
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [psd, hum, series]);
  // ซูมแกนนอน (แกนความถี่) hr.z เท่า ขอบซ้ายของช่วงที่เห็น hr.b เป็นสัดส่วนบนแกน (พี่กันถาม 9 พ.ย. 2569 "แล้วซูมแนวนอนหายไปไหน")
  const hr = useVRange(resetN);
  const uOf = (fr: number) => (psdLog ? (Math.log10(Math.max(fr, 20)) - Math.log10(20)) / (Math.log10(nyq) - Math.log10(20)) : fr / nyq);
  const X = (fr: number, w: number) => PSM.L + (uOf(fr) - hr.b) * hr.z * (w - PSM.L - PSM.R);
  /* หน้าตาแบบ Audacity (พี่กันส่งภาพหน้าต่าง Frequency Analysis ของ Audacity มา 7 พ.ย. 2569 *"กราฟมันยังไม่เหมือนใน audicity เลย"*)
     ระบายทึบสีเดียวใต้เส้น · แกน dB ปรับตามเสียงจริง ขีดทุก 6 dB · เส้นตารางถี่ทุกหลัก (20 30 40 … 100 200 300 …) เปิดปิดได้
     ช่วง dB เลือกได้ (แทนแถบซูมแนวตั้งของ Audacity) · บอกค่าที่ชี้กับยอดใกล้สุดในช่องใต้กราฟ วงกลมที่ยอด */
  const [grids, setGrids] = useState(true);
  // สีทึบใต้เส้น ใช้กับทุกโหมด ค่าตั้งต้นปิด (แคลร์ตั้ง หลายเส้นซ้อนแล้วสีขุ่น) · BUGS ข้อ 20 พี่กัน "ให้มีตัวเลือกในนี้เลยว่าจะเเสดงสีทึบไหม"
  const [fill, setFillRaw] = useState(() => { try { return localStorage.getItem("graph-psd-fill") === "1"; } catch { return false; } });
  const setFill = (v: boolean) => { setFillRaw(v); try { localStorage.setItem("graph-psd-fill", v ? "1" : "0"); } catch { /* เก็บไม่ได้ ใช้ค่าในหน้าไปก่อน */ } };
  const [range, setRange] = useState(90);
  const start = psdLog ? Math.max(1, Math.ceil(20 / fOf(1))) : 0;
  const vr = useVRange(resetN);
  const fullTop = useMemo(() => {
    if (!psd) return 0;
    let m = -150; for (const d of psd.db) for (let i = start; i < d.length; i++) m = Math.max(m, d[i]);
    return Math.min(0, Math.ceil(m / 6) * 6);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [psd, start]);
  const { lo, hi: top } = vWindow(fullTop - range, fullTop, vr);
  // กราฟค่อย ๆ โตจากพื้นขึ้นมา ไม่แวบมา (พี่กันสั่ง 9 พ.ย. 2569 "ตอนแสดงเราอยากให้มันมีอนิเมชันตอนแสดง ไม่ใช่แวบมา")
  const rise = useRise(psd);
  const grab = useGrab({ canX: hr.z > 1, canY: vr.z > 1, span: 1 / hr.z, center: hr.b + 0.5 / hr.z, onX: (c) => hr.setB(hr.clampB(c - 0.5 / hr.z, hr.z)), z: vr.z, b: vr.b, left: PSM.L, right: PSM.R, top: PSM.T, bottom: PSM.B, onY: (b) => vr.setB(vr.clampB(b, vr.z)) });
  /* ค่าที่วาดต่อจุดภาพ ใช้หลักเดียวกับ Audacity (อ่านจาก au3-fft/SpectrumAnalyst.cpp GetProcessedValue · เขียนเอง ไม่ได้คัดลอก Audacity ใช้ GPL)
     จุดภาพแคบกว่าหนึ่งช่องความถี่ (เสียงต่ำบนแกนล็อก) ลากเส้นโค้งผ่าน 4 ช่องข้างเคียง เส้นจึงเนียน ไม่เป็นหยักตรง ๆ แบบเดิม
     จุดภาพครอบหลายช่อง ใช้ค่าเฉลี่ยถ่วงตามส่วนที่ครอบ */
  const binHz = (psd?.rate ?? 48000) / (psd?.size ?? 4096);
  const valRange = (d: number[], f0: number, f1: number) => {
    let b0 = f0 / binHz, b1 = f1 / binHz;
    if (b1 - b0 < 1) {
      const mid = (b0 + b1) / 2, i = Math.max(0, Math.min(d.length - 4, Math.floor(mid) - 1));
      return cubicAt(d[i], d[i + 1], d[i + 2], d[i + 3], mid - i);
    }
    b0 = Math.max(0, b0); b1 = Math.min(d.length - 1, b1);
    let s = 0, i0 = Math.floor(b0), i1 = Math.floor(b1);
    if (i1 > i0) { s += d[i0] * (i0 + 1 - b0); for (let i = i0 + 1; i < i1; i++) s += d[i]; s += d[i1] * (b1 - i1); } else s = d[i0] * (b1 - b0);
    return s / Math.max(1e-9, b1 - b0);
  };
  const fAt = (x: number, PW: number) => { const u = hr.b + x / PW / hr.z; return psdLog ? 20 * Math.pow(nyq / 20, u) : Math.max(0, u * nyq); };
  /** ยอดทุกยอดย่อยแบบ Audacity (FindPeak) ใช้กับช่องยอดใกล้สุด · ตำแหน่งจริงคิดด้วยพาราโบลาผ่าน 3 ช่อง
      (เส้นโค้งผ่าน 4 ช่องแบบ Audacity เลื่อนยอดฮัม 50 Hz ไปเป็น 51 Hz เจอตอนตรวจภาพ · พาราโบลาบนค่า dB ของหน้าต่าง Hann ได้ 50 Hz) */
  const allPeaks = useMemo(() => {
    if (!psd) return [] as [number, number][];
    const d = psd.db[0], out: [number, number][] = [];
    for (let b = 1; b < d.length - 1; b++) {
      if (!(d[b] > d[b - 1] && d[b] >= d[b + 1]) || d[b] < -100) continue;
      const a = d[b - 1], c = d[b + 1], den = a - 2 * d[b] + c, p = den ? Math.max(-0.5, Math.min(0.5, 0.5 * (a - c) / den)) : 0;
      out.push([(b + p) * binHz, d[b] - 0.25 * (a - c) * p]);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [psd]);
  const Yof = (d: number, h: number) => PSM.T + (top - Math.max(lo, Math.min(top, d))) / (top - lo) * (h - PSM.T - PSM.B);
  return { nyq, series, off, setOff, shown, fOf, peaks, hum, topF, checks, hr, uOf, X, grids, setGrids, fill, setFillRaw, setFill, range, setRange, start, vr, fullTop, lo, top, rise, grab, binHz, valRange, fAt, allPeaks, Yof, codec, filePath, onReset, resetN, scroller, psd, names, psdCh, setPsdCh, psdLog, setPsdLog, psdSize, setPsdSize, th, ov, t0, t1, zoomBox, onPick, f, setF, fileName, save, exportRef, plotRef, toast };
}
