/* หน้าต่างฝึกจากฟอนต์ในเครื่อง (แผน OCR ขั้น 11 ระบบแมนนวล) ตาม NOcrTrainWindow ของ Subtitle Edit · หน้าตาตามมอคอัปฝึกจากฟอนต์
   ซ้าย ชื่อฐานที่ได้ ฐานเริ่มต้น ขนาด จำนวนเส้น แบบตัว ตัวอักษรที่ฝึก (คืนค่าตั้งต้น นำจากไฟล์ซับ) คู่ที่มักติดกัน
   ขวา ค้นฟอนต์ รายการฟอนต์ติ๊กได้หลายตัว ฟอนต์ที่ซับมักใช้ ล้าง ตัวอย่างของฟอนต์ที่ชี้ ความคืบหน้า ตัวที่เพิ่มกับตัวที่ข้าม
   ตัวสอนเองของชั้นหนังฝึกพยัญชนะ สระ วรรณยุกต์ไทยครบชุดเอง จึงไม่มีช่องตัวอักษร */
import { useEffect, useMemo, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import Dialog from "../../components/Dialog";
import InfoTip from "../../components/InfoTip";
import Dropdown from "../../components/Dropdown";
import { CardIcon, Phr, Switch } from "../../components/ui";
import { IbPlay, IbStop, IcClose, IcFile, IcRefresh } from "../../components/icons";
import { inApp, ocrApi, pickFile, subApi, type OcrDbKind, type OcrTrainDone } from "../../lib/api";
import { setOcrCfg } from "../../lib/ocrJob";

const DLG_W = 880, DLG_H = "min(640px, calc(100vh - 48px))";
/** ชุดตัวอักษรที่ฝึกตั้งต้น · ตรงกับ DEFAULT_CHARS ใน nocr_train.rs (NOcrTrainer.DefaultTrainingCharacters) */
export const DEFAULT_CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,!?\"'()[]:;-+/%&$#@*=æøåäöüßéèêëáàâíìîóòôúùûñçÆØÅÄÖÜÉÈÊËÁÀÂÍÌÎÓÒÔÚÙÛÑÇ";
/** ฟอนต์ที่ซับมักใช้ · ตาม SubtitleFontPreset */
const PRESET = ["Arial", "Helvetica", "Verdana", "Tahoma", "Trebuchet MS", "Arial Narrow", "Helvetica Neue", "Times New Roman", "Liberation Sans", "DejaVu Sans", "Segoe UI"];
const KEY = "ms.ocrTrain";
type Saved = { fonts: string[]; sizes: string; bold: boolean; italic: boolean; lines: number; merged: string };
const load = (): Saved => {
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? "null"); if (v && Array.isArray(v.fonts)) return v; } catch { /* ใช้ค่าตั้งต้น */ }
  return { fonts: [], sizes: "30, 40", bold: false, italic: true, lines: 60, merged: "" };
};
const TRAIN_TIP = { w: "โปรแกรมวาดตัวอักษรทุกตัวด้วยฟอนต์ที่เลือกแล้วจำรูปร่างลงฐาน ใช้แทนการสอนทีละตัว ตัวที่ฐานอ่านออกอยู่แล้วข้ามไป", o: [
  ["ขนาด", "ขนาดตัวอักษรเป็นจุด คั่นด้วยจุลภาค ฝึกทีละขนาด ควรใกล้กับขนาดตัวในซับ", "", ""],
  ["คู่ที่มักติดกัน", "ตัวที่ฟอนต์วาดติดกันจนแยกไม่ออก เช่น rn fi ใส่คู่ละไม่เกินสามตัว คั่นด้วยเว้นวรรค", "", ""],
  ["จำนวนเส้น", "เส้นเทียบต่อตัว ยิ่งมากยิ่งแยกตัวคล้ายได้ดี แต่ฐานใหญ่ขึ้น", "", ""],
] as [string, string, string, string][], r: "ขนาด 30 กับ 40 จุด ตามค่าตั้งต้นของ Subtitle Edit" };

