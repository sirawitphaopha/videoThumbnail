/* หน้าต่างแก้คีย์ลัดของคำสั่งเดียว (BUGS ข้อ 162.3 · แบบหน้าตั้งค่าคีย์ลัดของ VS Code กับ Aegisub)
   คลิกช่องรับคีย์แล้วกดคีย์ บอกทันทีว่าตั้งได้ไหม ชนกับคำสั่งไหน แล้วเลือกแทนคีย์เดิมหรือเพิ่มอีกคีย์
   Tab กับ Esc ไม่รับ ให้ย้ายช่องและปิดหน้าต่างได้ตามปกติ · บันทึกทันทีที่กดปุ่ม ไม่ต้องกดบันทึกอีกรอบ */
import { useEffect, useRef, useState } from "react";
import Dialog from "../../../components/Dialog";
import { IcClose } from "../../../components/icons";
import { KEY_GROUPS, RESERVED, actionOf, clashOf, comboOf, isCustom, keysOf, showCombo, typingKey, type KeyAction } from "../../../lib/keymap";

const MAX = 4;

export default function KeyEdit(p: { id: string | null; onClose: () => void; onSave: (patch: Record<string, string[] | null>) => void }) {
  const a = p.id ? actionOf(p.id) : undefined;
  const [cap, setCap] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { setCap(null); if (p.id) requestAnimationFrame(() => box.current?.focus()); }, [p.id]);
  if (!a) return <Dialog open={false} onClose={p.onClose} title="" />;
  const keys = keysOf(a.id);
  const group = KEY_GROUPS.find((g) => g.id === a.group);
  const check = cap ? judge(a, cap, keys) : null;
  const put = (list: string[]) => {
    const patch: Record<string, string[] | null> = { [a.id]: list };
    if (check?.clash) patch[check.clash.id] = keysOf(check.clash.id).filter((k) => k !== cap);
    p.onSave(patch);
    setCap(null);
    box.current?.focus();
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Tab" || e.key === "Escape") return;
    e.preventDefault();
    e.stopPropagation();
    const c = comboOf(e.nativeEvent);
    if (c) setCap(c);
  };

  return (
    <Dialog open={!!p.id} onClose={p.onClose} kind="menu" width={500} title={`แก้คีย์ลัด ${a.label}`}
      actions={<>
        <button type="button" className={"btn btn-ghost" + (isCustom(a.id) ? "" : " btn-wait")} aria-disabled={!isCustom(a.id) || undefined}
          title={isCustom(a.id) ? `กลับเป็น ${a.keys.map(showCombo).join(" กับ ") || "ไม่มีคีย์ลัด"} ตามค่าตั้งต้น` : "คำสั่งนี้ใช้คีย์ตั้งต้นอยู่แล้ว"}
          onClick={() => { if (isCustom(a.id)) { p.onSave({ [a.id]: null }); setCap(null); } }} data-hk-default>กลับค่าตั้งต้นของคำสั่งนี้</button>
        <button type="button" className="btn btn-main" onClick={p.onClose} data-hk-done>เสร็จ</button>
      </>}>
      <div className="hk-dlg" data-hk-dialog={a.id}>
        <div className="small">{group?.title}{group?.note ? `  ${group.note}` : ""}</div>
        <div className="hk-lab">คีย์ที่ใช้อยู่</div>
        <div className="hk-cur" data-hk-current>
          {keys.length ? keys.map((k) => (
            <span key={k} className="hk-kbd hk-del">{showCombo(k)}
              <button type="button" className="hk-x" aria-label={`เอาคีย์ ${showCombo(k)} ออก`} title={`เอาคีย์ ${showCombo(k)} ออก`} onClick={() => p.onSave({ [a.id]: keys.filter((x) => x !== k) })} data-hk-remove={k}><IcClose size={11} /></button>
            </span>)) : <span className="small">ยังไม่มีคีย์ลัด ใช้คำสั่งนี้จากปุ่มหรือเมนูได้ตามเดิม</span>}
        </div>
        <div className="hk-lab">คีย์ใหม่</div>
        <div ref={box} className={"hk-cap" + (cap ? " has" : "")} tabIndex={0} role="textbox" aria-label="ช่องรับคีย์ใหม่ คลิกแล้วกดคีย์ที่ต้องการ" onKeyDown={onKey} data-hk-capture>
          {cap ? <span className="hk-kbd">{showCombo(cap)}</span> : <span className="hk-ph">คลิกที่นี่แล้วกดคีย์ที่ต้องการ</span>}
        </div>
        <div className={"hk-msg small" + (check?.bad ? " bad" : check?.clash ? " warn" : "")} role="status" data-hk-msg>{check?.text ?? ""}</div>
        <div className="hk-acts">
          <button type="button" className={"btn btn-ghost btn-sm" + (check?.ok ? "" : " btn-wait")} aria-disabled={!check?.ok || undefined}
            title={check?.ok ? "ใช้คีย์นี้แทนคีย์ที่มีอยู่ทั้งหมด" : check?.text || "ยังไม่ได้กดคีย์ใหม่"} onClick={() => { if (check?.ok) put([cap!]); }} data-hk-replace>ใช้แทนคีย์เดิม</button>
          <button type="button" className={"btn btn-ghost btn-sm" + (check?.ok && keys.length < MAX ? "" : " btn-wait")} aria-disabled={!(check?.ok && keys.length < MAX) || undefined}
            title={!check?.ok ? check?.text || "ยังไม่ได้กดคีย์ใหม่" : keys.length >= MAX ? `คำสั่งหนึ่งมีได้ไม่เกิน ${MAX} คีย์` : "เพิ่มคีย์นี้โดยคีย์เดิมยังใช้ได้"}
            onClick={() => { if (check?.ok && keys.length < MAX) put([...keys, cap!]); }} data-hk-add>เพิ่มอีกคีย์</button>
        </div>
      </div>
    </Dialog>
  );
}

/** ตั้งคีย์นี้ได้ไหม และบอกเหตุผลเป็นประโยคเดียว */
function judge(a: KeyAction, cap: string, keys: string[]): { ok: boolean; bad?: boolean; clash?: KeyAction; text: string } {
  const name = showCombo(cap);
  if (RESERVED.has(cap)) return { ok: false, bad: true, text: `${name} เป็นคีย์ที่ Windows หรือหน้าต่างโปรแกรมใช้อยู่ จึงตั้งไม่ได้` };
  if (keys.includes(cap)) return { ok: false, text: `คำสั่งนี้ใช้ ${name} อยู่แล้ว` };
  const clash = clashOf(a.id, cap) ?? undefined;
  const typing = a.field && typingKey(cap) ? `  คีย์นี้ไม่มี Ctrl หรือ Alt จึงใช้ไม่ได้ตอนพิมพ์ในช่อง` : "";
  if (clash) return { ok: true, clash, text: `${name} ใช้กับคำสั่ง${clash.label}อยู่ ถ้าตั้งที่นี่คีย์จะย้ายมาจากคำสั่งนั้น${typing}` };
  return { ok: true, text: `ตั้ง ${name} ได้${typing}` };
}
