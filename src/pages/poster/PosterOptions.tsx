/* ตัวเลือกสามกลุ่ม แถวปุ่มเริ่ม และสถานะงาน
   แยกจาก PosterPage.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 8) เนื้อโค้ดยกมาทั้งก้อน */
import { CardIcon, Keep, Phr, Seg } from "../../components/ui";
import { fmtSize } from "../../lib/format";
import { IbStop, IbTrash, IcPoster, IcRefresh } from "../../components/icons";
import { Check, DoneCard, Radio, fmtEta } from "./parts";
import type { PoCtx } from "./posterCtx";

export default function PosterOptions({ pg }: { pg: PoCtx }) {
  const { blocked, checkOutput, checkSource, clearAll, mode, movie, original, output, p, pct, posterShort, pressStart, run, runBox, runMode, setAck, setAskMp4, setAskStop, setDrop, setOne, setRun, setRunMore, startLabel, working } = pg;
  return (
    <>
        {/* ตัวเลือก 3 กลุ่ม ตรงแนวกับ 3 ช่องข้างบน · ชื่อกลุ่มแคลร์ตั้ง */}
        <div className="three">
          <div className="card" data-opt="check">
            <h3>ตรวจไฟล์</h3>
            <div className="opts">
              <Check on={checkSource} onChange={(v) => setOne({ checkSourceBefore: v })} title={mode === "cover" ? "ตรวจไฟล์ก่อนเปลี่ยนรูปแนบ" : "ตรวจไฟล์ต้นทางก่อนครอบ"} note="ถ้าไฟล์เสียอยู่แล้วจะบอกก่อนลงมือ" disabled={working} />
              <Check on={checkOutput} onChange={(v) => setOne({ checkOutputAfter: v })} title={mode === "cover" ? "ตรวจรูปแนบหลังเปลี่ยนเสร็จ" : "ตรวจไฟล์ใหม่หลังครอบเสร็จ"} note={mode === "cover" ? "ดึงปกออกมาเทียบกับรูปที่ทำทุกไบต์" : "เทียบว่าภาพ เสียง และซับครบเท่าต้นทาง"} disabled={working} />
            </div>
          </div>
          <div className="card" data-opt="original">
            <h3>ไฟล์เดิมหลังครอบ</h3>
            <div className="opts" title={mode === "cover" ? "ไฟล์เป็น MKV อยู่แล้ว เปลี่ยนแค่รูปแนบ ไม่มีไฟล์เดิมแยก" : undefined}>
              <Radio on={original === "keep"} onChange={() => setOne({ originalAfter: "keep" })} disabled={working || mode === "cover"}
                title={`เก็บไฟล์เดิมไว้ ย้ายไปโฟลเดอร์ "ไฟล์เดิม"`} note={movie ? `ปลอดภัยที่สุด แต่ใช้พื้นที่เพิ่ม ${fmtSize(movie.size)}` : "ปลอดภัยที่สุด แต่ใช้พื้นที่เพิ่มเท่าไฟล์หนัง"} />
              <Radio on={original === "trash"} onChange={() => setOne({ originalAfter: "trash" })} disabled={working || mode === "cover"}
                title="ลบไฟล์เดิมหลังตรวจไฟล์ใหม่ผ่านแล้ว" note={mode === "cover" ? "ไฟล์เป็น MKV อยู่แล้ว ไม่มีไฟล์เดิมแยก" : "ไม่ลบถ้าไฟล์ใหม่ตรวจไม่ผ่าน"} />
            </div>
          </div>
          <div className="card" data-opt="output">
          <h3>ไฟล์ที่ได้</h3>
          <div>
            <Seg label="ไฟล์ที่ได้" value={output} onChange={(v) => { setDrop([]); setAck([]); setOne({ outputFormat: v }); if (v === "mp4" && movie?.streams.some((x) => x.mp4 === "no" || x.mp4 === "style")) setAskMp4("pick"); }}
              disabledReason={working ? "รอให้งานที่ทำอยู่เสร็จก่อน" : undefined}
              options={[{ value: "mkv", label: "MKV (แนะนำ)" }, { value: "mp4", label: "MP4" }]} />
            <div className="small" style={{ marginTop: 8 }}><Phr>{"MKV ใส่ซับและเสียงได้ทุกแบบ ส่วน MP4 ปกขึ้นเป็นไอคอนใน Windows ได้เลยโดยไม่ต้องลง Icaros แต่ใส่ซับบางแบบไม่ได้"}</Phr></div>
          </div>
          </div>
        </div>

        <div className="three pactions">
          <div className="pact-msg">
            {/* สถานะงานอยู่ในแถบนี้ ไม่เพิ่มความสูงหน้า · รายละเอียดยาวเปิดดูจากปุ่ม · ยังไม่เริ่มก็แสดงแถบเปล่าไว้ ไม่มีอะไรโผล่ทีหลัง */}
            {run.state === "idle" && (
              <div className="runline idle" data-run-idle>
                <div className="runtxt">
                  {/* ที่ว่างไม่พอขึ้นแทนคำว่ายังไม่เริ่ม บรรทัดเดียวเท่าเดิม แถบไม่สูงขึ้น (BUGS ข้อ 94) */}
                  <div className="runl1" style={posterShort ? { color: "#94680f" } : undefined} data-space-short={posterShort ? "" : undefined}>{posterShort ?? "ยังไม่เริ่ม 0%"}</div>
                  <div className="bar" role="progressbar" aria-label="ความคืบหน้า" aria-valuenow={0} aria-valuemin={0} aria-valuemax={100}><i style={{ width: 0 }} /></div>
                </div>
              </div>
            )}
            {run.state === "working" && (
              <div ref={runBox} className="runline" data-run="working">
                <div className="runtxt">
                  <div className="runl1">{run.progress?.phase ?? "กำลังเริ่ม…"} {pct}%{run.progress?.eta != null && run.progress.eta > 0 ? <> เหลือราว <span className="nw">{fmtEta(run.progress.eta)}</span></> : null}{run.progress?.next ? <> ขั้นถัดไปคือ{run.progress.next}</> : null}</div>
                  <div className="bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${pct}%` }} /></div>
                </div>
                {/* เปลี่ยนรูปแนบแก้ไฟล์เดิมตรง ๆ หยุดได้เฉพาะช่วงตรวจไฟล์ต้นทาง (ยังไม่แตะไฟล์) · ช่วงแก้ไฟล์ใช้ไม่กี่วินาที หยุดกลางทางไม่ได้ */}
                {runMode === "cover" && !(run.progress?.phase ?? "กำลังตรวจไฟล์ต้นทาง").startsWith("กำลังตรวจไฟล์ต้นทาง")
                  ? <div className="small" data-nostop>หยุดกลางทางไม่ได้</div>
                  : <button type="button" className="btn btn-bad btn-sm" onClick={() => setAskStop(true)}><IbStop size={15} />หยุด</button>}
              </div>
            )}
            {run.state === "done" && <div ref={runBox} className="runline ok" data-run="done" role="status"><DoneCard r={run.result} onShelf={() => p.onPage("shelf")} onClose={() => setRun({ state: "idle" })} onMore={setRunMore} /></div>}
            {run.state === "failed" && (
              <div ref={runBox} className={"runline " + (run.problem.kind === "cancelled" ? "warn" : "bad")} data-run="failed" role="alert">
                <CardIcon kind={run.problem.kind === "cancelled" ? "warn" : "bad"} />
                <div className="runtxt" title={run.problem.detail.join(" ")}><b>{run.problem.title}</b><div className="runl2">{run.problem.detail[0]}</div></div>
                {run.problem.detail.length > 1 && <button type="button" className="btn btn-ghost btn-sm" data-run-more onClick={() => setRunMore({ title: run.problem.title, lines: run.problem.detail })}>รายละเอียด</button>}
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => pressStart()}><IcRefresh size={15} />ลองใหม่</button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRun({ state: "idle" })} data-run-close>ปิด</button>
              </div>
            )}
          </div>
          <div className="pact-btns">
          <button type="button" className={"btn " + (working ? "btn-wait" : "btn-ghost")} style={{ height: 44 }} aria-disabled={working || undefined} title={working ? "รอให้งานที่ทำอยู่เสร็จก่อน" : undefined} onClick={clearAll}><IbTrash size={15} />ล้างทั้งหมด</button>
          <button type="button" className={"btn " + (blocked || working ? "btn-wait" : "btn-main")} style={{ height: 44, padding: "0 9px", fontSize: 14, flex: 1 }}
            aria-disabled={!!blocked || working || undefined} title={blocked ?? undefined} onClick={() => pressStart()} data-start><Keep icon={<IcPoster size={15} />} all={["กำลังทำ…", startLabel]}>{working ? "กำลังทำ…" : startLabel}</Keep></button>
          </div>
        </div>
    </>
  );
}
