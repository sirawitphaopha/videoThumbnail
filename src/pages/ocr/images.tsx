/* หน้า OCR ภาพซับ ภาพแบบชิดกัน ภาพเต็มจอ ข้อความในแถว สีพื้นหลังของภาพ
   แยกจาก OcrPage.tsx ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 · แผนแบ่งไฟล์ขั้น 7.1) ย้ายมาทั้งก้อน เนื้อโค้ดไม่เปลี่ยน */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Dropdown from "../../components/Dropdown";
import { Skel } from "../../components/ui";
import { IcExpand } from "../../components/icons";
import { subApi, type SubImg } from "../../lib/api";
import { lineAns, type OcrRow } from "../../lib/ocrJob";
import { useEscClose } from "../../lib/popup";

/* ---------- ภาพซับ ---------- */
const PER = 40;
/** ภาพซับทีละหน้า ใช้ผลถอดชุดเดียวกับตัวดูซับรูป · need(n) ขอหน้าที่มีภาพ n (นับจาก 1) */
export function useSubImgs(path: string, ff: number) {
  const [imgs, setImgs] = useState<Map<number, SubImg>>(() => new Map());
  const asked = useRef(new Set<number>());
  // รุ่นของชุดภาพ · คำขอที่ส่งก่อนวาดสีใหม่หรือก่อนเปลี่ยนซับ ตอบทีหลังแล้วทิ้ง ไม่ให้ภาพสีเดิมกลับมาทับ (ผู้ช่วยตรวจทาน U21)
  const gen = useRef(0);
  useEffect(() => { gen.current++; setImgs(new Map()); asked.current = new Set(); }, [path, ff]);
  const need = (n: number) => {
    const page = Math.floor((n - 1) / PER);
    if (asked.current.has(page)) return;
    asked.current.add(page);
    const my = gen.current;
    subApi.images(path, ff, page, PER).then((r) => { if (my === gen.current) setImgs((m) => { const x = new Map(m); r.items.forEach((it) => x.set(it.n, it)); return x; }); }, () => { if (my === gen.current) asked.current.delete(page); });
  };
  /** ภาพถูกวาดใหม่ (สีของ VobSub) ล้างที่จำไว้แล้วขอใหม่ */
  const reload = () => { gen.current++; setImgs(new Map()); asked.current = new Set(); };
  return { imgs, need, reload };
}

/** ภาพบรรทัดซับบนพื้นเทา · ปุ่มขยายมุมขวาล่างแบบ .bigbtn ของโปรแกรม (ซ่อนได้ในตารางที่ปุ่มอยู่อีกคอลัมน์) */
/** ภาพที่ตัดช่องว่างแนวตั้งกว้างออกแล้ว จำตามภาพต้นฉบับ */
const compactCache = new Map<string, string>();
/** ภาพซับที่มีป้ายบนจอกับบทพูดล่างจอในภาพเดียว ช่องว่างตรงกลางสูงเกือบทั้งจอ ย่อลงแถวแล้วตัวหนังสืออ่านไม่ออก
 *  ตัดช่องว่างที่กว้างเกิน 60 จุดให้เหลือ 16 จุด ช่องระหว่างบรรทัดปกติกับสระบนล่างไม่แตะ · ภาพขยายยังเป็นภาพจริง */
