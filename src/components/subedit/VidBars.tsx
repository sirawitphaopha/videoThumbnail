/* แถบเครื่องมือซ้ายของภาพ กับเมนูคลิกขวา แถบเลื่อนเวลา และแถบปุ่มใต้ภาพ
   แยกจาก SubVideo.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 10) เนื้อโค้ดยกมาทั้งก้อน */
import { fmtMs, getVid, seek, setAuto } from "../../lib/vidFrames";
import InfoTip from "../InfoTip";
import { IbCross, IbDrag, IbFrameNext, IbFramePrev, IbMovePos, IbPlay, IbPlayLine, IbStop } from "../icons";
import VideoSlider from "./VideoSlider";
import { getVidPlay, stopVidPlay } from "../../lib/vidPlay";
import { FrameMenu, VideoMenu } from "./VideoMenus";
import { VISUAL_TIP } from "./vidShared";
import type { VdCtx } from "./vidCtx";
import { keyLabel } from "../../lib/keymap";

export function VidToolbar({ pg }: { pg: VdCtx }) {
  const { ass, selEvents, setTool, toMove, toggleMove, tool } = pg;
  const dragWhy = !ass ? "ไฟล์ SRT ไม่มีแท็กตำแหน่ง เปลี่ยนเป็น ASS ก่อน" : undefined;
  return (
    <>
        <div className="se-vtoolbar" role="toolbar" aria-label="เครื่องมือบนภาพ" data-vtoolbar>
          <button type="button" className={"btn btn-ghost btn-sm se-vstep" + (tool === "cross" ? " pressed" : "")} aria-pressed={tool === "cross"} title="กากบาท (A) ชี้ภาพแล้วเห็นพิกัด ดับเบิลคลิกย้ายบรรทัดที่เลือกมาตรงนั้น" aria-label="เครื่องมือกากบาท" onClick={() => setTool("cross")} data-vtool="cross"><IbCross size={15} /></button>
          <button type="button" className={"btn btn-ghost btn-sm se-vstep" + (tool === "drag" ? " pressed" : "") + (dragWhy ? " btn-wait" : "")} aria-pressed={tool === "drag"} aria-disabled={!!dragWhy || undefined} title={dragWhy ?? "ลากจัดตำแหน่งคำบรรยาย (S) ลากจุดบนภาพแล้วซับย้ายตาม"} aria-label="เครื่องมือลากจัดตำแหน่ง" onClick={() => { if (!dragWhy) setTool("drag"); }} data-vtool="drag"><IbDrag size={15} /></button>
          {tool === "drag" && ass && <>
            <span className="se-vtsep" aria-hidden="true" />
            <button type="button" className={"btn btn-ghost btn-sm se-vstep" + (selEvents.length ? "" : " btn-wait")} aria-disabled={!selEvents.length || undefined}
              title={!selEvents.length ? "เลือกบรรทัดในตารางก่อน" : toMove ? "เปลี่ยนบรรทัดที่เลือกเป็น \\move ซับเลื่อนจากจุดเริ่มไปจุดปลายได้" : "เปลี่ยน \\move ของบรรทัดที่เลือกเป็น \\pos ซับอยู่กับที่"}
              aria-label={toMove ? "เปลี่ยนเป็น move" : "เปลี่ยนเป็น pos"} onClick={toggleMove} data-vtool="movepos" data-vtomove={toMove ? "1" : undefined}><IbMovePos size={15} /></button>
          </>}
          <span className="se-vtinfo"><InfoTip title="เครื่องมือบนภาพ" tip={VISUAL_TIP} /></span>
        </div>
    </>
  );
}

