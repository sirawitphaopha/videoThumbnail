/* หน้าต่างดูและแก้บทของหนัง (BUGS ข้อ 99 พี่กันถาม 13 พ.ย. 2569 "เราจะ edit ยังไง เปิดดูยังไง")
   อ่านบทจากไฟล์หนัง แก้ชื่อ แก้เวลาเริ่ม เพิ่ม ลบ · กดเสร็จสิ้นแล้วเก็บไว้ในงานรวม บทที่แก้ลงไฟล์ใหม่ตอนรวม ไฟล์หนังเดิมไม่ถูกแตะ
   เวลาพิมพ์แบบ ชั่วโมง:นาที:วินาที หรือ นาที:วินาที ทศนิยมได้ · ผิดรูปแบบหรือเกินความยาวหนัง ขึ้นเหตุผลใต้แถว กดเสร็จสิ้นไม่ได้
   หน้าต่างสูงคงที่ รายการยาวเลื่อนในหน้าต่าง */
import { useEffect, useState } from "react";
import Dialog from "./Dialog";
import ThaiInput from "./ThaiInput";
import { Skel } from "./ui";
import { IcClose, IcPlus, IcRefresh } from "./icons";
import { mergeApi, type Chapter } from "../lib/api";

type Row = { id: number; time: string; title: string };

