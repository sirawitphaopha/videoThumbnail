/* ตัวดูซับ (มอคอัปหัวข้อ 4 · แผนเสียงและซับ ขั้น 6) · ดูอย่างเดียว แก้ไม่ได้
   ซับตัวหนังสือ (SRT ASS VTT) สามแบบ
   ① แบบ Aegisub ภาพหนังตรงเวลานั้นพร้อมซับทับ ซ้ายบน · คลื่นเสียงช่วงนั้นพร้อมกรอบเวลาของแต่ละบรรทัด ขวาบน · ตารางบรรทัดซับล่าง
      ช่องตัวอักษรต่อวินาทีขึ้นสีเมื่อเกิน 20 (อ่านไม่ทัน) · ช่องเวลาเริ่มขึ้นสีเมื่อซ้อนกับบรรทัดก่อน · กดแถว ภาพกับคลื่นเลื่อนตาม
   ② แบบอ่านยาว เรียงบรรทัดพร้อมเวลา ค้นคำได้
   ③ แบบ notepad ไฟล์จริงทุกตัวอักษร มีเลขบรรทัด ค้นคำได้ · เวลาตามไฟล์ ยังไม่บวกดีเลย์
   ซับรูป (PGS VobSub) ถอดเป็นรูปทีละภาพ หน้าละ 6 ภาพ พื้นตารางหมากรุกคือส่วนโปร่งใส กดภาพดูเต็มจอที่ตำแหน่งจริง
   ใส่ดีเลย์ไว้ เวลาที่แสดงเลื่อนตามดีเลย์ (ยกเว้นแบบ notepad) */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Dialog from "./Dialog";
import { CardIcon, Phr, Seg, Skel } from "./ui";
import { subApi, type SubText } from "../lib/api";
import type { AvTrack } from "../lib/avJob";
import { ftName, isBitmapSub, isImageSub } from "../lib/ftypes";
import { IbWand } from "./icons";
import { IbTable, IcFile, IbPencil, IbResample } from "./icons";
import ImgConvDialog from "./ImgConvDialog";
import { baseName, sign } from "./subviewer/svShared";
import { TextView } from "./subviewer/TextView";
import { ImageView } from "./subviewer/ImageView";
export { cpsChars } from "./subviewer/TextView";

/** กรอบตัวดูซับในหน้าซับไตเติล · ซับรูปสูงพอดีที่เหลือของหน้าต่าง รายการเวลากับตารางภาพอยู่ในจอ หน้าไม่เลื่อน
 *  (BUGS ข้อ 142 พี่กันขอ 16 พ.ย. 2569 "หน้านี้ ขอเหมือนกันสิ" · "ไม่เอาเลื่อนลงไปแบบนี้") */
function InlineCard(p: { image: boolean; children: React.ReactNode }) {
  const el = useRef<HTMLElement>(null);
  const [h, setH] = useState<number | null>(null);
  useLayoutEffect(() => {
    if (!p.image) { setH(null); return; }
    const fit = () => {
      const box = el.current;
      if (!box) return;
      // ขอบบนของกรอบนับจากต้นหน้า (ไม่ขึ้นกับตำแหน่งที่เลื่อนอยู่) เว้นขอบล่าง 16 ไม่ต่ำกว่า 420
      const wrap = box.closest(".pagewrap");
      const top = box.getBoundingClientRect().top + (wrap?.scrollTop ?? 0);
      setH(Math.max(420, Math.floor(window.innerHeight - top - 16)));
    };
    fit();
    window.addEventListener("resize", fit);
    const ro = new ResizeObserver(fit);
    if (el.current?.parentElement) ro.observe(el.current.parentElement);
    return () => { window.removeEventListener("resize", fit); ro.disconnect(); };
  }, [p.image]);
  return <section ref={el} className={"card subviewer-inline" + (p.image ? " fitimg" : "")} style={h ? { height: h } : undefined} data-subviewer-inline>{p.children}</section>;
}