export function TrainDialog({ open, onClose, kind, current, dbs }: { open: boolean; onClose: () => void; kind: OcrDbKind; current: string; dbs: string[] }) {
  const [fontsAll, setFontsAll] = useState<string[]>([]);
  const [s, setS] = useState<Saved>(load);
  const [q, setQ] = useState("");
  const [hi, setHi] = useState("");
  const [name, setName] = useState("");
  const [base, setBase] = useState("");
  const [chars, setChars] = useState(DEFAULT_CHARS);
  const [prev, setPrev] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState<{ percent: number; font: string; size: number; text: string; learned: number; skipped: number } | null>(null);
  const [done, setDone] = useState<OcrTrainDone | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [askOver, setAskOver] = useState(false);
  const own = kind === "own";
  useEffect(() => {
    if (!open) return;
    setErr(null); setDone(null); setTick(null); setAskOver(false); setName(""); setBase("");
    ocrApi.fontFamilies().then((f) => {
      setFontsAll(f);
      setS((x) => (x.fonts.length ? x : { ...x, fonts: PRESET.filter((p) => f.some((g) => g.toLowerCase() === p.toLowerCase())).slice(0, 1) }));
    }, () => {});
  }, [open]);
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* จำไม่ได้ก็ใช้ค่านี้ไปก่อน */ } }, [s]);
  useEffect(() => {
    if (!inApp) return;
    const un = listen<{ percent: number; font: string; size: number; text: string; learned: number; skipped: number }>("ocr-train-progress", (e) => setTick(e.payload));
    return () => { void un.then((f) => f()); };
  }, []);
  // ตัวอย่างของฟอนต์ที่ชี้ หรือฟอนต์แรกที่เลือก
  const show = hi || s.fonts[0] || "";
  useEffect(() => {
    if (!open || !show) { setPrev(null); return; }
    let live = true;
    const t = setTimeout(() => { ocrApi.trainPreview(show, 36, s.bold, false, own ? "กขคงสวัสดี" : [...chars].filter((x) => !/\s/.test(x)).slice(0, 12).join("")).then((p) => { if (live) setPrev(p); }, () => { if (live) setPrev(null); }); }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [open, show, s.bold, chars, own]);
  const list = useMemo(() => { const k = q.trim().toLowerCase(); return k ? fontsAll.filter((f) => f.toLowerCase().includes(k)) : fontsAll; }, [fontsAll, q]);
  const sizes = s.sizes.split(/[,; ]/).map((x) => parseFloat(x)).filter((x, i, a) => x >= 10 && x <= 200 && a.indexOf(x) === i);
  const exists = dbs.includes(name.trim());
  const why = !name.trim() ? "ตั้งชื่อฐานที่จะได้ก่อน" : !s.fonts.length ? "เลือกฟอนต์อย่างน้อยหนึ่งตัว" : !sizes.length ? "ใส่ขนาดฟอนต์ 10 ถึง 200 อย่างน้อยหนึ่งขนาด" : !own && !chars.trim() ? "ใส่ตัวอักษรที่จะฝึก" : undefined;
  const toggle = (f: string) => setS((x) => ({ ...x, fonts: x.fonts.includes(f) ? x.fonts.filter((y) => y !== f) : [...x.fonts, f] }));
  const start = async (overwrite: boolean) => {
    if (why) return;
    if (exists && !overwrite && base !== name.trim()) { setAskOver(true); return; }
    setAskOver(false); setErr(null); setDone(null); setBusy(true); setTick(null);
    try {
      const r = await ocrApi.train({ kind, name: name.trim(), base, overwrite, fonts: s.fonts, sizes, bold: s.bold, italic: s.italic, lines: s.lines, chars, merged: s.merged });
      setDone(r);
      setOcrCfg({ [kind === "own" ? "ownDb" : "nocrDb"]: r.name });
    } catch (e) { setErr(String(e)); }
    setBusy(false);
  };
  const importChars = async () => {
    const w = window as unknown as { __ocrTrainImport?: string };
    const p = import.meta.env.DEV && w.__ocrTrainImport ? w.__ocrTrainImport : await pickFile("subtitle");
    if (!p) return;
    try {
      const t = await subApi.text(p, false, 0, 0);
      const seen = new Set<string>();
      let out = "";
      for (const c of t.cues) for (const ch of c.text.replace(/<[^>]+>|\{\\[^}]*\}/g, "")) if (!/\s/.test(ch) && !seen.has(ch)) { seen.add(ch); out += ch; }
      if (out) setChars(out);
    } catch (e) { setErr(String(e)); }
  };
  const label = own ? "ตัวสอนเอง" : "nOCR";
  return (
    <Dialog open={open} onClose={() => { if (!busy) onClose(); }} kind="work" title={`ฝึกฐาน ${label} จากฟอนต์ในเครื่อง`} width={DLG_W} height={DLG_H}
      actions={<><button type="button" className={"btn " + (busy ? "btn-wait" : "btn-ghost")} aria-disabled={busy || undefined} title={busy ? "หยุดฝึกก่อนจึงจะปิดได้" : undefined} onClick={() => { if (!busy) onClose(); }}><IcClose size={15} />ปิด</button><span style={{ flex: 1 }} />
        {busy ? <button type="button" className="btn btn-ghost" onClick={() => void ocrApi.trainCancel()} data-train-stop><IbStop size={15} />หยุดฝึก</button>
          : <button type="button" className={"btn " + (why ? "btn-wait" : "btn-main")} aria-disabled={!!why || undefined} title={why ?? `ฝึก ${s.fonts.length} ฟอนต์ ${sizes.length} ขนาด`} onClick={() => void start(false)} data-train-start><IbPlay size={15} />เริ่มฝึก</button>}</>}>
      <div className="ocr-dlg ocr-train" data-ocr-train-dlg>
        <div className="ocr-trl">
          <div className="small"><Phr>เลือกฟอนต์ที่ซับเรื่องนี้ใช้ โปรแกรมวาดตัวอักษรทุกตัวแล้วจำไว้ในฐาน ใช้แทนการสอนทีละตัว</Phr> <InfoTip title="ฝึกจากฟอนต์" tip={TRAIN_TIP} /></div>
          <div className="icv-row"><span className="icv-lbl">ชื่อฐาน</span><input className="inp" style={{ flex: 1, minWidth: 0 }} value={name} placeholder={`เช่น ${current}-ฝึก`} disabled={busy} onChange={(e) => setName(e.target.value)} aria-label="ชื่อฐานที่จะได้" data-train-name /></div>
          <div className="icv-row"><span className="icv-lbl">เริ่มจาก</span><div style={{ display: "flex", flex: 1, minWidth: 0 }}><Dropdown label="ฐานเริ่มต้น" value={base} onChange={setBase} stretch disabled={busy ? "กำลังฝึก" : undefined}
            options={[{ value: "", label: "ฐานว่าง" }, ...dbs.map((d) => ({ value: d, label: `ต่อจาก ${d}` }))]} /></div></div>
          <div className="icv-row"><span className="icv-lbl">ขนาด</span><input className="inp" style={{ width: 110 }} value={s.sizes} disabled={busy} onChange={(e) => setS({ ...s, sizes: e.target.value })} aria-label="ขนาดฟอนต์ คั่นด้วยจุลภาค" data-train-sizes /><span className="small">จุด</span>
            <span className="icv-lbl" style={{ width: "auto", marginLeft: 12 }}>จำนวนเส้น</span><input className="inp ocr-numi" inputMode="numeric" value={s.lines} disabled={busy} onChange={(e) => setS({ ...s, lines: Math.max(10, Math.min(500, parseInt(e.target.value, 10) || 0)) })} aria-label="จำนวนเส้นต่อตัว" /></div>
          <div className="icv-row"><span className="icv-lbl">แบบตัว</span>
            <label className="ocr-only"><Switch on={s.bold} onChange={(v) => { if (!busy) setS({ ...s, bold: v }); }} label="ฝึกตัวหนาด้วย" /><span>หนา</span></label>
            <label className="ocr-only"><Switch on={s.italic} onChange={(v) => { if (!busy) setS({ ...s, italic: v }); }} label="ฝึกตัวเอียงด้วย" /><span>เอียง</span></label><span className="small">ตัวปกติฝึกทุกครั้ง</span></div>
          {own ? <div className="small"><Phr>ตัวสอนเองฝึกพยัญชนะ สระ และวรรณยุกต์ไทยครบชุดเอง ไม่ต้องใส่ตัวอักษร</Phr></div> : <>
            <div className="icv-head">ตัวอักษรที่จะฝึก<span className="small" style={{ fontWeight: 400 }}>{`${[...chars].filter((c) => !/\s/.test(c)).length} ตัว`}</span></div>
            <textarea className="inp ocr-ta ocr-trchars" value={chars} spellCheck={false} disabled={busy} onChange={(e) => setChars(e.target.value)} aria-label="ตัวอักษรที่จะฝึก" data-train-chars />
            <div className="ocr-dbtools"><button type="button" className="btn btn-ghost btn-sm" onClick={() => setChars(DEFAULT_CHARS)} disabled={busy} data-train-reset><IcRefresh size={14} />คืนค่าตั้งต้น</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => void importChars()} disabled={busy} title="ใช้ตัวอักษรทุกตัวที่มีในไฟล์ซับตัวหนังสือ" data-train-import><IcFile size={14} />นำจากไฟล์ซับ</button></div>
            <div className="icv-row"><span className="icv-lbl">คู่ที่มักติดกัน</span><input className="inp" style={{ flex: 1, minWidth: 0 }} value={s.merged} placeholder="rn fi ff" disabled={busy} onChange={(e) => setS({ ...s, merged: e.target.value })} aria-label="คู่ตัวอักษรที่มักติดกัน" /></div>
          </>}
          {askOver && <div className="ocr-dbask" data-train-ask><Phr>{`มีฐานชื่อ ${name.trim()} อยู่แล้ว ฝึกแล้วเขียนทับฐานเดิม`}</Phr>
            <div className="ocr-dbtools"><button type="button" className="btn btn-danger btn-sm" onClick={() => void start(true)} data-train-over>เขียนทับ</button><button type="button" className="btn btn-ghost btn-sm" onClick={() => setAskOver(false)}>ยกเลิก</button></div></div>}
        </div>
        <div className="ocr-trr">
          <div className="icv-head">ฟอนต์<span className="small" style={{ fontWeight: 400 }} data-train-nfonts>{`เลือก ${s.fonts.length} ฟอนต์`}</span></div>
          <input className="inp" value={q} placeholder="ค้นฟอนต์" onChange={(e) => setQ(e.target.value)} aria-label="ค้นฟอนต์" data-train-q />
          <div className="ocr-trfonts" data-train-fonts>{list.map((f) => (
            <label key={f} className={"ocr-trfont" + (hi === f ? " on" : "")} onMouseEnter={() => setHi(f)}>
              <input type="checkbox" checked={s.fonts.includes(f)} disabled={busy} onChange={() => toggle(f)} /><span>{f}</span></label>))}
            {!list.length && <span className="small">{fontsAll.length ? "ไม่มีฟอนต์ที่ตรงกับคำค้น" : "กำลังอ่านรายชื่อฟอนต์…"}</span>}</div>
          <div className="ocr-dbtools"><button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => { setS({ ...s, fonts: fontsAll.filter((f) => PRESET.some((p) => p.toLowerCase() === f.toLowerCase())) }); setQ(""); }} data-train-preset>ฟอนต์ที่ซับมักใช้</button>
            <button type="button" className="btn btn-ghost btn-sm" disabled={busy || !s.fonts.length} onClick={() => setS({ ...s, fonts: [] })} data-train-clear>ล้าง</button></div>
          <div className="ocr-trprev" data-train-prev>{prev ? <img src={prev} alt={`ตัวอย่างฟอนต์ ${show}`} /> : <span className="small">{show ? "กำลังวาดตัวอย่าง…" : "เลือกฟอนต์เพื่อดูตัวอย่าง"}</span>}</div>
          {(busy || tick) && !done && <div className="ocr-prog" data-train-prog><div className="ocr-bar2"><span style={{ width: `${tick?.percent ?? 0}%` }} /></div>
            <span className="small">{tick ? `${tick.font} ขนาด ${tick.size} ${tick.text} เพิ่ม ${tick.learned} ข้าม ${tick.skipped}` : "กำลังเริ่ม…"}</span></div>}
          {done && <div className="stat ok" data-train-done><CardIcon kind="ok" /><Phr>{`${done.stopped ? "หยุดแล้ว " : ""}บันทึกฐาน ${done.name} แล้ว เพิ่ม ${done.learned} ตัว ข้าม ${done.skipped} ตัว ฐานมี ${done.total} รูปแบบ`}</Phr></div>}
          {err && <div className="stat bad" data-train-err><CardIcon kind="bad" /><div style={{ flex: 1 }}><b>ฝึกไม่สำเร็จ</b><Phr>{err}</Phr></div></div>}
        </div>
      </div>
    </Dialog>
  );
}
