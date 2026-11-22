/* หน้าใส่โปสเตอร์ ส่วนประกอบ · ตัดกลางรูป ปุ่ม ชื่อแทร็ก การ์ดเสร็จ ช่องติ๊ก ปุ่มเลือก รูปในโฟลเดอร์ของหนัง
   แยกจาก PosterPage.tsx ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 · แผนแบ่งไฟล์ขั้น 7.3) ย้ายมาทั้งก้อน เนื้อโค้ดไม่เปลี่ยน */
import { useEffect, useMemo, useRef, useState } from "react";
import Dialog from "../../components/Dialog";
import { CardIcon, Keep } from "../../components/ui";
import { pickFile, posterApi, thumbUrl, type ApplyResult, type FolderImage, type PosterInfo, type StreamInfo } from "../../lib/api/index";
import { kb } from "../../lib/popup";
import { IcPoster, IcShelf } from "../../components/icons";

export const extOf = (p: string) => (p.match(/\.([^.\\/]+)$/)?.[1] ?? "").toLowerCase();
export const baseName = (p: string) => p.split(/[\\/]/).pop() ?? p;
export const BUSY = "รอให้งานที่ทำอยู่เสร็จก่อน";

/** กรอบ 2 : 3 ใหญ่สุดกลางรูป หลังหมุน (เหมือน default_crop ใน poster_image.rs) · หมุน 90 270 ด้านกว้างยาวสลับกัน */
export function centerCrop(p: PosterInfo, rotate: number): [number, number, number, number] {
  if (rotate % 180 === 0) return p.crop;
  const ratio = p.height / p.width, target = 2 / 3;
  if (ratio > target) { const cw = target / ratio; return [(1 - cw) / 2, 0, cw, 1]; }
  const ch = ratio / target;
  return [0, (1 - ch) / 2, 1, ch];
}
/** ปุ่มเล็กแบบโปร่ง · off = เหตุผลที่กดไม่ได้ ปุ่มเป็นแบบกดไม่ได้ ชี้แล้วบอกเหตุผล (สกิล button-feedback) */
export function Btn(p: { off?: string | false; onClick: () => void; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <button type="button" className={"btn btn-sm " + (p.off ? "btn-wait" : "btn-ghost")} style={p.style} aria-disabled={p.off ? true : undefined}
      title={p.off || undefined} onClick={() => { if (!p.off) p.onClick(); }}>{p.children}</button>
  );
}

export function kindWord(k: string) { return k === "audio" ? "เสียง" : k === "video" ? "ภาพ" : "ซับ"; }
export function trackTitle(s: StreamInfo) {
  if (s.kind === "video") return "ภาพ 1 อันใส่ใน MP4 ไม่ได้";
  const lang = s.lang ? `ภาษา${s.lang}` : "";
  return s.mp4 === "style" ? `ซับ${lang} 1 อันจะเสียสีกับฟอนต์ใน MP4` : `${kindWord(s.kind)}${lang} 1 อันใส่ใน MP4 ไม่ได้`;
}
export function fmtEta(s: number) { return s < 60 ? `${Math.max(1, Math.round(s))} วินาที` : `${Math.round(s / 60)} นาที`; }

export function DoneCard({ r, onShelf, onClose, onMore }: { r: ApplyResult; onShelf: () => void; onClose: () => void; onMore: (m: { title: string; lines: string[] }) => void }) {
  const c = r.counts;
  const title = r.mode === "cover" ? (r.verified ? "เปลี่ยนโปสเตอร์เสร็จ ไฟล์ตรวจผ่าน" : "เปลี่ยนโปสเตอร์เสร็จ")
    : r.mode === "mp4" ? (r.verified ? "ส่งออก MP4 เสร็จ ไฟล์ใหม่ตรวจผ่าน" : "ส่งออก MP4 เสร็จ")
    : r.verified ? "ครอบเสร็จ ไฟล์ใหม่ตรวจผ่าน" : "ครอบเสร็จ";
  const line2 = r.mode === "cover" ? (r.verified ? "ปกในไฟล์ตรงกับรูปที่ทำทุกไบต์ ภาพ เสียง ซับ เท่าเดิม" : "ไม่ได้ตรวจรูปแนบ") : r.verified ? "ครบเท่าต้นทาง" : "ไม่ได้ตรวจเทียบต้นทาง";
  const where = r.original === "kept" && r.originalTo ? r.originalTo.replace(/[\\/][^\\/]+$/, "") : null;
  const counts = `ภาพ ${c.video} เสียง ${c.audio} ซับ ${c.subs}`;
  // ชื่อไฟล์ที่ได้อยู่ในรายละเอียด รู้ว่าไฟล์ไหนถูกแก้ (AUDIT ข้อ 6)
  const outName = r.output ? r.output.split(/[\\/]/).pop() : "";
  const lines = [outName ? "ไฟล์ที่ได้คือ " + outName : "", counts, line2, where ? "ไฟล์เดิมย้ายไปที่ " + where : "", r.original === "trash" ? "ไฟล์เดิมอยู่ในถังขยะของ Windows กู้คืนได้จนกว่าจะล้างถังขยะ" : "", ...r.notes].filter(Boolean);
  return (
    <>
      <CardIcon kind="done" />
      <div className="runtxt" title={lines.join(" ")}><b>{title}</b><div className="runl2">{counts} {line2}</div></div>
      {lines.length > 2 && <button type="button" className="btn btn-ghost btn-sm" data-run-more onClick={() => onMore({ title, lines })}>รายละเอียด</button>}
      <button type="button" className="btn btn-ok btn-sm" onClick={onShelf}><IcShelf size={15} />ไปดูบนชั้นวาง</button>
      <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} data-run-close>ปิด</button>
    </>
  );
}