export default function SubViewer(p: { track: AvTrack; movie: string; refStream: number | null; refIdx: number | null; onClose: () => void; onAddMovie?: () => void; inline?: boolean;
  /** ปุ่ม OCR เป็นตัวหนังสือข้างปุ่มแปลงซับภาพ (แผน OCR ขั้น 11 · ข้อ 143 ㉔) · ไม่ส่งไม่มีปุ่ม */
  onOcr?: () => void;
  /** หน้าซับไตเติลคุมแบบการดูเอง ปุ่มเลือกแบบอยู่แถวบนของหน้า (BUGS ข้อ 109 พี่กัน "เอาปุ่มเลือกรูปแบบไปไว้ตรงปุ่มเพิ่มวิดีโอ") */
  tab?: "aeg" | "long" | "pad" }) {
  const t = p.track;
  const ft = ftName("subtitle", t.codec, t.profile);
  // ซับรูปทุกชนิดเปิดด้วยตัวถอดภาพ · แปลงซับภาพกับ OCR เฉพาะชนิดที่เครื่องมือแปลงรองรับ (AUDIT ข้อ 94 · เดิม DVB ไปทางตัวหนังสือแล้วอ่านไม่ได้)
  const image = isBitmapSub(t.codec, t.profile), convOk = isImageSub(t.codec, t.profile);
  const ff = t.ff ?? t.tid;
  const [tabS, setTab] = useState<"aeg" | "long" | "pad">("aeg");
  const tab = p.tab ?? tabS;
  const [data, setData] = useState<SubText | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [conv, setConv] = useState(false);
  const [imgTotal, setImgTotal] = useState<number | null>(null);
  useEffect(() => {
    if (image) return;
    subApi.text(t.inMovie ? p.movie : t.src, t.inMovie, t.tid, ff).then(setData, (e) => setErr(String(e)));
  }, [image, t.inMovie, t.src, t.tid, ff, p.movie]);
  const name = t.inMovie ? `${t.name || "ซับในหนัง"} (${ft})` : baseName(t.src);
  // เขียนเป็นประโยค (เดิมเป็นวลีคั่นจุลภาค "ดีเลย์ +500 ms เวลาที่แสดงเลื่อนแล้ว" อ่านกำกวม เจอตอนอ่านภาพ 11 พ.ย. 2569)
  const sub = `${t.inMovie ? "ซับที่อยู่ในไฟล์หนัง" : "ซับที่เพิ่มเข้ามา"}เป็น${image ? "ซับรูปภาพ" : "ซับตัวหนังสือ"}แบบ ${ft}${data ? ` มี ${data.cues.length.toLocaleString("en-US")} บรรทัด` : image && imgTotal != null ? ` มี ${imgTotal.toLocaleString("en-US")} ภาพ` : ""}${t.delay ? `  ตั้งดีเลย์ ${sign(t.delay)} ms ไว้ เวลาที่แสดงจึงเลื่อนตามดีเลย์แล้ว` : ""}`;
  const head = <span style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
    <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>ซับ {name}</span>
    <span style={{ display: "flex", gap: 8, alignItems: "center", marginLeft: "auto" }}>
      {!image && <Seg small label="แบบการดู" value={tab} onChange={setTab} options={[{ value: "aeg", label: <><IbTable size={14} />แบบ Aegisub</> }, { value: "long", label: <><IcFile size={14} />แบบอ่านยาว</> }, { value: "pad", label: <><IbPencil size={14} />แบบ notepad</> }]} />}
    </span></span>;
  const body = (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, ...(image ? { flex: 1, minHeight: 0 } : {}) }} data-subviewer data-mode={image ? "image" : tab}>
      {image ? <div className="sv-imghead" style={{ marginTop: p.inline ? 0 : -6 }}>
        <div className="small"><Phr>{sub}</Phr></div>
        {/* แปลงซับภาพเป็นซับภาพชนิดอื่น (BUGS ข้อ 125 · ImgConvDialog.tsx) */}
        {convOk && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConv(true)} title="แปลงเป็น PGS VobSub หรือ BDN XML และย่อขยายภาพ เปลี่ยนอัตราเฟรม หรือเลื่อนเวลาได้" data-imgconv-open><IbResample size={14} />แปลงซับภาพ</button>}
        {p.onOcr && convOk && <button type="button" className="btn btn-main btn-sm" onClick={p.onOcr} title="อ่านซับรูปเป็นตัวหนังสือ แล้วตรวจทานก่อนส่งออก" data-ocr-open><IbWand size={14} />OCR เป็นตัวหนังสือ</button>}
      </div> : <div className="small" style={{ marginTop: p.inline ? 0 : -6 }}><Phr>{sub}</Phr></div>}
      {image && conv && createPortal(<ImgConvDialog open onClose={() => setConv(false)} track={t} movie={p.movie} />, document.body)}
      {image ? <ImageView track={t} path={t.inMovie ? p.movie : t.src} ff={ff} movie={p.movie || undefined} onClose={p.inline ? undefined : p.onClose} onTotal={setImgTotal} />
        : err ? <div className="stat bad"><CardIcon kind="bad" /><div><b>อ่านซับไม่ได้</b><Phr>{err}</Phr></div></div>
        : !data ? <><Skel w="100%" h={203} /><Skel w="100%" h={220} /></>
        : <TextView track={t} movie={p.movie} refStream={p.refStream} refIdx={p.refIdx} data={data} tab={tab} onAddMovie={p.onAddMovie} />}
    </div>
  );
  // หน้าซับไตเติลแสดงในหน้าเลย ไม่เด้งหน้าต่างซ้อน (BUGS ข้อ 104 พี่กันทัก 13 พ.ย. 2569 "ตัวซับจะเปิดได้ที่หน้านี้เลย")
  // ไม่มีหัวข้อซ้ำ ชื่อไฟล์อยู่แถวบนของหน้า แถบแทร็กบอกว่าดูซับไหน ปุ่มเลือกแบบการดูอยู่แถวบน ไม่มีขอบในด้านบน ตัวดูซับชิดแถวบน (พี่กัน "ระยะห่างเยอะไป")
  if (p.inline) return <InlineCard image={image}>{body}</InlineCard>;
  return (
    // สูงคงที่ทุกแบบ สลับแบบ Aegisub อ่านยาว notepad หรือซับรูปแล้วหน้าต่างไม่ยืดหด เนื้อที่ยาวกว่าเลื่อนในหน้าต่าง (BUGS ข้อ 100 พี่กันสั่ง 13 พ.ย. 2569 "หน้าจอซับทั้งสามแบบ ให้ popup ขนาดเท่ากันตลอด")
    // ซับรูปสูงเต็มจอ ภาพต่อหน้าเพิ่มตามความสูง (พี่กันบอก 15 พ.ย. 2569 "ให้มันยาวกว่านี้ได้นะ หน้านี้") · ซับตัวหนังสือสามแบบยังสูงเท่ากันตามข้อ 100
    <Dialog open onClose={p.onClose} width={image ? 1120 : 980} height={image ? "calc(100vh - 48px)" : "min(720px, 88vh)"} title={head}
      // ซับตัวหนังสือปิดที่แถบล่าง ซับรูปปิดที่แถวปุ่มเปลี่ยนหน้าในตัวดูซับรูป
      actions={image ? undefined : <button type="button" className="btn btn-ghost btn-sm" onClick={p.onClose} data-sv-close>ปิด</button>}>
      {body}
    </Dialog>
  );
}
