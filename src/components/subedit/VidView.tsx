/* กรอบภาพหนัง ภาพตรงเฟรมหรือวิดีโอจำลอง ซับบนภาพ เครื่องมือบนภาพ ระยะจากขอบบรรทัด และข้อความแจ้งผล
   แยกจาก SubVideo.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 10) เนื้อโค้ดยกมาทั้งก้อน */
import { reopenVideo, signedMs } from "../../lib/vidFrames";
import { Skel } from "../ui";
import { IbFilm, IcFile } from "../icons";
import VideoTools from "./VideoTools";
import { bindMpvBox, bindPlayCanvas } from "../../lib/vidPlay";
import { TOOLBAR_W } from "./vidShared";
import { DummyCanvas } from "./VidDummy";
import type { VdCtx } from "./vidCtx";

export function VidView({ pg }: { pg: VdCtx }) {
  const { anyShown, boxH, boxW, d, fail, fontPx, fr, htmlSub, img, imgH, imgW, keyDown, lay, layH, layW, note, onViewDown, openMenu, ov, ovKey, p, playing, pos, ready, setNote, shown, src, st, still, tNow, tool, toolsOn, view, vp, wrapW } = pg;
  let body: React.ReactNode;
  if (src.kind === "dummy") body = <DummyCanvas spec={src.spec} w={imgW} h={imgH} />;
  else if (src.kind === "movie") body = <>
    {img ? <img src={img} alt={pos != null ? `ภาพหนังเฟรม ${pos}` : "ภาพหนัง"} style={{ width: imgW, height: imgH }} draggable={false} />
      : fail ? <div className="vnone">ดึงภาพหนังไม่ได้</div> : <Skel w={imgW} h={imgH} r={0} />}
    {playing && vp.engine === "aegisub" && <canvas ref={bindPlayCanvas} className="se-vplaycv" style={{ width: imgW, height: imgH }} aria-label="หนังที่กำลังเล่น" data-vplaycv />}
    {playing && vp.engine === "mpv" && <div ref={bindMpvBox} className="se-vplaycv se-vmpv" style={{ width: imgW, height: imgH }} aria-label="หนังที่กำลังเล่นด้วย mpv" data-vmpv />}
  </>;
  else body = (
    <div className="vnone">
      <span>{st.closed ? "ปิดวิดีโออยู่" : "เปิดไฟล์ซับอย่างเดียว จึงไม่มีภาพหนัง"}</span>
      <span className="se-vnonebtns">
        {st.closed && st.movie ? <button type="button" className="btn btn-ghost btn-sm" onClick={reopenVideo} data-vreopen><IbFilm size={15} />เปิดวิดีโอของหนัง</button>
          : p.onAddMovie && <button type="button" className="btn btn-ghost btn-sm" onClick={p.onAddMovie} data-sub-addvideo><IcFile size={15} />เพิ่มไฟล์วิดีโอ</button>}
        <button type="button" className="btn btn-ghost btn-sm" onClick={p.onDummy} data-vdummy-open>วิดีโอจำลอง</button>
      </span>
    </div>
  );
  return (
    <>
        <div className="se-vwrap" style={{ width: wrapW, height: boxH }} data-vwrap>
        <div className="se-vview vframe" ref={view} tabIndex={0} style={{ width: boxW, height: boxH }} onKeyDown={keyDown} onMouseDown={onViewDown}
          onContextMenu={(e) => { e.preventDefault(); }} aria-label="ภาพหนัง คลิกแล้วใช้ลูกศรซ้ายขวาเดินทีละเฟรม" data-vframe>
          <div className="se-vimg" style={{ width: layW, height: layH }}>
            {body}
            {still && anyShown && ov && <img className="se-vsubimg" src={ov.url} alt="" draggable={false} style={{ left: lay.x, top: lay.y, width: imgW, height: imgH }} data-vsubimg data-vsubnow={ov.key === ovKey ? "1" : undefined} />}
            {htmlSub && shown && src.kind !== "none" && <div className="vsub" style={{ fontSize: fontPx, bottom: Math.max(8, (layH - imgH) / 2 + imgH * 0.06) }}>{shown}</div>}
            {toolsOn && <VideoTools doc={p.doc} delay={d} fr={fr} pos={pos} tNow={tNow!} lay={lay} w={layW} h={layH} tool={tool} onMenu={openMenu} onFocus={() => view.current?.focus({ preventScroll: true })} />}
          </div>
          {p.ev && ready && <div className="vtime se-voff" data-voff>{`${signedMs(tNow! - (p.ev.start + d))}; ${signedMs(tNow! - (p.ev.end + d))}`}</div>}
        </div>
        </div>
        {note && <div className={"se-vnote" + (note.err ? " err" : "")} style={{ left: TOOLBAR_W + 6, maxWidth: wrapW - 12 }} role={note.err ? "alert" : "status"} data-vnote={note.err ? "err" : note.busy ? "busy" : "ok"}>
          <span>{note.text}</span>
          {note.err && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setNote(null)} aria-label="ปิดข้อความ" data-vnote-close>ปิด</button>}
        </div>}
    </>
  );
}
