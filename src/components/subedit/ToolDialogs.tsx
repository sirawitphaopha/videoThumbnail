/* เปลี่ยนความละเอียดของคำบรรยาย กับตัวช่วยแปล (แผนหน้าแก้ซับ ขั้น 7 · BUGS ข้อ 109)
   แบบ dialog_resample.cpp กับ dialog_translation.cpp ของ Aegisub · ตรรกะเปลี่ยนความละเอียดอยู่ lib/subResample.ts
   ตัวช่วยแปล แบ่งข้อความของบรรทัดเป็นท่อน (ข้อความธรรมดา บล็อกแท็ก บล็อกหมายเหตุ) แปลทีละท่อนข้อความ แท็กอยู่ที่เดิม
   คีย์ลัดตาม Aegisub Enter ยืนยันแล้วไปท่อนถัดไป · Shift+Enter ขึ้นบรรทัด · F8 ยืนยันไม่ย้าย · PageUp PageDown ท่อนก่อนหน้า ถัดไป · Insert แทรกต้นฉบับ · End ฟังเสียง */
import { useEffect, useMemo, useRef, useState } from "react";
import type { SubDoc } from "../../lib/api";
import type { Tip } from "../../lib/codecAdv";
import { edit, getSubEdit, select } from "../../lib/subEdit";
import { arChanged, resample, type ArMode } from "../../lib/subResample";
import { infoGet, playRes } from "../../lib/subStyle";
import { fromBox, isAss } from "../../lib/subText";
import Dialog from "../Dialog";
import InfoTip from "../InfoTip";
import { Phr, Seg, Switch } from "../ui";

const n0 = (n: number) => n.toLocaleString("en-US");

/* ---------------------------------------------------------------- เปลี่ยนความละเอียด */

const RES_TIP: Tip = {
  w: "ขนาดภาพของซับ (PlayRes) คือขนาดที่ใช้วัดตำแหน่ง ขนาดตัวอักษร ขอบ เงา ระยะขอบในไฟล์ เปลี่ยนแล้วโปรแกรมคูณตัวเลขให้หน้าตาบนจอเท่าเดิม ทั้งขนาดตัวอักษร ขอบ เงา ระยะตัวอักษร ระยะขอบของสไตล์และบรรทัด แท็กตำแหน่ง แท็กขนาด และรูปวาด ใช้ตอนเอาซับไปใช้กับหนังที่ขนาดภาพต่างจากเดิม เช่นซับทำไว้กับ 720p แล้วจะใส่หนัง 1080p",
  r: "ตั้งขนาดใหม่ให้เท่าภาพของหนังที่จะใช้",
};
const AR_TIP: Tip = {
  w: "ใช้เมื่อสัดส่วนภาพเดิมกับใหม่ต่างกัน เช่น 4:3 เป็น 16:9",
  o: [
    ["ยืด", "ยืดหรือบีบซับตามภาพใหม่ ตัวอักษรกว้างขึ้นหรือแคบลง", "ซับเต็มภาพเหมือนเดิม", "ตัวอักษรผิดสัดส่วน"],
    ["เพิ่มขอบ", "ถือว่าภาพใหม่มีแถบดำเพิ่มข้างหรือบนล่าง ซับอยู่ในส่วนภาพเดิม", "ตัวอักษรสัดส่วนเดิม", ""],
    ["ตัดขอบ", "ถือว่าภาพใหม่ตัดขอบภาพเดิมออก ซับขยายตามส่วนที่เหลือ", "ตัวอักษรสัดส่วนเดิม", "ซับที่อยู่ริมขอบอาจหลุดภาพ"],
    ["กำหนดเอง", "ใส่ระยะขอบที่เพิ่มหรือตัดเองทั้งสี่ด้านเป็นจุด", "ตรงกับการตัดภาพจริง", "ต้องรู้ตัวเลขการตัดภาพ"],
  ],
  r: "ไม่แน่ใจใช้เพิ่มขอบ",
};
const PRESETS: [number, number][] = [[640, 360], [1280, 720], [1920, 1080], [3840, 2160]];

