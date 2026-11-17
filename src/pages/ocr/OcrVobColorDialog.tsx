/* หน้าต่างสีของ VobSub (แผน OCR ขั้น 11) ตาม VobSubColorChooserWindow ของ Subtitle Edit
   สี่สีของซับ DVD (พื้นหลัง Pattern Emphasis 1 Emphasis 2) เลือกสีและความทึบเอง สลับพื้นกับตัวหนังสือ คืนค่าตั้งต้น ตัวอย่างภาพที่เลือก
   ใช้สีนี้แล้ววาดภาพทั้งไฟล์ใหม่ ข้อความที่อ่านไว้ไม่หาย · สีที่ตั้งจำไว้ในเครื่อง เปิด VobSub ครั้งหน้าใช้สีนี้เอง (ApplyStoredVobSubColors) */
import { useEffect, useState } from "react";
import Dialog from "../../components/Dialog";
import InfoTip from "../../components/InfoTip";
import { CardIcon, Phr, Switch } from "../../components/ui";
import { IbSwap, IbTick, IcClose, IcRefresh } from "../../components/icons";
import { ocrApi } from "../../lib/api";

const DLG_W = 880, DLG_H = "min(640px, calc(100vh - 48px))";
export type Rgba = [number, number, number, number];
export type VobColors = [Rgba, Rgba, Rgba, Rgba];
/** ค่าตั้งต้นของ Subtitle Edit พื้นใส Pattern ดำ Emphasis 1 ขาว Emphasis 2 ดำ · ค่านี้คือใช้จานสีของไฟล์ */
export const VOB_DEFAULT: VobColors = [[0, 0, 0, 0], [0, 0, 0, 255], [255, 255, 255, 255], [0, 0, 0, 255]];
const KEY = "ms.ocrVobColors";
const same = (a: VobColors, b: VobColors) => a.every((c, i) => c.every((v, k) => v === b[i][k]));
/** สีที่จำไว้ · ไม่มีหรือเป็นค่าตั้งต้นคืน null (ใช้จานสีของไฟล์) */
export function storedVobColors(): VobColors | null {
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? "null"); if (Array.isArray(v) && v.length === 4 && !same(v as VobColors, VOB_DEFAULT)) return v as VobColors; } catch { /* ไม่มีค่าที่จำ */ }
  return null;
}
const hex = (c: Rgba) => "#" + c.slice(0, 3).map((v) => v.toString(16).padStart(2, "0")).join("");
const fromHex = (h: string, a: number): Rgba => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16), a];
const NAMES = ["พื้นหลัง", "Pattern", "Emphasis 1", "Emphasis 2"];
const TIP = { w: "ซับ DVD เก็บภาพเป็นสี่สีแล้วให้จานสีในไฟล์ .idx บอกว่าแต่ละสีคือสีอะไร บางไฟล์จานสีผิด ตัวหนังสือมืดหรือกลืนกับพื้น ตัวอ่านจึงอ่านไม่ออก ตั้งสีเองแทนได้ที่นี่", o: [
  ["พื้นหลัง", "สีรอบตัวหนังสือ ปกติใส", "", ""],
  ["Pattern", "สีของเนื้อตัวหนังสือในซับส่วนใหญ่", "", ""],
  ["Emphasis 1 กับ 2", "สีขอบหรือเงาของตัวหนังสือ บางไฟล์ใช้เป็นเนื้อตัวแทน ลองสลับดูจากตัวอย่าง", "", ""],
] as [string, string, string, string][], r: "ให้ตัวหนังสือสีขาวทึบ ขอบสีดำ พื้นใส ตัวอ่านอ่านได้ดีที่สุด" };

