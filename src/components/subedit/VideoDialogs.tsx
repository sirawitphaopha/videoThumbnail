/* หน้าต่างของกรอบวิดีโอในหน้าแก้ซับ (แผนหน้าแก้ซับ ขั้น 4 · BUGS ข้อ 109 เมนูวิดีโอที่พี่กันเอา)
   ข้ามไปยัง (Ctrl+G แบบ dialog_jumpto.cpp) · รายละเอียดวิดีโอ (dialog_video_details.cpp) · วิดีโอจำลอง (dialog_dummy_video.cpp) */
import { useEffect, useState } from "react";
import type { Tip } from "../../lib/codecAdv";
import { fmtTime } from "../../lib/subText";
import { DUMMY_DEFAULT, DUMMY_SIZES, dummyRate, fmtMs, type DummySpec, type Framerate } from "../../lib/vidFrames";
import type { VidTable } from "../../lib/api";
import Dialog from "../Dialog";
import Dropdown from "../Dropdown";
import InfoTip from "../InfoTip";
import { Switch } from "../ui";

export const KEY_TIP: Tip = {
  w: "keyframe คือเฟรมที่ตัวเข้ารหัสวิดีโอเก็บภาพเต็มทั้งภาพ เฟรมอื่นเก็บแค่ส่วนที่เปลี่ยนจากเฟรมก่อน ตัวเข้ารหัสมักวาง keyframe ตรงจุดเปลี่ยนฉาก คนทำซับจึงใช้ตั้งให้ซับขึ้นหรือหายตรงฉากตัดพอดี",
  o: [
    ["keyframe ของหนัง", "อ่านจากไฟล์หนังเอง ได้ทันทีตอนเปิด", "เร็ว ไม่ต้องถอดภาพ", "บางจุดไม่ใช่ฉากตัด เพราะตัวเข้ารหัสวางเพิ่มเป็นระยะ"],
    ["จุดเปลี่ยนฉาก", "โปรแกรมถอดภาพทั้งเรื่องแล้วหาเฟรมที่ภาพเปลี่ยนไปมาก", "ตรงฉากตัดจริง", "หนังยาวใช้เวลาหลายนาที"],
    ["ไฟล์ keyframe", "เปิดไฟล์ที่ทำไว้จากโปรแกรมอื่น เช่น Aegisub, x264 หรือ WWXD", "ใช้ผลเดียวกับที่ทีมใช้", "ต้องมีไฟล์ของหนังเรื่องนี้พอดี"],
  ],
  r: "ใช้ keyframe ของหนังก่อน ถ้าเส้นไม่ตรงฉากตัดค่อยกดหาจุดเปลี่ยนฉาก",
};

/* ---------------------------------------------------------------- ข้ามไปยัง */