export function ResampleDialog(p: { open: boolean; onClose: () => void; doc: SubDoc; video: [number, number] | null; onDone: (msg: string) => void }) {
  const [src, setSrc] = useState<[string, string]>(["", ""]);
  const [dst, setDst] = useState<[string, string]>(["", ""]);
  const [mode, setMode] = useState<ArMode>("add");
  const [mg, setMg] = useState<[string, string, string, string]>(["0", "0", "0", "0"]);
  const [sym, setSym] = useState(true);
  const first = useRef<HTMLInputElement>(null);
  const [sw, sh] = playRes(p.doc);
  useEffect(() => {
    if (!p.open) return;
    setSrc([String(sw), String(sh)]);
    setDst(p.video ? [String(p.video[0]), String(p.video[1])] : [String(sw), String(sh)]);
    setMode("add"); setMg(["0", "0", "0", "0"]); setSym(true);
    const t = setTimeout(() => first.current?.select(), 0);
    return () => clearTimeout(t);
  }, [p.open]); // eslint-disable-line react-hooks/exhaustive-deps
  const iv = (s: string) => (/^\d+$/.test(s.trim()) && parseInt(s, 10) > 0 ? parseInt(s, 10) : null);
  const mv = (s: string) => (/^-?\d+$/.test(s.trim()) ? parseInt(s, 10) : null);
  const S = [iv(src[0]), iv(src[1]), iv(dst[0]), iv(dst[1])];
  const M = mg.map(mv);
  const okNums = S.every((x) => x != null);
  const changedAr = okNums && arChanged({ srcW: S[0]!, srcH: S[1]!, dstW: S[2]!, dstH: S[3]! });
  const manual = changedAr && mode === "manual";
  const why = !isAss(p.doc) ? "ซับ SRT ไม่มีขนาดภาพ เปลี่ยนเป็น ASS ก่อน" : !okNums ? "ขนาดต้องเป็นจำนวนเต็มมากกว่า 0" : manual && M.some((x) => x == null) ? "ระยะขอบต้องเป็นจำนวนเต็ม" : S[0] === S[2] && S[1] === S[3] && !manual ? "ขนาดใหม่เท่าขนาดเดิม" : null;
  const run = () => {
    if (why) return;
    const s = { srcW: S[0]!, srcH: S[1]!, dstW: S[2]!, dstH: S[3]!, mode, margin: (manual ? M.map((x) => x ?? 0) : [0, 0, 0, 0]) as [number, number, number, number] };
    edit(`เปลี่ยนความละเอียดเป็น ${s.dstW} × ${s.dstH}`, (d) => resample(d, s));
    p.onDone(`เปลี่ยนความละเอียดเป็น ${s.dstW} × ${s.dstH} แล้ว`);
    p.onClose();
  };
  const setM = (i: number, v: string) => setMg((o) => { const n = [...o] as typeof o; n[i] = v; if (sym) { if (i === 0) n[1] = v; if (i === 2) n[3] = v; } return n; });
  const box = (v: string, on: (s: string) => void, label: string, ref?: React.Ref<HTMLInputElement>, off?: boolean) => (
    <input ref={ref} className={"inp se-num4" + (v.trim() && !/^-?\d+$/.test(v.trim()) ? " err" : "")} style={{ width: 68 }} value={v} disabled={off} onChange={(e) => on(e.target.value)} aria-label={label} data-rs={label} />
  );
  return (
    <Dialog open={p.open} onClose={p.onClose} kind="work" title="เปลี่ยนความละเอียดของคำบรรยาย" width={660}
      actions={<>
        <button type="button" className="btn btn-ghost" onClick={p.onClose}>ยกเลิก</button>
        <button type="button" className={"btn " + (why ? "btn-wait" : "btn-main")} aria-disabled={!!why || undefined} title={why ?? undefined} onClick={run} data-rs-run>เปลี่ยนความละเอียด</button>
      </>}>
      <div className="se-dummy se-cdlg" data-resample>
        <div className="se-drow"><span className="se-dlbl">ขนาดเดิม<InfoTip title="ขนาดภาพของซับ" tip={RES_TIP} /></span>
          {box(src[0], (x) => setSrc([x, src[1]]), "กว้างเดิม", first)}<span>×</span>{box(src[1], (x) => setSrc([src[0], x]), "สูงเดิม")}
          <button type="button" className={"btn btn-ghost btn-sm" + (src[0] === String(sw) && src[1] === String(sh) ? " btn-wait" : "")} aria-disabled={(src[0] === String(sw) && src[1] === String(sh)) || undefined} title={src[0] === String(sw) && src[1] === String(sh) ? "เป็นขนาดในไฟล์อยู่แล้ว" : undefined} onClick={() => setSrc([String(sw), String(sh)])} data-rs-from-script>ขนาดในไฟล์</button>
          <span className="small">{infoGet(p.doc, "PlayResX") ? "" : "ไฟล์ไม่ได้ตั้งไว้ ใช้ค่าตั้งต้น"}</span>
        </div>
        <div className="se-drow"><span className="se-dlbl">ขนาดใหม่</span>
          {box(dst[0], (x) => setDst([x, dst[1]]), "กว้างใหม่")}<span>×</span>{box(dst[1], (x) => setDst([dst[0], x]), "สูงใหม่")}
          <button type="button" className={"btn btn-ghost btn-sm" + (!p.video ? " btn-wait" : "")} aria-disabled={!p.video || undefined} title={p.video ? `ขนาดภาพของหนัง ${p.video[0]} × ${p.video[1]}` : "ยังไม่มีวิดีโอ"} onClick={() => p.video && setDst([String(p.video[0]), String(p.video[1])])} data-rs-from-video>ขนาดของหนัง</button>
        </div>
        <div className="se-drow"><span className="se-dlbl" />
          <span className="se-dstyles">{PRESETS.map(([w, h]) => <button key={w} type="button" className="btn btn-ghost btn-sm" onClick={() => setDst([String(w), String(h)])} data-rs-preset={`${w}x${h}`}>{`${w} × ${h}`}</button>)}</span>
        </div>
        <div className="se-drow"><span className="se-dlbl">สัดส่วนภาพ<InfoTip title="สัดส่วนภาพ" tip={AR_TIP} /></span>
          <span title={changedAr ? undefined : "สัดส่วนเดิมกับใหม่เท่ากัน ไม่ต้องเลือก"} style={{ display: "contents" }}>
            <Seg small label="สัดส่วนภาพ" value={mode} onChange={setMode} disabledReason={changedAr ? undefined : "สัดส่วนเดิมกับใหม่เท่ากัน ไม่ต้องเลือก"}
              options={[{ value: "stretch", label: "ยืด" }, { value: "add", label: "เพิ่มขอบ" }, { value: "remove", label: "ตัดขอบ" }, { value: "manual", label: "กำหนดเอง" }]} />
          </span>
        </div>
        {manual && <div className="se-drow"><span className="se-dlbl">ระยะขอบ</span>
          <label className="se-f se-pin">ซ้าย{box(mg[0], (x) => setM(0, x), "ซ้าย")}</label><label className="se-f se-pin">ขวา{box(mg[1], (x) => setM(1, x), "ขวา", undefined, sym)}</label>
          <label className="se-f se-pin">บน{box(mg[2], (x) => setM(2, x), "บน")}</label><label className="se-f se-pin">ล่าง{box(mg[3], (x) => setM(3, x), "ล่าง", undefined, sym)}</label>
        </div>}
        {manual && <div className="se-drow"><span className="se-dlbl" />
          <span className="se-dsw2"><Switch on={sym} onChange={(v) => { setSym(v); if (v) setMg((o) => [o[0], o[0], o[2], o[2]]); }} label="ขวาเท่าซ้าย ล่างเท่าบน" />ขวาเท่าซ้าย ล่างเท่าบน</span>
        </div>}
        <div className="small se-dlgtext"><Phr>{`คูณตัวเลขขนาดและตำแหน่งของ ${n0(p.doc.events.length)} บรรทัดกับ ${n0(p.doc.styles.length)} สไตล์  เลิกทำได้ทีเดียว`}</Phr></div>
      </div>
    </Dialog>
  );
}

