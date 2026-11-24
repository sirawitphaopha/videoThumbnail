/* หน้าว่างตอนยังไม่ได้ใส่ไฟล์หนัง
   แยกจาก AvPage.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 2) เนื้อโค้ดยกมาทั้งก้อน */
import { Phr, dropClick } from "../../components/ui";
import { MOVIE_EXT, pickFile } from "../../lib/api";
import { setAv } from "../../lib/avJob";
import { IcFile } from "../../components/icons";
import { BUSY, RunCard, StopDialog } from "./parts";
import type { AvCtx } from "./avCtx";

export default function avEmptyView({ pg }: { pg: AvCtx }) {
  const { askStop, av, loadMovie, loading, movieErr, over, p, pct, run, runBox, setAskStop, working } = pg;
  return (
    <>
      <div className="pagewrap" data-av-page>
        <div className="avwrap">
          {run.state !== "idle" && <div ref={runBox} className="card workbox" data-run={run.state}><RunCard run={run} pct={pct} runMovie={av.runMovie} onStop={() => setAskStop(true)} onShelf={() => p.onPage("shelf")} onGraph={p.onGraph} onRetry={() => setAv({ run: { state: "idle" } })} /></div>}
          <div className="card">
            <h3>เสียงและซับ</h3>
            <div className={"drop" + (over && over !== null ? " over" : movieErr ? " bad" : "")} data-drop="movie" style={{ minHeight: 190 }} onClick={dropClick(async () => { if (working) return; const f = await pickFile("movie"); if (f) loadMovie(f); })}>
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#e5a3bd" strokeWidth="1.8" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M10 9l5 3-5 3z" /></svg>
              {over ? <b>ปล่อยเมาส์เพื่อใส่ไฟล์นี้</b>
                : movieErr ? <><b>{movieErr}</b><div><Phr>ไฟล์หนังรองรับ MKV MP4 M4V MOV AVI WebM TS M2TS MPG MPEG VOB FLV</Phr></div></>
                : loading === "movie" ? "กำลังอ่านไฟล์หนัง…"
                : <><b style={{ color: "var(--txt2)" }}>ลากไฟล์หนังมาวางตรงนี้</b><span>แล้วลากไฟล์เสียงหรือซับตามมาวางได้เลย</span></>}
              <button type="button" className={"btn btn-sm " + (working ? "btn-wait" : "btn-ghost")} aria-disabled={working || undefined} title={working ? BUSY : undefined}
                onClick={async () => { if (working) return; const f = await pickFile("movie"); if (f) loadMovie(f); }}><IcFile size={15} />เลือกไฟล์จากเครื่อง</button>
            </div>
            <div className="small" style={{ marginTop: 10 }}><Phr>{`ลากหนังกับเสียงมาพร้อมกันได้ โปรแกรมแยกให้เองว่าไฟล์ไหนเป็นหนัง และรับไฟล์หนัง ${MOVIE_EXT.map((e) => e.toUpperCase()).join(" ")}`}</Phr></div>
          </div>
        </div>
        <StopDialog open={askStop && !(run.state === "working" && run.progress?.final)} pct={pct} name={av.runMovie} onClose={() => setAskStop(false)} />
      </div>
    </>
  );
}
