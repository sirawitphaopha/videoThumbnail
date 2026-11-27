/* กล่องอธิบายวิธี คำเตือนก่อนเริ่ม และสถานะงาน
   แยกจาก AvPage.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 2) เนื้อโค้ดยกมาทั้งก้อน */
import { CardIcon, Phr } from "../../components/ui";
import { fmtDuration } from "../../lib/format";
import { ftName } from "../../lib/ftypes";
import { setAv } from "../../lib/avJob";
import { IbSwap, IbTrash, IbBack, IcGraph } from "../../components/icons";
import { KIND_WORD, RunCard, baseName, rowText } from "./parts";
import { patch, removeAdded } from "./trackOps";
import type { AvCtx } from "./avCtx";

export default function AvNotes({ pg }: { pg: AvCtx }) {
  const { av, covers, output, loadSavedPairs, longer, method, miErr, mp4Bad, mp4Style, nth, p, pairable, paired, pairsNotInTable, pct, pressStart, refAudio, run, runBox, savedPairs, setAskStop, setDelayFor, vtts, working, xRawWord } = pg;
  return (
    <>
        {/* กล่องอธิบายของวิธีที่เลือก อยู่ที่เดิมในหน้า ตัวเลือกวิธีย้ายไปตรึงล่างสุด (BUGS ข้อ 68) */}
        {method !== "merge" && <div className="card" data-method-notes>
          {method === "extract" && <div className="stat info" data-xinfo><CardIcon kind="info" /><div><b>ไฟล์หนังไม่ถูกแตะ</b>
            <Phr>{`ติ๊กแทร็กในตารางหรือไฟล์แนบที่อยากได้ แล้วกดแยก แต่ละชิ้นออกมาเป็นไฟล์ของมันเองโดยไม่แปลงใหม่ คุณภาพจึงเท่าเดิม ${xRawWord ? `ส่วนภาพเลือกได้ที่แถวภาพว่าจะเป็นไฟล์ MKV ที่มีแต่ภาพ หรือสตรีม ${xRawWord} ล้วน` : "ส่วนภาพแยกออกมาเป็นไฟล์ MKV ที่มีแต่ภาพ"}`}</Phr>
            {miErr && <div className="fontmiss" style={{ marginTop: 4 }}><Phr>{`อ่านข้อมูลแทร็กไม่ได้ ${miErr}`}</Phr></div>}</div></div>}
          {method === "pair" && <div className="stat info"><CardIcon kind="info" /><div><b>ไฟล์หนังไม่ถูกแตะ</b>
            <Phr>{`จับคู่ได้เฉพาะเสียงกับซับที่เพิ่ม (${pairable.length} ไฟล์) ส่วนการแปลงชนิด เอาแทร็กออก เรียงลำดับ และใส่ปก ทำได้เฉพาะตอนรวม ดีเลย์ใช้ได้ทั้งสองแบบ และไฟล์ที่จับคู่อยู่โฟลเดอร์ไหนก็ได้ โปรแกรมจำไว้กับหนังในคลัง`}</Phr></div></div>}
          {method === "pair" && pairsNotInTable.length > 0 && <div className="stat warn" style={{ marginTop: 8 }} data-pairs-saved><CardIcon kind="warn" /><div>
            <b>{`เรื่องนี้จับคู่ไว้แล้ว ${savedPairs.length} ไฟล์ และยังไม่อยู่ในตาราง ${pairsNotInTable.length} ไฟล์`}</b>
            <Phr>ถ้ากดจับคู่ไว้กับหนังเรื่องนี้ ชุดเดิมจะถูกแทนทั้งชุด ให้ใส่ไฟล์ที่จับคู่ไว้ลงตารางก่อนถ้าจะเก็บไว้ด้วย</Phr>
            <div style={{ marginTop: 6 }}><button type="button" className="btn btn-ghost btn-sm" onClick={() => { void loadSavedPairs(); }} disabled={working} data-pairs-load>{`ใส่ไฟล์ที่จับคู่ไว้ ${pairsNotInTable.length} ไฟล์ลงตาราง`}</button></div></div></div>}
          {method === "pair" && paired && (paired.err ? <div className="stat bad" style={{ marginTop: 8 }}><CardIcon kind="bad" /><div><b>จับคู่ไม่สำเร็จ</b><Phr>{paired.err}</Phr></div></div>
            : <div className="stat ok" style={{ marginTop: 8 }} data-paired-ok><CardIcon kind="done" /><div><b>{`จับคู่ไว้ ${paired.n} ไฟล์แล้ว`}</b><Phr>เปิดเล่นพร้อมไฟล์ที่จับคู่ได้ที่แผงขวาของชั้นวาง และการบันทึกใหม่แทนการจับคู่เดิมของเรื่องนี้ทั้งชุด</Phr></div></div>)}
        </div>}


        {/* คำเตือนก่อนเริ่ม (ของงานรวม ตอนแยกไม่เกี่ยว) */}
        {method !== "extract" && mp4Bad.map((t) => (
          <div key={t.key} data-mp4warn>
            <div className="stat warn"><CardIcon kind="warn" /><div><b>{rowText(t, nth(t)).title} ที่เป็น {ftName(t.kind, t.codec, t.profile)} ใส่ใน MP4 ไม่ได้</b><Phr>{`${t.why ?? ""} ถ้าทำต่อ ${KIND_WORD[t.kind]}นี้จะหายจากไฟล์ใหม่`}</Phr></div></div>
            <div className="minirow" style={{ marginTop: 6 }}>
              <button type="button" className="btn btn-main btn-sm" onClick={() => setAv((s) => ({ once: { ...s.once, output: "mkv" } }))}><IbBack size={15} />กลับไปใช้ MKV</button>
              {/* แทร็กเดิมที่ตั้งแปลงแบบเพิ่มคู่ เปลี่ยนเป็นแทนที่ ได้ทั้งแทร็กที่แปลงและ MP4 (ผู้ช่วยตรวจขั้น 10 ข้อ 2) */}
              {t.convert && t.inMovie && (t.pair ?? true) && t.convert.codec !== "wv"
                ? <button type="button" className="btn btn-ghost btn-sm" onClick={() => patch(t.key, { pair: false })} data-mp4replace><IbSwap size={15} />ใช้แทร็กที่แปลงแทนที่แทร็กเดิม</button>
                : t.kind !== "video" && <button type="button" className="btn btn-ghost btn-sm" onClick={() => (t.inMovie ? patch(t.key, { keep: false, default: false }) : removeAdded(t.src))}><IbTrash size={15} />เอา{KIND_WORD[t.kind]}นี้ออก</button>}
            </div>
          </div>
        ))}
        {/* MP4 เก็บปกนอนไม่ได้ ฝั่ง Rust ข้ามแล้วจดในผลอย่างเดียว เตือนตั้งแต่ก่อนกดรวม (merge/run.rs · AUDIT ข้อ 82) */}
        {method === "merge" && output === "mp4" && covers.cover_land.mode === "new" && <div className="stat warn" data-mp4land><CardIcon kind="warn" /><div><b>MP4 เก็บได้แค่ปกตั้ง ปกนอนที่ใส่จะไม่ได้ใส่ในไฟล์</b><Phr>ถ้าอยากเก็บปกนอนด้วยให้เลือก MKV</Phr></div></div>}
        {/* MP4 เก็บไฟล์แนบไม่ได้ (ฟอนต์ ไฟล์อื่น ที่ไม่ใช่ปก) เตือนก่อนรวม (AUDIT ข้อ 96) */}
        {method === "merge" && output === "mp4" && (() => { const n = pg.movie?.attachments.filter((a) => !/^cover(_land)?\./i.test(a.name)).length ?? 0; return n > 0 && <div className="stat warn" data-mp4attach><CardIcon kind="warn" /><div><b>{`MP4 เก็บไฟล์แนบไม่ได้ ไฟล์แนบ ${n} ไฟล์จะไม่อยู่ในไฟล์ใหม่`}</b><Phr>ถ้าอยากเก็บไฟล์แนบไว้ด้วยให้เลือก MKV</Phr></div></div>; })()}
        {method !== "extract" && mp4Style.length > 0 && <div className="stat info"><CardIcon kind="info" /><div><b>ซับ ASS ใน MP4 สีกับฟอนต์หาย เหลือตัวหนังสือล้วน</b><Phr>{`${mp4Style.length} แทร็ก ใช้ MKV ถ้าต้องการเก็บสีกับตำแหน่ง`}</Phr></div></div>}
        {method !== "extract" && vtts.length > 0 && <div className="stat info" data-vttnote><CardIcon kind="info" /><div><b>ซับ VTT จะแปลงเป็น SRT ก่อนรวม</b><Phr>{`${vtts.map((t) => baseName(t.src)).join(", ")} เพราะโปรแกรมเล่นหลายตัวยังไม่รู้จัก VTT ที่อยู่ใน MKV ส่วนข้อความกับเวลาเหมือนเดิม`}</Phr></div></div>}
        {method !== "extract" && longer.map((t) => (
          <div key={t.key} className="stat warn" data-longer><CardIcon kind="warn" /><div><b>{baseName(t.src)} {t.longerBy! > 0 ? "ยาวกว่า" : "สั้นกว่า"}หนัง {fmtDuration(Math.abs(t.longerBy!))}</b>
            <Phr>อาจเป็นเสียงจากหนังต่างฉบับ โปรดตั้งความเร็วเสียงหรือตรวจสอบว่าเลือกไฟล์ถูกต้อง แต่ยังรวมไฟล์ต่อได้ตามปกติ</Phr>
            {t.kind === "audio" && refAudio && <div style={{ marginTop: 6 }}><button type="button" className="btn btn-ghost btn-sm" onClick={() => { if (!working) setDelayFor(t.key); }} data-longer-check><IcGraph size={15} />ให้โปรแกรมเทียบเสียงกับหนัง</button></div>}</div></div>
        ))}

        {/* สถานะงาน */}
        {run.state !== "idle" && <div ref={runBox} className="card workbox" data-run={run.state}><RunCard run={run} pct={pct} runMovie={av.runMovie} onStop={() => setAskStop(true)} onShelf={() => p.onPage("shelf")} onGraph={p.onGraph} onRetry={() => pressStart()} /></div>}
    </>
  );
}
