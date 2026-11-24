/* เมนูเสียงของกรอบคลื่นเสียง เปิดไฟล์เสียงแยก และบันทึกเสียงของบรรทัดเป็น WAV
   แยกจาก SubAudio.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 10) เนื้อโค้ดยกมาทั้งก้อน */
import { useRef, useState } from "react";
import { audApi, graphApi, pickFile, pickSave, type SubEvent } from "../../lib/api";
import { dropStyle, sideStyle, useDropPlacement, useSideFit } from "../../lib/popupFit";
import { useClickOutside, useEscClose } from "../../lib/popup";
import { rangeOf, setOwnAudio, useTiming, type AudSource } from "../../lib/subTiming";
import { IcFile } from "../icons";

/* ---------------------------------------------------------------- เมนูเสียง เปิดไฟล์เสียงแยก บันทึกเสียงของบรรทัด */

export function AudioMenu(p: { src: NonNullable<AudSource>; ev: SubEvent | null; delayMs: number }) {
  const tm = useTiming();
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const wrap = useRef<HTMLSpanElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const place = useDropPlacement(open, wrap, panel);
  const side = useSideFit(open, wrap, panel, "right");
  useEscClose(open, () => setOpen(false));
  useClickOutside(open, wrap, () => setOpen(false));
  const openFile = async () => {
    const w = window as unknown as { __audOpen?: string };
    const f = import.meta.env.DEV && w.__audOpen ? w.__audOpen : await pickFile("media");
    if (!f) return;
    const info = await graphApi.info(f).catch((e) => { setMsg(String(e)); return null; });
    if (!info) return;
    if (!info.tracks.length) { setMsg("ไฟล์นี้ไม่มีเสียง"); return; }
    setOwnAudio({ path: f, map: "0:a:0", idx: 0, name: f.split(/[\\/]/).pop() ?? f, own: true });
    setMsg(null); setOpen(false);
  };
  const saveClip = async () => {
    if (!p.ev) return;
    const r = rangeOf(p.ev);
    const w = window as unknown as { __audSave?: string };
    const base = p.src.path.replace(/\.[^.\\/]+$/, "") + `_บรรทัด_${(r.start / 1000).toFixed(2)}.wav`;
    const f = import.meta.env.DEV && w.__audSave ? w.__audSave : await pickSave(base, "wav", "ไฟล์เสียง WAV");
    if (!f) return;
    audApi.save(p.src.path, p.src.map, (r.start + p.delayMs) / 1000, (r.end + p.delayMs) / 1000, /\.wav$/i.test(f) ? f : `${f}.wav`, p.src.zero ?? null)
      .then((x) => setMsg(`บันทึกแล้ว ${x.split(/[\\/]/).pop()}`), (e) => setMsg(String(e)));
  };
  return (
    <span ref={wrap} style={{ position: "relative", display: "inline-flex" }}>
      <button type="button" className={"btn btn-ghost btn-sm se-amenu" + (open ? " pressed" : "")} aria-haspopup="true" aria-expanded={open} title={`เสียงจาก ${p.src.name}`} onClick={() => { setOpen((x) => !x); setMsg(null); }} data-se-amenu>
        <IcFile size={14} />เสียง
      </button>
      {open && (
        <div ref={panel} className="menu pop-in se-vmenu" role="dialog" aria-label="เมนูเสียง" style={{ position: "absolute", ...sideStyle(side, "right"), width: 300, zIndex: "var(--z-menu)" as unknown as number, ...dropStyle(place) }} data-se-amenupanel>
          <div className="se-vmrow"><span className="se-vmh">เสียงจาก</span><span className="small se-vmkeys" data-se-asrc>{p.src.name}</span></div>
          <div className="se-vmsec">
            <button type="button" className="se-vmi" onClick={() => void openFile()} data-se-aopen>เปิดไฟล์เสียงแยก</button>
            {tm.own && <button type="button" className="se-vmi" onClick={() => { setOwnAudio(null); setOpen(false); }} data-se-amovie>กลับไปใช้เสียงของหนัง</button>}
            <button type="button" className={"se-vmi" + (p.ev ? "" : " off")} aria-disabled={!p.ev || undefined} title={p.ev ? undefined : "ยังไม่ได้เลือกบรรทัด"} onClick={() => void saveClip()} data-se-asave>บันทึกเสียงของบรรทัดเป็นไฟล์ WAV</button>
          </div>
          {msg && <div className="small se-vmmsg" role="status" data-se-amsg>{msg}</div>}
        </div>
      )}
    </span>
  );
}
