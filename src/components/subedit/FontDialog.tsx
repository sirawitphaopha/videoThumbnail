/* หน้าต่างเลือกฟอนต์กับขนาดของปุ่ม fn (แผนหน้าแก้ซับ ขั้น 3 · พี่กัน "เอา เพราะเราจะเลือกฟอนต์ ขนาด")
   Aegisub เปิดหน้าต่างเลือกฟอนต์ของ Windows · ของเราทำเองในโปรแกรม รายชื่อฟอนต์ที่ลงในเครื่องจากฝั่ง Rust (fonts.rs font_families)
   ค้นชื่อได้ ตัวอย่างข้อความไทยกับอังกฤษแสดงด้วยฟอนต์นั้นจริง · กดใช้แล้วใส่แท็ก \fn \fs ตรงข้อความที่เลือก */
import { useEffect, useMemo, useRef, useState } from "react";
import { subDocApi } from "../../lib/api";
import Dialog from "../Dialog";
import { J, Phr, Skel } from "../ui";
import { IcSearch } from "../icons";

let cache: string[] | null = null;

export default function FontDialog(p: { open: boolean; current: { name: string; size: string }; sample: string; onClose: () => void; onApply: (tag: string, reset: string) => void; /** ใช้กับหน้าต่างแก้สไตล์ รับชื่อกับขนาดแทนแท็ก */ onPick?: (name: string, size: string) => void }) {
  const [list, setList] = useState<string[] | null>(cache);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [name, setName] = useState(p.current.name);
  const [size, setSize] = useState(p.current.size);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { if (p.open) { setName(p.current.name); setSize(p.current.size); setQ(""); } }, [p.open, p.current.name, p.current.size]);
  useEffect(() => {
    if (!p.open || cache) return;
    subDocApi.fontFamilies().then((v) => { cache = v; setList(v); }, (e) => setErr(String(e)));
  }, [p.open]);
  const shown = useMemo(() => { const k = q.trim().toLowerCase(); return (list ?? []).filter((f) => !k || f.toLowerCase().includes(k)); }, [list, q]);
  // เปิดหน้าต่างแล้วเลื่อนให้เห็นฟอนต์ที่ใช้อยู่
  useEffect(() => { if (p.open && list) requestAnimationFrame(() => box.current?.querySelector("[aria-selected=true]")?.scrollIntoView({ block: "center" })); }, [p.open, list]);
  const sizeOk = /^\d+(\.\d+)?$/.test(size.trim()) && parseFloat(size) > 0;
  const changed = name !== p.current.name || size.trim() !== p.current.size;
  const why = !name ? "เลือกฟอนต์ก่อน" : !sizeOk ? "ขนาดต้องเป็นตัวเลขมากกว่า 0" : !changed ? "ยังเป็นฟอนต์และขนาดเดิม" : undefined;
  const apply = () => {
    if (why) return;
    if (p.onPick) { p.onPick(name, size.trim()); p.onClose(); return; }
    const tag = `{${name !== p.current.name ? `\\fn${name}` : ""}${size.trim() !== p.current.size ? `\\fs${size.trim()}` : ""}}`;
    const reset = `{${name !== p.current.name ? "\\fn" : ""}${size.trim() !== p.current.size ? "\\fs" : ""}}`;
    p.onApply(tag, reset);
    p.onClose();
  };
  return (
    <Dialog open={p.open} onClose={p.onClose} title="เลือกฟอนต์กับขนาด" kind="menu" width={620}
      actions={<>
        <button type="button" className="btn btn-ghost" onClick={p.onClose}>ยกเลิก</button>
        <button type="button" className={"btn " + (why ? "btn-wait" : "btn-main")} aria-disabled={!!why || undefined} title={why} onClick={apply} data-font-apply>ใช้ฟอนต์นี้</button>
      </>}>
      <div className="se-fontdlg" data-font-dialog>
        <div className="se-fontcol">
          <label className="se-fsearch"><IcSearch size={15} /><input className="inp" value={q} placeholder="ค้นชื่อฟอนต์" aria-label="ค้นชื่อฟอนต์" onChange={(e) => setQ(e.target.value)} data-font-q /></label>
          <div className="se-fontlist" ref={box} role="listbox" aria-label="ฟอนต์ที่ลงในเครื่อง">
            {err ? <div className="small" style={{ color: "var(--bad-ink)", padding: 8 }}>อ่านรายชื่อฟอนต์ไม่ได้ {err}</div>
              : !list ? [0, 1, 2, 3, 4, 5].map((i) => <Skel key={i} w="80%" h={18} style={{ margin: "8px 10px" }} />)
              : shown.length === 0 ? <div className="small" style={{ padding: 8 }}>ไม่เจอฟอนต์ชื่อนี้</div>
              : shown.map((f) => (
                <button key={f} type="button" role="option" aria-selected={f === name} className={f === name ? "on" : ""} onClick={() => setName(f)} style={{ fontFamily: `"${f}"` }} data-font={f}>{f}</button>
              ))}
          </div>
        </div>
        <div className="se-fontside">
          <label className="se-f">ขนาด<input className={"inp se-num" + (sizeOk ? "" : " err")} value={size} inputMode="decimal" onChange={(e) => setSize(e.target.value)} data-font-size /></label>
          <div className="small"><Phr>ขนาดเป็นจุดตามขนาดภาพของซับ  ไม่ใช่ขนาดบนจอ</Phr></div>
          <div className="se-fontprev" style={{ fontFamily: name ? `"${name}"` : undefined }} data-font-preview>{p.sample || "ตัวอย่างข้อความ กขค ABC 123"}</div>
          <div className="small"><Phr>{`ฟอนต์ที่ใช้ต้องมีในเครื่องที่เปิดดูด้วย  ถ้าจะส่งหนังให้คนอื่น ให้${J}ฝังฟอนต์ตอนรวมไฟล์ในหน้าเสียงและซับ`}</Phr></div>
        </div>
      </div>
    </Dialog>
  );
}
