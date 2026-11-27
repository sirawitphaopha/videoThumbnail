/* หน้าเสียงและซับ ส่วนประกอบ · คำอธิบายแถวแยกแบบ gMKVExtractGUI ตัวช่วยข้อความแถวแทร็ก ไอคอนชนิด ช่องดีเลย์ ช่องปก การ์ดงานที่ทำอยู่ การ์ดเสร็จ หน้าต่างหยุด
   แยกจาก AvPage.tsx ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 · แผนแบ่งไฟล์ขั้น 2.2) ย้ายมาทั้งก้อน เนื้อโค้ดไม่เปลี่ยน
   ตัวหน้า AvPage เป็นฟังก์ชันเดียวยาวราว 970 บรรทัด คงทั้งก้อนตามข้อยกเว้นในแผน */
import { useState } from "react";
import Dialog from "../../components/Dialog";
import type { Tip } from "../../lib/codecAdv";
import { CardIcon, Phr } from "../../components/ui";
import { mergeApi, thumbUrl, type CoverTarget, type MergeResult } from "../../lib/api";
import { fmtDuration, fmtSize } from "../../lib/format";
import { BITMAP_SUBS, ftName } from "../../lib/ftypes";
import { getAv, type AvTrack, type CoverSlot } from "../../lib/avJob";
import { IcPoster, IbCrop, IcClose } from "../../components/icons";
import { IbNext, IbStop, IcRefresh, IcShelf, IcGraph } from "../../components/icons";

/* คำอธิบายแถวแยกแบบ gMKVExtractGUI (BUGS ข้อ 130) */
export const TAGS_TIP: Tip = { w: "แท็กคือข้อมูลที่ฝังไว้ในไฟล์ MKV เช่นชื่อเรื่อง ปี ผู้กำกับ หรือข้อมูลของแต่ละแทร็ก\nโดยไฟล์ XML ที่ได้เปิดดูด้วยโปรแกรมแก้ข้อความได้ และใส่กลับเข้าหนังด้วย MKVToolNix ได้" };
export const OGM_TIP: Tip = { w: "Chapter แบบ OGM เป็นข้อความธรรมดาบรรทัดละสองแถว คือ CHAPTER01=เวลา กับ CHAPTER01NAME=ชื่อ\nซึ่งโปรแกรมรุ่นเก่าและโปรแกรมทำแผ่นอ่านได้ ส่วนแบบ XML เก็บภาษาและ Chapter ซ้อนกันได้ครบกว่า" };
export const CUE_TIP: Tip = { w: "CUE sheet เป็นรายการเพลงตาม Chapter ใช้กับไฟล์เพลงทั้งอัลบั้มที่เป็นไฟล์เดียว\nโดยไฟล์ที่รวมมาจาก CUE sheet เดิมได้เวลาครบ ส่วนไฟล์อื่นอาจได้แค่รายชื่อเพลงไม่มีเวลา" };
export const TS_TIP: Tip = { w: "ไฟล์ข้อความบอกเวลาของทุกเฟรมในแทร็ก หน่วยมิลลิวินาที แบบ timestamps v2\nใช้ตอนรวมไฟล์ใหม่ให้เวลาตรงเดิม เช่นหนังที่อัตราเฟรมไม่คงที่ หรือใช้หา keyframe" };