function useCompact(src: string | undefined): { url: string | undefined; cut: boolean } {
  const [out, setOut] = useState<string | undefined>(() => (src ? compactCache.get(src) : undefined));
  useEffect(() => {
    if (!src) return;
    const hit = compactCache.get(src);
    if (hit) { setOut(hit); return; }
    let live = true;
    const im = new Image();
    im.onload = () => {
      let url = src;
      try {
        const w = im.naturalWidth, h = im.naturalHeight;
        const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
        const g = cv.getContext("2d");
        if (g && w > 0 && h > 0) {
          g.drawImage(im, 0, 0);
          const d = g.getImageData(0, 0, w, h).data;
          const runs: [number, number][] = [];
          for (let y = 0, start = -1; y <= h; y++) {
            let ink = false;
            if (y < h) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 20) { ink = true; break; }
            if (ink && start < 0) start = y;
            if (!ink && start >= 0) { runs.push([start, y]); start = -1; }
          }
          // ต่อแถบที่ห่างกันไม่เกิน 60 จุด (สระบน วรรณยุกต์ บรรทัดถัดไปของบทพูดเดียวกัน) เป็นก้อนเดียว
          const groups: [number, number][] = [];
          for (const r of runs) { const last = groups[groups.length - 1]; if (last && r[0] - last[1] <= 60) last[1] = r[1]; else groups.push([r[0], r[1]]); }
          if (groups.length > 1) {
            const GAP = 16, PAD = 4;
            const oh = groups.reduce((s, [a, b]) => s + b - a, 0) + GAP * (groups.length - 1) + PAD * 2;
            const c2 = document.createElement("canvas"); c2.width = w; c2.height = oh;
            const g2 = c2.getContext("2d");
            if (g2) {
              let y = PAD;
              for (const [a, b] of groups) { g2.drawImage(cv, 0, a, w, b - a, 0, y, w, b - a); y += b - a + GAP; }
              url = c2.toDataURL("image/png");
            }
          }
        }
      } catch { url = src; }
      compactCache.set(src, url);
      if (live) setOut(url);
    };
    im.onerror = () => { compactCache.set(src, src); if (live) setOut(src); };
    im.src = src;
    return () => { live = false; };
  }, [src]);
  return { url: out ?? src, cut: !!src && !!out && out !== src };
}

export function LineImg({ img, n, zoom = true }: { img: SubImg | undefined; n: number; zoom?: boolean }) {
  const [big, setBig] = useState(false);
  const shown = useCompact(img?.png);
  if (!img) return <div className="ocr-line" style={{ height: 46 }} aria-busy="true" />;
  return (<>
    <div className={zoom ? "ocr-zwrap" : undefined}><div className="ocr-line"><img src={shown.url} alt={`ซับภาพ ${n}`} data-compact={shown.cut || undefined}
      title={shown.cut ? "ตัดช่องว่างระหว่างป้ายบนจอกับบทพูดออกให้อ่านง่าย กดขยายเพื่อดูภาพจริง" : undefined} /></div>
      {zoom && <button type="button" className="bigbtn" title="ขยายดูเต็มหน้าต่าง" aria-label={`ขยายดูภาพ ${n} เต็มหน้าต่าง`} onClick={(e) => { e.stopPropagation(); setBig(true); }}><IcExpand size={11} /></button>}</div>
    {big && <BigView img={img} n={n} line onClose={() => setBig(false)} />}
  </>);
}
/** ภาพซับวางบนจอตามพิกัดในไฟล์ · frame ภาพจากหนังข้างหลัง */
export function ScreenImg({ img, n, frame }: { img: SubImg | undefined; n: number; frame?: string | null }) {
  const [big, setBig] = useState(false);
  if (!img) return <Skel w="100%" h={120} />;
  const [cw, ch] = img.canvas[0] > 0 ? img.canvas : [Math.max(img.w, 1), Math.max(img.h, 1)];
  const scr = (cls: string) => (
    <div className={"ocr-screen " + cls + (frame ? " withframe" : "")} style={{ aspectRatio: `${cw} / ${ch}`, ...(frame ? { backgroundImage: `url(${frame})`, backgroundSize: "cover" } : {}) }}>
      <img src={img.png} alt={`ซับภาพ ${n}`} style={{ left: `${(img.at[0] / cw) * 100}%`, top: `${(img.at[1] / ch) * 100}%`, width: `${(img.w / cw) * 100}%` }} />
    </div>);
  return (<>
    <div className="ocr-zwrap lg">{scr("")}
      <button type="button" className="bigbtn" title="ขยายดูเต็มหน้าต่าง" aria-label={`ขยายดูภาพ ${n} เต็มหน้าต่าง`} onClick={(e) => { e.stopPropagation(); setBig(true); }}><IcExpand size={15} /></button></div>
    {big && createPortal(
      <div className="ocr-zview" onClick={() => setBig(false)} role="dialog" aria-label={`ภาพ ${n} ขยาย`}>{scr("ocr-zscreen")}<span className="ocr-zcap">{`ภาพ ${n} กดที่ไหนก็ได้หรือกด Esc เพื่อปิด`}</span></div>, document.body)}
    {big && <EscClose onClose={() => setBig(false)} />}
  </>);
}
/** Esc ปิดภาพขยาย ผ่านชั้น Esc กลางของโปรแกรม (useEscClose) · เดิมดักที่หน้าต่างเอง ผิดกฎชั้น Esc (ผู้ช่วยตรวจทาน U13) */
function EscClose({ onClose }: { onClose: () => void }) {
  useEscClose(true, onClose);
  return null;
}
export function BigView({ img, n, onClose }: { img: SubImg; n: number; line?: boolean; onClose: () => void }) {
  return createPortal(<>
    <div className="ocr-zview" onClick={onClose} role="dialog" aria-label={`ภาพ ${n} ขยาย`}>
      <div className="ocr-line ocr-zline"><img src={img.png} alt="" /></div>
      <span className="ocr-zcap">{`ภาพ ${n} กดที่ไหนก็ได้หรือกด Esc เพื่อปิด`}</span>
    </div><EscClose onClose={onClose} /></>, document.body);
}

