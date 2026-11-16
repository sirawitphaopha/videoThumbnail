/* แปลงซับภาพเป็นซับภาพ (BUGS ข้อ 125 · ตัวทำอยู่ imgconv.rs)
   พี่กันสั่ง 15 พ.ย. 2569 "เอามาก็ดีนะ ตอนระบบแปลงจากซับภาพเป็นซับภาพ" แล้ว "ส่วนของ UXUI เอามาจากเจ้านั้นได้นะ แปลงมา เเละเสริมของเราถ้ามีจุดที่อยากเพิ่ม
   เเละดูว่า subtitle edit หน้า UI เป้นยังไงก็ปรับๆมา"
   หน้าตายกจาก BDSup2Sub++ (bdsup2sub.ui กับ conversiondialog.ui) แถบบนของหน้าต่างหลักคือชนิดผล จานสี ตัวย่อขยาย ภาษาและเกณฑ์ของ VobSub
   หน้าต่าง Conversion Options แบ่งกลุ่มขนาดภาพ ย่อขยายอิสระ อัตราเฟรม เวลา ป้ายบังคับ และหน้าต่าง Move all captions คือการย้ายตำแหน่ง
   ภาพต้นทางกับภาพปลายทางวางคู่กันพร้อมป้ายข้อมูลขนาดจอ ตำแหน่ง เวลา · ของ Subtitle Edit เอาแบบติ๊กเปิดทีละกลุ่ม ปิดแล้วไม่ส่งค่ากลุ่มนั้น
   ส่วนที่ของเราเสริม ภาพปลายทางแปลงจริงทั้งไฟล์ ภาพตัวอย่างจึงตรงผลทุกชนิด รวม VobSub ที่เหลือ 4 สี · ตัวแปลงสำรอง Subtitle Edit · ไม่เขียนทับ · จำค่าที่ตั้ง */
import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { api, imgApi, inApp, pickSave, subApi, subDocApi, type ImgOut, type ImgPreview, type ImgReq, type SubImg } from "../lib/api";
import type { AvTrack } from "../lib/avJob";
import type { Tip } from "../lib/codecAdv";
import { ftName } from "../lib/ftypes";
import { LANG_ALL, langOf } from "../lib/langs";
import Dialog from "./Dialog";
import Dropdown from "./Dropdown";
import InfoTip from "./InfoTip";
import { CardIcon, Keep, Phr, Range, Seg, Switch } from "./ui";
import { IbBack, IbNext, IbRevert, IcFolder } from "./icons";
import { NumBox } from "./subedit/StyleDialogs";