export function Check(p: { on: boolean; onChange: (v: boolean) => void; title: string; note: string; disabled?: boolean }) {
  return (
    <div className={"chk" + (p.disabled ? " off" : "")} aria-checked={p.on} aria-disabled={p.disabled || undefined}
      {...kb(() => { if (!p.disabled) p.onChange(!p.on); })} role="checkbox">
      <span className={"box" + (p.on ? " on" : "")}>{p.on && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>}</span>
      <span>{p.title}<br /><span className="small">{p.note}</span></span>
    </div>
  );
}

export function Radio(p: { on: boolean; onChange: () => void; title: string; note: string; disabled?: boolean }) {
  return (
    <div className={"chk" + (p.disabled ? " off" : "")} aria-checked={p.on} aria-disabled={p.disabled || undefined}
      {...kb(() => { if (!p.disabled) p.onChange(); })} role="radio">
      <span className={"radio" + (p.on ? " on" : "")} />
      <span>{p.title}<br /><span className="small">{p.note}</span></span>
    </div>
  );
}

/** รูปในโฟลเดอร์ของหนัง (กด เปลี่ยนรูป) · ป้ายเขียว .jpg แนบได้เลย · ป้ายเหลือง .webp→.jpg ตามค่าในหน้าตั้งค่า */
export function FolderImages(p: { open: boolean; movie: string | null; format: "jpg" | "png"; onClose: () => void; onPick: (path: string) => void }) {
  const [items, setItems] = useState<FolderImage[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const live = useRef(0);
  useEffect(() => {
    if (!p.open || !p.movie) return;
    const n = ++live.current;
    setItems(null); setErr(null);
    posterApi.folderImages(p.movie).then((r) => { if (n === live.current) setItems(r); }).catch((e) => { if (n === live.current) setErr(String(e)); });
  }, [p.open, p.movie]);
  const list = useMemo(() => items ?? [], [items]);
  return (
    <Dialog open={p.open} onClose={p.onClose} kind="menu" width={520} title="เลือกรูปโปสเตอร์"
      actions={<>
        <button type="button" className="btn btn-ghost btn-sm" onClick={p.onClose}>ปิด</button>
        <button type="button" className={"btn btn-sm " + (picking ? "btn-wait" : "btn-main")} aria-disabled={picking || undefined} onClick={async () => { if (picking) return; setPicking(true); try { const f = await pickFile("image"); if (f) p.onPick(f); } finally { setPicking(false); } }}>{picking ? <span className="spinner" aria-hidden="true" /> : <IcPoster size={15} />}<Keep all={["กำลังเปิดหน้าต่างเลือกไฟล์…", "เลือกรูปจากเครื่อง"]}>{picking ? "กำลังเปิดหน้าต่างเลือกไฟล์…" : "เลือกรูปจากเครื่อง"}</Keep></button>
      </>}>
      <div className="small">{p.movie ? <>รูปในโฟลเดอร์เดียวกับไฟล์หนัง พร้อมบอกว่ารูปไหนต้องแปลงก่อน</> : "ยังไม่ได้ใส่ไฟล์หนัง เลือกรูปจากเครื่องแทน"}</div>
      <div data-folder-images style={{ maxHeight: 360, overflowY: "auto" }}>
        {!p.movie ? null : err ? <div className="hint e">{err}</div> : items === null ? <div className="small" style={{ display: "flex", alignItems: "center", gap: 8 }} data-folder-wait><span className="spinner" aria-hidden="true" />กำลังอ่านรูปในโฟลเดอร์…</div>
          : list.length === 0 ? <div className="small">ไม่มีรูปในโฟลเดอร์นี้</div>
          : list.map((f) => (
            <div key={f.path} className="imgrow" {...kb(() => p.onPick(f.path))} aria-label={"ใช้รูป " + f.name}>
              {f.thumb ? <img className="imgth" src={thumbUrl(f.thumb) ?? undefined} alt="" /> : <span className="imgth" />}
              <div style={{ minWidth: 0, wordBreak: "break-all" }}>{f.name}<div className="small">{f.error ? f.error : <span className="nw">{f.width} × {f.height} px</span>}</div></div>
              <div style={{ fontSize: 12.5, whiteSpace: "nowrap" }}>{f.attachable ? <><span className="extag ok">.{f.ext}</span> แนบได้เลย</> : <span className="extag extcv">.{f.ext}→.{p.format}</span>}</div>
            </div>
          ))}
      </div>
    </Dialog>
  );
}