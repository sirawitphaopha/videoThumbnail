/* เปลี่ยนชื่อไฟล์ในแผงรายละเอียด (สเปกข้อ 2 · ต้นแบบบรรทัด 430–457 · แผนขั้น 3)
   ② ช่องพิมพ์ นามสกุลล็อกขวา บอกชื่อใหม่ · ③ ชื่อซ้ำ ④ ชื่อผิดกติกา (ช่องแดง บอกเหตุใต้ช่อง ปุ่มบันทึกกดไม่ได้)
   ⑥ ไม่สำเร็จ (ไฟล์ถูกเปิดอยู่ ฯลฯ) การ์ดแดงไม่หายเอง ปุ่มลองใหม่ ยกเลิก · ① กับ ⑤ อยู่ใน Detail
   Enter บันทึก · Esc ยกเลิก · ชื่อเหมือนเดิมกดบันทึกแค่ปิดช่องพิมพ์
   ตัวเช็กชื่อมีที่เดียวฝั่ง Rust (rename.rs) เรียกทุกครั้งที่พิมพ์ · ตอนบันทึกฝั่ง Rust เช็กซ้ำอีกรอบก่อนย้ายจริง
   ปุ่มบันทึก 4 สถานะ (สกิล save-status) กดได้ · กำลังเปลี่ยนชื่อ (ล็อกปุ่มยกเลิกด้วย) · กดไม่ได้พร้อมเหตุผลใต้ช่อง */
import { useEffect, useRef, useState } from "react";
import { api, type Movie, type RenameProblem } from "../lib/api";
import ThaiInput from "./ThaiInput";
import { CardIcon, Phr } from "./ui";

const CARD_KINDS = new Set(["inuse", "denied", "missing", "busy", "other"]);

export default function RenameBox(p: { m: Movie; onDone: (m: Movie, changed: boolean) => void; onCancel: () => void }) {
  const { m } = p;
  const [value, setValue] = useState(m.name);
  const [problem, setProblem] = useState<RenameProblem | null>(null);
  const [fail, setFail] = useState<RenameProblem | null>(null);
  const [saving, setSaving] = useState(false);
  const seq = useRef(0);
  const input = useRef<HTMLInputElement>(null);
  const retry = useRef<HTMLButtonElement>(null);
  const ext = "." + (m.path.match(/\.([^.\\/]+)$/)?.[1] ?? m.ext);
  const same = value === m.name;

  // เช็กชื่อตอนพิมพ์ · ผลที่มาช้ากว่าตัวที่พิมพ์ล่าสุดทิ้ง
  useEffect(() => {
    const n = ++seq.current;
    if (same) { setProblem(null); return; }
    const t = setTimeout(() => {
      api.checkRename(m.id, value).then((r) => { if (n === seq.current) setProblem(r); }).catch(() => {});
    }, 120);
    return () => clearTimeout(t);
  }, [value, same, m.id]);

  // ⑥ ไม่สำเร็จ โฟกัสไปที่ปุ่มลองใหม่ กด Enter ลองใหม่ได้ทันที (ช่องพิมพ์ไม่ค้างกรอบโฟกัสแบบในต้นแบบ)
  useEffect(() => { if (fail) retry.current?.focus(); }, [fail]);

  const save = async () => {
    if (saving || problem) return;
    if (same) { p.onDone(m, false); return; }
    setSaving(true);
    setFail(null);
    try {
      const r = await api.renameMovie(m.id, value);
      p.onDone(r, true);
    } catch (e) {
      const pr = toProblem(e);
      setSaving(false);
      if (CARD_KINDS.has(pr.kind)) setFail(pr);
      else { setProblem(pr); input.current?.focus(); }
    }
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") { e.preventDefault(); save(); }
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); if (!saving) p.onCancel(); }
  };

  const blocked = !!problem;
  return (
    <div className="rename" data-rename>
      <ThaiInput value={value} onChange={(v) => { setValue(v); setFail(null); }} label={"ชื่อไฟล์ใหม่ ไม่รวมนามสกุล " + ext}
        suffix={ext} err={blocked} readOnly={saving} autoFocus inputRef={input} onKeyDown={onKey} describedBy="rename-hint" />
      {fail ? (
        <div className="stat bad" style={{ marginTop: 8 }} role="alert">
          <CardIcon kind="bad" />
          <div><b>{fail.title}</b>{fail.detail?.split(" · ").map((l, i) => <div key={i}><Phr>{l}</Phr></div>)}</div>
        </div>
      ) : problem ? (
        <div id="rename-hint" className="hint e" role="alert">
          <div><Phr>{problem.title}</Phr></div>
          {problem.detail && <div><Phr>{problem.detail}</Phr></div>}
        </div>
      ) : (
        <div id="rename-hint" className="hint">{same ? <Phr>พิมพ์ชื่อใหม่ แล้วกด Enter หรือบันทึกชื่อ</Phr> : <>ชื่อใหม่ <Phr tail={<span className="ext">{ext}</span>}>{value}</Phr></>}</div>
      )}
      <div className="minirow">
        {fail ? (
          <button ref={retry} type="button" className="btn btn-ghost btn-sm" onClick={save}>ลองใหม่</button>
        ) : saving ? (
          <button type="button" className="btn btn-wait btn-sm" aria-disabled="true">กำลังเปลี่ยนชื่อ…</button>
        ) : blocked ? (
          <button type="button" className="btn btn-wait btn-sm" aria-disabled="true" title={problem!.title}>บันทึกชื่อ</button>
        ) : (
          <button type="button" className="btn btn-main btn-sm" onClick={save}>บันทึกชื่อ</button>
        )}
        <button type="button" className={"btn btn-sm " + (saving ? "btn-wait" : "btn-ghost")} aria-disabled={saving || undefined}
          title={saving ? "รอเปลี่ยนชื่อเสร็จก่อน" : undefined} onClick={() => { if (!saving) p.onCancel(); }}>ยกเลิก</button>
      </div>
    </div>
  );
}

/** ข้อผิดพลาดจากฝั่ง Rust เป็น RenameProblem · ข้อผิดพลาดแบบอื่น (คำสั่งไม่มี ฯลฯ) ห่อเป็น other */
function toProblem(e: unknown): RenameProblem {
  if (e && typeof e === "object" && "kind" in e && "title" in e) return e as RenameProblem;
  return { kind: "other", title: "เปลี่ยนชื่อไม่สำเร็จ", detail: String(e) + " · ไฟล์ยังชื่อเดิม" };
}