type Out = "sup" | "idx" | "xml";
type Opts = Omit<ImgReq, "src" | "inMovie" | "tid" | "ff" | "kind" | "target" | "language"> & { out: Out; useRes: boolean; useScale: boolean; useFps: boolean; useMove: boolean };
/** ค่าตั้งต้นตาม BDSup2Sub++ (แคลร์ตั้งเฉพาะชนิดผล PGS) */
const OPTS0: Opts = {
  engine: "bdsup", out: "sup", useRes: false, resolution: "1080", useScale: false, scaleX: 1, scaleY: 1, filter: "bilinear",
  useFps: false, fpsSource: "auto", fpsTarget: "keep", delay: 0, fixShort: false, minTime: 500,
  useMove: false, moveY: "none", ratio: 2.35, moveYOffset: 0, moveX: "none", moveXOffset: 0, cropY: 0,
  palette: "create", fixInvisible: false, forced: "all", forceAll: "", alphaThr: 80, lumLow: 0, lumHi: 0,
};
const FPS = ["23.975", "23.976", "24", "25", "29.97", "50", "59.94"];
const RES: { v: ImgReq["resolution"]; label: string }[] = [
  { v: "1080", label: "1080p 1920 × 1080" }, { v: "1440x1080", label: "1080p 1440 × 1080" }, { v: "720", label: "720p 1280 × 720" },
  { v: "576", label: "PAL 720 × 576" }, { v: "480", label: "NTSC 720 × 480" },
];
const FILTERS = [["bilinear", "Bilinear"], ["triangle", "Triangle"], ["bicubic", "Bicubic"], ["bell", "Bell"], ["b-spline", "B-spline"], ["hermite", "Hermite"], ["lanczos3", "Lanczos3"], ["mitchell", "Mitchell"]];
const EXT: Record<Out, string> = { sup: "sup", idx: "idx", xml: "xml" };
const OUT_NAME: Record<Out, string> = { sup: "PGS .sup", idx: "VobSub .idx", xml: "BDN XML" };
const PER = 12;
const load = <T,>(k: string, d: T): T => { try { const v = localStorage.getItem(k); return v ? { ...d, ...JSON.parse(v) } : d; } catch { return d; } };
const keep = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ไม่มีที่เก็บ */ } };
const nameOf = (p: string) => p.split(/[\\/]/).pop() ?? p;
/** เวลาแบบ 2:12.48 · เกินชั่วโมงเป็น 1:02:12.48 */
const ts = (ms: number) => { const s = Math.max(0, ms) / 1000; const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60; const sec = (s % 60).toFixed(2).padStart(5, "0"); return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`; };
const fsize = (b: number) => (b < 1048576 ? `${Math.max(1, Math.round(b / 1024)).toLocaleString("en-US")} KB` : `${(b / 1048576).toLocaleString("en-US", { maximumFractionDigits: 1 })} MB`);
/** คำเตือนของ BDSup2Sub++ เป็นภาษาไทย · แบบที่ไม่รู้จักบอกคำเดิม */
const warnTh = (w: string) => { const m = /end time of frame (\d+) <= start time/i.exec(w); return m ? `ภาพที่ ${m[1]} เวลาจบไม่เกินเวลาเริ่ม โปรแกรมแก้ให้แล้ว` : `คำเตือนจาก BDSup2Sub++ ว่า ${w}`; };

const INTRO_TIP: Tip = {
  w: "แปลงซับภาพ เช่น VobSub ของ DVD เป็น PGS ของ Blu-ray\nและย่อขยายภาพ เปลี่ยนอัตราเฟรม หรือเลื่อนเวลาได้ในรอบเดียว",
  o: [
    ["ซับภาพ", "ซับที่เก็บเป็นภาพ ไม่ใช่ตัวหนังสือ จึงแก้คำไม่ได้\nแต่หน้าตาเหมือนกันทุกเครื่องเล่น", "", ""],
    ["ไฟล์เดิม", "ไม่ถูกแตะ โปรแกรมเขียนเป็นไฟล์ใหม่\nและไม่เขียนทับไฟล์ที่มีอยู่แล้ว", "", ""],
  ],
};
const ENGINE_TIP: Tip = {
  w: "ตัวแปลงมีให้เลือกสองตัว โดย BDSup2Sub++ ทำได้ครบกว่า",
  o: [
    ["BDSup2Sub++", "BDSup2Sub รุ่น C++\nซึ่งคนทำแผ่น Blu-ray ใช้กันมานาน", "ย่อขยาย เปลี่ยนอัตราเฟรม ย้ายตำแหน่ง และตั้งจานสีได้", "อ่านไฟล์บางไฟล์ไม่ได้\nเช่น VobSub ที่ทำด้วยโปรแกรมรุ่นเก่า"],
    ["Subtitle Edit", "ตัวแปลง SeConv ของ Subtitle Edit", "อ่านไฟล์ที่ BDSup2Sub++ อ่านไม่ได้", "ทำได้แค่เปลี่ยนชนิดไฟล์ เลื่อนเวลาให้ช้าลง\nและเลือกเฉพาะซับบังคับ"],
  ],
  r: "BDSup2Sub++\nถ้าไฟล์ไหนอ่านไม่ได้ จะใช้ Subtitle Edit แทนเอง",
};
const OUT_TIP: Tip = {
  w: "ชนิดไฟล์ของซับภาพที่จะได้",
  o: [
    ["PGS .sup", "ซับภาพของ Blu-ray ภาพละไม่เกิน 255 สี", "คมและใส่ใน MKV หรือแผ่น Blu-ray ได้", ""],
    ["VobSub .idx", "ซับภาพของ DVD ได้ไฟล์ .idx กับ .sub คู่กัน", "เครื่องเล่นรุ่นเก่ารับได้ และไฟล์เล็ก", "ภาพละ 4 สี ขอบจึงหยาบกว่า"],
    ["BDN XML", "ไฟล์ XML บอกเวลาและตำแหน่ง\nกับภาพ PNG ทุกภาพในโฟลเดอร์เดียวกัน", "เอาไปแก้ภาพต่อหรือใช้กับโปรแกรมทำแผ่นได้", "เครื่องเล่นเปิดตรง ๆ ไม่ได้"],
  ],
  r: "PGS .sup",
};
const RES_TIP: Tip = {
  w: "ขนาดจอของซับต้องเท่าภาพของหนังที่จะใส่ ซับจึงอยู่ตรงตำแหน่ง\nปิดไว้คือใช้ขนาดเดิมของไฟล์ต้นทาง",
  o: [["เปิด", "ย่อหรือขยายภาพซับทุกภาพให้พอดีจอใหม่\nและย้ายตำแหน่งตามสัดส่วน", "ใช้ซับ DVD กับหนัง HD ได้", "ภาพที่ขยายจะนุ่มลงเล็กน้อย"]],
  r: "ขนาดเดียวกับหนังที่จะใส่ซับ",
};
const SCALE_TIP: Tip = {
  w: "ย่อหรือขยายภาพซับเทียบกับจอ โดย 1 คือเท่าเดิม\nใช้ตอนที่ตัวหนังสือใหญ่หรือเล็กเกินไปหลังเปลี่ยนขนาดจอ",
  r: "1 ทั้งสองค่า",
};
const FILTER_TIP: Tip = {
  w: "วิธีคำนวณจุดภาพใหม่ตอนย่อหรือขยายภาพซับ",
  o: [
    ["Bilinear", "เฉลี่ยจุดที่อยู่ติดกัน", "เร็วและเรียบ", "นุ่มกว่าแบบอื่นเล็กน้อย"],
    ["Bicubic", "คิดจากจุดรอบ ๆ มากขึ้น", "คมกว่า Bilinear", ""],
    ["Lanczos3", "คิดจากจุดรอบ ๆ มากที่สุด", "คมที่สุด", "ขอบอาจมีเงาเส้นบาง ๆ"],
    ["แบบอื่น", "Triangle Bell B-spline Hermite และ Mitchell\nให้ผลอยู่ระหว่างแบบข้างบน", "", ""],
  ],
  r: "Bilinear ตามค่าตั้งต้นของ BDSup2Sub",
};
const FPS_TIP: Tip = {
  w: "เปลี่ยนเวลาทุกภาพจากอัตราเฟรมต้นทางเป็นอัตราเฟรมปลายทาง\nใช้ตอนที่ซับมาจากหนังที่อัตราเฟรมต่างกัน เช่น 25 กับ 23.976",
  o: [
    ["ต้นทาง อัตโนมัติ", "อ่านอัตราเฟรมจากไฟล์ซับ", "", ""],
    ["ปลายทาง", "อัตราเฟรมของหนังที่จะใส่ซับ", "", ""],
  ],
  r: "ปิดไว้ เว้นแต่ซับเร็วหรือช้าขึ้นเรื่อย ๆ จนจบเรื่อง",
};
const DELAY_TIP: Tip = {
  w: "เลื่อนเวลาทุกภาพ ค่าบวกให้ซับขึ้นช้าลง ส่วนค่าลบให้ขึ้นเร็วขึ้น\nหน่วยเป็นมิลลิวินาที โดย 1,000 คือหนึ่งวินาที",
  r: "0",
};
const SHORT_TIP: Tip = {
  w: "ภาพที่ขึ้นสั้นกว่าขั้นต่ำ โปรแกรมจะยืดเวลาจบให้อ่านทัน",
  r: "ปิดไว้ ถ้าเปิดใช้ 500 มิลลิวินาที",
};
const MOVEY_TIP: Tip = {
  w: "ย้ายซับแนวตั้งทุกภาพ แบบหน้าต่างย้ายซับทั้งหมดของ BDSup2Sub",
  o: [
    ["ย้ายเข้าในภาพ", "ซับในแถบดำของหนังจอกว้าง ย้ายขึ้นมาอยู่ในภาพ\nโดยคิดจากสัดส่วนภาพของหนัง เช่น 2.35", "เห็นซับเมื่อดูแบบตัดแถบดำ", ""],
    ["ย้ายออกนอกภาพ", "ซับที่ทับภาพ ย้ายลงไปอยู่ในแถบดำ", "ซับไม่บังภาพ", ""],
    ["เลื่อนขึ้นหรือลง", "เลื่อนทุกภาพจากตำแหน่งเดิมตามระยะที่ตั้ง", "", ""],
  ],
};
const RATIO_TIP: Tip = {
  w: "สัดส่วนกว้างต่อสูงของภาพหนังไม่รวมแถบดำ ต้องเกิน 16:9 (1.78)\nหนังจอกว้างส่วนมากเป็น 2.35 หรือ 2.40",
  r: "2.35",
};
const MOVEX_TIP: Tip = {
  w: "ย้ายซับแนวนอนทุกภาพ",
  o: [
    ["ชิดซ้าย ชิดขวา กึ่งกลาง", "วางทุกภาพชิดขอบหรือกลางจอ\nแล้วเลื่อนตามระยะที่ตั้ง", "", ""],
    ["ตำแหน่งเดิม", "ไม่ย้ายแนวนอน แต่เลื่อนตามระยะที่ตั้ง", "", ""],
  ],
};
const PAL_TIP: Tip = {
  w: "วิธีเลือกสีของภาพซับที่จะได้",
  o: [
    ["คงเดิม", "ใช้จานสีของต้นทาง", "สีตรงต้นฉบับ", "ขอบหยาบเมื่อย่อขยาย"],
    ["สร้างใหม่", "คิดจานสีใหม่จากภาพหลังแปลง", "ขอบนุ่มหลังย่อขยาย", ""],
    ["กระจายจุดสี", "สร้างจานสีใหม่แล้วกระจายจุดสีสลับกัน", "สีไล่โทนเป็นขั้นน้อยลง", "มีจุดเล็ก ๆ ที่ขอบ"],
  ],
  r: "สร้างใหม่ ตามค่าตั้งต้นของ BDSup2Sub",
};
const INVIS_TIP: Tip = {
  w: "ภาพที่จานสีโปร่งใสทั้งหมดจนมองไม่เห็น จะแก้ให้ขึ้นได้\nซับจากแผ่นบางแผ่นตั้งไว้แบบนี้",
  r: "ปิด เว้นแต่ซับบางภาพหายไป",
};
const FORCED_TIP: Tip = {
  w: "ซับบังคับคือซับที่ขึ้นเสมอ เช่นป้ายหรือบทพูดภาษาอื่นในฉาก",
  o: [
    ["ทุกภาพ", "แปลงทุกภาพในไฟล์", "", ""],
    ["เฉพาะซับบังคับ", "แปลงเฉพาะภาพที่ติดป้ายซับบังคับ", "", ""],
    ["ยกเว้นซับบังคับ", "แปลงทุกภาพที่ไม่ได้ติดป้ายซับบังคับ", "", ""],
  ],
  r: "ทุกภาพ",
};
const FORCEALL_TIP: Tip = {
  w: "เปลี่ยนป้ายซับบังคับของทุกภาพในไฟล์ที่จะได้",
  o: [
    ["คงเดิม", "ป้ายตามไฟล์ต้นทาง", "", ""],
    ["ติดทุกภาพ", "ทุกภาพเป็นซับบังคับ ตัวเล่นจึงขึ้นซับนี้เสมอ", "", ""],
    ["เอาออกทุกภาพ", "ไม่มีภาพไหนเป็นซับบังคับ", "", ""],
  ],
  r: "คงเดิม",
};
const VIEW_TIP: Tip = {
  w: "เลือกวิธีดูภาพตัวอย่างของต้นฉบับกับผลที่จะได้ ซึ่งวางคู่กัน",
  o: [
    ["ทั้งจอ", "วางซับบนจอเท่าขนาดจอของไฟล์ แล้วย่อให้พอดีกรอบ", "เห็นตำแหน่งของซับบนจอ", ""],
    ["ขนาดจริง", "ตัดเฉพาะส่วนที่มีตัวหนังสือ\nโดยหนึ่งจุดของภาพเท่าหนึ่งจุดบนหน้าต่าง", "เห็นความละเอียดที่เปลี่ยนหลังย่อขยายหรือลดสี", "ซับยาวต้องเลื่อนดู\nโดยเลื่อนกรอบหนึ่งแล้วอีกกรอบเลื่อนตาม"],
    ["ขยาย 2 เท่า", "เหมือนขนาดจริงแต่ขยายสองเท่าแบบเห็นจุดภาพชัด", "เห็นขอบตัวหนังสือกับสีที่ลดลงชัดขึ้น", ""],
  ],
  r: "ทั้งจอตอนตั้งตำแหน่ง\nส่วนขนาดจริงตอนดูความละเอียด",
};
const LANG_TIP: Tip ={ w: "ภาษาที่เขียนในไฟล์ .idx ซึ่งตัวเล่นใช้บอกชื่อภาษาของซับ" };
const ALPHA_TIP: Tip = {
  w: "VobSub เก็บได้ 4 สี จุดที่ทึบน้อยกว่าเกณฑ์จะเป็นพื้นใส\nค่าน้อยเก็บขอบจางได้มากขึ้น ส่วนค่ามากขอบคมขึ้น",
  r: "80 ตามค่าตั้งต้นของ BDSup2Sub",
};
const LUM_TIP: Tip = {
  w: "แบ่งความสว่างเป็นสีเข้ม กลาง และสว่าง เพื่อเลือก 4 สีของ VobSub\nใส่ 0 คือใช้ค่าของ BDSup2Sub",
  r: "0 ทั้งสองค่า",
};

type Part = { png: string; x: number; y: number; w: number; h: number };
/** กรอบของส่วนที่มีภาพจริง (จุดที่ไม่ใส) บนจอ · ffmpeg กับ BDSup2Sub++ เว้นขอบใสรอบภาพไม่เท่ากัน
    ตัวเลขใต้ภาพนับจากส่วนนี้ ภาพต้นฉบับกับภาพที่จะได้จึงเทียบกันได้ตรง ๆ (เจอตอนตรวจ 15 พ.ย. 2569 ภาพตรงกันแต่ป้ายบอก 1329 กับ 1439) */
function useInk(parts: Part[] | null): { x: number; y: number; w: number; h: number } | null {
  const [box, setBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const key = parts ? parts.map((g) => `${g.png.length}:${g.png.slice(-32)}:${g.x}:${g.y}:${g.w}:${g.h}`).join("|") : "";
  useEffect(() => {
    if (!parts || !parts.length) { setBox(null); return; }
    let live = true;
    void Promise.all(parts.map(async (g) => {
      const im = new Image(); im.src = g.png; await im.decode();
      const cv = document.createElement("canvas"); cv.width = im.naturalWidth; cv.height = im.naturalHeight;
      const c = cv.getContext("2d"); if (!c || !cv.width || !cv.height) return null;
      c.drawImage(im, 0, 0);
      const px = c.getImageData(0, 0, cv.width, cv.height).data;
      let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
      for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++) if (px[(y * cv.width + x) * 4 + 3] > 0) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      const sx = g.w / cv.width, sy = g.h / cv.height;
      return x1 < 0 ? null : { x0: g.x + x0 * sx, y0: g.y + y0 * sy, x1: g.x + (x1 + 1) * sx, y1: g.y + (y1 + 1) * sy };
    })).then((bs) => {
      if (!live) return;
      const v = bs.filter((b): b is NonNullable<typeof b> => !!b);
      if (!v.length) { setBox(null); return; }
      const x = Math.round(Math.min(...v.map((b) => b.x0))), y = Math.round(Math.min(...v.map((b) => b.y0)));
      setBox({ x, y, w: Math.round(Math.max(...v.map((b) => b.x1))) - x, h: Math.round(Math.max(...v.map((b) => b.y1))) - y });
    }, () => { if (live) setBox(null); });
    return () => { live = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return box;
}

/** เฉพาะตัวซับ ตัดตามส่วนที่มีภาพจริง หนึ่งจุดของภาพเท่าหนึ่งจุดบนหน้าต่าง หรือขยาย 2 เท่าแบบเห็นจุดภาพชัด
    (พี่กันขอ 15 พ.ย. 2569 "อยากให้สามารถเลือกดู เฉพาะตัวซับได้ด้วย … เพราะอยากเอาไว้ดูความละเอียดของซับที่เปลี่ยน")
    เลื่อนกรอบหนึ่งแล้วอีกกรอบเลื่อนตามสัดส่วน ดูส่วนเดียวกันของต้นฉบับกับผลได้ทันที */
function Crop(p: { parts: Part[]; box: { x: number; y: number; w: number; h: number }; zoom: number; data: string; el: React.RefObject<HTMLDivElement | null>; other: React.RefObject<HTMLDivElement | null> }) {
  const z = p.zoom;
  const sync = () => {
    const a = p.el.current, b = p.other.current;
    if (!a || !b || a.dataset.syncing === "1") return;
    const fx = a.scrollWidth > a.clientWidth ? a.scrollLeft / (a.scrollWidth - a.clientWidth) : 0;
    const fy = a.scrollHeight > a.clientHeight ? a.scrollTop / (a.scrollHeight - a.clientHeight) : 0;
    b.dataset.syncing = "1";
    b.scrollLeft = fx * (b.scrollWidth - b.clientWidth);
    b.scrollTop = fy * (b.scrollHeight - b.clientHeight);
    requestAnimationFrame(() => { delete b.dataset.syncing; });
  };
  // จับลากด้วยเมาส์เลื่อนดูส่วนที่ล้นกรอบ อีกกรอบเลื่อนตามผ่าน onScroll (พี่กันขอ 15 พ.ย. 2569 "เราขอเอาเมาส์จับลากซ้ายขวาได้")
  const drag = useRef<{ x: number; y: number; l: number; t: number } | null>(null);
  const down = (e: React.PointerEvent<HTMLDivElement>) => {
    const a = p.el.current;
    if (!a || e.button !== 0 || (a.scrollWidth <= a.clientWidth && a.scrollHeight <= a.clientHeight)) return;
    drag.current = { x: e.clientX, y: e.clientY, l: a.scrollLeft, t: a.scrollTop };
    a.setPointerCapture(e.pointerId);
    a.classList.add("grabbing");
  };
  const move = (e: React.PointerEvent<HTMLDivElement>) => {
    const a = p.el.current, d = drag.current;
    if (!a || !d) return;
    a.scrollLeft = d.l - (e.clientX - d.x);
    a.scrollTop = d.t - (e.clientY - d.y);
  };
  const up = (e: React.PointerEvent<HTMLDivElement>) => {
    drag.current = null;
    p.el.current?.classList.remove("grabbing");
    if (p.el.current?.hasPointerCapture(e.pointerId)) p.el.current.releasePointerCapture(e.pointerId);
  };
  return (
    <div ref={p.el} className={"icv-crop" + (z > 1 ? " zoom" : "")} onScroll={sync} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} data-icv-crop={p.data}>
      <div className="icv-cropin" style={{ width: p.box.w * z, height: p.box.h * z }}>
        {p.parts.map((g, i) => <img key={i} src={g.png} alt="" style={{ left: (g.x - p.box.x) * z, top: (g.y - p.box.y) * z, width: g.w * z, height: g.h * z }} />)}
      </div>
    </div>
  );
}

/** ภาพซับหนึ่งภาพวางบนจอขนาด cw × ch ตามตำแหน่งจริง · พื้นตารางหมากรุกมืด */
function Frame(p: { cw: number; ch: number; parts: Part[]; data?: string }) {
  return (
    <div className="icv-frame" style={{ aspectRatio: `${Math.max(1, p.cw)} / ${Math.max(1, p.ch)}` }} data-icv-frame={p.data}>
      {p.parts.map((g, i) => <img key={i} src={g.png} alt="" style={{ left: `${(g.x / p.cw) * 100}%`, top: `${(g.y / p.ch) * 100}%`, width: `${(g.w / p.cw) * 100}%`, height: `${(g.h / p.ch) * 100}%` }} />)}
    </div>
  );
}

export default function ImgConvDialog(p: { open: boolean; onClose: () => void; track: AvTrack; movie: string }) {
  const t = p.track;
  const ft = ftName("subtitle", t.codec, t.profile);
  // ซับ HD DVD ส่งไฟล์ .sup ให้ตัวแปลงตรง ๆ แบบ PGS (BUGS ข้อ 129) · VobSub ต้องหาไฟล์ .idx คู่กัน
  const kind: ImgReq["kind"] = ft === "VobSub" ? "vobsub" : "pgs";
  const srcPath = t.inMovie ? p.movie : t.src;
  const ff = t.ff ?? t.tid;
  const [opts, setOpts] = useState<Opts>(() => load("imgconv-opts", OPTS0));
  const [lang, setLang] = useState("en");
  const [path, setPath] = useState("");
  const [tools, setTools] = useState<{ bdsupOk: boolean; seconvOk: boolean } | null>(null);
  const [idx, setIdx] = useState(0);
  const [src, setSrc] = useState<{ total: number; pages: Record<number, SubImg[]>; err?: boolean } | null>(null);
  const [prev, setPrev] = useState<{ s: "idle" | "busy" | "done" | "fail"; data?: ImgPreview; err?: string }>({ s: "idle" });
  const [run, setRun] = useState<{ done: number; total: number } | null>(null);
  const [out, setOut] = useState<ImgOut | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [exists, setExists] = useState(false);
  const seq = useRef(0);
  const [view, setViewS] = useState<"full" | "real" | "zoom">(() => { try { const v = localStorage.getItem("imgconv-view"); return v === "real" || v === "zoom" ? v : "full"; } catch { return "full"; } });
  const setView = (v: "full" | "real" | "zoom") => { setViewS(v); try { localStorage.setItem("imgconv-view", v); } catch { /* ไม่มีที่เก็บ */ } };
  const cropSrc = useRef<HTMLDivElement>(null), cropOut = useRef<HTMLDivElement>(null);
  // BDSup2Sub++ อ่านไฟล์นี้ไม่ได้ (หยุดทำงานตอนทำภาพตัวอย่างหรือตอนแปลง) ใช้ Subtitle Edit แทนเฉพาะไฟล์นี้ ค่าที่จำไว้ยังเป็นตัวเดิม (BUGS ข้อ 128
  // พี่กันเสนอ "ถ้าเลือกชนิดซับนี้ของ bub2sub มันควรขึ้นจางให้กดไม่ได้" แล้วสั่ง "ตามคิวนะ") · ตัดสินจากข้อความอ่านซับนี้ไม่ได้ของ imgconv.rs เท่านั้น
  // การแปลงที่ล้มด้วยเหตุอื่น เช่นตัวเลือกย่อขยาย ไม่ได้แปลว่าอ่านไฟล์ไม่ได้ จึงไม่สลับเอง
  const [bdBad, setBdBad] = useState(false);
  const engine: Opts["engine"] = bdBad && tools?.seconvOk ? "seconv" : opts.engine;
  const se = engine === "seconv";
  const set = <K extends keyof Opts>(k: K, v: Opts[K]) => setOpts((o) => ({ ...o, [k]: v }));
  useEffect(() => keep("imgconv-opts", opts), [opts]);
  useEffect(() => { setOut(null); setErr(null); setExists(false); }, [engine, opts.out]);

  // เปิดหน้าต่าง ตั้งที่เก็บข้างไฟล์ต้นทาง ชื่อไม่ชนไฟล์ที่มี · ภาษาของ VobSub ตามภาษาของแทร็ก
  useEffect(() => {
    if (!p.open) return;
    setRun(null); setOut(null); setErr(null); setExists(false); setIdx(0); setSrc(null); setBdBad(false);
    const l = langOf(t.lang)[3];
    setLang(l || "en");
    const base = srcPath.replace(/\.[^.\\/]+$/, "") + (t.inMovie && t.lang && t.lang !== "und" ? `.${t.lang}` : "");
    const want = `${base}.${EXT[opts.out]}`;
    const first = want.toLowerCase() === srcPath.toLowerCase() ? `${base}.แปลง.${EXT[opts.out]}` : want;
    if (inApp) {
      void subDocApi.freeName(first).then(setPath, () => setPath(first));
      imgApi.tools().then(setTools, () => setTools({ bdsupOk: false, seconvOk: false }));
    } else setPath(first);
  }, [p.open]); // eslint-disable-line react-hooks/exhaustive-deps
  // เปลี่ยนชนิดผลแล้วเปลี่ยนนามสกุลของที่เก็บตาม
  useEffect(() => { setPath((x) => (x ? x.replace(/\.(sup|idx|sub|xml)$/i, `.${EXT[opts.out]}`) : x)); }, [opts.out]);

  // ภาพต้นทางจากตัวถอดซับภาพเดิม (ffmpeg sub2video ใน subs.rs) ทีละหน้า 12 ภาพ
  const page = Math.floor(idx / PER);
  useEffect(() => {
    if (!p.open || !inApp || src?.pages[page]) return;
    let live = true;
    // รุ่นทดสอบ ตัวตรวจตั้ง window.__icvSrcFail ให้ตัวถอดภาพต้นฉบับล้ม (ไฟล์ที่ ffmpeg อ่านไม่ได้เปิดในหน้าซับไตเติลไม่ได้ จึงเรียกกรณีนี้จากไฟล์จริงไม่ได้)
    const fail = import.meta.env.DEV && (window as unknown as { __icvSrcFail?: boolean }).__icvSrcFail;
    (fail ? Promise.reject(new Error("ทดสอบ")) : subApi.images(srcPath, ff, page, PER)).then((r) => { if (live) setSrc((o) => ({ total: r.total, pages: { ...(o?.pages ?? {}), [page]: r.items } })); }, () => { if (live) setSrc((o) => ({ total: o?.total ?? 0, pages: o?.pages ?? {}, err: true })); });
    return () => { live = false; };
  }, [p.open, page, srcPath, ff]); // eslint-disable-line react-hooks/exhaustive-deps

  const reqOf = (eng: Opts["engine"]): ImgReq => { const se = eng === "seconv"; return {
    // นามสกุลตามชนิดผลที่เลือกเสมอ ที่เก็บเปลี่ยนนามสกุลตามทีหลังหนึ่งรอบ ถ้าใช้ที่เก็บตรง ๆ คำขอภาพตัวอย่างรอบแรกได้ชนิดเดิม
    src: srcPath, inMovie: t.inMovie, tid: t.tid, ff, kind, target: `${(path || "x").replace(/\.(sup|idx|sub|xml)$/i, "")}.${EXT[opts.out]}`, engine: eng, language: lang,
    resolution: opts.useRes && !se ? opts.resolution : "keep", scaleX: opts.useScale && !se ? opts.scaleX : 1, scaleY: opts.useScale && !se ? opts.scaleY : 1, filter: opts.filter,
    fpsSource: opts.useFps && !se ? opts.fpsSource : "auto", fpsTarget: opts.useFps && !se ? opts.fpsTarget : "keep", delay: se ? Math.max(0, opts.delay) : opts.delay,
    fixShort: opts.fixShort && !se, minTime: opts.minTime,
    moveY: opts.useMove && !se ? opts.moveY : "none", ratio: opts.ratio, moveYOffset: opts.moveYOffset, moveX: opts.useMove && !se ? opts.moveX : "none", moveXOffset: opts.moveXOffset, cropY: 0,
    palette: opts.palette, fixInvisible: opts.fixInvisible && !se, forced: se && opts.forced === "exclude" ? "all" : opts.forced, forceAll: se ? "" : opts.forceAll,
    alphaThr: opts.alphaThr, lumLow: opts.lumLow, lumHi: opts.lumHi,
  }; };
  const req = reqOf(engine);
  const readFail = (m: string) => /BDSup2Sub\+\+ อ่านซับนี้ไม่ได้/.test(m);
  const ratioBad = req.moveY === "inside" || req.moveY === "outside" ? !(opts.ratio > 16 / 9 + 0.001 && opts.ratio <= 4) : false;
  const engWhy = tools && !tools[se ? "seconvOk" : "bdsupOk"] ? `ยังไม่มี ${se ? "Subtitle Edit" : "BDSup2Sub++"} ในโฟลเดอร์เครื่องมือของโปรแกรม` : undefined;

  // ภาพตัวอย่างของผลที่จะได้ · แปลงจริงทั้งไฟล์ด้วยตัวเลือกเดียวกัน รอหยุดปรับ 600 มิลลิวินาที · เปลี่ยนแค่ภาพที่ดู ฝั่ง Rust ใช้ผลเดิม
  const prevKey = JSON.stringify({ ...req, target: EXT[opts.out] });
  const lastKey = useRef("");
  useEffect(() => {
    if (!p.open || !inApp || run) return;
    if (engWhy || ratioBad) { setPrev({ s: "fail", err: engWhy ?? "สัดส่วนภาพของหนังต้องกว้างกว่า 16:9 (1.78)" }); return; }
    const my = ++seq.current;
    // เปลี่ยนแค่ภาพที่ดู ขอทันที (ฝั่ง Rust มีผลอยู่แล้ว) · เปลี่ยนตัวเลือกรอหยุดปรับ 600 มิลลิวินาที
    const wait = lastKey.current === prevKey ? 0 : 600;
    lastKey.current = prevKey;
    setPrev((o) => ({ s: "busy", data: o.data }));
    const tm = setTimeout(() => {
      imgApi.preview(req, idx).then((r) => { if (seq.current === my) setPrev({ s: "done", data: r }); }, (e) => {
        if (seq.current !== my) return;
        const m = String(e);
        if (req.engine === "bdsup" && readFail(m)) { setBdBad(true); if (tools?.seconvOk) { setPrev((o) => ({ s: "busy", data: o.data })); return; } }
        setPrev({ s: "fail", err: m });
      });
    }, wait);
    return () => clearTimeout(tm);
  }, [prevKey, idx, p.open, tools]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!run || !inApp) return;
    const un = listen<{ done: number; total: number }>("imgsub-progress", (e) => setRun(e.payload));
    return () => { void un.then((f) => f()); };
  }, [run != null]); // eslint-disable-line react-hooks/exhaustive-deps

  const busy = run != null;
  const why = busy ? "กำลังแปลง" : !path ? "ยังไม่ได้เลือกที่เก็บ" : engWhy ?? (ratioBad ? "สัดส่วนภาพของหนังต้องกว้างกว่า 16:9 (1.78)" : undefined);
  const go = async (target = path) => {
    if (busy) return;
    setErr(null); setExists(false); setOut(null); setRun({ done: 0, total: 0 });
    try {
      let r: ImgOut;
      try { r = await imgApi.convert({ ...req, target }); } catch (e) {
        if (!(req.engine === "bdsup" && readFail(String(e)))) throw e;
        setBdBad(true);
        if (!tools?.seconvOk) throw e;
        setRun({ done: 0, total: 0 });
        r = await imgApi.convert({ ...reqOf("seconv"), target });
      }
      setRun(null); setOut(r);
    } catch (e) {
      setRun(null);
      const m = String(e);
      if (m === "exists") { setPath(target); setExists(true); return; }
      if (m !== "stopped") setErr(m);
    }
  };
  const browse = async () => {
    const w2 = window as unknown as { __imgTarget?: string };
    const r = import.meta.env.DEV && w2.__imgTarget ? w2.__imgTarget : await pickSave(path, EXT[opts.out], `ซับ ${OUT_NAME[opts.out]}`);
    if (r) setPath(new RegExp(`\\.${EXT[opts.out]}$`, "i").test(r) ? r : `${r}.${EXT[opts.out]}`);
  };
  const reveal = (f: string) => {
    const w2 = window as unknown as { __openDry?: boolean; __openDryLog?: string[] };
    if (import.meta.env.DEV && w2.__openDry) { (w2.__openDryLog ??= []).push(f); return; }
    api.revealMovie(f).catch((e) => setErr(String(e)));
  };

  const d = prev.data;
  // กรอบรวมของทุกภาพในชุด (PGS ขึ้นพร้อมกันได้สองกรอบ) จะได้เทียบกับภาพต้นฉบับที่ตัวถอดรวมเป็นภาพเดียว
  const ob = d && d.graphics.length ? (() => { const x = Math.min(...d.graphics.map((g) => g.x)), y = Math.min(...d.graphics.map((g) => g.y)); return { x, y, w: Math.max(...d.graphics.map((g) => g.x + g.w)) - x, h: Math.max(...d.graphics.map((g) => g.y + g.h)) - y }; })() : null;
  const total = d?.total ?? src?.total ?? 0;
  const s0 = src?.pages[page]?.[idx % PER];
  const srcInk = useInk(s0 ? [{ png: s0.png, x: s0.at[0], y: s0.at[1], w: s0.w, h: s0.h }] : null);
  const outInk = useInk(d && d.graphics.length ? d.graphics : null);
  const pct = run && run.total ? Math.round((run.done / run.total) * 100) : 0;
  const langOpts = LANG_ALL.filter((l) => l[3]).map((l) => ({ value: l[3], label: `${l[0] || l[1]} ${l[3]}` }));
  const row = (label: React.ReactNode, body: React.ReactNode, data?: string) => <div className="icv-row" data-icv-row={data}><span className="icv-lbl">{label}</span>{body}</div>;
  const onOff = (k: "useRes" | "useScale" | "useFps" | "useMove", label: string) => <Switch on={opts[k]} onChange={(v) => set(k, v)} label={label} />;

  return (
    <Dialog open={p.open} onClose={() => { if (!busy) p.onClose(); }} kind="work" title="แปลงซับภาพ" width={1120} height="calc(100vh - 48px)"
      actions={<>
        {busy ? <button type="button" className="btn btn-ghost" onClick={() => void imgApi.cancel()} data-icv-stop>หยุด</button>
          : <button type="button" className="btn btn-ghost" onClick={p.onClose}>{out ? "ปิด" : "ยกเลิก"}</button>}
        {exists && !busy && <button type="button" className="btn btn-ghost" onClick={() => { void subDocApi.freeName(path).then((f2) => { setPath(f2); void go(f2); }); }} data-icv-renum>ตั้งชื่อใหม่ต่อเลข</button>}
        <button type="button" className={"btn " + (why ? "btn-wait" : "btn-main")} aria-disabled={!!why || undefined} title={why} onClick={() => { if (!why) void go(); }} data-icv-go>
          <Keep all={["แปลง", "กำลังแปลง… 100%"]}>{busy ? `กำลังแปลง… ${pct}%` : "แปลง"}</Keep></button>
      </>}>
      <div className="icv" data-icv>
        <div className="icv-cols">
          <div className="icv-l" data-icv-left>
            <div className="icv-intro"><Phr>{`แปลงซับภาพ ${ft} เป็นไฟล์ชนิดอื่น และย่อขยายภาพ เปลี่ยนอัตราเฟรม หรือเลื่อนเวลาได้ในรอบเดียว`}</Phr> <InfoTip title="แปลงซับภาพ" tip={INTRO_TIP} /></div>
            {row("ที่เก็บ", <><span className="icv-path small" title={path} data-icv-path>{path.split(/(?<=[\\/])/).map((s, i) => <span key={i}>{s}<wbr /></span>)}</span>
              <button type="button" className={"btn btn-ghost btn-sm" + (busy ? " btn-wait" : "")} aria-disabled={busy || undefined} onClick={() => { if (!busy) void browse(); }} data-icv-browse><IcFolder size={15} />เปลี่ยนที่เก็บ</button></>)}

            <div className="icv-head">ตัวแปลง<InfoTip title="ตัวแปลงซับภาพ" tip={ENGINE_TIP} />
              <button type="button" className="btn btn-ghost btn-sm icv-reset" onClick={() => setOpts({ ...OPTS0, out: opts.out })} data-icv-reset><IbRevert size={14} />ค่าตั้งต้น</button></div>
            <div className="icv-engs" role="radiogroup" aria-label="ตัวแปลงซับภาพ">
              {([["bdsup", "BDSup2Sub++", "ย่อขยายภาพ เปลี่ยนอัตราเฟรม และย้ายตำแหน่งได้", tools && !tools.bdsupOk ? "ยังไม่มี BDSup2Sub++ ในโฟลเดอร์เครื่องมือ" : bdBad ? (tools?.seconvOk ? "อ่านไฟล์นี้ไม่ได้ จึงใช้ Subtitle Edit แทน" : "อ่านไฟล์นี้ไม่ได้") : undefined],
                ["seconv", "Subtitle Edit", "ใช้แทนเมื่อ BDSup2Sub++ อ่านไฟล์ไม่ได้", tools && !tools.seconvOk ? "ยังไม่มี Subtitle Edit ในโฟลเดอร์เครื่องมือ" : undefined]] as const).map(([k, name, note, no]) => (
                <button key={k} type="button" role="radio" aria-checked={engine === k} aria-disabled={busy || !!no || undefined} title={no}
                  className={"icv-eng" + (engine === k ? " on" : "") + (no ? " off" : "")} onClick={() => { if (!busy && !no) set("engine", k); }} data-icv-engine={k} data-icv-bdbad={k === "bdsup" && bdBad ? "" : undefined}>
                  <span className="icv-engt"><b>{name}</b>{k === "bdsup" && !no && <span className="icv-badge">แนะนำ</span>}</span>
                  <span className="small">{no ?? note}</span>
                </button>))}
            </div>
            {row(<>ชนิดไฟล์<InfoTip title="ชนิดไฟล์" tip={OUT_TIP} /></>, <Seg small label="ชนิดไฟล์" value={opts.out} onChange={(v) => set("out", v)} options={[{ value: "sup", label: "PGS .sup" }, { value: "idx", label: "VobSub .idx" }, { value: "xml", label: "BDN XML" }]} />, "out")}

            {se ? <div className="small icv-note" data-icv-se-note><Phr>Subtitle Edit ทำได้แค่เปลี่ยนชนิดไฟล์ เลื่อนเวลาให้ซับขึ้นช้าลง และเลือกเฉพาะซับบังคับ ตัวเลือกอื่นจึงซ่อนไว้</Phr></div> : <>
              <div className="icv-head">ขนาดภาพ</div>
              {row(<>เปลี่ยนขนาดจอ<InfoTip title="ขนาดจอ" tip={RES_TIP} /></>, <>{onOff("useRes", "เปลี่ยนขนาดจอ")}
                <Dropdown label="ขนาดจอ" value={opts.resolution} disabled={!opts.useRes ? "เปิดสวิตช์ก่อน" : undefined} options={RES.map((r) => ({ value: r.v, label: r.label }))} onChange={(v) => set("resolution", v as ImgReq["resolution"])} /></>, "res")}
              {row(<>ย่อขยายภาพซับ<InfoTip title="ย่อขยายภาพซับ" tip={SCALE_TIP} /></>, <>{onOff("useScale", "ย่อขยายภาพซับ")}
                <label className="icv-f">แนวนอน<NumBox value={opts.scaleX} onChange={(x) => set("scaleX", Math.max(0.5, Math.min(2, x)))} width={60} data="icv-scale-x" />เท่า</label>
                <label className="icv-f">แนวตั้ง<NumBox value={opts.scaleY} onChange={(x) => set("scaleY", Math.max(0.5, Math.min(2, x)))} width={60} data="icv-scale-y" />เท่า</label></>, "scale")}
              {row(<>วิธีย่อขยาย<InfoTip title="วิธีย่อขยาย" tip={FILTER_TIP} /></>, <Dropdown label="วิธีย่อขยาย" value={opts.filter} options={FILTERS.map(([v, l]) => ({ value: v, label: l }))} onChange={(v) => set("filter", v)} />, "filter")}
            </>}

            <div className="icv-head">เวลา</div>
            {!se && row(<>อัตราเฟรม<InfoTip title="อัตราเฟรม" tip={FPS_TIP} /></>, <>{onOff("useFps", "เปลี่ยนอัตราเฟรม")}
              <Dropdown label="อัตราเฟรมต้นทาง" value={opts.fpsSource} disabled={!opts.useFps ? "เปิดสวิตช์ก่อน" : undefined} options={[{ value: "auto", label: "อัตโนมัติ" }, ...FPS.map((f) => ({ value: f, label: `${f} fps` }))]} onChange={(v) => set("fpsSource", v)} />
              <span className="small">เป็น</span>
              <Dropdown label="อัตราเฟรมปลายทาง" value={opts.fpsTarget} disabled={!opts.useFps ? "เปิดสวิตช์ก่อน" : undefined} options={[{ value: "keep", label: "เท่าเดิม" }, ...FPS.map((f) => ({ value: f, label: `${f} fps` }))]} onChange={(v) => set("fpsTarget", v)} /></>, "fps")}
            {row(<>เลื่อนเวลา<InfoTip title="เลื่อนเวลา" tip={DELAY_TIP} /></>, <><NumBox value={opts.delay} onChange={(x) => set("delay", Math.round(Math.max(se ? 0 : -3600000, Math.min(3600000, x))))} width={84} data="icv-delay" />
              <span className="small">{se ? "มิลลิวินาที และเลื่อนให้ช้าลงได้อย่างเดียว" : "มิลลิวินาที"}</span></>, "delay")}
            {!se && row(<>ภาพที่ขึ้นสั้นไป<InfoTip title="ภาพที่ขึ้นสั้นไป" tip={SHORT_TIP} /></>, <><Switch on={opts.fixShort} onChange={(v) => set("fixShort", v)} label="ยืดภาพที่ขึ้นสั้นไป" />
              <span className="small">ขั้นต่ำ</span><NumBox value={opts.minTime} onChange={(x) => set("minTime", Math.round(Math.max(1, Math.min(60000, x))))} width={72} data="icv-min-time" /><span className="small">มิลลิวินาที</span></>, "short")}

            {!se && <>
              <div className="icv-head">ตำแหน่ง</div>
              {row(<>ย้ายแนวตั้ง<InfoTip title="ย้ายแนวตั้ง" tip={MOVEY_TIP} /></>, <>{onOff("useMove", "ย้ายตำแหน่ง")}
                <Dropdown label="ย้ายแนวตั้ง" value={opts.moveY} disabled={!opts.useMove ? "เปิดสวิตช์ย้ายตำแหน่งก่อน" : undefined} onChange={(v) => set("moveY", v as Opts["moveY"])}
                  options={[{ value: "none", label: "ไม่ย้าย" }, { value: "inside", label: "ย้ายเข้าในภาพ" }, { value: "outside", label: "ย้ายออกนอกภาพ" }, { value: "up", label: "เลื่อนขึ้น" }, { value: "down", label: "เลื่อนลง" }]} />
                <label className="icv-f">ระยะ<NumBox value={opts.moveYOffset} onChange={(x) => set("moveYOffset", Math.round(Math.max(-2000, Math.min(2000, x))))} width={60} data="icv-move-y" />จุด</label></>, "move-y")}
              {opts.useMove && (opts.moveY === "inside" || opts.moveY === "outside") && row(<>สัดส่วนภาพหนัง<InfoTip title="สัดส่วนภาพหนัง" tip={RATIO_TIP} /></>, <>
                <NumBox value={opts.ratio} onChange={(x) => set("ratio", x)} width={60} data="icv-ratio" />{ratioBad && <span className="small icv-bad">ต้องกว้างกว่า 1.78</span>}</>, "ratio")}
              {row(<>ย้ายแนวนอน<InfoTip title="ย้ายแนวนอน" tip={MOVEX_TIP} /></>, <>
                <Dropdown label="ย้ายแนวนอน" value={opts.moveX} disabled={!opts.useMove ? "เปิดสวิตช์ย้ายตำแหน่งก่อน" : undefined} onChange={(v) => set("moveX", v as Opts["moveX"])}
                  options={[{ value: "none", label: "ไม่ย้าย" }, { value: "left", label: "ชิดซ้าย" }, { value: "right", label: "ชิดขวา" }, { value: "center", label: "กึ่งกลาง" }, { value: "origin", label: "ตำแหน่งเดิม" }]} />
                <label className="icv-f">ระยะ<NumBox value={opts.moveXOffset} onChange={(x) => set("moveXOffset", Math.round(Math.max(-2000, Math.min(2000, x))))} width={60} data="icv-move-x" />จุด</label></>, "move-x")}

              <div className="icv-head">สีและซับบังคับ</div>
              {row(<>จานสี<InfoTip title="จานสี" tip={PAL_TIP} /></>, <Seg small label="จานสี" value={opts.palette} onChange={(v) => set("palette", v)} options={[{ value: "keep", label: "คงเดิม" }, { value: "create", label: "สร้างใหม่" }, { value: "dither", label: "กระจายจุดสี" }]} />, "palette")}
              {row(<>ภาพที่มองไม่เห็น<InfoTip title="ภาพที่มองไม่เห็น" tip={INVIS_TIP} /></>, <><Switch on={opts.fixInvisible} onChange={(v) => set("fixInvisible", v)} label="แก้ภาพที่มองไม่เห็น" /><span className="small">ให้ภาพที่ใสทั้งภาพกลับมาเห็น</span></>, "invisible")}
            </>}
            {se && <div className="icv-head">ซับบังคับ</div>}
            {row(<>ภาพที่แปลง<InfoTip title="ซับบังคับ" tip={FORCED_TIP} /></>, <Seg small label="ภาพที่แปลง" value={req.forced} onChange={(v) => set("forced", v)}
              options={se ? [{ value: "all", label: "ทุกภาพ" }, { value: "only", label: "เฉพาะซับบังคับ" }] : [{ value: "all", label: "ทุกภาพ" }, { value: "only", label: "เฉพาะซับบังคับ" }, { value: "exclude", label: "ยกเว้นซับบังคับ" }]} />, "forced")}
            {!se && row(<>ป้ายซับบังคับ<InfoTip title="ป้ายซับบังคับ" tip={FORCEALL_TIP} /></>, <Seg small label="ป้ายซับบังคับ" value={opts.forceAll} onChange={(v) => set("forceAll", v)} options={[{ value: "", label: "คงเดิม" }, { value: "set", label: "ติดทุกภาพ" }, { value: "clear", label: "เอาออกทุกภาพ" }]} />, "force-all")}

            {opts.out === "idx" && <>
              <div className="icv-head">เฉพาะ VobSub</div>
              {row(<>ภาษา<InfoTip title="ภาษาของ VobSub" tip={LANG_TIP} /></>, <Dropdown label="ภาษา" value={lang} search hint="พิมพ์ค้น เช่น tha หรือ ไทย" options={langOpts} onChange={setLang} />, "lang")}
              {!se && row(<>เกณฑ์ความทึบ<InfoTip title="เกณฑ์ความทึบ" tip={ALPHA_TIP} /></>, <><div className="icv-range" data-icv-alpha><Range value={opts.alphaThr} min={0} max={255} step={1} onChange={(v) => set("alphaThr", v)} label="เกณฑ์ความทึบ" /></div><span className="icv-val">{opts.alphaThr}</span></>, "alpha")}
              {!se && row(<>เกณฑ์ความสว่าง<InfoTip title="เกณฑ์ความสว่าง" tip={LUM_TIP} /></>, <>
                <label className="icv-f">ระหว่างเข้มกับกลาง<NumBox value={opts.lumLow} onChange={(x) => set("lumLow", Math.round(Math.max(0, Math.min(255, x))))} width={56} data="icv-lum-low" /></label>
                <label className="icv-f">ระหว่างกลางกับสว่าง<NumBox value={opts.lumHi} onChange={(x) => set("lumHi", Math.round(Math.max(0, Math.min(255, x))))} width={56} data="icv-lum-hi" /></label></>, "lum")}
            </>}
          </div>

          <div className="icv-r" data-icv-right>
            <div className="icv-head icv-rhead">ภาพตัวอย่าง<InfoTip title="มุมมองภาพตัวอย่าง" tip={VIEW_TIP} />
              <span className="icv-viewseg"><Seg small label="มุมมองภาพตัวอย่าง" value={view} onChange={setView} options={[{ value: "full", label: "ทั้งจอ" }, { value: "real", label: "ขนาดจริง" }, { value: "zoom", label: "ขยาย 2 เท่า" }]} /></span></div>
            <div className="icv-pick" data-icv-pick>
              <button type="button" className="btn btn-ghost btn-sm" aria-disabled={idx <= 0 || undefined} title={idx <= 0 ? "ภาพแรกแล้ว" : "ภาพก่อนหน้า"} onClick={() => { if (idx > 0) setIdx(idx - 1); }} data-icv-prev><IbBack size={14} /></button>
              <span className="small">{total ? `ภาพที่ ${(idx + 1).toLocaleString("en-US")} จาก ${total.toLocaleString("en-US")}` : "—"}</span>
              <button type="button" className="btn btn-ghost btn-sm" aria-disabled={idx >= total - 1 || undefined} title={idx >= total - 1 ? "ภาพสุดท้ายแล้ว" : "ภาพถัดไป"} onClick={() => { if (idx < total - 1) setIdx(idx + 1); }} data-icv-next><IbNext size={14} /></button>
            </div>
            <figure className="icv-fig"><figcaption data-icv-cap="src">{`ต้นฉบับเป็น ${ft}${s0 ? ` จอ ${s0.canvas[0]} × ${s0.canvas[1]}` : ""}`}</figcaption>
              {s0 && view !== "full" ? <Crop parts={[{ png: s0.png, x: s0.at[0], y: s0.at[1], w: s0.w, h: s0.h }]} box={srcInk ?? { x: s0.at[0], y: s0.at[1], w: s0.w, h: s0.h }} zoom={view === "zoom" ? 2 : 1} data="src" el={cropSrc} other={cropOut} />
                : s0 ? <Frame cw={s0.canvas[0]} ch={s0.canvas[1]} parts={[{ png: s0.png, x: s0.at[0], y: s0.at[1], w: s0.w, h: s0.h }]} data="src" />
                : src?.err && !src.pages[page] ? <div className={"icv-frame icv-none" + (view !== "full" ? " icv-cropskel" : "")} style={{ aspectRatio: view === "full" ? `${d?.w || 16} / ${d?.h || 9}` : undefined }} data-icv-src-err><span className="small">ตัวถอดภาพต้นฉบับอ่านไฟล์นี้ไม่ได้ จึงไม่มีภาพให้เทียบ</span></div>
                : <div className={"icv-frame skel" + (view !== "full" ? " icv-cropskel" : "")} style={{ aspectRatio: view === "full" ? "16 / 9" : undefined }} />}
              <div className="small icv-info" data-icv-info="src">{s0 ? `ภาพ ${(srcInk ?? s0).w} × ${(srcInk ?? s0).h} ที่ ${srcInk?.x ?? s0.at[0]}, ${srcInk?.y ?? s0.at[1]} เวลา ${ts(s0.start * 1000)}${s0.end != null ? `–${ts(s0.end * 1000)}` : ""}` : " "}</div></figure>
            <figure className="icv-fig"><figcaption data-icv-cap="out">{`ไฟล์ที่จะได้เป็น ${OUT_NAME[opts.out]}${d && d.w ? ` จอ ${d.w} × ${d.h}` : ""}`}</figcaption>
              <div className="icv-wrap">
                {d && ob && view !== "full" ? <Crop parts={d.graphics} box={outInk ?? ob} zoom={view === "zoom" ? 2 : 1} data="out" el={cropOut} other={cropSrc} />
                  : d && d.graphics.length ? <Frame cw={d.w || 1920} ch={d.h || 1080} parts={d.graphics} data="out" />
                  // ทำภาพตัวอย่างไม่ได้ กล่องเหตุผลกับปุ่มใช้ Subtitle Edit อยู่แทนกรอบภาพ เห็นทันทีไม่ต้องเลื่อนลง (เจอจากภาพตรวจ 15 พ.ย. 2569)
                  : prev.s === "fail" ? <div className="stat bad icv-preverr" data-icv-prev-err><CardIcon kind="bad" /><div><b>ทำภาพตัวอย่างไม่ได้</b><Phr>{prev.err ?? ""}</Phr></div></div>
                  : <div className={"icv-frame skel" + (view !== "full" ? " icv-cropskel" : "")} style={{ aspectRatio: view === "full" ? "16 / 9" : undefined }} />}
                {prev.s === "busy" && <span className="icv-wait small" data-icv-wait>{se ? "Subtitle Edit กำลังแปลงภาพตัวอย่าง…" : "BDSup2Sub++ กำลังแปลงภาพตัวอย่าง…"}</span>}
              </div>
              <div className="small icv-info" data-icv-info="out">{d && ob ? `ภาพ ${(outInk ?? ob).w} × ${(outInk ?? ob).h} ที่ ${(outInk ?? ob).x}, ${(outInk ?? ob).y} เวลา ${ts(d.start)}–${ts(d.end)}${d.forced ? " เป็นซับบังคับ" : ""}` : " "}</div></figure>
            {d && d.warnings.length > 0 && <div className="small icv-warn" data-icv-warn>{d.warnings.slice(0, 3).map((w) => <div key={w}><Phr>{warnTh(w)}</Phr></div>)}</div>}
            {d && src && d.total !== src.total && src.total > 0 && <div className="small icv-note" data-icv-count-note><Phr>{`ต้นฉบับมี ${src.total.toLocaleString("en-US")} ภาพ แต่ไฟล์ที่จะได้มี ${d.total.toLocaleString("en-US")} ภาพ เพราะตัวแปลงรวมภาพที่ติดกันหรือข้ามภาพว่าง ภาพเลขเดียวกันจึงอาจไม่ใช่ภาพเดียวกัน`}</Phr></div>}
          </div>
        </div>

        {(busy || exists || err || out) && <div className="icv-stat" data-icv-status>
          {busy && <div className="icv-row"><div className="icv-prog" data-icv-prog><div style={{ width: `${pct}%` }} /></div>
            <span className="small">{run.total ? `แปลงภาพที่ ${run.done.toLocaleString("en-US")} จาก ${run.total.toLocaleString("en-US")}` : "กำลังเริ่ม…"}</span></div>}
          {exists && <div className="small icv-bad" data-icv-exists><Phr>{`มีไฟล์ชื่อ ${nameOf(path)} อยู่แล้ว โปรแกรมจึงไม่เขียนทับ กดตั้งชื่อใหม่ต่อเลข หรือเลือกที่เก็บใหม่`}</Phr></div>}
          {err && <div className="stat bad" style={{ margin: 0 }} role="alert" data-icv-err><CardIcon kind="bad" /><div><b>แปลงไม่สำเร็จ</b><Phr>{err}</Phr></div></div>}
          {out && <div className="stat ok" style={{ margin: 0 }} data-icv-done><CardIcon kind="ok" /><div style={{ flex: 1, minWidth: 0 }}>
            <b>{`แปลงแล้ว ${out.files.map(nameOf).join(" กับ ")}`}</b>
            <Phr>{`ได้ ${out.images.toLocaleString("en-US")} ภาพ ไฟล์ขนาด ${fsize(out.bytes)}${out.w ? ` จอ ${out.w} × ${out.h}` : ""}`}</Phr>
            <div className="minirow"><button type="button" className="btn btn-ghost btn-sm" onClick={() => reveal(out.files[0])} data-icv-reveal><IcFolder size={15} />เปิดโฟลเดอร์</button></div>
          </div></div>}
        </div>}
      </div>
    </Dialog>
  );
}
