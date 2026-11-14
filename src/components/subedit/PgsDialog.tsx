/* ส่งออกซับเป็น PGS ซับแบบภาพของ Blu-ray ไฟล์ .sup (BUGS ข้อ 118 · ตัวทำอยู่ pgs.rs)
   ขนาดภาพกับอัตราเฟรมตามหนังที่เปิดอยู่ เลือกขนาดของ Blu-ray เองได้ · ก่อนส่งออกไล่ซับจริงแล้วเตือนสิ่งที่จะเพี้ยนหรือหาย
   (พี่กันสั่ง "เราเข้าใจว่ามันมีข้อจำกัดก็ต้องเตือนด้วย") · ระหว่างทำบอกภาพที่วาดแล้ว หยุดได้ · ชื่อชนถามตั้งชื่อใหม่ต่อเลข ไม่เขียนทับ */
import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { inApp, pgsApi, pickSave, subDocApi, type PgsOut, type SubDoc } from "../../lib/api";
import type { Tip } from "../../lib/codecAdv";
import { playRes } from "../../lib/subStyle";
import { isAss } from "../../lib/subText";
import Dialog from "../Dialog";
import Dropdown from "../Dropdown";
import InfoTip from "../InfoTip";
import { CardIcon, Keep, Phr } from "../ui";
import { IcFolder } from "../icons";

const nameOf = (p: string) => p.split(/[\\/]/).pop() ?? p;
/** ขนาดภาพของ Blu-ray */
const BD: [number, number][] = [[1920, 1080], [1280, 720], [720, 576], [720, 480]];
/** อัตราเฟรมที่ PGS เก็บได้ */
const FPS: { v: string; label: string; num: number; den: number }[] = [
  { v: "23.976", label: "23.976", num: 24000, den: 1001 }, { v: "24", label: "24", num: 24, den: 1 }, { v: "25", label: "25", num: 25, den: 1 },
  { v: "29.97", label: "29.97", num: 30000, den: 1001 }, { v: "50", label: "50", num: 50, den: 1 }, { v: "59.94", label: "59.94", num: 60000, den: 1001 },
];
const PGS_TIP: Tip = {
  w: "PGS คือซับแบบภาพของแผ่น Blu-ray เก็บเป็นไฟล์ .sup โปรแกรมวาดซับทุกบรรทัดเป็นภาพด้วยตัววาดเดียวกับตอนเล่น หน้าตาจึงเหมือนในตัวเล่น แต่แก้ข้อความทีหลังไม่ได้",
  o: [
    ["ใช้ทำอะไร", "ใส่ในหนังสำหรับเครื่องเล่นหรือทีวีที่ไม่รองรับซับ ASS หรือทำแผ่น Blu-ray", "ฟอนต์ สี ตำแหน่ง ขึ้นเหมือนกันทุกเครื่อง", ""],
    ["ข้อจำกัด", "หนึ่งภาพเก็บได้ไม่เกิน 255 สี ซับบนจอพร้อมกันได้ไม่เกินสองกรอบ เอฟเฟกต์เคลื่อนไหวต้องวาดใหม่ทุกเฟรม", "", "ขอบเบลอหรือสีไล่โทนอาจเห็นเป็นขั้น และไฟล์ใหญ่ขึ้นตามจำนวนภาพ"],
  ],
  r: "เก็บไฟล์ ASS ไว้ด้วยเสมอ ถ้าต้องแก้ซับให้แก้ที่ไฟล์ ASS แล้วส่งออกใหม่",
};
const SIZE_TIP: Tip = {
  w: "ขนาดภาพของ PGS ต้องเท่าภาพของหนังที่จะใส่ ซับจึงอยู่ตรงตำแหน่ง",
  o: [
    ["ตามหนัง", "ขนาดภาพของหนังที่เปิดอยู่", "ตรงกับหนังเสมอ", "หนังที่ขนาดไม่ใช่แบบ Blu-ray เครื่องเล่น Blu-ray อาจไม่รับ"],
    ["ขนาดของ Blu-ray", "1920 × 1080 1280 × 720 720 × 576 หรือ 720 × 480", "เครื่องเล่น Blu-ray รับแน่นอน", ""],
  ],
  r: "ตามหนัง",
};