/** ข้อความหลายบรรทัด บรรทัดที่อยู่บนจอติดป้าย ตัวเอียงแสดงเอียง */
export function Txt({ r }: { r: OcrRow }) {
  const ls = r.text.split("\n");
  // ลำดับในบรรทัดที่มีข้อความ ตรงกับ lineAns ที่ไฟล์ส่งออกใช้ (ผู้ช่วยตรวจทาน T10)
  const an = lineAns(r);
  const idx = ls.map((_, k) => ls.slice(0, k).filter((l) => l.trim()).length);
  const top = (k: number) => !!ls[k].trim() && (an[idx[k]] ?? 2) >= 7;
  return <span className="ocr-txt">{ls.map((l, k) => (
    <span key={k} className="ocr-tl">{top(k) && <span className="ocr-pos">บนจอ</span>}{/^<i>.*<\/i>$/.test(l) ? <i>{l.replace(/<\/?i>/g, "")}</i> : l.replace(/<\/?[ib]>/g, "")}</span>))}</span>;
}
export const hasTop = (r: OcrRow) => lineAns(r).some((a) => a >= 7);

/* ---------- สีพื้นหลังของภาพซับ (BUGS ข้อ 143.2 พี่กันสั่ง "ขอปุ่มเปลี่ยนสีพื้นหลังด้วยหน่อย") ----------
   ซับตัวขาวขอบดำเห็นชัดบนพื้นเทา ซับตัวเหลืองหรือตัวดำเห็นชัดบนพื้นอื่น · ใช้กับภาพบรรทัดในตาราง หน้าต่างสอน คำที่ไม่รู้จัก แต่งภาพ · จำไว้ในเครื่อง */
type ImgBg = "gray" | "dark" | "white" | "check";
const BG_KEY = "ms.ocrImgBg";
function loadBg(): ImgBg { try { const v = localStorage.getItem(BG_KEY); return v === "dark" || v === "white" || v === "check" ? v : "gray"; } catch { return "gray"; } }
function applyBg(v: ImgBg) { document.documentElement.dataset.ocrImgbg = v; }
applyBg(loadBg());
export function BgPick() {
  const [v, setV] = useState<ImgBg>(loadBg);
  const pick = (x: ImgBg) => { setV(x); applyBg(x); try { localStorage.setItem(BG_KEY, x); } catch { /* จำไม่ได้ก็ใช้ค่านี้ไปก่อน */ } };
  return <span className="ocr-bgpick" data-ocr-bg><Dropdown label="สีพื้นหลังของภาพซับ" value={v} onChange={pick} display={(o) => `พื้น${o?.label ?? ""}`}
    options={[{ value: "gray", label: "เทา" }, { value: "dark", label: "ดำ" }, { value: "white", label: "ขาว" }, { value: "check", label: "ลายตาราง" }]} /></span>;
}
