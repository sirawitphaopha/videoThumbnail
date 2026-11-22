/* หน้ากราฟเสียง มุมมองความถี่เฉลี่ย (PsdView) · ช่องซ้ายขวากลาง ความดังตามความถี่ คำอธิบาย Mid Side
   แยกจาก GraphPage.tsx ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 · แผนแบ่งไฟล์ขั้น 1.8) ย้ายมาทั้งก้อน เนื้อโค้ดไม่เปลี่ยน */
import { useEffect, useMemo, useRef, useState } from "react";
import { graphApi, pickSave, type GOverview, type GPsd } from "../../lib/api";
import { useToast } from "../../components/Toasts";
import Dropdown from "../../components/Dropdown";
import { Switch } from "../../components/ui";
import InfoTip from "../../components/InfoTip";
import type { Tip } from "../../lib/codecAdv";
import { IcRefresh, IbSave } from "../../components/icons";
import { CMP, OVER, Theme, WARN, label, minus, noteOf, spanDigits, tfmt, tfmtD } from "./common";
import { SaveBtn, beside, hiCopy, screenK, useCanvas } from "./draw";
import { VBar, useGrab, useRise, useVRange, vWindow } from "./parts";
import { FZoom, HZoom, Overview, PSD_HZ_UNIT, TimeScroll } from "./zoom";
import { CommonProps } from "./LoudView";
import { LOSSLESS_CODECS } from "./SpekView";

/* ---------- ความถี่เฉลี่ย (แบบ Plot Spectrum ของ Audacity) ---------- */
export const PSM = { L: 52, R: 18, T: 14, B: 30 };
/** หน่วยของหน้าความดัง (BUGS ข้อ 24) */
/** แยกความหมายเป็นหัวข้อละแบบ (พี่กันทัก 13 พ.ย. 2569 "แบ่งความหมายสองออันนี้ด้วย" ที่กล่องละเอียดกับภาพรวม แคลร์ไล่แก้กล่องแบบเดียวกันในหน้านี้) */
export const LOUD_TIP: Tip = {
  w: "หน่วยของตัวเลขความดังขึ้นกับแบบที่เลือก",
  o: [
    ["รวมทุกช่อง", "ใช้หน่วย LUFS ซึ่งเป็นความดังที่หูได้ยินตามมาตรฐานเดียวกับ Spotify และ YouTube โดยค่ายิ่งติดลบยิ่งเบา", "เทียบความดังกับเพลงหรือหนังเรื่องอื่นได้", ""],
    ["L R และเทียบซ้ายขวา", "ใช้หน่วย dB ซึ่งเป็นความดังเฉลี่ย (RMS) ของแต่ละช่อง", "เห็นว่าข้างไหนดังกว่ากัน", ""],
  ],
};
/** คำอธิบาย ⓘ ของหน้าความถี่เฉลี่ย (BUGS ข้อ 21 22) */
const MS_TIP: Tip = { w: "M (Mid) คือเสียงกลาง ได้จากซ้ายบวกขวา เป็นส่วนที่สองข้างเหมือนกัน เช่นเสียงร้อง เบส และกลอง ส่วน S (Side) คือเสียงข้าง ได้จากซ้ายลบขวา เป็นส่วนที่สองข้างต่างกัน เช่นเสียงก้องและเครื่องดนตรีที่แยกข้าง วิธีอ่านคือ ถ้า S ต่ำกว่า M มาก เนื้อเพลงอยู่ตรงกลาง ถ้า S เกือบเท่า M เพลงกว้าง ถ้า S แทบเป็นศูนย์ เสียงเกือบเป็นโมโน และเสียงเบสควรอยู่ใน M" };
const PSD_TIPS: Record<string, Tip> = { axis: { w: "แกนความถี่คือแกนนอนของกราฟ เสียงต่ำอยู่ซ้ายและเสียงสูงอยู่ขวา ส่วนสองแบบนี้ต่างกันที่การแบ่งระยะบนแกน", o: [
    ["Log", "ย่อมาจาก Logarithm ทุกครั้งที่ความถี่เพิ่มเป็นสองเท่าจะได้ระยะเท่ากัน เช่น ช่วง 100 ถึง 200 Hz กว้างเท่ากับช่วง 1 ถึง 2 kHz ซึ่งตรงกับที่หูคนได้ยิน", "เห็นเบสกับเสียงร้องชัด", "ย่านเสียงสูงถูกบีบ"],
    ["Linear", "แบ่งระยะเท่ากันทุก Hz เช่น ช่วง 0 ถึง 1 kHz กว้างเท่ากับช่วง 20 ถึง 21 kHz", "เหมาะดูเสียงสูงหรือจุดที่ถูกตัด", "เสียงต่ำเบียดอยู่ขอบซ้ายนิดเดียว"],
  ], r: "ดูทั่วไปใช้ Log ส่วนดูเสียงสูงหรือรอยตัดใช้ Linear" }, size: { w: "ตัวเลขยิ่งมากยิ่งแยกความถี่ที่ใกล้กันได้ เห็นยอดแคบชัด แต่เส้นหยักมากขึ้นและคิดนานขึ้น ค่า 4,096 พอสำหรับดูทั่วไป และ 16,384 ใช้หาเสียงหึ่งหรือโน้ตที่ชิดกัน" }, range: { w: "ความสูงของแกนตั้ง นับลงจากจุดที่ดังสุด ค่า 60 dB เห็นรายละเอียดส่วนที่ดัง และ 120 dB เห็นถึงเสียงเบามาก เช่นเสียงรบกวนพื้นหลัง" }, grid: { w: "เส้นช่วยอ่านค่า แนวนอนทุก 6 dB และแนวตั้งตามความถี่ ปิดแล้วกราฟโล่ง เหมาะบันทึกเป็นรูป" }, fill: { w: "ระบายสีใต้เส้นให้เห็นเป็นพื้น ถ้ามีเส้นเดียวอ่านง่าย แต่ถ้าหลายเส้นซ้อนกันสีจะผสมจนขุ่น ปิดไว้อ่านง่ายกว่า" } };