export function JumpDialog(p: { open: boolean; fr: Framerate | null; pos: number; onClose: () => void; onJump: (frame: number) => void }) {
  const [frame, setFrame] = useState("");
  const [time, setTime] = useState("");
  useEffect(() => {
    if (!p.open || !p.fr) return;
    setFrame(String(p.pos));
    setTime(fmtMs(p.fr.timeAt(p.pos)));
  }, [p.open]); // eslint-disable-line react-hooks/exhaustive-deps
  const fr = p.fr;
  const parseT = (s: string) => {
    const m = /^(?:(\d+):)?(\d{1,2}):(\d{1,2})(?:\.(\d{1,3}))?$/.exec(s.trim());
    if (!m) return null;
    return ((+(m[1] ?? 0) * 60 + +m[2]) * 60 + +m[3]) * 1000 + +(m[4] ?? "0").padEnd(3, "0");
  };
  const fNum = /^\d+$/.test(frame.trim()) ? parseInt(frame, 10) : null;
  const ok = fr && fNum != null ? fNum : null;
  const go = () => { if (ok != null) { p.onJump(ok); p.onClose(); } };
  return (
    <Dialog open={p.open} onClose={p.onClose} kind="menu" title="ข้ามไปยังเฟรมหรือเวลา" width={420}
      actions={<>
        <button type="button" className="btn btn-ghost" onClick={p.onClose}>ยกเลิก</button>
        <button type="button" className={"btn " + (ok != null ? "btn-main" : "btn-wait")} aria-disabled={ok == null || undefined} title={ok == null ? "พิมพ์เลขเฟรมหรือเวลาก่อน" : undefined} onClick={go} data-vjump-go>ข้ามไป</button>
      </>}>
      <div className="se-dlgform" onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); go(); } }}>
        <label className="se-f">เฟรม
          <input className="inp se-time" value={frame} inputMode="numeric" data-vjump-frame
            onChange={(e) => { const v = e.target.value; setFrame(v); if (fr && /^\d+$/.test(v.trim())) setTime(fmtMs(fr.timeAt(parseInt(v, 10)))); }} />
        </label>
        <label className="se-f">เวลา
          <input className="inp se-time" value={time} inputMode="decimal" data-vjump-time
            onChange={(e) => { const v = e.target.value; setTime(v); const t = parseT(v); if (fr && t != null) setFrame(String(fr.frameAt(t))); }} />
        </label>
      </div>
      <div className="small se-dlgtext" style={{ marginTop: 10 }}>พิมพ์ช่องไหนก็ได้ อีกช่องเปลี่ยนตาม แล้วกด Enter</div>
    </Dialog>
  );
}

/* ---------------------------------------------------------------- รายละเอียดวิดีโอ */

const CODEC_TIP: Tip = {
  w: "วิธีบีบอัดภาพของไฟล์ เช่น h264 hevc av1 หรือ mpeg2video บอกว่าโปรแกรมเล่นต้องถอดภาพแบบไหน ไม่มีผลกับการตั้งเวลาซับ",
};

/** 24000/1001 เป็น 23.976 · ทศนิยมสามตำแหน่งแบบ Aegisub */
const rateText = (r: string) => { const m = /^(\d+)\/(\d+)$/.exec(r); return m && +m[2] ? (+m[1] / +m[2]).toFixed(3) : r; };

export function DetailsDialog(p: { open: boolean; onClose: () => void; name: string; table: VidTable | null; dummy: DummySpec | null; fr: Framerate | null; keys: number }) {
  const t = p.table, d = p.dummy, fr = p.fr;
  const count = fr?.count ?? 0;
  const rows: [string, string][] = d ? [
    ["ไฟล์", "วิดีโอจำลอง ไม่มีไฟล์จริง"],
    ["ขนาดภาพ", `${d.w} × ${d.h}`],
    ["อัตราเฟรม", `${fr ? fr.value.toFixed(3) : d.fps} fps`],
    ["ความยาว", `${d.frames.toLocaleString("en-US")} เฟรม ${fr ? fmtMs(fr.timeAt(d.frames)) : ""}`],
    ["สีพื้น", `${d.r}, ${d.g}, ${d.b}${d.pattern ? " แบบตารางหมากรุก" : ""}`],
  ] : t ? [
    ["ไฟล์", p.name],
    ["ขนาดภาพ", `${t.w} × ${t.h}${t.dar && t.dar !== "0:1" ? ` อัตราส่วนภาพ ${t.dar}` : ""}`],
    ["อัตราเฟรม", `${fr ? fr.value.toFixed(3) : "—"} fps${t.rate && rateText(t.rate) !== fr?.value.toFixed(3) ? ` ไฟล์บอกว่า ${rateText(t.rate)} fps` : ""}`],
    ["ความยาว", `${count.toLocaleString("en-US")} เฟรม ${fr ? fmtMs(fr.timeAt(count)) : ""}`],
    ["keyframe", `${p.keys.toLocaleString("en-US")} จุด`],
    ["Codec", t.codec || "—"],
  ] : [];
  return (
    <Dialog open={p.open} onClose={p.onClose} kind="menu" title="รายละเอียดวิดีโอ" width={500}
      actions={<button type="button" className="btn btn-main" onClick={p.onClose}>ปิด</button>}>
      <dl className="se-details" data-vdetails>
        {rows.map(([k, v]) => <div key={k}><dt>{k}{k === "keyframe" && <InfoTip title="keyframe" tip={KEY_TIP} />}{k === "Codec" && <InfoTip title="Codec" tip={CODEC_TIP} />}</dt><dd>{v}</dd></div>)}
      </dl>
      {t?.partial && <div className="small" style={{ marginTop: 8 }}>อ่านไฟล์ไม่ถึงท้ายเรื่อง ไฟล์อาจเสียตอนท้าย จำนวนเฟรมจึงน้อยกว่าความยาวจริง</div>}
    </Dialog>
  );
}

