/* ตัวจัดการสไตล์กับหน้าต่างแก้สไตล์ของซับ ASS (แผนหน้าแก้ซับ ขั้น 7 · BUGS ข้อ 109)
   แบบ dialog_style_manager.cpp (รายการสไตล์ในไฟล์ เพิ่ม แก้ คัดลอก ลบ ย้าย เรียง) กับ dialog_style_editor.cpp (ทุกช่องของสไตล์ ตัวอย่างข้อความ)
   ไม่ทำคลังสไตล์ (Storage) ของ Aegisub ที่เก็บสไตล์ไว้ใช้ข้ามไฟล์ · เปลี่ยนชื่อสไตล์ถามว่าจะเปลี่ยนในบรรทัดที่ใช้อยู่ด้วยไหม (StyleRenamer)
   ทุกการแก้ผ่าน edit() เลิกทำได้ทีละขั้น · ตัวอย่างข้อความวาดด้วย CSS ใกล้เคียงของจริง ไม่ใช่ตัววาดซับของโปรแกรมเล่น */
import { useEffect, useMemo, useRef, useState } from "react";
import type { SubDoc } from "../../lib/api";
import type { Tip } from "../../lib/codecAdv";
import { edit } from "../../lib/subEdit";
import {
  addStyle, deleteStyles, findStyle, fmtG, moveStyle, playRes, readStyle, renameUses, setStyle, sortStyles, STYLE_DEFAULT, styleKeys, styleName, styleUses, uniqueName, writeStyle,
  type Rgba, type StyleV,
} from "../../lib/subStyle";
import Dialog from "../Dialog";
import InfoTip from "../InfoTip";
import { Phr, Seg } from "../ui";
import { IbBold, IbItalic, IbPencil, IbStrike, IbTrash, IbUnderline, IcCopy, IcPlus } from "../icons";
import FontDialog from "./FontDialog";