/** ซูมแกนความถี่ได้สูงสุดกี่เท่า */
export const PSD_HZ_MAX = 32;
/** ค่าบนเส้นโค้งผ่าน 4 จุดที่ตำแหน่ง 0 1 2 3 (พหุนามลากรานจ์ดีกรีสาม) · x คือตำแหน่งระหว่าง 0 ถึง 3 */
function cubicAt(y0: number, y1: number, y2: number, y3: number, x: number) {
  return y0 * -(x - 1) * (x - 2) * (x - 3) / 6 + y1 * x * (x - 2) * (x - 3) / 2 - y2 * x * (x - 1) * (x - 3) / 2 + y3 * x * (x - 1) * (x - 2) / 6;
}
export function PsdView({ codec, filePath, onReset, resetN, scroller, psd, names, psdCh, setPsdCh, psdLog, setPsdLog, psdSize, setPsdSize, th, ov, t0, t1, zoomBox, onPick, f, setF, fileName, save, exportRef, plotRef, toast }: CommonProps & { codec: string; filePath: string; onReset: () => void; resetN: number;
  psd: GPsd | null; names: string[]; psdCh: string; setPsdCh: (v: string) => void; psdLog: boolean; setPsdLog: (b: boolean) => void; psdSize: number; setPsdSize: (n: number) => void; th: Theme; ov: GOverview; t0: number; t1: number;
  zoomBox: React.ReactNode; onPick: (t: number) => void; f: number | null; setF: (f: number | null) => void; fileName: string; toast: ReturnType<typeof useToast>;
}) {
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
  const peaks = useMemo(() => {
    if (!psd) return [] as [number, number][];
    const d = psd.db[0], out: [number, number][] = [];
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
  const topF = useMemo(() => { if (!psd) return 0; const d = psd.db[0]; for (let i = d.length - 1; i > 0; i--) if (d[i] > -90) return fOf(i); return 0; /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [psd]);
  /** ตรวจเพิ่มจากข้อมูลที่กราฟคิดแล้ว ไม่โหลดอะไรใหม่ · ทุกข้อบอกว่าน่าสงสัย */
  const checks = useMemo(() => {
    const out: { k: string; warn: boolean; b: string; d?: string; title: string; tip: string }[] = [];
    if (!psd) return out;
    const rate = psd.rate, binHz = psd.rate / psd.size, d = psd.db[0], at = (fr: number) => d[Math.max(0, Math.min(d.length - 1, Math.round(fr / binHz)))];
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
  const ref = useCanvas((g, w, h, rr) => {
    g.fillStyle = "#fff"; g.fillRect(0, 0, w, h);
    const { L, R, T, B } = PSM, PW = w - L - R, PH = h - T - B, Y = (d: number) => Yof(d, h), stp = 1 / Math.max(1, rr);
    const ink = "#4a2b38", minor = "#efdde5", major = "#dcc0cc";
    // เส้นตารางแนวนอนทุก 6 dB (ถี่เกินไปเป็นทุก 12) · ตัวเลขทุกเส้น
    const step = [1, 2, 3, 6].find((k) => PH * k / (top - lo) >= 16) ?? 12;
    /** เส้นตารางทุกเส้น จดไว้วาดซ้ำทับพื้นสีด้วยสีขาวโปร่ง แบบ Audacity ที่เส้นตารางอยู่หน้าสุด
        (พี่กัน *"ของ audacity เส้นตารางมันจะอยู่หน้าสุดนะ … เอาเส้นตารางที่พาดผ่านสีจะอ่อนกว่าเส้นตารางพื้นหลังที่อยู่ฉากขาว"*) */
    const gl: [number, number, number, number, boolean][] = [];
    g.font = "600 11px Sarabun, sans-serif"; g.textAlign = "right"; g.textBaseline = "middle";
    for (let d = Math.floor(top / step) * step; d >= lo - 0.01; d -= step) {
      const y = Math.round(Y(d)) + 0.5;
      if (grids) { gl.push([L, y, L + PW, y, true]); g.strokeStyle = major; g.lineWidth = 1; g.beginPath(); g.moveTo(L, y); g.lineTo(L + PW, y); g.stroke(); }
      g.fillStyle = ink; g.fillText(minus(String(d)) + " dB", L - 6, y);
    }
    // เส้นตารางแนวตั้ง · แบบล็อก ทุก 1–9 × 10ⁿ (หลักเข้ม ตัวคั่นจาง) · แบบเส้นตรง ทุก 1 kHz
    g.textAlign = "center"; g.textBaseline = "top"; g.font = "600 11px Sarabun, sans-serif";
    const vline = (fr: number, strong: boolean) => { if (!grids) return; const x = Math.round(X(fr, w)) + 0.5; if (x < L || x > L + PW) return; gl.push([x, T, x, T + PH, strong]); g.strokeStyle = strong ? major : minor; g.beginPath(); g.moveTo(x, T); g.lineTo(x, T + PH); g.stroke(); };
    const hz = (fr: number) => (fr >= 1000 ? `${fr / 1000} kHz` : `${fr} Hz`);
    if (psdLog) {
      for (let dec = 10; dec <= nyq; dec *= 10) for (let m = 1; m <= 9; m++) { const fr = m * dec; if (fr >= 20 && fr <= nyq) vline(fr, m === 1); }
      let lastX = -99;
      // ซูมแล้วป้ายเดิมอยู่ห่างกันเกินไป เพิ่มป้ายถี่ขึ้นตามช่วงที่เห็น
      const marks = hr.z < 2 ? [1, 2, 5] : hr.z < 6 ? [1, 2, 3, 4, 5, 6, 7, 8, 9] : [1, 1.2, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 6, 7, 8, 9];
      const labels: number[] = [20];
      for (let dec = 10; dec <= nyq; dec *= 10) for (const m of marks) { const fr = Math.round(m * dec); if (fr > 20 && fr <= nyq) labels.push(fr); }
      for (const fr of labels) {
        const x = X(fr, w); const tw = g.measureText(hz(fr)).width;
        if (x < L - 1 || x > L + PW + 1 || x - tw / 2 < lastX + 8 || x + tw / 2 > L + PW + R) continue;
        g.fillStyle = ink; g.fillText(hz(fr), x, T + PH + 6); lastX = x + tw / 2;
      }
    } else {
      const seen = nyq / hr.z, gridStep = seen < 6000 ? 100 : 1000;
      for (let fr = gridStep; fr < nyq; fr += gridStep) vline(fr, fr % (gridStep * 5) === 0);
      const every = hr.z === 1 ? (nyq > 30000 ? 8000 : 4000) : [100, 200, 500, 1000, 2000, 4000, 8000].find((k) => PW * k / seen >= 80) ?? 8000;
      for (let fr = 0; fr <= nyq; fr += every) { const x = X(Math.max(fr, 1), w); if (x < L - 1 || x > L + PW + 1) continue; g.fillStyle = ink; g.fillText(hz(fr), x, T + PH + 6); }
    }
    const rising = !!psd && rise < 1;
    if (rising) { g.save(); g.beginPath(); g.rect(L, T, PW, PH); g.clip(); g.translate(0, (T + PH) * (1 - rise)); g.scale(1, rise); }
    if (!psd) { g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = "#b28a9a"; g.font = "13px Sarabun, sans-serif"; g.fillText("กำลังคิดความถี่เฉลี่ยของช่วงที่เลือก", L + PW / 2, T + PH / 2); }
    else if (psdCh === "all") {
      // ซ้อนทุกช่อง แบบ SpectrumAnalyzer (พี่กัน 7 พ.ย. 2569 *"เราอยากให้มันซ้อนกันแบบนี้ได้ของ spectrum ที่ดูได้ทุกความถี่ เเละมีสีที่ต่างกัน"*)
      // ระบายสีโปร่งของทุกเส้นก่อน แล้ววาดเส้นทึบทับทีหลัง เส้นจึงไม่จมใต้พื้นสีของเส้นอื่น · ส่วนที่ซ้อนกันเห็นสีผสม
      const drawn = shown.map((s) => {
        const area = new Path2D(), line = new Path2D(); area.moveTo(L, T + PH);
        for (let x = 0; x < PW; x += stp) { const y = Y(valRange(s.d, fAt(x, PW), fAt(x + stp, PW))); area.lineTo(L + x + 0.5, y); if (x) line.lineTo(L + x + 0.5, y); else line.moveTo(L + 0.5, y); }
        area.lineTo(L + PW, T + PH); area.closePath();
        return { s, area, line };
      });
      // ความทึบพื้นสีต่อเส้นลดตามจำนวนเส้น ส่วนที่ทุกเส้นซ้อนกันทึบรวมราว 45% (เดิม 20% ทุกเส้น 4 เส้นซ้อนกันเป็นสีหม่นขุ่น เจอตอนตรวจภาพ)
      if (fill) { g.globalAlpha = 1 - Math.pow(0.55, 1 / Math.max(1, drawn.length)); for (const { s, area } of drawn) { g.fillStyle = s.color; g.fill(area); } }
      g.globalAlpha = 1; g.lineWidth = 1.5; g.lineJoin = "round"; for (const { s, line } of drawn) { g.strokeStyle = s.color; g.stroke(line); }
    } else if (series.length === 1) {
      // ระบายทึบสีเดียวจากเส้นลงถึงพื้นกราฟ แบบ Audacity · สีกลางของชุดสี (ชุดม่วงใกล้สีของ Audacity)
      // ค่าทีละจุดภาพ (valRange) ไม่ใช่ทีละช่องความถี่
      const s = series[0], area = new Path2D(); area.moveTo(L, T + PH);
      for (let x = 0; x < PW; x += stp) area.lineTo(L + x + 0.5, Y(valRange(s.d, fAt(x, PW), fAt(x + stp, PW))));
      area.lineTo(L + PW, T + PH); area.closePath();
      if (fill) g.fillStyle = th.ramp[4], g.fill(area);
      else { const ln = new Path2D(); for (let x = 0; x < PW; x += stp) { const y = Y(valRange(s.d, fAt(x, PW), fAt(x + stp, PW))); if (x) ln.lineTo(L + x + 0.5, y); else ln.moveTo(L + 0.5, y); } g.strokeStyle = th.ramp[5] ?? th.rms; g.lineWidth = 1.5; g.lineJoin = "round"; g.stroke(ln); }
      // เส้นตารางเส้นเดิมวาดซ้ำเฉพาะในพื้นสี ขาวโปร่ง อ่อนกว่าเส้นบนพื้นขาว
      if (grids && fill) {
        g.save(); g.clip(area); g.lineWidth = 1;
        for (const [x1, y1, x2, y2, strong] of gl) { g.strokeStyle = strong ? "rgba(255,255,255,.34)" : "rgba(255,255,255,.18)"; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); }
        g.restore();
      }
    } else {
      // เทียบซ้ายขวา (ของเราเพิ่มเอง Audacity ไม่มี) เป็นเส้นสองสีตามช่อง
      if (fill) for (const s of shown) {
        const area = new Path2D(); area.moveTo(L, T + PH);
        for (let x = 0; x < PW; x += stp) area.lineTo(L + x + 0.5, Y(valRange(s.d, fAt(x, PW), fAt(x + stp, PW))));
        area.lineTo(L + PW, T + PH); area.closePath(); g.globalAlpha = 1 - Math.pow(0.55, 1 / Math.max(1, shown.length)); g.fillStyle = s.color; g.fill(area); g.globalAlpha = 1;
      }
      for (const s of shown) {
        g.strokeStyle = s.color; g.lineWidth = 2; g.lineJoin = "round"; g.beginPath();
        for (let x = 0; x < PW; x += stp) { const y = Y(valRange(s.d, fAt(x, PW), fAt(x + stp, PW))); if (x) g.lineTo(L + x + 0.5, y); else g.moveTo(L + 0.5, y); }
        g.stroke();
      }
    }
    if (rising) g.restore();
    g.strokeStyle = ink; g.lineWidth = 1; g.strokeRect(L + 0.5, T + 0.5, PW - 1, PH - 1);
  }, [rise, hr.z, hr.b, vr.z, vr.b, psd, psdLog, th, series, off, grids, range, top, fill]);
  exportRef.current = (outW) => (ref.current ? hiCopy(ref.current, outW ? outW / ref.current.clientWidth : screenK()) : null);
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  const cur = f ?? (hum[0]?.[0] ?? 1000);
  const hrNow = useRef(hr); hrNow.current = hr;
  useEffect(() => {
    if (!box) return;
    const fn = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const h = hrNow.current, r = box.getBoundingClientRect(), p = Math.max(0, Math.min(1, (e.clientX - r.left - PSM.L) / Math.max(1, r.width - PSM.L - PSM.R)));
      const k = Math.max(1, Math.min(PSD_HZ_MAX, h.z * (e.deltaY < 0 ? 1.5 : 1 / 1.5))), u = h.b + p / h.z;
      h.setZ(k); h.setB(h.clampB(u - p / k, k));
    };
    box.addEventListener("wheel", fn, { passive: false });
    return () => box.removeEventListener("wheel", fn);
  }, [box]);
  const hrSpan = PSD_HZ_MAX * PSD_HZ_UNIT;
  const setHz = (k: number) => hr.setZ(Math.max(1, Math.min(PSD_HZ_MAX, k)));
  const W = box?.clientWidth ?? 0, H = box?.clientHeight ?? 0, cx = W ? X(cur, W) : 0;
  // ยอดใกล้ตำแหน่งชี้ที่สุด วัดระยะแบบล็อก (บนแกนล็อกตรงกับที่ตาเห็นกว่าวัดเป็น Hz แบบ Audacity)
  const nearest = (fr: number) => allPeaks.slice().sort((a, b) => Math.abs(Math.log(a[0] / fr)) - Math.abs(Math.log(b[0] / fr)))[0];
  const valAt = (d: number[], fr: number) => valRange(d, fr * 0.999, fr * 1.001);
  const hzTxt = (fr: number) => `${Math.round(fr).toLocaleString("en-US")} Hz`;
  const pk = psd ? nearest(cur) : undefined;
  const exportCsv = async () => {
    if (!psd) return;
    const where = await pickSave(beside(filePath, fileName.replace(/\.[^.]+$/, "") + " ความถี่เฉลี่ย.csv"), "csv", "ตาราง CSV"); if (!where) return;
    const head = "Hz," + series.map((s) => s.name + " dB").join(",");
    const rows = psd.db[0].map((_, i) => [fOf(i).toFixed(2), ...psd.db.map((d) => d[i].toFixed(1))].join(","));
    try { const saved = await graphApi.save(where, null, [head, ...rows].join("\r\n")); toast({ kind: "ok", title: "ส่งออกตารางแล้ว", detail: saved }); }
    catch (e) { toast({ kind: "bad", title: "ส่งออกไม่ได้", detail: String(e) }); }
  };
  // ช่วงความถี่ที่ซูมอยู่ บอกข้างแถบซูม (BUGS ข้อ 16 ซูมแล้วงงว่าซูมอะไร แกนนอนหน้านี้คือความถี่ ไม่ใช่เวลา)
  const fL = psdLog ? 20 * Math.pow(nyq / 20, hr.b) : hr.b * nyq, fR = psdLog ? 20 * Math.pow(nyq / 20, hr.b + 1 / hr.z) : (hr.b + 1 / hr.z) * nyq;
  const khz = (x: number) => (x >= 1000 ? `${+(x / 1000).toFixed(x >= 10000 ? 0 : 1)}k` : `${Math.round(x)}`);
  const hzoomBox = (
    <span className="zbtns" data-psdhzoom>
      <span className="lbl">ซูม</span>
      <span className={"lbl" + (hr.z > 1.01 ? "" : " all")} data-psdhzrange title="ช่วงความถี่ที่เห็นอยู่บนแกนนอน">{hr.z > 1.01 ? `${khz(fL)}–${khz(fR)} Hz` : "ทุกความถี่"}</span>
      <button type="button" className="zb" onClick={() => setHz(hr.z / 2)} disabled={hr.z <= 1} aria-label="ซูมแกนความถี่ออก" title="ซูมออก (Ctrl หมุนล้อเมาส์ลง)"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="M20 20l-4.8-4.8M7.5 10.5h6" /></svg></button>
      <HZoom dur={hrSpan} span={hrSpan / hr.z} onSpan={(sp) => setHz(hrSpan / sp)} name="ซูมแกนความถี่" text={`ซูมแกนความถี่ ${hr.z.toFixed(1)} เท่า`} />
      <button type="button" className="zb" onClick={() => setHz(hr.z * 2)} disabled={hr.z >= PSD_HZ_MAX} aria-label="ซูมแกนความถี่เข้า" title="ซูมเข้า (Ctrl หมุนล้อเมาส์ขึ้น)"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="M20 20l-4.8-4.8M7.5 10.5h6M10.5 7.5v6" /></svg></button>
    </span>
  );
  // แถวขวาของหัวกราฟเรียงแบบเดียวกับมุมมองอื่น คำว่าซูมนำหน้าเส้นเลื่อน เส้นแบ่งกั้นกลุ่ม ปุ่มรีเซ็ตท้ายสุด
  // (เดิมไม่มีคำว่าซูมและเส้นแบ่ง ปุ่มรีเซ็ตอยู่กลางแถว เจอตอนไล่หัวกราฟทุกมุมมองหลังพี่กันทักเรื่องแบ่งกลุ่ม 13 พ.ย. 2569)
  const resetBtn = <button type="button" className="zb" aria-label="รีเซ็ตซูม" title="รีเซ็ต กลับทั้งไฟล์ ซูมแนวตั้งกับแนวนอน 1 เท่า" data-zoom-reset onClick={onReset}><IcRefresh size={15} /></button>;
  const opts: [string, string][] = names.length === 1 ? [["mix", label(names, names[0]).code]] : [["mix", "รวมทุกช่อง"], ...(names.includes("FR") ? [["FL", label(names, "FL").code], ["FR", label(names, "FR").code], ["lr", "เทียบซ้ายขวา"]] as [string, string][] : []), ["all", "ซ้อนทุกช่อง"]];
  return (
    <div className="plot" data-plot ref={plotRef as React.RefObject<HTMLDivElement>}>
      <div className="plotstick">
      {/* แถบซูมแกนความถี่อยู่แถวบนเหมือนมุมมองอื่น · แถวไม่พอ ปุ่มช่องเป็นดรอปดาวน์ (BUGS ข้อ 15 พี่กัน "ทำไม … ปุ่มซูมเเนวนอนไปอยุ่ด้านล่าง" · "ถ้าไม่พอ ไปเปลี่ยนตามรูป ให้เป็นดรอปดาว") */}
      <div className="plothead"><span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}><b>ความถี่เฉลี่ย</b>
        <span className="psdch-seg"><div className="seg sm">{opts.map(([k, l]) => <button key={k} type="button" className={psdCh === k ? "on" : ""} onClick={() => setPsdCh(k)} data-psdch={k}>{l}</button>)}</div></span>
        <span className="psdch-dd" data-psdchdd><Dropdown label="ช่องที่ดู" value={psdCh} onChange={setPsdCh} options={opts.map(([value, l]) => ({ value, label: l }))} /></span></span>
        <span className="psdright" style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "flex-end", minWidth: 0 }}>{hzoomBox}<span className="fsep" aria-hidden="true" />{zoomBox}<span className="fsep" aria-hidden="true" />{resetBtn}</span></div>
      <Overview ov={ov} th={th} t0={t0} t1={t1} onPick={onPick} left={52} caption={t1 - t0 >= ov.duration - 0.01 ? `เฉลี่ยทั้งไฟล์ ${tfmt(ov.duration)}` : `ช่วงที่เอามาเฉลี่ย ${tfmtD(t0, spanDigits(t1 - t0))}–${tfmtD(t1, spanDigits(t1 - t0))}`} />
      {scroller?.(52, 0)}
      </div>
      <div style={{ flex: "1 0 300px", marginTop: 8, display: "flex", gap: 8, minHeight: 0 }}>
      <div className={grab.cls} style={{ position: "relative", flex: 1, minWidth: 0 }} ref={setBox} data-psdbox onWheel={vr.wheel} {...grab.props}
        onPointerMove={(e) => { if (grab.move(e)) return; const r = e.currentTarget.getBoundingClientRect(), PW = r.width - PSM.L - PSM.R, x = Math.min(PW, Math.max(0, e.clientX - r.left - PSM.L)); setF(Math.max(1, fAt(x, PW))); }}
        onPointerLeave={() => setF(null)}>
        <canvas className="cv fillcv" ref={ref} data-psd />
        {/* เส้นตั้งกับวงยอดขึ้นเฉพาะตอนเมาส์ชี้ (พี่กัน *"ต้องให้เเสดงเฉพาะเมาส์ชี้"*) · ช่องบอกค่าใต้กราฟยังอยู่ตลอด */}
        {psd && W > 0 && f != null && <>
          <div className="xh" style={{ left: cx, top: PSM.T, bottom: PSM.B }} />
          {pk && pk[1] >= lo && pk[1] <= top && X(pk[0], W) >= PSM.L && X(pk[0], W) <= W - PSM.R && <div className="psdpk" style={{ left: X(pk[0], W), top: Yof(pk[1], H) }} />}
        </>}
        <VBar v={vr} right={PSM.R + 4} top={PSM.T} bottom={PSM.B} />
      </div>
      <FZoom value={vr.z} onChange={vr.setZ} />
      </div>
      {/* แถบเลื่อนแกนความถี่ตรงกับขอบกราฟ เว้นขวาเท่าแถบซูมแนวตั้ง · ซูมแนวนอนอยู่ท้ายแถวบอกค่า หัวกราฟเต็มแล้ว */}
      <div style={{ marginRight: 30 }} data-psdhscroll><TimeScroll dur={1} t0={hr.b} t1={hr.b + 1 / hr.z} left={PSM.L} right={PSM.R} onPan={(c) => hr.setB(hr.clampB(c - 0.5 / hr.z, hr.z))} /></div>
      {/* ช่องบอกค่าใต้กราฟ แบบ Cursor กับ Peak ของ Audacity */}
      <div className="psdread" data-psdreadout>
        {/* ป้ายสีเส้นย้ายมาแทนที่แถบซูมเดิม ปุ่มเล็กลง ยังกดซ่อนแสดงเส้นได้ (BUGS ข้อ 19 พี่กัน "งั้นย้ายไปเเทนที่เเถบซูมเเนวนอน" · "อ๋อ มันคือปุ่มกด") · ⓘ อธิบาย M S (ข้อ 21) */}
        {series.length > 1 && <span className="psdlg" style={{ order: 9, marginLeft: "auto" }} data-psdlegend>{series.map((sr) => {
          const on = !off.includes(sr.key), last = on && shown.length === 1;
          return <button key={sr.key} type="button" className={"psdk" + (on ? " on" : "")} aria-pressed={on} aria-disabled={last || undefined}
            title={last ? "ต้องเหลืออย่างน้อยหนึ่งเส้น" : on ? `กดเพื่อซ่อน ${sr.long}` : `กดเพื่อแสดง ${sr.long}`} data-psdkey={sr.key}
            onClick={() => { if (!last) setOff((o) => (on ? [...o, sr.key] : o.filter((k) => k !== sr.key))); }}>
            <i style={on ? { background: sr.color, borderColor: sr.color } : { borderColor: sr.color }} />{sr.long}</button>;
        })}{series.some((sr) => sr.key === "M") && <InfoTip title="M กับ S คืออะไร" tip={MS_TIP} />}</span>}
        <span className="lbl">ตำแหน่งชี้</span>
        <span className="psdbox" data-psdcursor>{psd && f == null ? "ชี้ที่กราฟเพื่อดูค่า" : psd ? `${hzTxt(cur)} (${noteOf(cur)}) = ${shown.map((s) => (series.length > 1 ? s.name + " " : "") + minus(Math.round(valAt(s.d, cur)).toString()) + " dB").join(", ")}` : "—"}</span>
        <span className="lbl">ยอดใกล้สุด</span>
        <span className="psdbox" data-psdpeak>{pk ? `${hzTxt(pk[0])} (${noteOf(pk[0])}) = ${minus(pk[1].toFixed(1))} dB` : "—"}</span>
      </div>
      {/* ผลตรวจ บอกว่าน่าสงสัย ไม่ตัดสินเด็ดขาด ทุกข้อมีปุ่ม ⓘ (BUGS ข้อ 25 พี่กัน "เราคิดว่ามันคือฮัมเพลง ต้อเปลี่ยนคำ" · ตรวจเพิ่ม 4 อย่าง พี่กันเคาะ "ได้") */}
      {psd && <div className="psdchecks" data-psdchecks data-top={Math.round(topF)}>{checks.map((c) => (
        <div key={c.k} className={"stat " + (c.warn ? "warn" : "info") + (c.d ? "" : " slim")} data-psdcheck={c.k}>{c.warn ? WARN : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5v.5" /></svg>}
          <div className="psdck-txt" title={c.d ? `${c.b} ${c.d}` : c.b}><b>{c.b}</b>{c.d && <span> {c.d}</span>}</div><InfoTip title={c.title} tip={{ w: c.tip }} /></div>))}</div>}
      <div className="small" style={{ marginTop: 6 }}>{psd ? `เสียงสูงสุดที่มีราว ${(topF / 1000).toFixed(1)} kHz ใน` : ""}ช่วงที่เลือก {tfmtD(t0, spanDigits(t1 - t0))} ถึง {tfmtD(t1, spanDigits(t1 - t0))} และกดที่แถบบนเพื่อย้ายช่วงได้</div>
      {/* แต่ละตัวเลือกจับคู่กับปุ่ม ⓘ ของมัน ตกบรรทัดแล้วไม่แยกกัน (เจอตอนตรวจภาพ ⓘ ของเส้นตารางหลุดไปต้นบรรทัดใหม่) */}
      <div className="agfoot"><div className="psdopts" style={{ display: "flex", alignItems: "center", columnGap: 14, rowGap: 6, flexWrap: "wrap" }}>
        <span className="psdopt"><span className="lbl">แกนความถี่</span><InfoTip title="แกนความถี่" tip={PSD_TIPS.axis} />
        <div className="seg sm"><button type="button" className={psdLog ? "on" : ""} onClick={() => setPsdLog(true)} data-psdaxis="log">Log</button><button type="button" className={!psdLog ? "on" : ""} onClick={() => setPsdLog(false)} data-psdaxis="lin">Linear</button></div></span>
        <span className="psdopt"><span data-psdsize title="ยิ่งมากยิ่งแยกความถี่ละเอียด แต่ช้าลง"><Dropdown label="ความละเอียด" value={String(psdSize)} onChange={(v) => setPsdSize(Number(v))}
          options={[1024, 4096, 16384].map((n) => ({ value: String(n), label: `ความละเอียด ${n.toLocaleString("en-US")}` }))} /></span><InfoTip title="ความละเอียด" tip={PSD_TIPS.size} /></span>
        <span className="psdopt"><span className="lbl">ช่วง</span>
        <div className="seg sm">{[60, 90, 120].map((r) => <button key={r} type="button" className={range === r ? "on" : ""} onClick={() => setRange(r)} data-psdrange={r}>{r} dB</button>)}</div><InfoTip title="ช่วง dB" tip={PSD_TIPS.range} /></span>
        <span className="psdopt"><span className="lbl">เส้นตาราง</span><span data-psdgrid style={{ display: "inline-flex" }}><Switch on={grids} onChange={setGrids} label="เส้นตาราง" /></span><InfoTip title="เส้นตาราง" tip={PSD_TIPS.grid} /></span>
        <span className="psdopt"><span className="lbl">สีทึบใต้เส้น</span><span data-psdfill style={{ display: "inline-flex" }}><Switch on={fill} onChange={setFill} label="สีทึบใต้เส้น" /></span><InfoTip title="สีทึบใต้เส้น" tip={PSD_TIPS.fill} /></span></div>
        <div style={{ display: "flex", gap: 8 }}><button type="button" className="btn btn-ghost btn-sm" onClick={exportCsv}><IbSave size={15} />ส่งออกเป็นตาราง</button><SaveBtn onClick={save} /></div></div>
    </div>
  );
}