/* ---------------------------------------------------------------- ตัวช่วยแปล */

type Block = { kind: "plain" | "tag" | "note"; text: string };
/** แบ่งข้อความเป็นท่อน (AssDialogue::ParseTags) · SRT แท็ก <…> เป็นบล็อกแท็ก */
export function blocksOf(text: string, ass: boolean): Block[] {
  const out: Block[] = [];
  const re = ass ? /\{[^}]*\}/g : /<[^>]*>/g;
  let last = 0, m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ kind: "plain", text: text.slice(last, m.index) });
    out.push({ kind: !ass || m[0].includes("\\") ? "tag" : "note", text: m[0] });
    last = m.index + m[0].length;
  }
  if (last < text.length || !out.length) out.push({ kind: "plain", text: text.slice(last) });
  return out;
}
/** ท่อนที่ข้าม แท็ก หมายเหตุ ท่อนที่มีแต่ช่องว่าง (bad_block กับ Skip Whitespace ที่ค่าตั้งต้นเปิด) */
const bad = (b: Block) => b.kind !== "plain" || !b.text.replace(/\\[Nnh]/g, " ").trim();

const TR_TIP: Tip = {
  w: "แปลซับทีละท่อน ข้อความเดิมอยู่ข้างบน พิมพ์คำแปลข้างล่างแล้วกด Enter คำแปลแทนข้อความเดิมของท่อนนั้นแล้วไปท่อนถัดไป แท็กสี ตำแหน่ง ตัวเอียงในบรรทัดอยู่ที่เดิม ไม่ต้องพิมพ์แท็กเอง",
  o: [
    ["Enter", "ยืนยันคำแปลแล้วไปท่อนถัดไป หมดบรรทัดไปบรรทัดถัดไป", "", ""],
    ["Shift+Enter", "ขึ้นบรรทัดใหม่ในคำแปล", "", ""],
    ["F8", "ยืนยันคำแปลแต่อยู่ท่อนเดิม ดูผลในตาราง", "", ""],
    ["PageUp PageDown", "ไปท่อนก่อนหน้า ท่อนถัดไป โดยไม่เปลี่ยนข้อความ", "", ""],
    ["Insert", "แทรกข้อความเดิมของท่อนลงช่องคำแปล แล้วแก้ทับ", "", ""],
    ["End", "ฟังเสียงของบรรทัด ตอนช่องคำแปลยังว่าง (มีข้อความแล้ว End เลื่อนเคอร์เซอร์ไปท้ายบรรทัดตามปกติ)", "", ""],
  ],
};

