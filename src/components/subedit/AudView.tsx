/* ภาพคลื่นเสียงกับปุ่มเมนู ขีดเวลาใต้ภาพ และแถบเลื่อนตั้งสามอันข้างคลื่นเสียง
   แยกจาก SubAudio.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 10) เนื้อโค้ดยกมาทั้งก้อน */
import { cube, setOpt, zoomFactor } from "../../lib/subTiming";
import InfoTip from "../InfoTip";
import { WAVE_TIP, SLIDER_TIP, fmtRuler } from "./audShared";
import { AudioMenu } from "./AudioMenu";
import type { AuCtx } from "./audCtx";

export function AudWave({ pg }: { pg: AuCtx }) {
  const { X, cursor, cv, d, h, left, mpp, onDown, onHover, p, right, setMouse, w, wrap } = pg;
  const src = pg.src!;
  // ขีดบอกเวลาใต้ภาพ ห่างกันอย่างน้อย 80 จุด
  const step = [100, 200, 500, 1000, 2000, 5000, 10000, 30000, 60000, 120000, 300000, 600000].find((s) => s / mpp >= 80) ?? 600000;
  const ticks: number[] = [];
  for (let s = Math.ceil(left / step) * step; s <= right && ticks.length < 40; s += step) ticks.push(s);
  return (
    <>
        <div className="se-wavebox" ref={wrap}>
          <canvas ref={cv} className="se-aud" style={{ height: h, cursor }} tabIndex={0} aria-label="คลื่นเสียง ลากเส้นแดงหรือน้ำเงินเพื่อเปลี่ยนเวลาเริ่มหรือจบ" data-aud
            onMouseDown={onDown} onMouseMove={onHover} onMouseLeave={() => setMouse(null)} onContextMenu={(e) => e.preventDefault()}
            onKeyDown={(e) => { if (e.key === "ArrowLeft") { e.preventDefault(); p.onPrev(); } else if (e.key === "ArrowRight") { e.preventDefault(); p.onNext(); } }} />
          <span className="se-wavebtns">
            <AudioMenu src={src} ev={p.ev} delayMs={d} />
            <InfoTip title="อ่านภาพคลื่นเสียง" tip={WAVE_TIP} />
          </span>
          <div className="se-ruler" aria-hidden="true">{ticks.map((s) => <span key={s} style={{ left: X(s), transform: X(s) < 18 ? "none" : X(s) > w - 18 ? "translateX(-100%)" : undefined }}>{fmtRuler(s, step)}</span>)}</div>
        </div>
    </>
  );
}

export function AudSliders({ pg }: { pg: AuCtx }) {
  const { o, zoomTo } = pg;
  return (
    <>
        <div className="se-sl" data-se-sliders>
          <div className="se-slcols">
          <label className="se-slc" title={`ซูมแนวนอน ${zoomFactor(o.hzoom)}%`}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="M20 20l-4.8-4.8M7.5 10.5h6" /></svg>
            <input type="range" min={-50} max={30} step={1} value={o.hzoom} onChange={(e) => zoomTo(Number(e.target.value))} aria-label="ซูมแนวนอน" data-se-hzoom />
          </label>
          <label className="se-slc" title={`ซูมแนวตั้ง ${Math.round(cube(o.vzoom) * 100)}%`}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="M20 20l-4.8-4.8M10.5 7.5v6" /></svg>
            <input type="range" min={0} max={100} step={1} value={o.vzoom} onChange={(e) => setOpt("vzoom", Number(e.target.value))} aria-label="ซูมแนวตั้ง" data-se-vzoom />
          </label>
          <label className="se-slc" title={o.link ? "ความดังผูกกับซูมแนวตั้งอยู่ กดปุ่มโซ่เพื่อแยก" : `ความดัง ${Math.round(cube(o.volume) * 100)}%`}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" /><path d="M15.5 9a4 4 0 010 6" /></svg>
            <input type="range" min={0} max={100} step={1} value={o.link ? o.vzoom : o.volume} disabled={o.link} onChange={(e) => setOpt("volume", Number(e.target.value))} aria-label="ความดัง" data-se-volume />
          </label>
          </div>
          <span className="se-slfoot">
            <button type="button" className={"se-slbtn" + (o.link ? " on" : "")} aria-pressed={o.link} title={o.link ? "ผูกซูมแนวตั้งกับความดังอยู่ กดเพื่อแยก" : "กดเพื่อผูกซูมแนวตั้งกับความดัง"} onClick={() => setOpt("link", !o.link)} data-se-link>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1" /></svg>
            </button>
            <InfoTip title="แถบเลื่อนข้างคลื่นเสียง" tip={SLIDER_TIP} />
          </span>
        </div>
    </>
  );
}