/* ---------------------------------------------------------------- วิดีโอจำลอง */

const DUMMY_TIP: Tip = {
  w: "ภาพสีพื้นที่โปรแกรมวาดเอง ใช้ตั้งเวลาซับกับเสียงเมื่อไม่มีไฟล์วิดีโอ หรือไฟล์วิดีโอใหญ่จนเปิดช้า ซับ ASS จำค่านี้ไว้ในไฟล์แบบที่ Aegisub จำ เปิดครั้งหน้าได้วิดีโอจำลองเดิม",
  o: [
    ["ขนาดภาพ", "กว้างคูณสูงเป็นจุด ควรตรงกับขนาดภาพของซับ", "ตำแหน่งซับบนภาพตรงกับหนังจริง", "ไม่มีผลกับเวลา"],
    ["อัตราเฟรม", "จำนวนภาพต่อวินาที พิมพ์ทศนิยม เช่น 23.976 หรือเศษส่วน เช่น 24000/1001", "เลขเฟรมตรงกับหนังจริง", "ใส่ผิดแล้วเลขเฟรมเพี้ยน"],
    ["ความยาว", "จำนวนเฟรมทั้งหมด โปรแกรมบอกเป็นเวลาให้ด้านล่าง", "ยาวพอให้ครอบซับทุกบรรทัด", "สั้นไปแล้วเลื่อนไปท้ายเรื่องไม่ได้"],
  ],
  r: "ใส่อัตราเฟรมกับขนาดเท่าหนังที่จะใช้ซับนี้",
};
const LS_DUMMY = "se-dummy";
const lastDummy = (): DummySpec => { try { const v = JSON.parse(localStorage.getItem(LS_DUMMY) ?? "null"); return v && typeof v === "object" ? { ...DUMMY_DEFAULT, ...v } : DUMMY_DEFAULT; } catch { return DUMMY_DEFAULT; } };
const hex = (r: number, g: number, b: number) => "#" + [r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("");

export function DummyDialog(p: { open: boolean; onClose: () => void; onUse: (d: DummySpec) => void }) {
  const [d, setD] = useState<DummySpec>(DUMMY_DEFAULT);
  const [w, setW] = useState(""), [h, setH] = useState(""), [len, setLen] = useState("");
  useEffect(() => {
    if (!p.open) return;
    const v = lastDummy();
    setD(v); setW(String(v.w)); setH(String(v.h)); setLen(String(v.frames));
  }, [p.open]);
  const num = (s: string, lo: number, hi: number) => { const n = /^\d+$/.test(s.trim()) ? parseInt(s, 10) : NaN; return n >= lo && n <= hi ? n : null; };
  const W = num(w, 1, 10000), H = num(h, 1, 10000), L = num(len, 2, 36000000);
  const fr = dummyRate(d.fps);
  const why = !fr ? "อัตราเฟรมอ่านไม่ออก พิมพ์เป็นทศนิยมหรือเศษส่วน" : W == null || H == null ? "ขนาดภาพต้องเป็น 1 ถึง 10,000 จุด" : L == null ? "ความยาวต้องเป็น 2 ถึง 36,000,000 เฟรม" : null;
  const preset = DUMMY_SIZES.findIndex((s) => s.w === W && s.h === H);
  const use = () => {
    if (why || W == null || H == null || L == null) return;
    const spec = { ...d, w: W, h: H, frames: L };
    try { localStorage.setItem(LS_DUMMY, JSON.stringify(spec)); } catch { /* ไม่มีที่เก็บก็ใช้ได้รอบนี้ */ }
    p.onUse(spec);
    p.onClose();
  };
  return (
    <Dialog open={p.open} onClose={p.onClose} kind="work" title="วิดีโอจำลอง" width={560}
      actions={<>
        <button type="button" className="btn btn-ghost" onClick={p.onClose}>ยกเลิก</button>
        <button type="button" className={"btn " + (why ? "btn-wait" : "btn-main")} aria-disabled={!!why || undefined} title={why ?? undefined} onClick={use} data-vdummy-use>ใช้วิดีโอจำลอง</button>
      </>}>
      <div className="se-dummy" data-vdummy>
        <div className="se-dlgtext small">ภาพสีพื้นที่โปรแกรมวาดเอง ไว้ตั้งเวลาซับเมื่อไม่มีไฟล์วิดีโอ <InfoTip title="วิดีโอจำลอง" tip={DUMMY_TIP} /></div>
        <div className="se-drow">
          <span className="se-dlbl">ขนาดภาพ</span>
          <Dropdown label="ขนาดภาพสำเร็จรูป" value={preset >= 0 ? String(preset) : "own"} stretch
            options={[...DUMMY_SIZES.map((s, i) => ({ value: String(i), label: `${s.w} × ${s.h} ${s.label}` })), { value: "own", label: "พิมพ์เอง" }]}
            onChange={(v) => { if (v === "own") return; const s = DUMMY_SIZES[+v]; setW(String(s.w)); setH(String(s.h)); }} />
        </div>
        <div className="se-drow">
          <span className="se-dlbl" />
          <input className={"inp se-num4" + (W == null ? " err" : "")} value={w} inputMode="numeric" aria-label="กว้าง" onChange={(e) => setW(e.target.value)} data-vdummy-w />
          <span>×</span>
          <input className={"inp se-num4" + (H == null ? " err" : "")} value={h} inputMode="numeric" aria-label="สูง" onChange={(e) => setH(e.target.value)} data-vdummy-h />
          <span className="small">จุด</span>
        </div>
        <div className="se-drow">
          <span className="se-dlbl">สีพื้น</span>
          <label className="se-dswatch" title="เลือกสีพื้น">
            <span style={{ background: hex(d.r, d.g, d.b) }} />
            <input type="color" value={hex(d.r, d.g, d.b)} onChange={(e) => { const v = e.target.value; setD({ ...d, r: parseInt(v.slice(1, 3), 16), g: parseInt(v.slice(3, 5), 16), b: parseInt(v.slice(5, 7), 16) }); }} data-vdummy-color />
          </label>
          <span className="se-dsw">ตารางหมากรุก<Switch on={d.pattern} onChange={(v) => setD({ ...d, pattern: v })} label="ตารางหมากรุก" /></span>
        </div>
        <div className="se-drow">
          <span className="se-dlbl">อัตราเฟรม</span>
          <input className={"inp se-num6" + (fr ? "" : " err")} value={d.fps} onChange={(e) => setD({ ...d, fps: e.target.value.replace(/[^0-9./]/g, "") })} data-vdummy-fps />
          <span className="small">fps</span>
        </div>
        <div className="se-drow">
          <span className="se-dlbl">ความยาว</span>
          <input className={"inp se-num6" + (L == null ? " err" : "")} value={len} inputMode="numeric" onChange={(e) => setLen(e.target.value)} data-vdummy-len />
          <span className="small">เฟรม</span>
          <span className="small" data-vdummy-dur>{fr && L != null ? `ยาว ${fmtTime(fr.timeAt(L), "ass")}` : ""}</span>
        </div>
      </div>
    </Dialog>
  );
}
