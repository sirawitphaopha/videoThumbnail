/* แถววิธีกับปุ่มเริ่มที่ตรึงล่างสุดของจอ
   แยกจาก AvPage.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 2) เนื้อโค้ดยกมาทั้งก้อน */
import ExtractCard from "./ExtractCard";
import InfoTip from "../../components/InfoTip";
import { Keep, Seg } from "../../components/ui";
import { fmtSize } from "../../lib/format";
import { kb } from "../../lib/popup";
import { setAv } from "../../lib/avJob";
import { IcExtract, IbTrash, IcLink, IcMix } from "../../components/icons";
import { BUSY } from "./parts";
import type { AvCtx } from "./avCtx";

export default function AvDock({ pg }: { pg: AvCtx }) {
  const { blocked, changed, fontOnly, fontFiles, clearAll, estimate, method, original, output, pairBlocked, pairSaving, pressStart, savePairs, setMethod, setPaired, settings, working, xPicks, xi } = pg;
  const movie = pg.movie!;
  return (
    <>
        {/* แถววิธีตรึงล่างสุดของจอ อยู่กรอบเดียวกับแถบปุ่ม เลื่อนหน้าไปไหนก็เปลี่ยนวิธีได้ (BUGS ข้อ 68 พี่กันสั่ง 12 พ.ย. 2569 "ตรึงไว้ล่างสุด") */}
        <div className="avdock">
            {/* หัววิธีกับการ์ดวิธีอยู่แถวเดียวกัน (พี่กันสั่ง 12 พ.ย. 2569 "ขอเเถวเดียวกัน")
                การ์ดใหญ่สามใบแยกกันให้เด่น มีชื่ออังกฤษในวงเล็บแบบ MKVToolNix (พี่กันสั่ง "วงเล็บภาษษอังกิดที่มันคล้ายกับ toolnix เเละขยายการฺดห้ใหญ่กว่านี้ เเยกสามปุ่ม ให้เด่น") */}
            <div className="avm-row" data-method={method}><h3 style={{ margin: 0 }}>วิธี</h3>
              <div className="avm-cards" role="radiogroup" aria-label="วิธี">
                {([["merge", <IcMix size={20} />, "รวมเข้าไฟล์หนัง", "Merge", "ใส่เสียง ซับ และปก ทำเป็นไฟล์ใหม่"],
                  ["pair", <IcLink size={20} />, "จับคู่ไว้ ไม่รวม", "Pair", "จำไฟล์ไว้กับหนัง ไฟล์หนังไม่ถูกแตะ"],
                  ["extract", <IcExtract size={20} />, "แยกออกจากหนัง", "Extract", "แทร็กที่ติ๊กออกมาเป็นไฟล์ของมันเอง"]] as const).map(([v, icon, name, en, desc]) => (
                  <button key={v} type="button" role="radio" aria-checked={method === v} aria-disabled={working || undefined} title={working ? BUSY : undefined}
                    className={"avm-card" + (method === v ? " on" : "")} onClick={() => { if (working) return; setMethod(v); setPaired(null); }} data-mode={v}>
                    <span className="avm-ic">{icon}</span>
                    <span className="avm-tx"><b>{name} <i>({en})</i></b><span className="avm-desc">{desc}</span></span>
                  </button>
                ))}
              </div></div>
        {/* การ์ดแยกไฟล์ตรึงล่างสุดของจอแบบแถบปุ่มรวม ไม่ต้องเลื่อนหา (BUGS ข้อ 35 ต่อ พี่กันสั่ง 12 พ.ย. 2569 "ตัวนี้ควรอยู่ล่าสุดตลอด") */}
        {method === "extract" && <div className="avfoot avxfoot"><ExtractCard path={movie.path} picks={xPicks} onClear={() => setAv(() => ({ xPick: [] }))} onClearAll={working ? undefined : clearAll} busy={working ? BUSY : undefined} srcSize={movie.size} pattern={settings?.extractPattern} batchable={!!xi} /></div>}
        {method !== "extract" && <div className="avfoot">
          {method === "pair" ? (<>
            {pairBlocked && <div className="hint" style={{ color: "#94680f", margin: 0 }} data-blocked>{pairBlocked}</div>}
            {/* ล้างทั้งหมดมีทุกวิธี ไม่ใช่แค่วิธีรวม (พี่กันทัก 15 พ.ย. 2569 "ปุ่มล้างทั้งหมด ในหน้าเสียงเเละซับ มันอยู่เเค่ merge น่ะ มันควรอยู่ทั้งหมดนะ") */}
            <button type="button" className={"btn " + (working ? "btn-wait" : "btn-ghost")} style={{ height: 44 }} aria-disabled={working || undefined} title={working ? BUSY : undefined} onClick={clearAll} data-clear-all><IbTrash size={15} />ล้างทั้งหมด</button>
            <button type="button" className={"btn " + (pairBlocked || pairSaving ? "btn-wait" : "btn-main")} style={{ height: 44, padding: "0 26px", fontSize: 15 }}
              aria-disabled={!!pairBlocked || pairSaving || undefined} title={pairBlocked ?? undefined} onClick={savePairs} data-pair-save><Keep icon={<IcLink size={15} />} all={["จับคู่ไว้กับหนังเรื่องนี้", "กำลังจับคู่…"]}>{pairSaving ? "กำลังจับคู่…" : "จับคู่ไว้กับหนังเรื่องนี้"}</Keep></button>
          </>) : (<>
          {/* ชนิดไฟล์กับไฟล์เดิมอยู่ในแถบล่างที่ตรึงไว้ แทร็กยาวแค่ไหนก็เห็นข้างปุ่มรวม (BUGS ข้อ 63 พี่กันเลือกแบบ 2 จากมอคอัป 12 พ.ย. 2569 "มอคอัป เอาข้อสอง")
              เดิมเป็นการ์ดไฟล์ที่ได้และไฟล์เดิมใต้การ์ดวิธี ถูกดันลงล่างเมื่อแทร็กเยอะ */}
          <div className="avfoot-out" data-outopts>
            <Seg label="ไฟล์ที่ได้" value={output} onChange={(v) => setAv((s) => ({ once: { ...s.once, output: v } }))} disabledReason={working ? BUSY : undefined}
              options={[{ value: "mkv", label: "MKV (แนะนำ)" }, { value: "mp4", label: "MP4" }]} />
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div className={"chk" + (working ? " off" : "")} aria-checked={original === "keep"} {...kb(() => { if (!working) setAv((s) => ({ once: { ...s.once, original: "keep" } })); })} role="radio">
                <span className={"radio" + (original === "keep" ? " on" : "")} /><span>เก็บไฟล์เดิมไว้</span></div>
              <div className={"chk" + (working ? " off" : "")} aria-checked={original === "trash"} {...kb(() => { if (!working) setAv((s) => ({ once: { ...s.once, original: "trash" } })); })} role="radio">
                <span className={"radio" + (original === "trash" ? " on" : "")} /><span>ลบไฟล์เดิมหลังตรวจผ่าน</span></div>
            </div>
            {/* แยกหัวข้อละตัวเลือก (BUGS ข้อ 97 พี่กันถาม 13 พ.ย. 2569 "มันยาวมาก ควรเป็นบูลเล็ตไหม" · เดิมรวมสี่ตัวเลือกเป็นย่อหน้าเดียว) */}
            <InfoTip title="ชนิดไฟล์กับไฟล์เดิม" tip={{ w: "เลือกชนิดไฟล์ใหม่ และสิ่งที่จะทำกับไฟล์เดิม", o: [
              ["MKV", "ไฟล์หนังที่ใส่ของได้ครบที่สุด", "ใส่เสียงและซับได้ทุกแบบ เก็บได้ทั้งปกตั้งและปกนอน\nและเก็บฟอนต์ของซับไว้ในไฟล์ได้", "ไอคอนไฟล์จะเป็นรูปปกเมื่อลง Icaros ก่อน"],
              ["MP4", "ไฟล์หนังที่เปิดได้แทบทุกเครื่อง", "ไอคอนไฟล์เป็นรูปปกได้เลยโดยไม่ต้องลง Icaros", "เก็บปกได้แค่ปกตั้ง และใส่ซับบางแบบไม่ได้\nเก็บฟอนต์ของซับไว้ในไฟล์ไม่ได้"],
              ["เก็บไฟล์เดิมไว้", "ย้ายไฟล์เดิมไปโฟลเดอร์ชื่อไฟล์เดิมข้างไฟล์หนัง", "ไฟล์เดิมอยู่ครบ ย้อนกลับได้ทุกเมื่อ", "ใช้ที่ว่างเพิ่มราวขนาดหนังหนึ่งเรื่อง"],
              ["ลบไฟล์เดิมหลังตรวจผ่าน", "ลบเฉพาะเมื่อตรวจไฟล์ใหม่ผ่านแล้ว โดยย้ายไปถังขยะของ Windows", "ไม่ใช้ที่ว่างเพิ่ม และกู้คืนจากถังขยะได้", "ล้างถังขยะแล้วกู้คืนไม่ได้"],
            ], r: "MKV กับเก็บไฟล์เดิมไว้\nยกเว้นอยากได้ไอคอนเป็นรูปปกโดยไม่ต้องลง Icaros" }} />
          </div>
          {/* ขนาดไฟล์ที่คาดอยู่ข้างปุ่มรวมเมื่อกดได้ ตอนกดไม่ได้เหตุผลขึ้นแทนที่ตรงนี้ */}
          {!blocked && !working && <div className="small avfoot-sum" data-summary title={`ไฟล์ใหม่ ${movie.name}.${output} ขนาดราว ${fmtSize(Math.max(0, estimate))} ${(settings?.checkOutputAfter ?? true) ? "และจะตรวจไฟล์ใหม่หลังรวมเสร็จ" : "และไม่ได้ตั้งให้ตรวจไฟล์ใหม่ ตั้งได้ที่หน้าตั้งค่า"}`}>{`ไฟล์ใหม่ .${output} ราว ${fmtSize(Math.max(0, estimate))}${changed ? "" : fontOnly ? ` ฝังฟอนต์เพิ่ม ${fontFiles.length} ไฟล์` : " แทร็กเหมือนไฟล์เดิม"}`}</div>}
          {blocked && !working && <div className="hint" style={{ color: "#94680f", margin: 0 }} data-blocked>{blocked}</div>}
          <button type="button" className={"btn " + (working ? "btn-wait" : "btn-ghost")} style={{ height: 44 }} aria-disabled={working || undefined} title={working ? BUSY : undefined} onClick={clearAll}><IbTrash size={15} />ล้างทั้งหมด</button>
          <button type="button" className={"btn " + (blocked || working ? "btn-wait" : "btn-main")} style={{ height: 44, padding: "0 26px", fontSize: 15 }}
            aria-disabled={!!blocked || working || undefined} title={blocked ?? undefined} onClick={() => pressStart()} data-start><Keep icon={<IcMix size={15} />} all={["กำลังรวม…", "รวมเป็น MP4", "รวมเข้าไฟล์หนัง"]}>{working ? "กำลังรวม…" : output === "mp4" ? "รวมเป็น MP4" : "รวมเข้าไฟล์หนัง"}</Keep></button>
          </>)}
        </div>}
        </div>
    </>
  );
}