export function VidBar({ pg }: { pg: VdCtx }) {
  const { copyCoords, ctx, fitS, fr, keyDown, keys, noStep, onKey, p, playLine, playWhy, playing, pos, ready, resetPan, setCtx, snap, snapWhy, src, st, t, tNow, togglePlay, vp } = pg;
  return (
    <>
      {ctx && <FrameMenu x={ctx.x} y={ctx.y} at={ctx.at} pan={ctx.pan} why={snapWhy} where={src.kind === "dummy" ? "ในโฟลเดอร์ของไฟล์ซับ" : "ในโฟลเดอร์ของหนัง"} onClose={() => setCtx(null)} onSnap={snap} onCoords={copyCoords} onPan={resetPan} />}
      <VideoSlider pos={playing && vp.frame != null ? vp.frame : pos} max={fr ? (fr.count || t?.times.length || 1) - 1 : 0} keys={src.kind === "movie" ? keys.list : []}
        why={src.kind === "dummy" ? undefined : noStep} onKey={keyDown} onBeforeSeek={() => { if (getVidPlay().playing) stopVidPlay(false, true); }} />
      <div className="se-vbar" data-vbar>
        <button type="button" className={"btn btn-ghost btn-sm se-vstep" + (ready ? "" : " btn-wait")} aria-disabled={!ready || undefined} title={noStep ?? "ถอยหนึ่งเฟรม (ลูกศรซ้าย)"} aria-label="ถอยหนึ่งเฟรม" onClick={() => { if (!ready) return; const at = getVidPlay().playing ? null : pos!; stopVidPlay(); seek((at ?? getVid().pos ?? 0) - 1); }} data-vprev><IbFramePrev size={15} /></button>
        <button type="button" className={"btn btn-ghost btn-sm se-vstep" + (ready ? "" : " btn-wait")} aria-disabled={!ready || undefined} title={noStep ?? "เดินหนึ่งเฟรม (ลูกศรขวา)"} aria-label="เดินหนึ่งเฟรม" onClick={() => { if (!ready) return; const at = getVidPlay().playing ? null : pos!; stopVidPlay(); seek((at ?? getVid().pos ?? 0) + 1); }} data-vnext><IbFrameNext size={15} /></button>
        {/* เล่น เล่นเฉพาะบรรทัด หยุด ตามแถบใต้ภาพของ Aegisub (default_toolbar.json ส่วน video) · กดเล่นตอนกำลังเล่นแล้วหยุดแบบ VideoController::Play */}
        <button type="button" className={"btn btn-ghost btn-sm se-vstep se-vplay" + (playWhy ? " btn-wait" : "") + (playing ? " pressed" : "")} aria-disabled={!!playWhy || undefined} aria-pressed={playing}
          title={playWhy ?? (playing ? `กำลังเล่น กดอีกครั้งเพื่อหยุด (${keyLabel("vid.play")})${vp.err ? `  ${vp.err}` : ""}` : `เล่นหนังจากภาพนี้ เสียงจากแทร็กเดียวกับคลื่นเสียง (${keyLabel("vid.play")})`)} data-vplayerr={vp.err || undefined} aria-label="เล่นหนัง" onClick={() => { if (!playWhy) togglePlay(); }} data-vplay>
          <IbPlay size={15} /></button>
        <button type="button" className={"btn btn-ghost btn-sm se-vstep" + (playWhy || !p.ev ? " btn-wait" : "")} aria-disabled={!!playWhy || !p.ev || undefined}
          title={playWhy ?? (p.ev ? "เล่นเฉพาะช่วงของบรรทัดที่กำลังแก้ ตั้งแต่เฟรมแรกถึงเฟรมสุดท้ายของบรรทัด" : "ยังไม่ได้เลือกบรรทัด")} aria-label="เล่นเฉพาะบรรทัด" onClick={() => { if (!playWhy && p.ev) playLine(); }} data-vplayline>
          <IbPlayLine size={15} /></button>
        <button type="button" className={"btn btn-ghost btn-sm se-vstep" + (playing ? "" : " btn-wait")} aria-disabled={!playing || undefined}
          title={playing ? "หยุดเล่น ภาพค้างที่เฟรมที่เห็นอยู่" : "ยังไม่ได้เล่นหนัง"} aria-label="หยุด" onClick={() => { if (playing) stopVidPlay(); }} data-vstop>
          <IbStop size={15} /></button>
        <span className={"se-vpos" + (ready && onKey ? " key" : "")} title={ready ? (onKey ? "เฟรมนี้เป็น keyframe" : "เวลาของภาพ ขีด เลขเฟรม") : undefined} data-vpos data-vkey={ready && onKey ? "1" : undefined}>
          {ready ? `${fmtMs(tNow!)} - ${playing && vp.frame != null ? vp.frame : pos}` : st.load === "busy" ? `อ่านเวลาเฟรม ${st.dur > 0 ? Math.min(99, Math.round((st.readTo / st.dur) * 100)) : 0}%` : st.load === "err" ? "อ่านเวลาเฟรมไม่ได้" : "—"}
        </span>
        <button type="button" className={"btn btn-ghost btn-sm se-auto" + (st.auto ? " pressed" : "")} aria-pressed={st.auto} title={st.auto ? "เปิดอยู่ เลือกบรรทัดแล้วภาพไปเวลาเริ่มของบรรทัดเอง กดเพื่อปิด" : "ปิดอยู่ เลือกบรรทัดแล้วภาพอยู่ที่เดิม กดเพื่อเปิด"} onClick={() => setAuto(!st.auto)} data-vauto>AUTO</button>
        <VideoMenu {...p} fitPct={Math.round(fitS * 1000) / 10} />
      </div>
    </>
  );
}
