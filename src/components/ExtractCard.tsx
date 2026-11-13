/* การ์ดแยกไฟล์ออกจากหนัง (BUGS ข้อ 35 · พี่กันเคาะ 10 พ.ย. 2569 "ปุ่มเเยก กับรวม เอาที่เดียวกันในหน้นี้เลย")
   เดิมอยู่ท้ายหน้า MediaInfo ติ๊กหัวหมวดแล้วกดแยก พี่กันหาไม่เจอ ย้ายมาอยู่หน้าเสียงและซับ ที่เดียวกับงานรวม
   แยกทีละชิ้น หยุดได้ ชื่อชนถามก่อน ไม่เขียนทับ ไฟล์หนังเดิมไม่ถูกแตะ (extract.rs) · ชิ้นที่ติ๊กส่งมาจากหน้าที่ใช้การ์ดนี้ */
import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { api, infoApi, inApp, pickFolder, type ExtractItem, type ExtractResult } from "../lib/api";
import { useElsewhere } from "../lib/elsewhere";
import { CardIcon, Phr } from "./ui";
import { spaceShort, useFree } from "../lib/drives";
import { IbNext, IbPencil, IbStop, IcExtract, IcFolder, IcRefresh } from "./icons";

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

export default function ExtractCard({ path, picks, busy, srcSize }: { path: string; picks: ExtractPick[]; busy?: string; srcSize?: number }) {
  const [folder, setFolder] = useState("");
  /** ชิ้นที่กดแยกรอบนี้ตรึงไว้ · ติ๊กเพิ่มหรือเอาออกระหว่างการ์ดชื่อชนค้าง กดตั้งชื่อใหม่แล้วต้องแยกชิ้นเดิม (ผู้ช่วยตรวจโค้ดเจอ ตอนอยู่หน้า MediaInfo) */
  const [xRun, setXRun] = useState<{ items: ExtractItem[]; labels: string[]; pct: number[]; result: ExtractResult | null; running: boolean } | null>(null);
  const elsewhere = useElsewhere(infoApi.extractRunning, !!xRun?.running);

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

  const run = async (items: ExtractItem[], labels: string[], policy: string[]) => {
    setXRun({ items, labels, pct: items.map(() => 0), result: null, running: true });
    try {
      const result = await infoApi.extract(path, folder || null, items, policy);
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
  // ที่ว่างในโฟลเดอร์ที่เก็บ · สูตรเดียวกับ extract.rs ภาพใช้ราวขนาดหนัง ชิ้นอื่นหนึ่งในสี่ของหนัง อย่างน้อย 64 MB รวมทุกชิ้นที่ติ๊ก ไม่พอเตือนข้างปุ่มก่อนกด (BUGS ข้อ 94)
  const free = useFree(folder || null);
  const src = srcSize ?? 0, MB64 = 64 * 1024 * 1024;
  const need = src ? picks.reduce((s, p) => s + (p.item.kind === "video" ? src : Math.min(Math.max(src / 4, MB64), src + MB64)), 0) : 0;
  const short = picks.length ? spaceShort(free, need) : null;
  const why = busy ?? (!picks.length ? "ยังกดไม่ได้ ติ๊กอย่างน้อย 1 อย่างก่อน" : elsewhere ? "รองานแยกไฟล์ที่ทำอยู่ให้เสร็จก่อน" : short ?? undefined);

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
            {elsewhere ? <b data-extract-elsewhere>งานแยกไฟล์ที่เริ่มไว้ก่อนหน้ายังทำอยู่</b> : picks.length ? <b>เลือกไว้ {picks.length} อย่าง</b> : "ติ๊กแทร็กในตารางข้างบนเพื่อแยกเป็นไฟล์"}
            {elsewhere ? <div className="hint" style={{ color: "#94680f", margin: 0 }}>รอให้เสร็จก่อน หรือกดหยุด</div> : why && <div className="hint" style={{ color: "#94680f", margin: 0 }}>{why}</div>}</div>
          {elsewhere && <button type="button" className="btn btn-bad btn-sm" onClick={() => infoApi.extractCancel()}><IbStop size={15} />หยุดงานนั้น</button>}
          {/* ที่เก็บอยู่ข้างปุ่มแยก กรอบสีโทน ตัวหนา เห็นชัดก่อนกด (BUGS ข้อ 92 พี่กันสั่ง 13 พ.ย. 2569 "ขอที่เก็บ ข้างๆปุ่มเเยก เเละเด่นๆ")
              บรรทัดเดียวเสมอ ที่อยู่ยาวย่อตรงกลาง เก็บไดรฟ์กับโฟลเดอร์ปลายทางไว้ ชี้แล้วเห็นที่อยู่เต็ม แถบล่างไม่สูงขึ้น */}
          {/* ที่เก็บกับปุ่มเปลี่ยนรวมเป็นปุ่มเดียว กดตรงไหนก็เลือกโฟลเดอร์ใหม่ ฝั่งขวามีไอคอนดินสอกับคำว่าเปลี่ยน (พี่กันสั่ง 13 พ.ย. 2569 "ใส่ icon หน่อย เเละที่อยู่ อยากให้กดเปลี่ยนได้ เเม้ปุ่มเปลี่ยนที่เก็บจะเเยกไว้ เเต่อยากให้รวมกัน") */}
          <button type="button" className="xdest" title={folder ? `เก็บที่ ${folder}  กดเพื่อเปลี่ยนที่เก็บ` : "กดเพื่อเลือกที่เก็บ"} onClick={async () => { const f = await pickFolder("เลือกที่เก็บไฟล์ที่แยก"); if (f) setFolder(f); }} data-extract-dest data-extract-folder>
            <IcFolder size={16} /><span>เก็บที่</span><b>{folder ? midPath(folder) : "—"}</b>
            <i className="xdest-chg" aria-hidden="true"><IbPencil size={14} />เปลี่ยน</i></button>
          {/* ขนาดเท่าปุ่มจับคู่กับปุ่มรวมในแถบล่างเดียวกัน (พี่กันสั่ง 13 พ.ย. 2569 "ขอเเยกไฟล์ ใหญ่เท่าปุ่มจับคู่") */}
          <button type="button" className={"btn " + (why ? "btn-wait" : "btn-main")} style={{ height: 44, padding: "0 26px", fontSize: 15, flex: "none" }} aria-disabled={!!why || undefined} title={why}
            onClick={() => { if (!why) run(picks.map((p) => p.item), picks.map((p) => p.rowLabel), picks.map(() => "ask")); }} data-extract-start><IcExtract size={15} />แยกไฟล์ที่เลือก</button>
        </div>
      ) : (
        <div className="workbox">
          {xRun.labels.map((l, i) => {
            const st = xRun.result?.states[i] ?? (xRun.pct[i] >= 100 ? "done" : xRun.pct[i] > 0 || i === xRun.pct.findIndex((p) => p < 100) ? "working" : "queued");
            const word = st === "done" ? "เสร็จแล้ว" : st === "working" ? `กำลังทำ ${Math.round(xRun.pct[i])}%` : st === "conflict" ? "มีไฟล์ชื่อเดียวกันอยู่แล้ว" : st === "skipped" ? "ข้ามแล้ว" : st === "failed" ? "ไม่สำเร็จ" : st === "cancelled" ? "หยุดแล้ว" : "รอคิว";
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
              <div className="stat bad"><CardIcon kind="bad" /><div>{xRun.result.error.split(/ · |  /).map((l, i) => i === 0 ? <b key={i}>{l}</b> : <div key={i}><Phr>{l}</Phr></div>)}</div></div>
              <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => run(xRun.items, xRun.labels, xRun.items.map(() => "ask"))}><IcRefresh size={15} />ลองใหม่</button>
            </>
          )}
          {xRun.result && !xRun.result.error && conflicts.length === 0 && (
            <>
              {done > 0 && <div className="stat ok"><CardIcon kind="done" /><div><b>แยกครบ {done} ไฟล์</b>{xRun.result.files.filter((f, i) => f && xRun.result!.states[i] === "done").map((f, i) => <div key={i} style={{ overflowWrap: "anywhere" }}>{f!.split(/[\\/]/).pop()}</div>)}</div></div>}
              <div className="minirow" style={{ marginTop: 0 }}>
                {done > 0 && <button type="button" className="btn btn-ok btn-sm" onClick={() => { const f = xRun.result!.files.find((f, i) => f && xRun.result!.states[i] === "done"); if (f) api.revealMovie(f).catch(() => {}); }}><IcFolder size={15} />เปิดโฟลเดอร์ที่เก็บ</button>}
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setXRun(null)}><IbNext size={15} />แยกอย่างอื่นต่อ</button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