export function VobColorDialog({ open, onClose, path, ff, n, onApplied }: { open: boolean; onClose: () => void; path: string; ff: number; n: number; onApplied: () => void }) {
  const [c, setC] = useState<VobColors>(VOB_DEFAULT);
  const [prev, setPrev] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (open) { setC(storedVobColors() ?? VOB_DEFAULT); setErr(null); } }, [open]);
  useEffect(() => {
    if (!open) return;
    let live = true;
    const t = setTimeout(() => { ocrApi.vobsubPreview(path, ff, n, same(c, VOB_DEFAULT) ? null : c).then((p) => { if (live) setPrev(p); }, (e) => { if (live) { setPrev(null); setErr(String(e)); } }); }, 150);
    return () => { live = false; clearTimeout(t); };
  }, [open, c, path, ff, n]);
  const set = (i: number, v: Rgba) => setC((x) => x.map((y, k) => (k === i ? v : y)) as VobColors);
  const apply = async () => {
    setBusy(true); setErr(null);
    try {
      const custom = same(c, VOB_DEFAULT) ? null : c;
      await ocrApi.vobsubRecolor(path, ff, custom);
      try { localStorage.setItem(KEY, JSON.stringify(c)); } catch { /* จำไม่ได้ก็ใช้รอบนี้ไปก่อน */ }
      onApplied();
      onClose();
    } catch (e) { setErr(String(e)); }
    setBusy(false);
  };
  const isDef = same(c, VOB_DEFAULT);
  return (
    <Dialog open={open} onClose={() => { if (!busy) onClose(); }} kind="work" title="สีของ VobSub" width={DLG_W} height={DLG_H}
      actions={<><button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}><IcClose size={15} />ยกเลิก</button><span style={{ flex: 1 }} />
        <button type="button" className={"btn " + (busy ? "btn-wait" : "btn-main")} aria-disabled={busy || undefined} title={busy ? "กำลังวาดภาพใหม่" : isDef ? "กลับไปใช้จานสีของไฟล์" : "วาดภาพทั้งไฟล์ใหม่ด้วยสีนี้"} onClick={() => { if (!busy) void apply(); }} data-vob-apply><IbTick size={15} />{busy ? "กำลังวาดใหม่…" : "ใช้สีนี้"}</button></>}>
      <div className="ocr-dlg ocr-vob" data-ocr-vob-dlg>
        <div className="small"><Phr>เลือกสีที่ใช้วาดภาพซับแทนจานสีของไฟล์ ใช้เมื่อตัวหนังสือมืดหรือกลืนกับพื้นจนอ่านไม่ออก</Phr> <InfoTip title="สีของ VobSub" tip={TIP} /></div>
        <div className="ocr-vobgrid">
          <div className="ocr-vobrows">{c.map((col, i) => (
            <div key={i} className="icv-row" data-vob-row={i}><span className="icv-lbl" style={{ width: 110 }}>{NAMES[i]}</span>
              <input type="color" className="ocr-vobpick" value={hex(col)} disabled={busy} onChange={(e) => set(i, fromHex(e.target.value, col[3]))} aria-label={`สี${NAMES[i]}`} data-vob-color={i} />
              <label className="ocr-only"><Switch on={col[3] > 0} onChange={(v) => { if (!busy) set(i, [col[0], col[1], col[2], v ? 255 : 0]); }} label={`${NAMES[i]} ทึบ`} /><span>{col[3] > 0 ? "ทึบ" : "ใส"}</span></label>
              <span className="small ocr-vobhex">{hex(col).toUpperCase()}</span></div>))}
            <div className="ocr-dbtools">
              <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setC((x) => [x[2], x[1], x[0], x[3]])} title="สลับสีพื้นหลังกับ Emphasis 1" data-vob-swap><IbSwap size={14} />สลับพื้นกับตัวหนังสือ</button>
              <button type="button" className={"btn btn-sm " + (isDef ? "btn-wait" : "btn-ghost")} aria-disabled={isDef || undefined} title={isDef ? "เป็นค่าตั้งต้นอยู่แล้ว" : "กลับไปใช้จานสีของไฟล์"} onClick={() => { if (!isDef && !busy) setC(VOB_DEFAULT); }} data-vob-reset><IcRefresh size={14} />คืนค่าตั้งต้น</button></div>
            <div className="small">{isDef ? "ค่าตั้งต้น ใช้จานสีของไฟล์" : "ใช้สีที่ตั้งเองแทนจานสีของไฟล์"}</div>
          </div>
          <div className="ocr-vobprev" data-vob-prev><div className="icv-head">{`ตัวอย่างภาพที่ ${n}`}</div>
            <div className="ocr-vobimg">{prev ? <img src={prev} alt={`ตัวอย่างภาพที่ ${n}`} /> : <span className="small">กำลังวาดตัวอย่าง…</span>}</div></div>
        </div>
        {err && <div className="stat bad" data-vob-err><CardIcon kind="bad" /><div style={{ flex: 1 }}><b>วาดภาพด้วยสีนี้ไม่ได้</b><Phr>{err}</Phr></div></div>}
      </div>
    </Dialog>
  );
}