export function TranslateDialog(p: { open: boolean; onClose: () => void; doc: SubDoc; onPlay: () => void; onSeek: (ms: number) => void; onDone: (msg: string) => void }) {
  const [blk, setBlk] = useState(0);
  const [tr, setTr] = useState("");
  const [seek, setSeek] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const ta = useRef<HTMLTextAreaElement>(null);
  const ass = isAss(p.doc);
  const st = getSubEdit();
  const ev = p.doc.events.find((e) => e.id === st.active) ?? null;
  const row = ev ? p.doc.events.indexOf(ev) : -1;
  const blocks = useMemo(() => (ev ? blocksOf(ev.text, ass) : []), [ev, ass]);
  const focus = () => requestAnimationFrame(() => ta.current?.focus());
  /** หาท่อนที่แปลได้ จากบรรทัด row ท่อน b ไปทาง dir · คืน null ถ้าหมด */
  const find = (r: number, b: number, dir: 1 | -1): { r: number; b: number } | null => {
    const ev2 = p.doc.events;
    for (let i = r; i >= 0 && i < ev2.length; i += dir) {
      const bs = blocksOf(ev2[i].text, ass);
      let k = i === r ? b : dir > 0 ? 0 : bs.length - 1;
      for (; k >= 0 && k < bs.length; k += dir) if (!bad(bs[k])) return { r: i, b: k };
    }
    return null;
  };
  const go = (to: { r: number; b: number } | null) => {
    if (!to) return false;
    const e = getSubEdit().doc?.events[to.r];
    if (!e) return false;
    if (e.id !== getSubEdit().active) { select([e.id], e.id); if (seek) p.onSeek(e.start); }
    setBlk(to.b); setTr(""); setMsg(null); focus();
    return true;
  };
  useEffect(() => {
    if (!p.open) return;
    const r = Math.max(0, row);
    if (!go(find(r, 0, 1))) { setMsg("ไม่มีข้อความให้แปลตั้งแต่บรรทัดนี้ลงไป"); }
    else if (seek && ev) p.onSeek(ev.start);
  }, [p.open]); // eslint-disable-line react-hooks/exhaustive-deps
  const commit = (next: boolean) => {
    if (!ev || bad(blocks[blk] ?? { kind: "tag", text: "" })) return;
    const value = ass ? tr.replace(/\r\n|\r|\n/g, "\\N") : fromBox(tr, p.doc);
    const text = blocks.map((b, i) => (i === blk ? value : b.text)).join("");
    if (text !== ev.text) edit("ตัวช่วยแปล", (d) => ({ ...d, events: d.events.map((e) => (e.id === ev.id ? { ...e, text } : e)) }));
    if (!next) { setTr(""); focus(); return; }
    if (!go(find(row, blk + 1, 1))) { p.onDone("ไม่มีบรรทัดให้แปลแล้ว"); p.onClose(); }
  };
  const key = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.altKey) { e.preventDefault(); commit(true); }
    else if (e.key === "F8") { e.preventDefault(); commit(false); }
    else if (e.key === "PageDown") { e.preventDefault(); if (!go(find(row, blk + 1, 1))) setMsg("เป็นท่อนสุดท้ายแล้ว"); }
    else if (e.key === "PageUp") { e.preventDefault(); if (!go(find(row, blk - 1, -1))) setMsg("เป็นท่อนแรกแล้ว"); }
    else if (e.key === "Insert") { e.preventDefault(); insertOrig(); }
    else if (e.key === "End" && e.ctrlKey === false && !tr) { e.preventDefault(); p.onPlay(); }
  };
  const insertOrig = () => {
    const b = blocks[blk];
    if (!b) return;
    const t = ta.current, s = ass ? b.text.replace(/\\N/g, "\n") : b.text;
    if (!t) { setTr(tr + s); return; }
    const a = t.selectionStart, z = t.selectionEnd;
    setTr(tr.slice(0, a) + s + tr.slice(z));
    requestAnimationFrame(() => { t.focus(); t.setSelectionRange(a + s.length, a + s.length); });
  };
  return (
    <Dialog open={p.open} onClose={p.onClose} kind="work" title="ตัวช่วยแปล" width={680}
      actions={<>
        <span className="se-dsw2"><Switch on={seek} onChange={setSeek} label="พาภาพไปที่บรรทัด" />พาภาพไปที่บรรทัด</span>
        <span style={{ flex: 1 }} />
        <button type="button" className="btn btn-ghost" onClick={p.onClose}>ปิด</button>
        <button type="button" className="btn btn-main" onClick={() => commit(true)} title="Enter" data-tr-commit>ใส่คำแปลแล้วไปต่อ</button>
      </>}>
      <div className="se-dummy se-cdlg se-trans" data-translate>
        <div className="se-drow"><span className="se-dlbl">ข้อความเดิม<InfoTip title="ตัวช่วยแปล" tip={TR_TIP} /></span>
          <span className="small" data-tr-line>{ev ? `บรรทัด ${n0(row + 1)} จาก ${n0(p.doc.events.length)}` : "ยังไม่ได้เลือกบรรทัด"}</span>
          {/* ข้อความผลอยู่แถวเดียวกับเลขบรรทัด หน้าต่างไม่สูงขึ้นตอนมีข้อความ */}
          {msg && <span className="small se-dlgmsg" role="status" data-dlgmsg>{msg}</span>}
        </div>
        <div className="se-trorig" data-tr-orig>
          {blocks.map((b, i) => <span key={i} className={b.kind !== "plain" ? "se-trtag" : i === blk ? "se-trcur" : undefined}>{ass && b.kind === "plain" ? b.text.split("\\N").flatMap((x, j) => (j ? [<br key={j} />, x] : [x])) : b.text}</span>)}
        </div>
        <div className="se-drow"><span className="se-dlbl">คำแปล</span><span className="small">Enter ยืนยันแล้วไปท่อนถัดไป Shift+Enter ขึ้นบรรทัดใหม่</span></div>
        <textarea ref={ta} className="se-text se-trbox" rows={3} value={tr} onChange={(e) => setTr(e.target.value)} onKeyDown={key} spellCheck={false} aria-label="คำแปลของท่อนที่เน้นสี" data-tr-box />
        <div className="se-drow se-trbtns">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => { if (!go(find(row, blk - 1, -1))) setMsg("เป็นท่อนแรกแล้ว"); }} title="PageUp" data-tr-prev>ท่อนก่อนหน้า</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => { if (!go(find(row, blk + 1, 1))) setMsg("เป็นท่อนสุดท้ายแล้ว"); }} title="PageDown" data-tr-next>ข้ามท่อนนี้</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={insertOrig} title="Insert" data-tr-insert>แทรกข้อความเดิม</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => { p.onPlay(); focus(); }} title="End" data-tr-play>ฟังเสียง</button>
          <span style={{ flex: 1 }} />
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => commit(false)} title="F8" data-tr-preview>ใส่คำแปลอยู่ท่อนเดิม</button>
        </div>
      </div>
    </Dialog>
  );
}