/** วินาทีเป็นข้อความ ชั่วโมง:นาที:วินาที.มิลลิวินาที ตัดศูนย์ท้ายทศนิยม */
export function fmtTime(sec: number): string {
  const ms = Math.round(Math.max(0, sec) * 1000);
  const h = Math.floor(ms / 3_600_000), m = Math.floor(ms / 60_000) % 60, s = Math.floor(ms / 1000) % 60, f = ms % 1000;
  const frac = f ? "." + String(f).padStart(3, "0").replace(/0+$/, "") : "";
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}${frac}`;
}

/** ข้อความเวลาเป็นวินาที · รับ ชม:นาที:วินาที นาที:วินาที หรือวินาทีล้วน · ผิดรูปแบบได้ null */
export function parseTime(t: string): number | null {
  const parts = t.trim().split(":");
  if (!parts.length || parts.length > 3 || parts.some((p) => !/^\d+(\.\d+)?$/.test(p))) return null;
  const n = parts.map(Number);
  if (n.length > 1 && n.slice(1).some((x) => x >= 60)) return null;
  return n.reduce((acc, x) => acc * 60 + x, 0);
}

let seq = 1;
const toRows = (chs: Chapter[]): Row[] => chs.map((c) => ({ id: seq++, time: fmtTime(c.start), title: c.title }));

export default function ChapterDialog({ open, path, duration, edited, onClose, onSave }: {
  open: boolean; path: string; duration: number | null;
  /** บทที่เคยแก้ไว้ในงานนี้ · null = ยังไม่ได้แก้ อ่านจากไฟล์ */
  edited: Chapter[] | null;
  onClose: () => void;
  /** null = กลับไปใช้บทเดิมของหนัง */
  onSave: (chs: Chapter[] | null) => void;
}) {
  const [orig, setOrig] = useState<Chapter[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    if (!open) return;
    let live = true;
    setFailed(null);
    mergeApi.chapters(path).then((c) => {
      if (!live) return;
      setOrig(c);
      setRows(toRows(edited ?? c));
    }, (e) => { if (live) { setFailed(String(e)); setRows(edited ? toRows(edited) : []); } });
    return () => { live = false; };
  }, [open, path, edited]);

  const errOf = (r: Row): string | null => {
    const t = parseTime(r.time);
    if (t == null) return "เวลาต้องเป็นแบบ ชั่วโมง:นาที:วินาที เช่น 00:12:30";
    // เริ่มตรงท้ายหนังพอดีได้บทว่าง จึงนับว่าเกินด้วย
    if (duration != null && t > 0 && t >= duration) return `เวลาต้องน้อยกว่าความยาวหนัง ${fmtTime(duration)}`;
    if (rows && rows.some((o) => o.id !== r.id && parseTime(o.time) === t)) return "มี Chapter อื่นเริ่มเวลาเดียวกันแล้ว";
    return null;
  };
  const bad = (rows ?? []).some((r) => errOf(r) != null);
  const set = (id: number, p: Partial<Row>) => setRows((rs) => rs && rs.map((r) => (r.id === id ? { ...r, ...p } : r)));
  const add = () => setRows((rs) => {
    const list = rs ?? [];
    const last = list.reduce((m, r) => Math.max(m, parseTime(r.time) ?? 0), 0);
    // ต่อจากบทสุดท้าย 1 นาที · หนังเหลือไม่ถึงนั้น ไปกึ่งกลางระหว่างบทสุดท้ายกับท้ายหนัง เป็นวินาทีเต็ม
    const next = !list.length ? 0
      : duration == null || last + 60 < duration ? last + 60
      : Math.max(last + 1, Math.floor((last + duration) / 2));
    return [...list, { id: seq++, time: fmtTime(next), title: `Chapter ${String(list.length + 1).padStart(2, "0")}` }];
  });
  const save = () => {
    if (!rows || bad) return;
    const chs = rows.map((r) => ({ start: parseTime(r.time)!, title: r.title.trim() })).sort((a, b) => a.start - b.start);
    // เหมือนบทเดิมทุกบท ถือว่าไม่ได้แก้ บทเดิมติดไปตามเดิม
    const same = orig && orig.length === chs.length && orig.every((o, i) => Math.abs(o.start - chs[i].start) < 0.0005 && o.title === chs[i].title);
    onSave(same ? null : chs);
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} kind="work" width={640} height="min(560px, 86vh)"
      title={<>ดูและแก้ Chapter ของหนัง{rows && <span className="small" style={{ fontWeight: 400, marginLeft: 8 }}>{rows.length} Chapter</span>}</>}
      actions={<>
        <button type="button" className={"btn btn-sm " + (orig ? "btn-ghost" : "btn-wait")} style={{ marginRight: "auto" }} aria-disabled={!orig || undefined} title={orig ? "ใช้ Chapter เดิมของไฟล์หนัง" : "กำลังอ่าน Chapter เดิม"} onClick={() => orig && setRows(toRows(orig))} data-chap-reset><IcRefresh size={15} />กลับเป็น Chapter เดิม</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>ยกเลิก</button>
        <button type="button" className={"btn btn-sm " + (bad ? "btn-wait" : "btn-main")} aria-disabled={bad || undefined} title={bad ? "แก้เวลาที่ผิดก่อน" : undefined} onClick={save} data-chap-save>เสร็จสิ้น</button>
      </>}>
      <div className="small" style={{ marginBottom: 10 }}>Chapter ที่แก้จะลงไฟล์ใหม่ตอนรวม ส่วนไฟล์หนังเดิมไม่ถูกแตะ</div>
      {failed && <div className="small" style={{ color: "var(--bad-ink)", marginBottom: 8 }}>อ่าน Chapter จากไฟล์ไม่ได้ {failed}</div>}
      {rows == null ? (
        <div aria-busy="true">{[0, 1, 2].map((i) => <Skel key={i} w="100%" h={34} style={{ marginTop: 8 }} />)}</div>
      ) : (
        <div className="chaplist" data-chaplist>
          <div className="chaphead"><span>ลำดับ</span><span>เวลาเริ่ม</span><span>ชื่อ Chapter</span><span /></div>
          {rows.map((r, i) => {
            const err = errOf(r);
            return (
              <div key={r.id} className="chaprow" data-chaprow={i}>
                <span className="chapno">{i + 1}</span>
                <input className={"chaptime" + (err ? " err" : "")} value={r.time} aria-label={`เวลาเริ่ม Chapter ที่ ${i + 1}`} inputMode="decimal" onChange={(e) => set(r.id, { time: e.target.value })} data-chaptime />
                <ThaiInput value={r.title} onChange={(v) => set(r.id, { title: v })} label={`ชื่อ Chapter ที่ ${i + 1}`} placeholder="ชื่อ Chapter" />
                <button type="button" className="ib bad" aria-label={`ลบ Chapter ที่ ${i + 1}`} title="ลบ Chapter นี้" onClick={() => setRows((rs) => rs && rs.filter((x) => x.id !== r.id))} data-chapdel><IcClose size={14} /></button>
                {err && <div className="chaperr">{err}</div>}
              </div>
            );
          })}
          {rows.length === 0 && <div className="small" style={{ padding: "10px 0" }}>ไม่มี Chapter ถ้ากดเสร็จสิ้นตอนนี้ ไฟล์ใหม่จะไม่มี Chapter</div>}
          <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={add} data-chapadd><IcPlus size={14} />เพิ่ม Chapter</button>
        </div>
      )}
    </Dialog>
  );
}
