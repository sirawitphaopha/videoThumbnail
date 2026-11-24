/* เนื้อของสามแบบหน้า แบบ Aegisub ข้อความยาว และ notepad
   แยกจาก SubEditor.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 5) เนื้อโค้ดยกมาทั้งก้อน */
import { blankEvent, insertEvent, select } from "../../lib/subEdit";
import { seekTime } from "../../lib/vidFrames";
import MainBar from "./MainBar";
import { CardIcon, Seg } from "../ui";
import SubGrid from "./SubGrid";
import SubEditBox, { savedOf } from "./SubEditBox";
import { shownText } from "./SubVideo";
import SubAudio from "./SubAudio";
import AudioBar from "./AudioBar";
import { setOpt } from "../../lib/subTiming";
import PadView from "./PadView";
import type { SeOpen } from "./seCtx";

export default function SeTabs({ pg }: { pg: SeOpen }) {
  const { TAGS, at, audioAct, cmds, commitTiming, dl, ev, fold, fr, frWhy, gbar, goto, gridAt, gridH, movieAud, noAudio, noLine, onDelete, onNext, onToAss, p, setFont, setTags, setUnit, sideKey, st, tags, tall, tb, tm, unit, videoEl } = pg;
  const doc = pg.doc!;
  return (
    <>
      {p.tab === "aeg" && <>
        {!fold && <div className="aegtop se-top">
          {videoEl}
          <div className="se-acol">
            <SubAudio movie={movieAud} noAudio={noAudio ?? ""} delayMs={dl} doc={doc} ev={ev} sel={st.sel} onAutoCommit={() => commitTiming(true)}
              onPrev={() => audioAct("prev")} onNext={() => audioAct("next")} onSeekVideo={(ms) => seekTime(ms, "exact")} />
            {!tall && <AudioBar compact opts={tm.opts} noAudio={noAudio} noLine={noLine} onAct={audioAct} onToggle={(k, v) => setOpt(k, v)} />}
          </div>
        </div>}
        {tall && !fold && <AudioBar opts={tm.opts} noAudio={noAudio} noLine={noLine} onAct={audioAct} onToggle={(k, v) => setOpt(k, v)} />}
        {ev ? <SubEditBox doc={doc} ev={ev} orig={st.orig[ev.id]} savedEv={savedOf(ev.id)} fr={fr} frWhy={frWhy} delayMs={dl} unit={unit} onUnit={setUnit} onPrev={() => goto(at - 1)} onNext={onNext}
          onInsert={cmds.insertAfter} onSplit={(k) => cmds.split("estimate", k)} onJoin={() => cmds.join(false)} onDelete={onDelete} onToAss={onToAss} onFont={(apply, current) => setFont({ apply, current })}
          why={{
            prev: at <= 0 ? "บรรทัดนี้เป็นบรรทัดแรก" : undefined,
            next: at >= doc.events.length - 1 ? "บรรทัดนี้เป็นบรรทัดสุดท้าย กด Enter ในช่องพิมพ์เพื่อเพิ่มบรรทัดใหม่ต่อท้าย" : undefined,
            join: st.sel.length < 2 && at >= doc.events.length - 1 ? "บรรทัดนี้เป็นบรรทัดสุดท้าย ไม่มีบรรทัดถัดไปให้รวม" : undefined,
            del: st.sel.length ? undefined : "ยังไม่ได้เลือกบรรทัด",
          }} />
          : <div className="stat info"><CardIcon kind="info" /><div><b>ซับนี้ยังไม่มีบรรทัด</b><div className="minirow"><button type="button" className="btn btn-ghost btn-sm" onClick={() => insertEvent(-1, blankEvent(doc, { start: 0, end: 3000 }), "เพิ่มบรรทัด")} data-se-first>เพิ่มบรรทัดแรก</button></div></div></div>}
        <div className="se-gridbar" ref={gbar} data-se-gridbar>
          {cmds.bar}
          <MainBar groups={tb} />
          <span className="se-gslot" data-se-gslot>
            {cmds.note ?? <span className="small se-gcount" data-se-count>{`${doc.events.length.toLocaleString("en-US")} บรรทัด`}{st.sel.length > 1 ? ` เลือกไว้ ${st.sel.length.toLocaleString("en-US")}` : ""}</span>}
          </span>
          <Seg small label="แท็กในตาราง" value={tags} onChange={setTags} options={[{ value: "full", label: TAGS.full }, { value: "sym", label: TAGS.sym }, { value: "hide", label: TAGS.hide }]} />
        </div>
        <div ref={gridAt}><SubGrid doc={doc} sel={st.sel} active={st.active} tags={tags} height={gridH} onSelect={(ids, a) => select(ids, a)}
          fr={unit === "frame" ? fr : null} delayMs={dl} onSideKey={sideKey} /></div>
      </>}
      {p.tab === "long" && <div className="subtext se-long" style={{ maxHeight: "none" }} data-long-view>{doc.events.filter((e) => !e.comment).map((e, i) => (
        <div key={e.id} className={"cue" + (e.id === st.active ? " cur" : "")} onClick={() => select([e.id], e.id)}><span className="n">{i + 1}</span><span className="t">{`${(e.start / 1000).toFixed(2)} → ${(e.end / 1000).toFixed(2)}`}</span><div style={{ whiteSpace: "pre-line" }}>{shownText(e, doc)}</div></div>
      ))}</div>}
      {p.tab === "pad" && <PadView doc={doc} delay={dl} video={videoEl} onSeek={(ms) => seekTime(ms + dl, "start")} />}

    </>
  );
}