const n0 = (n: number) => n.toLocaleString("en-US");
const css = (c: Rgba) => `rgba(${c.r}, ${c.g}, ${c.b}, ${((255 - c.a) / 255).toFixed(3)})`;
const hex = (c: Rgba) => `#${[c.r, c.g, c.b].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
const fromHex = (h: string, a: number): Rgba => ({ r: parseInt(h.slice(1, 3), 16), g: parseInt(h.slice(3, 5), 16), b: parseInt(h.slice(5, 7), 16), a });

const MANAGER_TIP: Tip = {
  w: "สไตล์คือชุดหน้าตาที่ตั้งชื่อไว้ ฟอนต์ ขนาด สี ขอบ เงา ตำแหน่ง ระยะขอบ แต่ละบรรทัดซับเลือกใช้สไตล์หนึ่งตัว แก้สไตล์ทีเดียว ทุกบรรทัดที่ใช้สไตล์นั้นเปลี่ยนตาม",
  o: [
    ["คัดลอก", "สร้างสไตล์ใหม่จากสไตล์ที่เลือก ชื่อต่อท้ายว่าสำเนา", "ทำสไตล์ที่ต่างกันนิดเดียว เช่นสีอื่น", ""],
    ["ลบ", "เอาสไตล์ออกจากไฟล์ บรรทัดที่ยังใช้ชื่อนั้นอยู่ โปรแกรมเล่นจะใช้หน้าตาตั้งต้นของตัวเอง", "", "บรรทัดที่ใช้อยู่หน้าตาเปลี่ยน"],
    ["ย้าย กับเรียง", "ลำดับสไตล์ในไฟล์ ไม่มีผลกับหน้าตาบนจอ", "หาสไตล์ง่ายขึ้น", ""],
  ],
};

/* ---------------------------------------------------------------- ตัวจัดการสไตล์ */

export function StyleManager(p: { open: boolean; onClose: () => void; doc: SubDoc; playRes: [number, number] | null }) {
  const [selId, setSelId] = useState<number | null>(null);
  const [editing, setEditing] = useState<{ id: number | null; v: StyleV } | null>(null);
  const [askDel, setAskDel] = useState(false);
  const d = p.doc;
  const uses = useMemo(() => new Map(d.styles.map((s) => [s.id, styleUses(d, styleName(s))])), [d]);
  const sel = d.styles.find((s) => s.id === selId) ?? null;
  useEffect(() => { if (p.open && !d.styles.some((s) => s.id === selId)) setSelId(d.styles[0]?.id ?? null); }, [p.open, d.styles]); // eslint-disable-line react-hooks/exhaustive-deps
  const at = sel ? d.styles.indexOf(sel) : -1;
  const noSel = sel ? undefined : "เลือกสไตล์ก่อน";
  const run = (label: string, fn: (x: SubDoc) => SubDoc) => edit(label, fn);
  // เปิดแล้วโฟกัสสไตล์ที่เลือก ไม่ใช่ปุ่ม ⓘ
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!p.open) return; const t = setTimeout(() => list.current?.querySelector<HTMLElement>(".on")?.focus(), 0); return () => clearTimeout(t); }, [p.open]);
  return (
    <>
      <Dialog open={p.open} onClose={p.onClose} kind="work" title="สไตล์ของซับ" width={640}
        actions={<button type="button" className="btn btn-main" onClick={p.onClose} data-style-close>เสร็จ</button>}>
        <div className="se-stylemgr" data-style-mgr>
          <div className="small se-dlgtext"><Phr>{`ไฟล์นี้มี ${n0(d.styles.length)} สไตล์  กดสไตล์แล้วเลือกคำสั่งทางขวา`}</Phr> <InfoTip title="สไตล์" tip={MANAGER_TIP} /></div>
          <div className="se-stylebody">
            <div ref={list} className="se-stylelist" role="listbox" aria-label="สไตล์ในไฟล์" data-style-list>
              {d.styles.length === 0 ? <div className="small" style={{ padding: 10 }}>ไฟล์นี้ยังไม่มีสไตล์</div> : d.styles.map((s) => {
                const v = readStyle(d, s);
                return (
                  <button key={s.id} type="button" role="option" aria-selected={s.id === selId} className={s.id === selId ? "on" : ""} onClick={() => setSelId(s.id)}
                    onDoubleClick={() => setEditing({ id: s.id, v })} data-style-row={styleName(s)}>
                    <span className="se-stname">{styleName(s)}</span>
                    <span className="small se-stmeta">{`${v.font} ${fmtG(v.size)}`}</span>
                    <span className="small se-stuse">{uses.get(s.id) ? `ใช้ ${n0(uses.get(s.id)!)} บรรทัด` : "ยังไม่มีบรรทัดใช้"}</span>
                  </button>
                );
              })}
            </div>
            <div className="se-stylebtns">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing({ id: null, v: { ...STYLE_DEFAULT, name: uniqueName(d, "Default") } })} data-style-new><IcPlus size={14} />เพิ่มสไตล์ใหม่</button>
              <button type="button" className={"btn btn-ghost btn-sm" + (noSel ? " btn-wait" : "")} aria-disabled={!!noSel || undefined} title={noSel} onClick={() => sel && setEditing({ id: sel.id, v: readStyle(d, sel) })} data-style-edit><IbPencil size={14} />แก้</button>
              <button type="button" className={"btn btn-ghost btn-sm" + (noSel ? " btn-wait" : "")} aria-disabled={!!noSel || undefined} title={noSel} onClick={() => sel && setEditing({ id: null, v: { ...readStyle(d, sel), name: uniqueName(d, styleName(sel)) } })} data-style-copy><IcCopy size={14} />คัดลอก</button>
              <button type="button" className={"btn btn-ghost btn-sm" + (noSel ? " btn-wait" : "")} aria-disabled={!!noSel || undefined} title={noSel} onClick={() => sel && setAskDel(true)} data-style-del><IbTrash size={14} />ลบ</button>
              <span className="se-stsep" />
              <button type="button" className={"btn btn-ghost btn-sm" + (at <= 0 ? " btn-wait" : "")} aria-disabled={at <= 0 || undefined} title={at <= 0 ? noSel ?? "อยู่บนสุดแล้ว" : undefined} onClick={() => sel && at > 0 && run("ย้ายสไตล์ขึ้น", (x) => moveStyle(x, sel.id, at - 1))} data-style-up>ย้ายขึ้น</button>
              <button type="button" className={"btn btn-ghost btn-sm" + (at < 0 || at >= d.styles.length - 1 ? " btn-wait" : "")} aria-disabled={at < 0 || at >= d.styles.length - 1 || undefined} title={at < 0 ? noSel : at >= d.styles.length - 1 ? "อยู่ล่างสุดแล้ว" : undefined} onClick={() => sel && at < d.styles.length - 1 && run("ย้ายสไตล์ลง", (x) => moveStyle(x, sel.id, at + 1))} data-style-down>ย้ายลง</button>
              <button type="button" className={"btn btn-ghost btn-sm" + (d.styles.length < 2 ? " btn-wait" : "")} aria-disabled={d.styles.length < 2 || undefined} title={d.styles.length < 2 ? "มีสไตล์เดียว" : undefined} onClick={() => d.styles.length > 1 && run("เรียงสไตล์ตามชื่อ", sortStyles)} data-style-sort>เรียงตามชื่อ</button>
            </div>
          </div>
        </div>
      </Dialog>
      <Dialog open={askDel && !!sel} onClose={() => setAskDel(false)} kind="work" confirm title="ลบสไตล์" width={520}
        actions={<>
          <button type="button" className="btn btn-ghost" onClick={() => setAskDel(false)}>ยกเลิก</button>
          <button type="button" className="btn btn-bad" onClick={() => { if (sel) { const next = d.styles[at + 1] ?? d.styles[at - 1]; run(`ลบสไตล์ ${styleName(sel)}`, (x) => deleteStyles(x, new Set([sel.id]))); setSelId(next?.id ?? null); } setAskDel(false); }} data-style-del-ok>ลบสไตล์</button>
        </>}>
        {sel && <div className="se-dlgtext"><Phr>{uses.get(sel.id) ? `${styleName(sel)} มี ${n0(uses.get(sel.id)!)} บรรทัดใช้อยู่  ลบแล้วบรรทัดเหล่านั้นจะแสดงด้วยหน้าตาตั้งต้นของโปรแกรมเล่น  เลิกทำได้` : `ลบ ${styleName(sel)} ออกจากไฟล์  ยังไม่มีบรรทัดใช้สไตล์นี้  เลิกทำได้`}</Phr></div>}
      </Dialog>
      <StyleEditor open={!!editing} init={editing} doc={d} playRes={p.playRes} onClose={() => setEditing(null)} onSaved={(id) => setSelId(id)} />
    </>
  );
}

/* ---------------------------------------------------------------- หน้าต่างแก้สไตล์ */

const TIPS: Record<string, Tip> = {
  color: {
    w: "สีสี่ชุดของสไตล์ แต่ละสีตั้งความโปร่งได้ 0 ถึง 255 (0 คือทึบ 255 คือมองไม่เห็น)",
    o: [
      ["สีหลัก", "สีของตัวอักษร", "", ""],
      ["สีรอง", "สีของคำที่ยังร้องไม่ถึงในซับคาราโอเกะ ซับทั่วไปไม่ได้ใช้", "", ""],
      ["สีขอบ", "สีเส้นรอบตัวอักษร หรือสีกล่องเมื่อเลือกแบบกล่องทึบ", "", ""],
      ["สีเงา", "สีเงาที่ทอดใต้ตัวอักษร", "", ""],
    ],
  },
  border: {
    w: "แบบขอบรอบตัวอักษร",
    o: [
      ["ขอบปกติ", "เส้นขอบรอบตัวอักษรกว้างตามช่องความหนาขอบ และมีเงาตามช่องระยะเงา", "อ่านง่ายบนภาพทุกแบบ", ""],
      ["กล่องทึบ", "กล่องสีขอบรองหลังข้อความแทนเส้นขอบ ความหนาขอบคือระยะของกล่องจากตัวอักษร", "อ่านง่ายบนภาพที่ลายเยอะ", "บังภาพมากกว่า"],
    ],
    r: "ใช้ขอบปกติ",
  },
  size: { w: "ความหนาขอบกับระยะเงาเป็นจุดตามขนาดภาพของซับ (PlayRes) ไม่ใช่จุดบนจอ ซับขนาดภาพ 1920 × 1080 ใช้ตัวเลขมากกว่าซับ 640 × 360 ราวสามเท่าเพื่อหน้าตาเท่ากัน" },
  align: { w: "ตำแหน่งของซับบนภาพ จัดแบบแป้นตัวเลข 1 2 3 แถวล่าง 4 5 6 กลางจอ 7 8 9 แถวบน ซ้าย กลาง ขวา ตามลำดับ ค่าปกติคือ 2 กลางล่าง" },
  margin: { w: "ระยะจากขอบภาพเป็นจุดตามขนาดภาพของซับ ซ้ายกับขวากันไม่ให้ข้อความชิดขอบ บนล่างคือระยะจากขอบล่าง (ซับแถวล่าง) หรือขอบบน (ซับแถวบน) บรรทัดที่ตั้งระยะขอบเองในช่องแก้บรรทัดใช้ค่าของบรรทัดแทน" },
  misc: {
    w: "ตั้งค่าอื่นของตัวอักษร",
    o: [
      ["ย่อขยายแนวนอน แนวตั้ง", "ยืดหรือบีบตัวอักษรเป็นร้อยละ 100 คือปกติ", "", ""],
      ["หมุน", "หมุนข้อความทวนเข็มนาฬิกาเป็นองศา", "", ""],
      ["ระยะตัวอักษร", "ช่องว่างเพิ่มระหว่างตัวอักษรเป็นจุด", "", "ภาษาไทยสระกับวรรณยุกต์อาจแยกจากตัวอักษร"],
      ["Encoding", "ชุดอักษรของฟอนต์แบบเก่า 1 คือค่าปกติ ไฟล์ Unicode ไม่ต้องเปลี่ยน", "", ""],
    ],
  },
};
type Ask = { k: "rename"; v: StyleV; from: string; n: number } | null;

export function StyleEditor(p: { open: boolean; init: { id: number | null; v: StyleV } | null; doc: SubDoc; playRes: [number, number] | null; onClose: () => void; onSaved: (id: number) => void }) {
  const [v, setV] = useState<StyleV>(STYLE_DEFAULT);
  const [err, setErr] = useState<string | null>(null);
  const [ask, setAsk] = useState<Ask>(null);
  const [font, setFont] = useState(false);
  const [sample, setSample] = useState(() => { try { return localStorage.getItem("se-style-sample") || "ตัวอย่างข้อความ สวัสดีค่ะ ABC 123"; } catch { return "ตัวอย่างข้อความ สวัสดีค่ะ ABC 123"; } });
  const [bg, setBg] = useState<"dark" | "light" | "check">("dark");
  const first = useRef<HTMLInputElement>(null);
  const d = p.doc;
  const keys = new Set(styleKeys(d));
  const has = (k: keyof StyleV) => keys.has(k);
  useEffect(() => { if (p.open && p.init) { setV(p.init.v); setErr(null); setAsk(null); const t = setTimeout(() => first.current?.select(), 0); return () => clearTimeout(t); } }, [p.open]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = <K extends keyof StyleV>(k: K, x: StyleV[K]) => { setV((o) => ({ ...o, [k]: x })); setErr(null); };
  const numIn = (k: keyof StyleV, label: string, unit = "", w = 64) => (
    has(k) && <label className="se-f se-pin">{label}<NumBox value={v[k] as number} onChange={(x) => set(k, x as never)} width={w} data={k} />{unit}</label>
  );
  const [W, H] = p.playRes ?? playRes(d);
  // ตัวอย่างวาดในกรอบสูง 150 จุด ขนาดตัวอักษรเทียบสัดส่วนกับความสูงภาพของซับ
  const k = 150 / Math.max(1, H) * 1.6;
  const save = (v2: StyleV, renameRefs: boolean | null) => {
    const name = v2.name.trim();
    if (!name) { setErr("ใส่ชื่อสไตล์ก่อน"); return; }
    const clash = findStyle(d, name);
    const id = p.init?.id ?? null;
    if (clash && clash.id !== id) { setErr("มีสไตล์ชื่อนี้อยู่แล้ว ตั้งชื่ออื่น"); return; }
    const old = id != null ? d.styles.find((s) => s.id === id) : null;
    const from = old ? styleName(old) : "";
    if (old && from !== name && renameRefs == null) {
      const n = styleUses(d, from);
      if (n) { setAsk({ k: "rename", v: { ...v2, name }, from, n }); return; }
    }
    const v3 = { ...v2, name };
    // กดบันทึกโดยไม่ได้แก้อะไร ไม่เพิ่มขั้นเลิกทำ
    if (old && JSON.stringify(writeStyle(d, v3, old)) === JSON.stringify(old.fields)) { p.onClose(); return; }
    if (id == null) {
      let nid = 0;
      edit(`เพิ่มสไตล์ ${name}`, (x) => { const r = addStyle(x, v3); nid = r.id; return r.doc; });
      p.onSaved(nid);
    } else {
      edit(from !== name ? `เปลี่ยนสไตล์ ${from} เป็น ${name}` : `แก้สไตล์ ${name}`, (x) => { const y = setStyle(x, id, v3); return renameRefs ? renameUses(y, from, name) : y; });
      p.onSaved(id);
    }
    try { localStorage.setItem("se-style-sample", sample); } catch { /* ไม่มีที่เก็บ */ }
    p.onClose();
  };
  const sw = (k2: "primary" | "secondary" | "outline" | "shadow", label: string) => has(k2) && (
    <span className="se-stcolor" data-style-color={k2}>
      <label className="se-dswatch" title={`${label} กดเพื่อเลือกสี`}><span style={{ background: css(v[k2]) }} /><input type="color" value={hex(v[k2])} onChange={(e) => set(k2, fromHex(e.target.value, v[k2].a))} aria-label={label} /></label>
      <span className="se-stclbl">{label}</span>
      <label className="se-f se-pin" title="ความโปร่ง 0 ทึบ 255 มองไม่เห็น">โปร่ง<NumBox value={v[k2].a} onChange={(x) => set(k2, { ...v[k2], a: Math.max(0, Math.min(255, Math.round(x))) })} width={52} data={`${k2}-a`} /></label>
    </span>
  );
  const tog = (k2: "bold" | "italic" | "underline" | "strike", label: string, icon: React.ReactNode) => has(k2) && (
    <button type="button" className={"btn btn-ghost btn-sm se-sttog" + (v[k2] ? " pressed" : "")} aria-pressed={v[k2]} onClick={() => set(k2, !v[k2])} title={label} data-style-tog={k2}>{icon}{label}</button>
  );
  const preview = {
    fontFamily: `"${v.font}"`, fontSize: Math.max(6, Math.min(80, v.size * k)), fontWeight: v.bold ? 700 : 400, fontStyle: v.italic ? "italic" : "normal",
    textDecoration: [v.underline && "underline", v.strike && "line-through"].filter(Boolean).join(" ") || "none",
    color: css(v.primary), letterSpacing: v.spacing * k,
    transform: `rotate(${-v.angle}deg) scale(${v.scaleX / 100}, ${v.scaleY / 100})`,
    ...(v.border === 3 ? { background: css(v.outline), padding: `${v.outlineW * k}px` } : { WebkitTextStroke: `${v.outlineW * k * 2}px ${css(v.outline)}`, paintOrder: "stroke fill" }),
    textShadow: v.shadowW ? `${v.shadowW * k}px ${v.shadowW * k}px 0 ${css(v.shadow)}` : "none",
  } as React.CSSProperties;
  const al = v.align;
  return (
    <>
      <Dialog open={p.open} onClose={p.onClose} kind="work" title={p.init?.id == null ? "สไตล์ใหม่" : `แก้สไตล์ ${p.init.v.name}`} width={760}
        actions={<>
          <span className="small se-dlgmsg bad" role={err ? "alert" : undefined} data-style-err>{err ?? ""}</span>
          <span style={{ flex: 1 }} />
          <button type="button" className="btn btn-ghost" onClick={p.onClose}>ยกเลิก</button>
          <button type="button" className="btn btn-main" onClick={() => save(v, null)} data-style-save>บันทึกสไตล์</button>
        </>}>
        <div className="se-dummy se-cdlg se-styleed" data-style-editor>
          <div className="se-drow"><span className="se-dlbl">ชื่อสไตล์</span><input ref={first} className="inp se-dwide" value={v.name} onChange={(e) => set("name", e.target.value)} aria-label="ชื่อสไตล์" data-style-name /></div>
          <div className="se-drow"><span className="se-dlbl">ฟอนต์</span>
            <button type="button" className="btn btn-ghost btn-sm se-stfont" onClick={() => setFont(true)} title="เลือกฟอนต์จากฟอนต์ที่ลงในเครื่อง" data-style-font style={{ fontFamily: `"${v.font}"` }}>{v.font || "เลือกฟอนต์"}</button>
            {numIn("size", "ขนาด")}
            <span className="se-sttogs">{tog("bold", "หนา", <IbBold size={14} />)}{tog("italic", "เอียง", <IbItalic size={14} />)}{tog("underline", "ขีดเส้นใต้", <IbUnderline size={14} />)}{tog("strike", "ขีดฆ่า", <IbStrike size={14} />)}</span>
          </div>
          <div className="se-drow"><span className="se-dlbl">สี<InfoTip title="สีของสไตล์" tip={TIPS.color} /></span>
            <span className="se-stcolors">{sw("primary", "สีหลัก")}{sw("secondary", "สีรอง")}{sw("outline", "สีขอบ")}{sw("shadow", "สีเงา")}</span>
          </div>
          <div className="se-drow"><span className="se-dlbl">ขอบ<InfoTip title="แบบขอบ" tip={TIPS.border} /></span>
            {has("border") && <Seg small label="แบบขอบ" value={v.border === 3 ? "3" : "1"} onChange={(x) => set("border", Number(x))} options={[{ value: "1", label: "ขอบปกติ" }, { value: "3", label: "กล่องทึบ" }]} />}
            {numIn("outlineW", "หนา")}{numIn("shadowW", "เงา")}<InfoTip title="ความหนาขอบกับระยะเงา" tip={TIPS.size} />
          </div>
          <div className="se-drow se-sttop"><span className="se-dlbl">ตำแหน่ง<InfoTip title="ตำแหน่ง" tip={TIPS.align} /></span>
            {has("align") && (d.kind === "ass" ? (
              <span className="se-stpad" role="group" aria-label="ตำแหน่งบนภาพ">
                {[7, 8, 9, 4, 5, 6, 1, 2, 3].map((n) => <button key={n} type="button" className={al === n ? "on" : ""} aria-pressed={al === n} onClick={() => set("align", n)} data-style-align={n}>{n}</button>)}
              </span>
            ) : <label className="se-f se-pin">ค่า<NumBox value={v.align} onChange={(x) => set("align", Math.round(x))} width={52} data="align" /></label>)}
            <span className="se-stcol">
              <span className="se-dlbl2">ระยะขอบ<InfoTip title="ระยะขอบ" tip={TIPS.margin} /></span>
              <span className="se-strow">{numIn("mL", "ซ้าย")}{numIn("mR", "ขวา")}{numIn("mV", "บนล่าง")}</span>
            </span>
          </div>
          {(has("scaleX") || has("angle") || has("spacing") || has("enc")) && <div className="se-drow"><span className="se-dlbl">อื่น ๆ<InfoTip title="ตั้งค่าอื่น" tip={TIPS.misc} /></span>
            {numIn("scaleX", "กว้าง", "%", 56)}{numIn("scaleY", "สูง", "%", 56)}{numIn("angle", "หมุน", "°", 56)}{numIn("spacing", "ระยะตัวอักษร", "", 52)}{numIn("enc", "Encoding", "", 44)}
          </div>}
          <div className="se-drow"><span className="se-dlbl">ตัวอย่าง</span>
            <input className="inp se-dwide" value={sample} onChange={(e) => setSample(e.target.value)} aria-label="ข้อความตัวอย่าง" data-style-sample />
            <Seg small label="พื้นหลังตัวอย่าง" value={bg} onChange={setBg} options={[{ value: "dark", label: "มืด" }, { value: "light", label: "สว่าง" }, { value: "check", label: "ตาราง" }]} />
          </div>
          <div className={`se-stprev se-stprev-${bg}`} data-style-preview>
            <span style={preview}>{sample}</span>
          </div>
          <div className="small se-dlgtext"><Phr>{`ตัวอย่างวาดเทียบขนาดภาพของซับ ${W} × ${H}  หน้าตาจริงขึ้นกับโปรแกรมเล่น`}</Phr></div>
        </div>
      </Dialog>
      <FontDialog open={font} current={{ name: v.font, size: fmtG(v.size) }} sample={sample} onClose={() => setFont(false)} onApply={() => {}}
        onPick={(name, size) => setV((o) => ({ ...o, font: name, size: parseFloat(size) || o.size }))} />
      <Dialog open={ask?.k === "rename"} onClose={() => setAsk(null)} kind="work" title="เปลี่ยนชื่อสไตล์ในบรรทัดด้วยไหม" width={560}
        actions={ask ? <>
          <button type="button" className="btn btn-ghost" onClick={() => setAsk(null)}>ยกเลิก</button>
          <button type="button" className="btn btn-ghost" onClick={() => { const a = ask; setAsk(null); save(a.v, false); }} data-style-rename-no>ไม่เปลี่ยน</button>
          <button type="button" className="btn btn-main" onClick={() => { const a = ask; setAsk(null); save(a.v, true); }} data-style-rename-yes>เปลี่ยนด้วย</button>
        </> : null}>
        {ask && <div className="se-dlgtext"><Phr>{`มี ${n0(ask.n)} บรรทัดใช้สไตล์ ${ask.from} อยู่  เปลี่ยนเป็น ${ask.v.name} ด้วย หน้าตาบรรทัดเหล่านั้นเหมือนเดิม  ถ้าไม่เปลี่ยน บรรทัดเหล่านั้นจะไม่มีสไตล์ที่ชื่อตรง`}</Phr></div>}
      </Dialog>
    </>
  );
}

/** ช่องตัวเลข พิมพ์ได้อิสระ ค่าเข้าเมื่ออ่านออก · ออกจากช่องแล้วกลับเป็นค่าล่าสุดที่ใช้ได้ */
function NumBox(p: { value: number; onChange: (v: number) => void; width: number; data: string }) {
  const [t, setT] = useState(fmtG(p.value));
  const [bad, setBad] = useState(false);
  useEffect(() => { if (parseFloat(t) !== p.value) setT(fmtG(p.value)); }, [p.value]); // eslint-disable-line react-hooks/exhaustive-deps
  return <input className={"inp se-num4" + (bad ? " err" : "")} style={{ width: p.width }} value={t} inputMode="decimal"
    onChange={(e) => { const s = e.target.value; setT(s); const v = /^-?\d*\.?\d+$/.test(s.trim()) ? parseFloat(s) : NaN; setBad(Number.isNaN(v)); if (!Number.isNaN(v)) p.onChange(v); }}
    onBlur={() => { setT(fmtG(p.value)); setBad(false); }} data-style-num={p.data} />;
}
