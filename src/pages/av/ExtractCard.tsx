/* การ์ดแยกไฟล์ออกจากหนัง (BUGS ข้อ 35 · พี่กันเคาะ 10 พ.ย. 2569 "ปุ่มเเยก กับรวม เอาที่เดียวกันในหน้นี้เลย")
   เดิมอยู่ท้ายหน้า MediaInfo ติ๊กหัวหมวดแล้วกดแยก พี่กันหาไม่เจอ ย้ายมาอยู่หน้าเสียงและซับ ที่เดียวกับงานรวม
   แยกทีละชิ้น หยุดได้ ชื่อชนถามก่อน ไม่เขียนทับ ไฟล์หนังเดิมไม่ถูกแตะ (extract.rs) · ชิ้นที่ติ๊กส่งมาจากหน้าที่ใช้การ์ดนี้ */
import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { api, infoApi, inApp, pickFolder, pickMkvFiles, type ExtractItem, type ExtractResult } from "../../lib/api";
import { useElsewhere } from "../../lib/elsewhere";
import { CardIcon, Phr } from "../../components/ui";
import { spaceShort, useFree } from "../../lib/drives";
import { IbEraser, IbNext, IbPencil, IbStop, IbTrash, IcExtract, IcFolder, IcRefresh } from "../../components/icons";
import InfoTip from "../../components/InfoTip";

/** แยกหลายไฟล์ (BUGS ข้อ 130 แบบ gMKVExtractGUI) */
const BATCH_TIP = { w: "แยกชิ้นที่ติ๊กไว้แบบเดียวกันจากไฟล์ MKV อื่นหลายไฟล์ทีละไฟล์\nโดยไฟล์ที่ได้ของแต่ละเรื่องอยู่ในโฟลเดอร์แยกไฟล์ข้างไฟล์นั้น",
  o: [["ลำดับแทร็ก", "ใช้ลำดับเดียวกับหนังเรื่องนี้ เช่น เสียงที่ 2 ส่วนนามสกุลกับภาษาอ่านจากไฟล์นั้นใหม่", "", ""], ["ชิ้นที่ไม่มี", "ไฟล์ที่ไม่มีแทร็กหรือ Chapter ตามที่ติ๊ก ข้ามชิ้นนั้นแล้วบอกในผล", "", ""], ["ชื่อซ้ำ", "ไม่เขียนทับไฟล์เดิม ตั้งชื่อใหม่ต่อท้ายเลขให้เอง และไฟล์แนบไม่แยก เพราะแต่ละไฟล์มีไฟล์แนบไม่เหมือนกัน", "", ""]] as [string, string, string, string][] };

/** ชิ้นที่ติ๊กไว้ · label ใช้ในประโยคสรุป · rowLabel ใช้ในแถวกำลังแยก แบบต้นแบบ Audio #1 .ac3 */
export type ExtractPick = { item: ExtractItem; label: string; rowLabel: string };

/** ที่อยู่ยาวย่อตรงกลาง เก็บไดรฟ์กับสองโฟลเดอร์ท้ายไว้ เช่น D:\…\หนัง\ดาวเหนือ (2023) · สั้นพออยู่แล้วไม่ย่อ (BUGS ข้อ 92) */
function midPath(p: string, max = 44): string {
  if (p.length <= max) return p;
  const sep = p.includes("\\") ? "\\" : "/";
  const parts = p.split(/[\\/]/).filter(Boolean);
  const tail = parts.slice(-2).join(sep);
  const head = parts[0] ?? "";
  const s = `${head}${sep}…${sep}${tail}`;
  return s.length <= max + 8 ? s : `…${sep}${parts[parts.length - 1]}`;
}