/** แท็กที่ทำให้ภาพเปลี่ยนระหว่างบรรทัด ตรงกับ pgs.rs animated · ดูเฉพาะในวงเล็บปีกกา */
const tagsOf = (t: string) => (t.match(/\{[^}]*\}/g) ?? []).join(" ").toLowerCase();
const isAnimated = (t: string) => { const g = tagsOf(t); return /\\(move|fad|fade|t)\(/.test(g) || /\\k(\d|f|o)/.test(g); };
const isSoft = (t: string) => /\\(blur|be)\s*[1-9]|\\([1-4]a|alpha)\s*&h[0-9a-f]/i.test(tagsOf(t));
/** บรรทัดที่ขึ้นพร้อมกันมากที่สุด */
function maxTogether(doc: SubDoc) {
  const ev: [number, number][] = [];
  for (const e of doc.events) if (!e.comment && e.end > e.start) { ev.push([e.start, 1]); ev.push([e.end, -1]); }
  ev.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let n = 0, m = 0;
  for (const [, d] of ev) { n += d; m = Math.max(m, n); }
  return m;
}
const fpsOf = (rate: string | null | undefined, fps: number | null | undefined) => {
  const m = /^(\d+)\/(\d+)$/.exec(rate ?? "");
  const f = m ? Number(m[1]) / Number(m[2]) : fps ?? 23.976;
  return FPS.reduce((b, x) => (Math.abs(x.num / x.den - f) < Math.abs(b.num / b.den - f) ? x : b), FPS[0]).v;
};

export default function PgsDialog(p: { open: boolean; onClose: () => void; doc: SubDoc; base: string; movie: string | null; video: { w: number; h: number; rate?: string; fps?: number } | null; onDone: (msg: string) => void }) {
  const [path, setPath] = useState("");
  const [size, setSize] = useState("video");
  const [fps, setFps] = useState("23.976");
  const [run, setRun] = useState<{ done: number; total: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [exists, setExists] = useState(false);
  const [out, setOut] = useState<PgsOut | null>(null);
  useEffect(() => {
    if (!p.open) return;
    setPath(`${p.base}.sup`); setRun(null); setErr(null); setExists(false); setOut(null);
    setSize(p.video ? "video" : (() => { const [w, h] = playRes(p.doc); return BD.some(([a, b]) => a === w && b === h) ? `${w}x${h}` : "1920x1080"; })());
    setFps(fpsOf(p.video?.rate, p.video?.fps));
  }, [p.open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!run || !inApp) return;
    const un = listen<{ done: number; total: number }>("pgs-progress", (e) => setRun(e.payload));
    return () => { void un.then((f) => f()); };
  }, [run != null]); // eslint-disable-line react-hooks/exhaustive-deps
  const busy = run != null;
  const [w, h] = size === "video" && p.video ? [p.video.w, p.video.h] : size.split("x").map(Number);
  const std = BD.some(([a, b]) => a === w && b === h);
  const lines = p.doc.events.filter((e) => !e.comment && e.end > e.start);
  const anim = lines.filter((e) => isAnimated(e.text)).length;
  const soft = lines.filter((e) => isSoft(e.text)).length;
  const together = maxTogether(p.doc);
  const warns: string[] = [
    ...(lines.length === 0 ? ["ซับนี้ไม่มีบรรทัดที่ขึ้นบนภาพ"] : []),
    ...(anim ? [`มีเอฟเฟกต์เคลื่อนไหว ${anim.toLocaleString("en-US")} บรรทัด โปรแกรมวาดใหม่ทุกเฟรม ไฟล์จะใหญ่ขึ้นและเครื่องเล่น Blu-ray บางเครื่องอาจแสดงไม่ทัน`] : []),
    ...(soft ? [`มีขอบเบลอหรือสีโปร่งใส ${soft.toLocaleString("en-US")} บรรทัด ภาพเก็บได้ไม่เกิน 255 สี จึงอาจเห็นสีเป็นขั้น`] : []),
    ...(together > 2 ? [`มีช่วงที่ซับขึ้นพร้อมกัน ${together} บรรทัด ถ้าอยู่เกินสองที่บนจอ โปรแกรมรวมเป็นกรอบเดียวกัน`] : []),
    ...(!isAss(p.doc) ? ["ซับ SRT ไม่มีสไตล์ ภาพใช้ฟอนต์และสีตั้งต้นของตัววาด"] : []),
    ...(!std ? [`ขนาด ${w} × ${h} ไม่ใช่ขนาดของ Blu-ray เครื่องเล่น Blu-ray อาจไม่รับ แต่ตัวเล่นในคอมเล่นได้`] : []),
  ];
  const why = busy ? "กำลังส่งออก" : lines.length === 0 ? "ซับนี้ไม่มีบรรทัดที่ขึ้นบนภาพ" : !path ? "ยังไม่ได้เลือกที่เก็บ" : undefined;
  const go = async (target = path) => {
    if (busy) return;
    const f = FPS.find((x) => x.v === fps) ?? FPS[0];
    setErr(null); setExists(false); setOut(null);
    setRun({ done: 0, total: 0 });
    try {
      const r = await pgsApi.export(p.doc, { target, w, h, fpsNum: f.num, fpsDen: f.den, movie: p.movie });
      setRun(null);
      setOut(r);
      p.onDone(`ส่งออก PGS แล้ว ${nameOf(r.path)} ${r.images.toLocaleString("en-US")} ภาพ`);
    } catch (e) {
      setRun(null);
      const m = String(e);
      if (m === "exists") { setPath(target); setExists(true); return; }
      if (m !== "stopped") setErr(m);
    }
  };
  const browse = async () => {
    const w2 = window as unknown as { __pgsTarget?: string };
    const r = import.meta.env.DEV && w2.__pgsTarget ? w2.__pgsTarget : await pickSave(path, "sup", "ซับ PGS");
    if (r) setPath(/\.sup$/i.test(r) ? r : `${r}.sup`);
  };
  const pct = run && run.total ? Math.round((run.done / run.total) * 100) : 0;
  // ไฟล์ซับส่วนมากเล็กกว่า 1 MB บอกเป็น KB ไม่ขึ้น 0 MB
  const fsize = (b: number) => (b < 1048576 ? `${Math.max(1, Math.round(b / 1024)).toLocaleString("en-US")} KB` : `${(b / 1048576).toLocaleString("en-US", { maximumFractionDigits: 1 })} MB`);
  /** ผลส่งออกเป็นประโยคเดียว ต่อด้วย โดย กับ และ */
  const doneText = (o: PgsOut) => {
    const extra = [o.reduced ? `ลดสี ${o.reduced.toLocaleString("en-US")} ภาพที่มีสีเกิน 255 สี` : "", o.merged ? `รวมกรอบ ${o.merged.toLocaleString("en-US")} ภาพที่ซับขึ้นเกินสองที่` : ""].filter(Boolean);
    return `${o.images.toLocaleString("en-US")} ภาพ ขนาด ${fsize(o.bytes)}${extra.map((x, i) => (i ? ` และ${x}` : ` โดย${x}`)).join("")}`;
  };
  return (
    <Dialog open={p.open} onClose={() => { if (!busy) p.onClose(); }} kind="work" title="ส่งออกเป็น PGS" width={640}
      actions={<>
        {busy ? <button type="button" className="btn btn-ghost" onClick={() => void pgsApi.cancel()} data-pgs-stop>หยุด</button>
          : <button type="button" className="btn btn-ghost" onClick={p.onClose}>{out ? "ปิด" : "ยกเลิก"}</button>}
        {exists && !busy && <button type="button" className="btn btn-ghost" onClick={() => { void subDocApi.freeName(path).then((f) => { setPath(f); void go(f); }); }} data-pgs-renum>ตั้งชื่อใหม่ต่อเลข</button>}
        <button type="button" className={"btn " + (why ? "btn-wait" : "btn-main")} aria-disabled={!!why || undefined} title={why} onClick={() => { if (!why) void go(); }} data-pgs-go>
          <Keep all={["ส่งออก", "กำลังส่งออก… 100%"]}>{busy ? `กำลังส่งออก… ${pct}%` : "ส่งออก"}</Keep></button>
      </>}>
      <div className="se-dummy se-cdlg se-pgs" data-pgs>
        <div className="se-dlgtext"><Phr>วาดซับทุกบรรทัดเป็นภาพแบบแผ่น Blu-ray หน้าตาเหมือนตอนเล่น</Phr> <InfoTip title="PGS" tip={PGS_TIP} /></div>
        <div className="se-drow"><span className="se-dlbl">ที่เก็บ</span><span className="se-path small" title={path} data-pgs-path>{path}</span>
          <button type="button" className={"btn btn-ghost btn-sm" + (busy ? " btn-wait" : "")} aria-disabled={busy || undefined} onClick={() => { if (!busy) void browse(); }} data-pgs-browse><IcFolder size={15} />เปลี่ยนที่เก็บ</button></div>
        <div className="se-drow"><span className="se-dlbl">ขนาดภาพ<InfoTip title="ขนาดภาพของ PGS" tip={SIZE_TIP} /></span>
          <Dropdown label="ขนาดภาพ" value={size} disabled={busy ? "กำลังส่งออก" : undefined}
            options={[...(p.video ? [{ value: "video", label: `ตามหนัง ${p.video.w} × ${p.video.h}` }] : []), ...BD.map(([a, b]) => ({ value: `${a}x${b}`, label: `${a} × ${b}` }))]}
            onChange={setSize} />
        </div>
        <div className="se-drow"><span className="se-dlbl">อัตราเฟรม</span>
          <Dropdown label="อัตราเฟรม" value={fps} disabled={busy ? "กำลังส่งออก" : undefined} options={FPS.map((x) => ({ value: x.v, label: `${x.label} fps` }))} onChange={setFps} />
          <span className="small">{p.video ? "ตามหนังที่เปิดอยู่" : "ยังไม่มีวิดีโอ เลือกให้ตรงหนังที่จะใส่"}</span>
        </div>
        {warns.length > 0 && <div className="stat warn" style={{ margin: 0 }} data-pgs-warn><CardIcon kind="warn" /><div>
          <b>ข้อจำกัดของ PGS ที่เจอในซับนี้</b>
          <ul className="se-lostlist">{warns.map((x) => <li key={x}><Phr>{x}</Phr></li>)}</ul>
        </div></div>}
        {busy && <div className="se-drow"><span className="se-dlbl" /><div className="se-vprog" style={{ flex: 1 }} data-pgs-prog><div style={{ width: `${pct}%` }} /></div>
          <span className="small">{run.total ? `ภาพที่ ${run.done.toLocaleString("en-US")} จาก ${run.total.toLocaleString("en-US")}` : "เริ่ม…"}</span></div>}
        {exists && <div className="small se-rmwarn" data-pgs-exists><Phr>{`${nameOf(path)} มีอยู่แล้ว โปรแกรมไม่เขียนทับ ตั้งชื่อใหม่ต่อเลข หรือเลือกที่เก็บใหม่`}</Phr></div>}
        {err && <div className="stat bad" style={{ margin: 0 }} role="alert" data-pgs-err><CardIcon kind="bad" /><div><b>ส่งออกไม่สำเร็จ</b><Phr>{err}</Phr></div></div>}
        {out && <div className="stat ok" style={{ margin: 0 }} data-pgs-done><CardIcon kind="ok" /><div>
          <b>{`ส่งออกแล้ว ${nameOf(out.path)}`}</b>
          <Phr>{doneText(out)}</Phr>
        </div></div>}
      </div>
    </Dialog>
  );
}