export const extOf = (p: string) => (p.match(/\.([^.\\/]+)$/)?.[1] ?? "").toLowerCase();
export const baseName = (p: string) => p.split(/[\\/]/).pop() ?? p;
export const dirName = (p: string) => p.replace(/[\\/][^\\/]*$/, "");
export const KIND_WORD = { video: "ภาพ", audio: "เสียง", subtitle: "ซับ" } as const;
/** ความหมายของแทร็กหลัก ใช้ทั้งหัวคอลัมน์หลักในตารางและส่วนตั้งค่าแทร็ก (BUGS ข้อ 66 · ข้อ 91 พี่กันถาม 13 พ.ย. 2569 "หลักที่เราเข้าใจ คือติ๊กเเล้วตอนเปิดหนัง เสียงนี้มันจะเล่นพร้อมภาพไหม" · "ไม่ก็ใส่เครื่องหมายอธิบาย") */
export const MAIN_TIP = "แทร็กหลักคือเสียงหรือซับที่โปรแกรมเล่นเปิดให้เองเมื่อเปิดหนัง เช่นตั้งเสียงไทยเป็นหลัก เปิดหนังแล้วได้ยินเสียงไทยพร้อมภาพทันที  เสียงมีหลักได้อันเดียว ซับก็มีหลักได้อันเดียว ส่วนแทร็กอื่นยังอยู่ในไฟล์ครบ กดสลับในโปรแกรมเล่นได้ตามเดิม\nโปรแกรมเล่นบางตัวตั้งให้เลือกตามภาษาที่ชอบก่อน เช่นตั้ง MPC-HC ให้เลือกเสียงไทยก่อน แบบนั้นค่าในโปรแกรมเล่นจะชนะแทร็กหลัก";
export const BUSY = "รอให้งานที่ทำอยู่เสร็จก่อน";
export const MAX_DELAY = 600_000;

/** ช่องเสียงแบบที่คนเล่นเสียงเรียก 5.1 · 2.0 · 1.0 */
function chWord(t: AvTrack): string {
  const l = (t.layout ?? "").toLowerCase();
  if (l.startsWith("7.1")) return "7.1 ch";
  if (l.startsWith("5.1")) return "5.1 ch";
  if (l === "stereo" || t.channels === 2) return "2.0 ch";
  if (l === "mono" || t.channels === 1) return "1.0 ch";
  return t.channels ? `${t.channels} ช่อง` : "";
}
function kbps(b: number | null) { return b ? `${Math.round(b / 1000).toLocaleString("en-US")} kbps` : ""; }

/** ชื่อแถวกับบรรทัดรอง (มอคอัป TRACKS) */
export function rowText(t: AvTrack, nth: number): { title: string; parts: string[] } {
  const ft = ftName(t.kind, t.codec, t.profile);
  if (t.kind === "video") {
    return { title: `ภาพ${t.width && t.height ? ` ${t.width} × ${t.height}` : ""}`, parts: [t.fps ? `${t.fps.toFixed(3).replace(/\.?0+$/, "")} ภาพต่อวินาที` : "", t.duration ? fmtDuration(t.duration) : ""] };
  }
  const where = t.inMovie ? "" : dirName(t.src);
  if (t.kind === "audio") {
    return {
      title: t.inMovie ? `เสียงที่ ${nth}${chWord(t) ? " แบบ " + chWord(t) : ""}` : baseName(t.src),
      parts: [where, t.inMovie || !chWord(t) ? "" : "เสียง " + chWord(t), kbps(t.bitrate), t.bytes ? fmtSize(t.bytes) : ""],
    };
  }
  const image = BITMAP_SUBS.includes(ft); // ซับรูปทุกชนิด รวม DVB XSUB HD DVD (AUDIT ข้อ 94)
  // ซับรูปนับเป็นแพ็กเก็ต (รวมแพ็กเก็ตล้างจอ) ไม่ใช่จำนวนภาพ · เดิมเขียนว่าภาพ ไม่ตรงกับตัวดูซับเกือบสองเท่า (ผู้ช่วยตรวจขั้น 10 ข้อ 19)
  const count = t.frames ? `${t.frames.toLocaleString("en-US")} ${image ? "แพ็กเก็ต" : "บรรทัด"}` : "";
  return {
    title: t.inMovie ? `ซับที่ ${nth}` : baseName(t.src),
    parts: [where, image ? ({ PGS: "ซับบลูเรย์แบบรูป", VobSub: "ซับดีวีดีแบบรูป", DVB: "ซับทีวีดิจิทัลแบบรูป", XSUB: "ซับ DivX แบบรูป", "HD DVD": "ซับ HD DVD แบบรูป" } as Record<string, string>)[ft] ?? "ซับแบบรูป" : ft === "ASS" ? "ตัวหนังสือมีรูปแบบ" : "ตัวหนังสือ", count],
  };
}