export default function ExtractCard({ path, picks, busy, srcSize, pattern, batchable, onClear, onClearAll }: { path: string; picks: ExtractPick[]; busy?: string; srcSize?: number; pattern?: string; batchable?: boolean; onClear?: () => void; onClearAll?: () => void }) {
  const [folder, setFolder] = useState("");
  /** ชิ้นที่กดแยกรอบนี้ตรึงไว้ · ติ๊กเพิ่มหรือเอาออกระหว่างการ์ดชื่อชนค้าง กดตั้งชื่อใหม่แล้วต้องแยกชิ้นเดิม (ผู้ช่วยตรวจโค้ดเจอ ตอนอยู่หน้า MediaInfo) */
  const [xRun, setXRun] = useState<{ items: ExtractItem[]; labels: string[]; pct: number[]; result: ExtractResult | null; running: boolean } | null>(null);
  const elsewhere = useElsewhere(infoApi.extractRunning, !!xRun?.running);
  /** แยกหลายไฟล์ ทีละไฟล์ตามลำดับที่เลือก · stop กดหยุดแล้วไม่เริ่มไฟล์ถัดไป */
  const [batch, setBatch] = useState<{ files: string[]; rows: { file: string; text: string; ok: boolean }[]; running: boolean } | null>(null);
  const stopBatch = useRef(false);

  useEffect(() => {
    let live = true;
    setXRun(null);
    infoApi.defaultFolder(path).then((f) => { if (live) setFolder(f); }).catch(() => {});
    return () => { live = false; };
  }, [path]);
  useEffect(() => {
    if (!inApp) return;
    const off = listen<{ index: number; percent: number }>("extract-progress", (e) => setXRun((r) => r ? { ...r, pct: r.pct.map((p, i) => i === e.payload.index ? e.payload.percent : p) } : r));
    return () => { off.then((f) => f()); };
  }, []);

  const run = async (items: ExtractItem[], labels: string[], policy: string[], dest = folder) => {
    setXRun({ items, labels, pct: items.map(() => 0), result: null, running: true });
    try {
      const result = await infoApi.extract(path, dest || null, items, policy, pattern);
      setXRun((r) => r && { ...r, result, running: false });
    } catch (e) {
      setXRun((r) => r && { ...r, running: false, result: { folder, states: items.map(() => "failed"), files: items.map(() => null), error: String(e) } });
    }
  };
  const conflicts = xRun?.result ? xRun.result.states.map((s, i) => (s === "conflict" ? i : -1)).filter((i) => i >= 0) : [];
  const resolve = (how: "skip" | "number") => {
    if (!xRun) return;
    run(conflicts.map((i) => xRun.items[i]), conflicts.map((i) => xRun.labels[i]), conflicts.map(() => how));
  };
  const done = xRun?.result ? xRun.result.states.filter((s) => s === "done").length : 0;
  // ไฟล์ที่ได้จริงทุกไฟล์ ซับ VobSub ชิ้นเดียวได้สองไฟล์ .idx กับ .sub (BUGS ข้อ 150)
  const doneFiles = xRun?.result ? xRun.result.states.flatMap((s, i) => s === "done" ? [xRun.result!.files[i], xRun.result!.pair?.[i]].filter((f): f is string => !!f) : []) : [];
  // ลองใหม่แยกเฉพาะชิ้นที่ยังไม่เสร็จ · เดิมแยกทุกชิ้นซ้ำ ชิ้นที่เสร็จแล้วชนชื่อไฟล์ของตัวเอง (พี่กันเจอ 15 พ.ย. 2569 "เเล้วพอเป็นแบบนี้ ทำอะไรไม่ได้เลย")
  const retry = (dest?: string) => {
    if (!xRun?.result) return;
    const left = xRun.items.map((_, i) => i).filter((i) => !["done", "skipped"].includes(xRun.result!.states[i]));
    run(left.map((i) => xRun.items[i]), left.map((i) => xRun.labels[i]), left.map(() => "ask"), dest ?? folder);
  };
  // ล้างการติ๊กทุกแถวแล้วกลับไปแถบเลือก ใช้ได้ทั้งตอนแยกเสร็จและไม่สำเร็จ (พี่กันทัก 15 พ.ย. 2569 "เรายังไม่เห็นปุ่มล้างเลย" ตอนการ์ดแสดงผลอยู่)
  const clearAll = () => { onClear?.(); setXRun(null); };
  const changeDest = async () => {
    const f = await pickFolder("เลือกที่เก็บไฟล์ที่แยก");
    if (f) { setFolder(f); retry(f); }
  };
  // ที่ว่างในโฟลเดอร์ที่เก็บ · สูตรเดียวกับ extract.rs ภาพใช้ราวขนาดหนัง ชิ้นอื่นหนึ่งในสี่ของหนัง อย่างน้อย 64 MB รวมทุกชิ้นที่ติ๊ก ไม่พอเตือนข้างปุ่มก่อนกด (BUGS ข้อ 94)
  const free = useFree(folder || null);
  const src = srcSize ?? 0, MB64 = 64 * 1024 * 1024;
  const need = src ? picks.reduce((s, p) => s + (p.item.kind === "video" ? src : Math.min(Math.max(src / 4, MB64), src + MB64)), 0) : 0;
  const short = picks.length ? spaceShort(free, need) : null;
  const why = busy ?? (!picks.length ? "ยังกดไม่ได้ ติ๊กอย่างน้อย 1 อย่างก่อน" : elsewhere ? "รองานแยกไฟล์ที่ทำอยู่ให้เสร็จก่อน" : short ?? undefined);

  const batchItems = picks.map((p) => p.item).filter((i) => i.kind !== "attachment");
  const batchWhy = why ?? (!batchItems.length ? "ไฟล์แนบแยกหลายไฟล์ไม่ได้ ติ๊กแทร็กหรือ Chapter ก่อน" : undefined);
  const startBatch = async () => {
    const files = (await pickMkvFiles()).filter((f) => f.toLowerCase() !== path.toLowerCase());
    if (!files.length) return;
    stopBatch.current = false;
    setBatch({ files, rows: [], running: true });
    for (const f of files) {
      if (stopBatch.current) break;
      let row: { file: string; text: string; ok: boolean };
      try {
        const r = await infoApi.extract(f, null, batchItems, batchItems.map(() => "number"), pattern, true);
        // ซับ VobSub ชิ้นเดียวได้สองไฟล์ นับไฟล์ที่ได้จริง (BUGS ข้อ 150)
        const ok = r.states.reduce((n, s, i) => n + (s === "done" ? (r.pair?.[i] ? 2 : 1) : 0), 0), miss = r.states.filter((s) => s === "missing").length;
        if (r.states.includes("cancelled")) { stopBatch.current = true; row = { file: f, text: "หยุดแล้ว", ok: false }; }
        // แถวของแต่ละไฟล์บอกสาเหตุด้วย ไม่ใช่แค่ว่าไม่สำเร็จ (BUGS ข้อ 150)
        else if (r.error) row = { file: f, text: r.error.split("  ").slice(0, 2).join(" "), ok: false };
        else row = { file: f, text: `แยกแล้ว ${ok} ไฟล์${miss ? ` และไฟล์นี้ไม่มี ${miss} อย่าง` : ""}`, ok: true };
      } catch (e) { row = { file: f, text: String(e), ok: false }; }
      setBatch((b) => b && { ...b, rows: [...b.rows, row] });
    }
    setBatch((b) => b && { ...b, running: false });
  };

  if (batch) return (
    <div className="card" data-extract data-extract-batchrun>
      <h3>แยกแบบเดียวกันจากหลายไฟล์</h3>
      <div className="workbox">
        {batch.files.map((f, i) => {
          const r = batch.rows[i];
          const word = r ? r.text : batch.running && i === batch.rows.length ? "กำลังแยก…" : batch.running ? "รอคิว" : "ไม่ได้แยก";
          return <div key={f} className="setrow" style={i === 0 ? { borderTop: 0 } : undefined} data-batch-row={i}><div className="lbl" style={{ overflowWrap: "anywhere" }}>{f.split(/[\\/]/).pop()}</div><div className={"small" + (r && !r.ok ? " bad" : "")}>{word}</div></div>;
        })}
        <div className="minirow" style={{ marginTop: 0 }}>
          {batch.running ? <button type="button" className="btn btn-bad btn-sm" onClick={() => { stopBatch.current = true; void infoApi.extractCancel(); }} data-batch-stop><IbStop size={15} />หยุด</button>
            : <button type="button" className="btn btn-ghost btn-sm" onClick={() => setBatch(null)} data-batch-close><IbNext size={15} />เสร็จแล้ว</button>}
        </div>
      </div>
    </div>
  );

  const idle = !xRun || (!xRun.running && !xRun.result);
  // ตอนยังไม่กดแยก เป็นแถวเดียวสูงเท่าแถบล่างของวิธีรวมกับวิธีจับคู่ ไม่มีหัวข้อซ้ำกับการ์ดวิธี สลับวิธีแล้วแถบล่างไม่ยืดหด
  // (พี่กันทัก 13 พ.ย. 2569 "ก็บอกว่าให้ fix ไง" · เดิมมีหัวข้อแยกออกจากหนังอีกบรรทัด แถบล่างสูงกว่าวิธีรวม 19 จุด)
  // งานแยกที่เริ่มไว้จากหน้าอื่นยังทำอยู่ บอกเป็นคำสั้นในแถวเดียวกับปุ่มหยุด ไม่ขึ้นการ์ดเตือนที่ดันแถบให้สูง
  return (
    <div className={idle ? "xidle" : "card"} data-extract>
      {!idle && <h3>แยกออกจากหนัง</h3>}
      {idle ? (
        <div className="xrow">
          <div className="xpicks" title={picks.length ? picks.map((p) => p.label).join(", ") : undefined}>
            {elsewhere ? <b data-extract-elsewhere>งานแยกไฟล์ที่เริ่มไว้ก่อนหน้ายังทำอยู่</b> : picks.length ? <><b>เลือกไว้ {picks.length} อย่าง</b>{onClear && <button type="button" className="btn btn-ghost btn-xs xclear" onClick={onClear} title="ยกเลิกการเลือกทุกแถว" data-extract-clear><IbEraser size={13} />ล้างการเลือก</button>}</> : "ติ๊กแทร็กในตารางข้างบนเพื่อแยกเป็นไฟล์"}
            {elsewhere ? <div className="hint" style={{ color: "#94680f", margin: 0 }}>รอให้เสร็จก่อน หรือกดหยุด</div> : why && <div className="hint" style={{ color: "#94680f", margin: 0 }}>{why}</div>}</div>
          {elsewhere && <button type="button" className="btn btn-bad btn-sm" onClick={() => infoApi.extractCancel()}><IbStop size={15} />หยุดงานนั้น</button>}
          {/* ที่เก็บอยู่ข้างปุ่มแยก กรอบสีโทน ตัวหนา เห็นชัดก่อนกด (BUGS ข้อ 92 พี่กันสั่ง 13 พ.ย. 2569 "ขอที่เก็บ ข้างๆปุ่มเเยก เเละเด่นๆ")
              บรรทัดเดียวเสมอ ที่อยู่ยาวย่อตรงกลาง เก็บไดรฟ์กับโฟลเดอร์ปลายทางไว้ ชี้แล้วเห็นที่อยู่เต็ม แถบล่างไม่สูงขึ้น */}
          {/* ที่เก็บกับปุ่มเปลี่ยนรวมเป็นปุ่มเดียว กดตรงไหนก็เลือกโฟลเดอร์ใหม่ ฝั่งขวามีไอคอนดินสอกับคำว่าเปลี่ยน (พี่กันสั่ง 13 พ.ย. 2569 "ใส่ icon หน่อย เเละที่อยู่ อยากให้กดเปลี่ยนได้ เเม้ปุ่มเปลี่ยนที่เก็บจะเเยกไว้ เเต่อยากให้รวมกัน") */}
          {batchable && <span className="xbatch"><button type="button" className={"btn btn-ghost btn-sm" + (batchWhy ? " btn-wait" : "")} aria-disabled={!!batchWhy || undefined} title={batchWhy ?? "แยกชิ้นที่ติ๊กแบบเดียวกันจากไฟล์ MKV อื่นหลายไฟล์"}
            onClick={() => { if (!batchWhy) void startBatch(); }} data-extract-batch>หลายไฟล์</button><InfoTip title="แยกหลายไฟล์" tip={BATCH_TIP} /></span>}
          <button type="button" className="xdest" title={folder ? `เก็บที่ ${folder}  กดเพื่อเปลี่ยนที่เก็บ` : "กดเพื่อเลือกที่เก็บ"} onClick={async () => { const f = await pickFolder("เลือกที่เก็บไฟล์ที่แยก"); if (f) setFolder(f); }} data-extract-dest data-extract-folder>
            <IcFolder size={16} /><span>เก็บที่</span><b>{folder ? midPath(folder) : "—"}</b>
            <i className="xdest-chg" aria-hidden="true"><IbPencil size={14} />เปลี่ยน</i></button>
          {/* ล้างทั้งหมดแบบเดียวกับวิธีรวมและวิธีจับคู่ เอาไฟล์หนังออกจากหน้า (พี่กันทัก 15 พ.ย. 2569 "มันควรอยู่ทั้งหมดนะ") */}
          {onClearAll && <button type="button" className="btn btn-ghost" style={{ height: 44, flex: "none" }} onClick={onClearAll} data-clear-all><IbTrash size={15} />ล้างทั้งหมด</button>}
          {/* ขนาดเท่าปุ่มจับคู่กับปุ่มรวมในแถบล่างเดียวกัน (พี่กันสั่ง 13 พ.ย. 2569 "ขอเเยกไฟล์ ใหญ่เท่าปุ่มจับคู่") */}
          <button type="button" className={"btn " + (why ? "btn-wait" : "btn-main")} style={{ height: 44, padding: "0 26px", fontSize: 15, flex: "none" }} aria-disabled={!!why || undefined} title={why}
            onClick={() => { if (!why) run(picks.map((p) => p.item), picks.map((p) => p.rowLabel), picks.map(() => "ask")); }} data-extract-start><IcExtract size={15} />แยกไฟล์ที่เลือก</button>
        </div>
      ) : (
        <div className="workbox">
          {xRun.labels.map((l, i) => {
            const st = xRun.result?.states[i] ?? (xRun.pct[i] >= 100 ? "done" : xRun.pct[i] > 0 || i === xRun.pct.findIndex((p) => p < 100) ? "working" : "queued");
            const word = st === "done" ? "เสร็จแล้ว" : st === "working" ? `กำลังทำ ${Math.round(xRun.pct[i])}%` : st === "conflict" ? "มีไฟล์ชื่อเดียวกันอยู่แล้ว" : st === "skipped" ? "ข้ามแล้ว" : st === "failed" ? "ไม่สำเร็จ" : st === "cancelled" ? "หยุดแล้ว" : st === "missing" ? "ไฟล์นี้ไม่มี" : xRun.result && !xRun.running ? "ไม่ได้แยก" : "รอคิว";
            return <div key={i} className="setrow" style={i === 0 ? { borderTop: 0 } : undefined}><div className="lbl">{l}</div><div className="small">{word}</div></div>;
          })}
          {xRun.running && <button type="button" className="btn btn-bad btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => infoApi.extractCancel()}><IbStop size={15} />หยุด</button>}
          {xRun.result && conflicts.length > 0 && (
            <>
              <div className="stat warn" data-conflict><CardIcon kind="warn" /><div><b>มีไฟล์ชื่อเดียวกันอยู่แล้ว</b>{conflicts.map((i) => <div key={i} style={{ overflowWrap: "anywhere" }}>ในที่เก็บมีไฟล์ {(xRun.result!.files[i] ?? "").split(/[\\/]/).pop()} อยู่แล้ว</div>)}<div>โปรแกรมไม่เขียนทับไฟล์เดิม</div></div></div>
              <div className="minirow" style={{ marginTop: 0 }}>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => resolve("skip")}>{conflicts.length > 1 ? `ข้ามทั้ง ${conflicts.length} ไฟล์` : "ข้ามไฟล์นี้"}</button>
                <button type="button" className="btn btn-main btn-sm" onClick={() => resolve("number")}>ตั้งชื่อใหม่ต่อท้ายเลข 2</button>
              </div>
            </>
          )}
          {xRun.result?.error && (
            <>
              {/* ข้อความจากเครื่องมือ (mkvextract ffmpeg) อยู่ในปุ่ม ⓘ ข้างหัวข้อ ประโยคบนการ์ดเป็นสาเหตุภาษาไทยที่แปลแล้ว (BUGS ข้อ 150) */}
              <div className="stat bad" data-extract-error><CardIcon kind="bad" /><div>{xRun.result.error.split(/ · |  /).map((l, i) => i === 0
                ? <b key={i}>{l}{xRun.result!.detail && <InfoTip title="ข้อความจากเครื่องมือ" tip={{ w: `บรรทัดสุดท้ายที่เครื่องมือพิมพ์ไว้ตอนหยุด\n${xRun.result!.detail}` }} noAbbr plain />}</b>
                : <div key={i}><Phr>{l}</Phr></div>)}</div></div>
              {/* ไม่สำเร็จแล้วเปลี่ยนที่เก็บได้ทันที ไม่ต้องย้อนกลับไปหน้าแรก (พี่กันทัก 15 พ.ย. 2569 "ไม่สำเร็จก็ไม่มีปุ่มให้เปลี่ยนชื่อเลยเหรอ") */}
              <div className="minirow" style={{ marginTop: 0 }}>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => retry()} data-extract-retry><IcRefresh size={15} />ลองใหม่</button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={changeDest} data-extract-redest><IcFolder size={15} />เปลี่ยนที่เก็บแล้วลองใหม่</button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setXRun(null)}><IbNext size={15} />กลับไปเลือกใหม่</button>
                {onClear && picks.length > 0 && <button type="button" className="btn btn-ghost btn-sm" onClick={clearAll} data-extract-clear><IbEraser size={15} />ล้างการเลือก</button>}
              </div>
            </>
          )}
          {xRun.result && !xRun.result.error && conflicts.length === 0 && (
            <>
              {(xRun.result.notes?.length ?? 0) > 0 && <div className="stat warn" data-extract-notes><CardIcon kind="warn" /><div><b>ตัดชื่อไฟล์ให้สั้นลง</b>{xRun.result.notes!.map((n, i) => <div key={i} style={{ overflowWrap: "anywhere" }}>{n}</div>)}</div></div>}
              {done > 0 && <div className="stat ok"><CardIcon kind="done" /><div><b>แยกครบ {doneFiles.length} ไฟล์</b>{doneFiles.map((f, i) => <div key={i} style={{ overflowWrap: "anywhere" }}>{f.split(/[\\/]/).pop()}</div>)}</div></div>}
              <div className="minirow" style={{ marginTop: 0 }}>
                {done > 0 && <button type="button" className="btn btn-ok btn-sm" onClick={() => { const f = xRun.result!.files.find((f, i) => f && xRun.result!.states[i] === "done"); if (f) api.revealMovie(f).catch(() => {}); }}><IcFolder size={15} />เปิดโฟลเดอร์ที่เก็บ</button>}
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setXRun(null)}><IbNext size={15} />แยกอย่างอื่นต่อ</button>
                {onClear && picks.length > 0 && <button type="button" className="btn btn-ghost btn-sm" onClick={clearAll} data-extract-clear><IbEraser size={15} />ล้างการเลือก</button>}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
