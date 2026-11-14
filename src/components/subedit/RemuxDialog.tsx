/* บันทึกซับที่อยู่ในไฟล์หนัง ถามสองทาง (แผนหน้าแก้ซับ ขั้น 9 · ทางที่แคลร์เลือก ติดป้ายแคลร์ตั้ง)
   ① บันทึกเป็นไฟล์ซับข้างหนัง ไม่แตะไฟล์หนัง (หน้าต่างบันทึกเป็นไฟล์ใหม่ของขั้น 3)
   ② ใส่กลับเข้าหนัง สร้างไฟล์หนังใหม่ทั้งไฟล์ผ่านงานรวมไฟล์เดิม แทนแทร็กซับนี้ แทร็กอื่นเหมือนเดิม ไฟล์เดิมไปตามที่เลือก (ค่าตั้งต้นจากหน้าตั้งค่า)
   ระหว่างทำบอกความคืบหน้าจากเหตุการณ์ merge-progress หยุดได้ ปิดหน้าต่างไม่ได้จนจบ */
import { useEffect, useRef, useState } from "react";
import { langName } from "../../lib/langs";
import { listen } from "@tauri-apps/api/event";
import { inApp, mergeApi, subDocApi, vidApi, type PosterProgress, type SubDoc } from "../../lib/api";
import { stopVidPlay } from "../../lib/vidPlay";
import type { Tip } from "../../lib/codecAdv";
import { remuxPlan, remuxSub, type RemuxDone, type RemuxPlan } from "../../lib/subRemux";
import { useSettings } from "../../lib/settings";
import Dialog from "../Dialog";
import InfoTip from "../InfoTip";
import { Keep, Phr, Seg, Skel } from "../ui";

const nameOf = (p: string) => p.split(/[\\/]/).pop() ?? p;
/** ชื่อแบบซับที่คนรู้จัก (รหัสของ mkvmerge subrip ass ssa webvtt) */
const codecLabel = (c: string) => ({ subrip: "SRT", ass: "ASS", ssa: "SSA", webvtt: "VTT" } as Record<string, string>)[c.toLowerCase()] ?? c.toUpperCase();
const REMUX_TIP: Tip = {
  w: "ซับที่เปิดจากในไฟล์หนัง บันทึกได้สองทาง",
  o: [
    ["บันทึกเป็นไฟล์ซับข้างหนัง", "เขียนซับที่แก้เป็นไฟล์ใหม่ เช่น .ass ไว้ข้างไฟล์หนัง ไฟล์หนังไม่ถูกแตะ", "เร็ว ปลอดภัย โปรแกรมเล่นส่วนใหญ่โหลดซับข้างหนังเอง", "ซับเดิมในหนังยังเป็นของเก่า"],
    ["ใส่กลับเข้าหนัง", "สร้างไฟล์หนังใหม่ทั้งไฟล์ แทนแทร็กซับนี้ด้วยซับที่แก้ ภาษา ชื่อ ธงหลัก ลำดับแทร็กเหมือนเดิม ภาพ เสียง ซับอื่น บท ปก เหมือนเดิมไม่แปลง ตรวจไฟล์ใหม่ก่อนแทนไฟล์เดิม", "ได้ไฟล์เดียวจบ", "ใช้เวลาตามขนาดหนัง และต้องมีที่ว่างในไดรฟ์ราวขนาดหนังหนึ่งเรื่อง"],
  ],
  r: "ยังแก้ซับอยู่ บันทึกข้างหนังไปก่อน แก้เสร็จแล้วค่อยใส่กลับเข้าหนังครั้งเดียว",
};

/** หนังกับเลขแทร็กมาจากที่มาของเอกสาร (เปิดจากแทร็กไหน หรือฉบับบันทึกอัตโนมัติจำไว้) ไม่ใช่แทร็กที่หน้าเลือกอยู่
    กดเปลี่ยนแทร็กเร็ว ๆ หรือเปิดฉบับอัตโนมัติของซับอีกแทร็ก จะได้ไม่แทนแทร็กผิด (ผู้ช่วยตรวจทาน F6 F18)
    onDone ได้เอกสารที่ใส่กลับจริงด้วย ให้หน้าแก้ซับนับเฉพาะเอกสารนั้นว่าบันทึกแล้ว (F4) */
