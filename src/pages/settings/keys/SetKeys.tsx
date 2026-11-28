/* หัวข้อคีย์ลัดในหน้าตั้งค่า (BUGS ข้อ 162.3 · docs/PLAN-2026-11-28-คีย์ลัด.md)
   พี่กันสั่ง 28 พ.ย. 2569 "หน้าตั้งค่าที่เขียนคีย์ลัดทั้งหมด ในทุกฟังชั่น และสามารถปรับได้ มีปุ่มแก้ไข เหมือนโปรแกรมทั่วไป ทำตามเขา"
   ช่องค้นหาชื่อคำสั่งหรือคีย์ ตารางแยกตามหน้า ปุ่มแก้ไขท้ายแถว ป้ายตั้งเอง ปุ่มกลับค่าตั้งต้นทั้งหมด และคีย์พื้นฐานที่ปรับไม่ได้
   ทะเบียนอยู่ lib/keymap.ts คีย์ที่ตั้งเองเก็บในค่าตั้ง hotkeys · หน้าต่างแก้อยู่ KeyEdit.tsx */
import { useEffect, useReducer, useState } from "react";
import Dialog from "../../../components/Dialog";
import InfoTip from "../../../components/InfoTip";
import SearchBox from "../../../components/SearchBox";
import { ACTIONS, FIXED_KEYS, KEY_GROUPS, actionOf, isCustom, keysOf, onKeysChange, showCombo } from "../../../lib/keymap";
import type { SetOpen } from "../setCtx";
import KeyEdit from "./KeyEdit";
import { FIXED_TIP, KEYS_TIP } from "./keyTips";

const same = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

export default function SetKeys({ pg }: { pg: SetOpen }) {
  const { sec, settings, update } = pg;
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  useEffect(() => onKeysChange(redraw), []);
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<string | null>(null);
  const [askReset, setAskReset] = useState(false);
  const custom = Object.keys(settings?.hotkeys ?? {}).filter((id) => actionOf(id)).length;

  /** null หรือรายการที่เท่าคีย์ตั้งต้น = กลับค่าตั้งต้น ไม่เก็บในค่าตั้ง */
  const save = (patch: Record<string, string[] | null>) => {
    const m = { ...(settings?.hotkeys ?? {}) };
    for (const [id, v] of Object.entries(patch)) {
      if (v == null || same(v, actionOf(id)?.keys ?? [])) delete m[id];
      else m[id] = v;
    }
    void update({ hotkeys: m });
  };

  const word = q.trim().toLowerCase();
  const hit = (id: string, label: string, title: string) => !word || label.toLowerCase().includes(word) || title.toLowerCase().includes(word)
    || keysOf(id).some((k) => showCombo(k).toLowerCase().includes(word));
  const groups = KEY_GROUPS.map((g) => ({ g, rows: ACTIONS.filter((a) => a.group === g.id && hit(a.id, a.label, g.title)) })).filter((x) => x.rows.length);

  return (
    <div className="setcard" data-setcard="hotkeys" hidden={sec !== "hotkeys"}>
      <h3>คีย์ลัด <InfoTip title="คีย์ลัด" tip={KEYS_TIP} /></h3>
      <div className="small" style={{ marginBottom: 12 }}>คีย์ลัดของทุกหน้า กดปุ่มแก้ไขท้ายแถวเพื่อตั้งคีย์ใหม่ และคีย์ที่ตั้งเองมีป้ายบอกไว้</div>
      <div className="hk-top">
        <SearchBox value={q} onChange={setQ} placeholder="ค้นชื่อคำสั่งหรือคีย์" label="ค้นคีย์ลัด" width={280} />
        <button type="button" className={"btn btn-ghost btn-sm" + (custom ? "" : " btn-wait")} aria-disabled={!custom || undefined}
          title={custom ? `กลับเป็นคีย์ตั้งต้นทุกคำสั่ง ตอนนี้ตั้งเองไว้ ${custom} คำสั่ง` : "ยังไม่มีคีย์ที่ตั้งเอง ทุกคำสั่งใช้คีย์ตั้งต้นอยู่"}
          onClick={() => { if (custom) setAskReset(true); }} data-hk-reset-all>กลับค่าตั้งต้นทั้งหมด</button>
      </div>
      {!groups.length && <div className="small hk-none" data-hk-none>ไม่มีคำสั่งหรือคีย์ที่ตรงกับคำว่า {q.trim()}</div>}
      {groups.map(({ g, rows }) => (
        <section key={g.id} className="hk-grp" data-hk-group={g.id}>
          <h4 className="imghead">{g.title}{g.note && <span className="small hk-note">{g.note}</span>}</h4>
          {rows.map((a) => {
            const keys = keysOf(a.id);
            return (
              <div key={a.id} className="hk-row" data-hk-row={a.id}>
                <span className="hk-name">{a.label}{isCustom(a.id) && <span className="hk-mark" data-hk-custom>ตั้งเอง</span>}</span>
                <span className="hk-keys">{keys.length ? keys.map((k) => <span key={k} className="hk-kbd">{showCombo(k)}</span>) : <span className="hk-dash">—</span>}</span>
                <button type="button" className="btn btn-ghost btn-sm" aria-label={`แก้คีย์ลัด ${a.label}`} onClick={() => setEdit(a.id)} data-hk-edit={a.id}>แก้ไข</button>
              </div>
            );
          })}
        </section>
      ))}
      {!word && <section className="hk-grp" data-hk-fixed>
        <h4 className="imghead">คีย์พื้นฐานที่ปรับไม่ได้ <InfoTip title="ทำไมปรับไม่ได้" tip={FIXED_TIP} /></h4>
        {FIXED_KEYS.map((f) => (
          <div key={f.keys + f.label} className="hk-row hk-fixrow">
            <span className="hk-name">{f.label}</span>
            <span className="hk-keys"><span className="hk-kbd">{f.keys}</span></span>
          </div>
        ))}
      </section>}
      <KeyEdit id={edit} onClose={() => setEdit(null)} onSave={save} />
      <Dialog open={askReset} onClose={() => setAskReset(false)} kind="work" title="กลับเป็นคีย์ตั้งต้นทั้งหมดไหม"
        actions={<>
          <button type="button" className="btn btn-ghost" onClick={() => setAskReset(false)}>ยกเลิก</button>
          <button type="button" className="btn btn-main" onClick={() => { void update({ hotkeys: {} }); setAskReset(false); }} data-hk-reset-yes>กลับค่าตั้งต้น</button>
        </>}>
        <div className="small">คีย์ที่ตั้งเองไว้ {custom} คำสั่งจะกลับเป็นคีย์ตั้งต้นของโปรแกรม</div>
      </Dialog>
    </div>
  );
}