/** บรรทัดรอง · ตัดบรรทัดได้เฉพาะตรงจุดคั่น จุดคั่นติดท้ายช่วงก่อนหน้า (มอคอัป dtLine) */
export function DtLine({ parts }: { parts: React.ReactNode[] }) {
  const p = parts.filter((x) => x !== "" && x != null);
  const pill = (x: React.ReactNode) => typeof x === "object" && x !== null && "props" in x && String((x.props as { className?: string }).className ?? "").includes("tpill");
  return <>{p.map((s, i) => <span key={i}><span className="nw">{s}{i < p.length - 1 && !pill(s) ? "," : ""}</span>{i < p.length - 1 ? " " : ""}</span>)}</>;
}

export function KindIcon({ k }: { k: AvTrack["kind"] }) {
  return (
    <span className={"kind " + (k === "video" ? "v" : k === "audio" ? "a" : "s")} aria-hidden="true">
      {k === "video" && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M10 9l5 3-5 3z" /></svg>}
      {k === "audio" && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M4 10v4M8 7v10M12 4v16M16 8v8M20 10v4" /></svg>}
      {k === "subtitle" && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M7 14h4M13 14h4M7 10h10" /></svg>}
    </span>
  );
}
/** ช่องดีเลย์ ปุ่ม − + ทีละ 100 ms กด Shift ค้างทีละ 10 ms · พิมพ์ได้ทั้ง −120 และ -120 */
export function DelayBox(p: { value: number; onChange: (v: number) => void; label: string; wide?: boolean; off?: string }) {
  const [text, setText] = useState<string | null>(null);
  const show = text ?? `${p.value > 0 ? "+" : ""}${p.value.toLocaleString("en-US")}`;
  const commit = () => {
    if (text == null) return;
    const n = Number(text.replace(/[,\s+]/g, "").replace(/[−–]/g, "-"));
    if (Number.isFinite(n)) p.onChange(n);
    setText(null);
  };
  return (
    <div className="delay" onClick={(e) => e.stopPropagation()}>
      <button type="button" aria-label={`ลดดีเลย์ของ ${p.label}`} aria-disabled={!!p.off || undefined} title={p.off ?? "ลด 100 ms หรือกด Shift ค้างเพื่อลด 10 ms"} onClick={(e) => { if (!p.off) p.onChange(p.value - (e.shiftKey ? 10 : 100)); }}>−</button>
      <input className="avnum" style={p.wide ? { width: 92 } : undefined} value={show} readOnly={!!p.off} aria-label={`ดีเลย์ของ ${p.label} มิลลิวินาที`} inputMode="numeric"
        onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") { commit(); (e.target as HTMLInputElement).blur(); } if (e.key === "Escape") setText(null); }} />
      <button type="button" aria-label={`เพิ่มดีเลย์ของ ${p.label}`} aria-disabled={!!p.off || undefined} title={p.off ?? "เพิ่ม 100 ms หรือกด Shift ค้างเพื่อเพิ่ม 10 ms"} onClick={(e) => { if (!p.off) p.onChange(p.value + (e.shiftKey ? 10 : 100)); }}>+</button>
    </div>
  );
}

export function CoverSlotBox(p: { slot: CoverTarget; s: CoverSlot; over: boolean; err: string | null; busy?: string; onPick: () => void; onRecrop: () => void; onRemove: () => void; onUndo: () => void }) {
  const tall = p.slot === "cover";
  const label = tall ? "ปกตั้ง" : "ปกนอน";
  const { s } = p;
  const neu = s.mode === "new" ? s.neu : null;
  const img = neu ? neu.choice.render.preview : s.old?.preview?.preview ?? null;
  const name = neu ? `${p.slot}.${neu.choice.format}` : s.old?.att.name ?? `${p.slot}.jpg`;
  const pill = neu ? <span className="tpill new">เพิ่มใหม่</span> : s.old ? (s.mode === "remove" ? <span className="tpill off">เอาออก</span> : <span className="tpill in">ในไฟล์</span>) : null;
  const dt = neu ? `จาก ${neu.info.name} ขนาด ${neu.choice.render.width} × ${neu.choice.render.height} ${fmtSize(neu.choice.render.bytes)}`
    : s.old ? `${s.old.preview ? `${s.old.preview.width} × ${s.old.preview.height} ` : ""}${fmtSize(s.old.att.size)} ${s.mode === "remove" ? "ไม่ใส่ในไฟล์ใหม่" : "ใช้รูปเดิม ครอปได้เมื่อเปลี่ยนเป็นรูปใหม่"}`
    : `ยังไม่มี${label} ลากรูป${tall ? "แนวตั้ง" : "แนวนอน"}มาวาง`;
  /** off = กดไม่ได้พร้อมเหตุผลบนปุ่ม (ปุ่มจาง) */
  const btn = (text: React.ReactNode, fn: () => void, extra?: string, off?: string) => {
    const why = p.busy ?? off;
    return <button type="button" className={"btn btn-sm " + (why ? "btn-wait" : "btn-ghost")} aria-disabled={why ? true : undefined} title={why} onClick={() => { if (!why) fn(); }} data-slot-btn={extra ?? text}>{text}</button>;
  };
  /* สามปุ่มชุดเดียวกับการ์ดรูปของหน้าใส่โปสเตอร์ เปลี่ยนรูป ครอป/แปลงรูป เอาออก มีไอคอน (BUGS ข้อ 59 · ข้อ 59 ต่อ ใช้คำว่า รูป คำเดียว) · ปกเดิมในไฟล์ยังครอปไม่ได้ ปุ่มครอปจาง เหตุผลอยู่บรรทัดรายละเอียดเหนือปุ่ม (สกิล button-feedback เหตุผลต้องติดปุ่ม) */
  const three = (canCrop: boolean) => <>{btn(<><IcPoster size={15} />เปลี่ยนรูป</>, p.onPick, "เปลี่ยนรูป")}{btn(<><IbCrop size={15} />ครอป/แปลงรูป</>, p.onRecrop, "ครอป/แปลงรูป", canCrop ? undefined : "ครอปได้หลังเลือกรูปใหม่ ปกเดิมในไฟล์ใช้ตามเดิม")}{btn(<><IcClose size={15} />เอารูปออก</>, p.onRemove, "เอารูปออก")}</>;
  return (
    <div className={"pslot" + (p.over ? " over" : p.err ? " bad" : "")} data-drop={p.slot} data-slot={p.slot}>
      {img && s.mode !== "remove" ? <img className={"pth " + (tall ? "tall" : "wide")} src={thumbUrl(img) ?? undefined} alt={label} /> : <div className={"pth none " + (tall ? "tall" : "wide")} />}
      <div style={{ minWidth: 0 }}>
        <div className="nm">{label} {name} {pill}</div>
        <div className="dt">{p.err ? <span style={{ color: "var(--bad-ink)" }}>{p.err}</span> : p.over ? <b style={{ color: "var(--accent-ink)" }}>ปล่อยเมาส์เพื่อใส่รูปนี้</b> : dt}</div>
        <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
          {neu ? three(true)
            : s.old && s.mode === "remove" ? btn("เอากลับ", p.onUndo)
            : s.old ? three(false)
            : btn(<><IcPoster size={15} />เลือกรูปจากเครื่อง</>, p.onPick)}
        </div>
      </div>
    </div>
  );
}

function fmtEta(s: number) { return s < 60 ? `${Math.max(1, Math.round(s))} วินาที` : `${Math.floor(s / 60)} นาที ${Math.round(s % 60)} วินาที`; }

export function RunCard(p: { run: ReturnType<typeof getAv>["run"]; pct: number; runMovie: string | null; onStop: () => void; onShelf: () => void; onGraph: (path: string) => void; onRetry: () => void }) {
  const { run } = p;
  if (run.state === "working") {
    return (
      <>
        <div style={{ fontSize: 14 }}>{run.progress?.phase ?? "กำลังเริ่ม…"}</div>
        <div className="bar" role="progressbar" aria-valuenow={p.pct} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${p.pct}%` }} /></div>
        <div className="small">{p.pct}%{run.progress?.eta != null && run.progress.eta > 0 ? <> เหลือราว <span className="nw">{fmtEta(run.progress.eta)}</span></> : null}
          {run.progress?.next ? <><br />ขั้นถัดไป {run.progress.next}</> : null}</div>
        {/* เลยจุดที่หยุดได้แล้ว ไม่มีปุ่มหยุด บอกเหตุผล (AUDIT ข้อ 14) · ความสูงสองบรรทัดเท่าเดิม ช่องไม่ยืดหด */}
        {run.progress?.final
          ? <><button type="button" className="btn btn-wait btn-sm" style={{ alignSelf: "flex-start" }} aria-disabled="true" title="ไฟล์ใหม่เข้าที่แล้ว จึงหยุดไม่ได้" data-stop-final><IbStop size={15} />หยุดไม่ได้</button>
            <div className="small"><Phr>ไฟล์ใหม่เข้าที่แล้ว กำลังจดข้อมูลให้เสร็จ จึงหยุดตอนนี้ไม่ได้</Phr></div></>
          : <><button type="button" className="btn btn-bad btn-sm" style={{ alignSelf: "flex-start" }} onClick={p.onStop}><IbStop size={15} />หยุด</button>
            <div className="small"><Phr>กดหยุด ไฟล์ที่ทำค้างถูกลบ ไฟล์เดิมไม่ถูกแตะ</Phr></div></>}
      </>
    );
  }
  if (run.state === "done") return <DoneCard r={run.result} onShelf={p.onShelf} onGraph={p.onGraph} />;
  if (run.state === "failed") {
    return (
      <>
        <div className={"stat " + (run.problem.kind === "cancelled" ? "warn" : "bad")} role="alert"><CardIcon kind={run.problem.kind === "cancelled" ? "warn" : "bad"} />
          <div><b>{run.problem.title}</b>{run.problem.detail.map((d, i) => <div key={i}><Phr>{d}</Phr></div>)}</div></div>
        <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: "flex-start" }} onClick={p.onRetry}><IcRefresh size={15} />ลองใหม่</button>
      </>
    );
  }
  return null;
}

function DoneCard({ r, onShelf, onGraph }: { r: MergeResult; onShelf: () => void; onGraph: (path: string) => void }) {
  const c = r.counts;
  const where = r.original === "kept" && r.originalTo ? r.originalTo.replace(/[\\/][^\\/]+$/, "") : null;
  return (
    <>
      <div className="stat ok" role="status"><CardIcon kind="done" /><div><b>{r.verified ? "รวมเสร็จ ไฟล์ใหม่ตรวจผ่าน" : "รวมเสร็จ"}</b>ภาพ {c.video} เสียง {c.audio} ซับ {c.subs} {r.verified ? "ครบตามที่ตั้ง และความยาวเท่าเดิม" : "ไม่ได้ตรวจไฟล์ใหม่"}
        <br /><span style={{ overflowWrap: "anywhere" }}>{r.output}</span></div></div>
      {where && <div className="small">ไฟล์เดิมย้ายไปที่ {where}</div>}
      {r.original === "trash" && <div className="small">ไฟล์เดิมอยู่ในถังขยะของ Windows กู้คืนได้จนกว่าจะล้างถังขยะ</div>}
      {r.notes.map((n, i) => <div key={i} className="small"><Phr>{n}</Phr></div>)}
      <div style={{ display: "flex", gap: 6 }}>
        <button type="button" className="btn btn-ok btn-sm" onClick={onShelf}><IcShelf size={15} />ไปดูบนชั้นวาง</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onGraph(r.output)}><IcGraph size={15} />ดูกราฟเสียง</button>
      </div>
    </>
  );
}

export function StopDialog(p: { open: boolean; pct: number; name: string | null; onClose: () => void }) {
  return (
    <Dialog open={p.open} onClose={p.onClose} title="ยืนยันหยุดรวมไฟล์"
      actions={<><button type="button" className="btn btn-ghost btn-sm" onClick={p.onClose}><IbNext size={15} />ทำต่อ</button><button type="button" className="btn btn-bad btn-sm" onClick={() => { p.onClose(); mergeApi.cancel(); }} data-stop-ok><IbStop size={15} />หยุด</button></>}>
      <div style={{ fontSize: 14, lineHeight: 1.6 }}><Phr>{`ไฟล์ใหม่ที่ทำไปได้ ${p.pct}% จะถูกลบทิ้ง`}</Phr> <Phr>{`ไฟล์เดิม ${p.name ? baseName(p.name) : ""} ไม่ถูกแตะ`}</Phr></div>
    </Dialog>
  );
}