export default function RemuxDialog(p: { open: boolean; onClose: () => void; doc: SubDoc; onSaveAsFile: () => void; onDone: (r: RemuxDone, written: SubDoc, stamp: { size: number; mtime: number }) => void; onFail: (m: string) => void }) {
  const { settings } = useSettings();
  const src = p.doc.source;
  const movie = src?.inMovie ? src.path : "";
  const tid = src?.inMovie && src.tid != null ? src.tid : null;
  const noTrack = !movie ? "ซับนี้ไม่ได้มาจากในไฟล์หนัง" : tid == null ? "ฉบับนี้ไม่รู้ว่ามาจากแทร็กไหนของหนัง จึงใส่กลับเข้าหนังไม่ได้ บันทึกเป็นไฟล์ข้างหนังได้" : null;
  const [plan, setPlan] = useState<RemuxPlan | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [orig, setOrig] = useState<"keep" | "trash">("keep");
  const [run, setRun] = useState<PosterProgress | "start" | null>(null);
  // เปิดแล้วโฟกัสปุ่มบันทึกเป็นไฟล์ข้างหนัง (ทางที่ไม่แตะหนัง) ไม่ใช่ปุ่ม ⓘ · หน้าต่างโฟกัสปุ่มแรกหลังลูก จึงรอหนึ่งจังหวะ
  const fileBtn = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (!p.open) return; const tm = setTimeout(() => fileBtn.current?.focus(), 0); return () => clearTimeout(tm); }, [p.open]);
  useEffect(() => {
    if (!p.open) return;
    setPlan(null); setErr(null); setRun(null);
    setOrig((settings?.originalAfter ?? "keep") as "keep" | "trash");
    if (noTrack || tid == null) { setErr(noTrack); return; }
    // หนังต้องยังเป็นไฟล์เดิมตอนเปิดซับ (ขนาดกับเวลาแก้เท่าเดิม) · ถูกรวมไฟล์ใหม่ระหว่างแก้ แทร็กเลขเดิมอาจเป็นซับอื่นแล้ว (ผู้ช่วยตรวจทาน R3)
    const known = !!(src?.size || src?.mtime);
    (known ? subDocApi.stamp(movie) : Promise.resolve<[number, number]>([0, 0])).then(([size, mtime]) => {
      if (known && (size !== src!.size || mtime !== src!.mtime)) { setErr("หนังเปลี่ยนไปหลังเปิดซับนี้ แทร็กอาจไม่ใช่แทร็กเดิมแล้ว เปิดซับจากหนังอีกครั้งก่อนใส่กลับ หรือบันทึกเป็นไฟล์ข้างหนัง"); return; }
      return remuxPlan(movie, tid, p.doc).then(setPlan);
    }).catch((e) => setErr(String(e)));
  }, [p.open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!run || !inApp) return;
    const un = listen<PosterProgress>("merge-progress", (e) => setRun(e.payload));
    return () => { void un.then((f) => f()); };
  }, [run != null]); // eslint-disable-line react-hooks/exhaustive-deps
  const busy = run != null;
  const why = busy ? "กำลังใส่ซับกลับเข้าหนัง" : err ?? plan?.why ?? (plan ? null : "กำลังอ่านแทร็กของหนัง");
  const go = async () => {
    if (why || tid == null) return;
    setRun("start");
    const written = p.doc;
    // งานของหน้าแก้ซับเองที่ถือไฟล์หนังอยู่ หยุดก่อน ไม่งั้นรวมไฟล์ตอบว่าไฟล์ถูกเปิดอยู่ในโปรแกรมอื่น ซึ่งหาไม่เจอ (ผู้ช่วยตรวจทาน R12)
    stopVidPlay();
    await Promise.all([vidApi.scenesStop().catch(() => {}), vidApi.tableStop().catch(() => {}), vidApi.playStop().catch(() => {})]);
    try {
      const w = window as unknown as { __remuxDry?: boolean };
      if (import.meta.env.DEV && w.__remuxDry) throw new Error("ทดสอบ ไม่รวมไฟล์จริง");
      const r = await remuxSub(movie, tid, written, orig);
      // ขนาดกับเวลาแก้ของหนังไฟล์ใหม่ ใช้เทียบตอนใส่กลับครั้งถัดไป
      const [size, mtime] = await subDocApi.stamp(r.output).catch((): [number, number] => [0, 0]);
      setRun(null);
      p.onDone(r, written, { size, mtime });
      p.onClose();
    } catch (e) {
      setRun(null);
      const m = typeof e === "object" && e && "title" in e ? [(e as { title: string }).title, ...((e as { detail?: string[] }).detail ?? [])].join("  ") : String(e);
      p.onFail(m);
      p.onClose();
    }
  };
  const pct = run && run !== "start" ? Math.round(run.percent) : 0;
  const t = plan?.track;
  return (
    <Dialog open={p.open} onClose={() => { if (!busy) p.onClose(); }} kind="work" title="ซับนี้อยู่ในไฟล์หนัง" width={640}
      actions={<>
        {busy ? <button type="button" className="btn btn-ghost" onClick={() => void mergeApi.cancel()} data-remux-stop>หยุด</button>
          : <button type="button" className="btn btn-ghost" onClick={p.onClose}>ยกเลิก</button>}
        <span style={{ flex: 1 }} />
        <button ref={fileBtn} type="button" className={"btn btn-ghost" + (busy ? " btn-wait" : "")} aria-disabled={busy || undefined} title={busy ? "กำลังใส่ซับกลับเข้าหนัง" : undefined} onClick={() => { if (!busy) { p.onClose(); p.onSaveAsFile(); } }} data-remux-file>บันทึกเป็นไฟล์ข้างหนัง</button>
        <button type="button" className={"btn " + (why ? "btn-wait" : "btn-main")} aria-disabled={!!why || undefined} title={why ?? undefined} onClick={() => void go()} data-remux-go>
          <Keep all={["ใส่กลับเข้าหนัง", "กำลังใส่… 100%"]}>{busy ? `กำลังใส่… ${pct}%` : "ใส่กลับเข้าหนัง"}</Keep></button>
      </>}>
      <div className="se-dummy se-cdlg" data-remux>
        <div className="se-dlgtext"><Phr>บันทึกได้สองทาง เป็นไฟล์ซับข้างหนัง หรือใส่กลับเข้าไฟล์หนัง</Phr> <InfoTip title="บันทึกซับในหนัง" tip={REMUX_TIP} /></div>
        <div className="se-drow"><span className="se-dlbl">หนัง</span><span className="small" data-remux-movie>{movie ? nameOf(movie) : "—"}</span></div>
        <div className="se-drow"><span className="se-dlbl">แทร็กซับ</span>
          {plan ? <span className="small" data-remux-track>{t ? `แทร็กที่ ${t.tid} ${t.name || "ไม่มีชื่อ"} ภาษา${langName(t.lang)} แบบ ${codecLabel(t.codec)}` : plan.why}</span> : err ? <span className="small se-dlgmsg bad">{err}</span> : <Skel w={220} h={16} />}
        </div>
        <div className="se-drow"><span className="se-dlbl">ไฟล์ใหม่</span>
          <span className="small" data-remux-out>{plan ? (plan.ext === "mp4" && plan.output === "mkv" ? "เป็น MKV เพราะ MP4 ใส่ซับ ASS ไม่ได้ ชื่อเดิมนามสกุลใหม่" : `${plan.output.toUpperCase()} ชื่อเดิม`) : err ? "—" : ""}</span>
        </div>
        <div className="se-drow"><span className="se-dlbl">ไฟล์เดิม</span>
          <Seg small label="ไฟล์เดิม" value={orig} onChange={setOrig} disabledReason={busy ? "กำลังใส่ซับกลับเข้าหนัง" : undefined}
            options={[{ value: "keep", label: "เก็บไว้ในโฟลเดอร์ไฟล์เดิม" }, { value: "trash", label: "ลงถังขยะเมื่อตรวจผ่าน" }]} />
        </div>
        {busy && <div className="se-drow"><span className="se-dlbl" /><div className="se-vprog" style={{ flex: 1 }} data-remux-prog><div style={{ width: `${pct}%` }} /></div><span className="small">{run !== "start" && run?.phase ? run.phase : "เริ่ม…"}</span></div>}
      </div>
    </Dialog>
  );
}
