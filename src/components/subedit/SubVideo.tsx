/* กรอบภาพหนังของหน้าแก้ซับ (แผนหน้าแก้ซับ ขั้น 3 · รุ่นแรกยกวิธีจากตัวดูซับเดิม SubViewer.tsx)
   ภาพหนังตรงเวลาเริ่มของบรรทัดที่กำลังแก้ ซับทับภาพ เวลามุมขวาบน · ขั้น 4 เพิ่มขนาดภาพ เลขเฟรม keyframe เดินทีละเฟรม วิดีโอจำลอง
   ยังไม่มีไฟล์วิดีโอ บอกในกรอบพร้อมปุ่มเพิ่มไฟล์วิดีโอ (BUGS ข้อ 107) */
import { useEffect, useState } from "react";
import { subApi, type SubDoc, type SubEvent } from "../../lib/api";
import { fmtTime, isAss } from "../../lib/subText";
import { Skel } from "../ui";
import { IcFile } from "../icons";

/** ข้อความที่ตาเห็นบนภาพ ไม่มีแท็ก ขึ้นบรรทัดจริง */
export function shownText(e: SubEvent, d: SubDoc) {
  return isAss(d) ? e.text.replace(/\{[^}]*\}/g, "").replace(/\\[Nn]/g, "\n").replace(/\\h/g, " ") : e.text.replace(/<[^>]*>/g, "");
}

export default function SubVideo(p: { movie: string; delayMs: number; doc: SubDoc; ev: SubEvent | null; onAddMovie?: () => void }) {
  const [frame, setFrame] = useState<string | null>(null);
  const at = p.ev ? p.ev.start + p.delayMs + Math.min(300, (p.ev.end - p.ev.start) / 2) : null;
  useEffect(() => {
    if (at == null) return;
    if (!p.movie) { setFrame(""); return; }
    let live = true;
    // รอนิดหนึ่ง กดเลื่อนบรรทัดเร็ว ๆ ไม่ถอดภาพทุกบรรทัด
    const tm = setTimeout(() => subApi.frame(p.movie, Math.max(0, at) / 1000, 360).then((f) => { if (live) setFrame(f); }, () => { if (live) setFrame(""); }), 120);
    return () => { live = false; clearTimeout(tm); };
  }, [at, p.movie]);
  return (
    <div className="vframe se-vframe" data-vframe>
      {frame ? <img src={frame} alt={p.ev ? `ภาพหนังที่ ${fmtTime(p.ev.start, p.doc.kind)}` : ""} /> : frame === "" ? <div className="vnone">{p.movie ? "ดึงภาพหนังไม่ได้" : <>
        <span>เปิดไฟล์ซับอย่างเดียว จึงไม่มีภาพหนัง</span>
        {p.onAddMovie && <button type="button" className="btn btn-ghost btn-sm" onClick={p.onAddMovie} data-sub-addvideo><IcFile size={15} />เพิ่มไฟล์วิดีโอ</button>}</>}</div> : <Skel w="100%" h={180} r={0} />}
      {p.ev && <div className="vsub">{shownText(p.ev, p.doc)}</div>}
      {p.ev && <div className="vtime">{fmtTime(p.ev.start + p.delayMs, p.doc.kind)}</div>}
    </div>
  );
}
