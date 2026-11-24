/* กราฟ ป้ายแกน แผงข้อมูล และแถบล่างของบิตเรตแบบเดิม
   แยกจาก BitrateClassic.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 7) เนื้อโค้ดยกมาทั้งก้อน */
import { C, FONT, btn, hms, kb, kbps } from "./classicParts";
import type { BvCtx } from "./bvCtx";

export default function BvPlot({ pg }: { pg: BvCtx }) {
  const { S, audio, auto, axisFit, barRef, box, choose, ci, close, codec, cur, curBar, curType, cutAt, cvRef, err, fmt, gradHead, group, head, info, jumpI, lab, load, maxV, md, mode, modeSel, onBarDown, onContext, onDown, onMove, onUp, onWheel, open, path, plotRef, r, readPct, running, sel, setAuto, setSel, setTopBand, setZoom, span, stats, top, totalSec, ver, xOf, yOf, z0, zoom, zoomPct } = pg;
  return (
    <>
      <div style={{ flex: 1, minHeight: 160, display: "flex", gap: 10 }}>
        <div style={{ width: 66, position: "relative", flex: "none" }} data-bv-axis>
          {path && !(choose && choose.path === path) && <>
            {yOf(maxV) > 18 && <div style={{ ...lab(yOf(maxV)), textAlign: "right", lineHeight: "16px" }}><div>Max.</div><div>{maxV}</div><div>{auto ? "(A)" : "(S)"}</div></div>}
            {auto ? <div style={lab(10)}>{Math.round(top)}</div> : <div style={lab(yOf(maxV / 2))}>{maxV / 2}</div>}
            <div style={lab(box.h)}>0</div>
            {info && axisFit.info != null && <div style={{ ...lab(axisFit.info), textAlign: "right", lineHeight: 1.35 }} title={info.profile || undefined}>
              <div>{codec}</div>{fmt && <div>{fmt}</div>}
              <div data-bv-badge style={{ marginTop: 3, marginLeft: "auto", width: 52, background: C.head1, color: "rgb(255,255,255)", fontWeight: 700, fontSize: 11, padding: "0 4px", textAlign: "center" }}>{md.badge}</div>
            </div>}
            {info && axisFit.tracks != null && <div style={{ ...lab(axisFit.tracks), lineHeight: 1.45 }}><div>V: {info.video}</div><div>A: {info.audio}</div></div>}
          </>}
        </div>
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
          <div ref={plotRef} style={{ flex: 1, minHeight: 0, position: "relative", cursor: path ? "crosshair" : "pointer", userSelect: "none" }}
            onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={() => setTopBand(false)} onContextMenu={onContext} onWheel={onWheel}
            onDoubleClick={() => path && setAuto((v) => !v)} onClick={() => { if (!path) void load(); }} data-bv-plot>
            <canvas ref={cvRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" }} />
            {sel && <div data-bv-sel style={{ position: "absolute", top: 0, bottom: 0, left: xOf(sel[0]), width: Math.max(1, xOf(sel[1]) - xOf(sel[0])), background: C.sel, borderLeft: `1px solid ${C.selEdge}`, borderRight: `1px solid ${C.selEdge}`, pointerEvents: "none", display: "flex", alignItems: "center", justifyContent: "center", color: "rgb(150,80,0)", fontWeight: 700 }}>
              {(((sel[1] - sel[0]) / span) * 100).toFixed(1)}%</div>}
            {path && <div style={{ position: "absolute", left: 10, top: 6, color: C.sample, fontSize: 12, pointerEvents: "none" }} data-bv-sample>sample: {group}{running ? ` อ่านแล้ว ${readPct}%${mode === "frm" ? " (ถอดภาพ)" : ""}` : ""}</div>}
            {/* ไอคอนลากไฟล์รูปเดียวกับจุดลากไฟล์ของโปรแกรมหลัก (.drop) สีม่วงฟ้าของหน้านี้ (BUGS ข้อ 86 · พี่กันสั่ง 13 พ.ย. 2569 "ใส่ icon ให้เหมือนโปรแกรมหลััก") */}
            {!path && <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, color: "rgb(120,120,120)", fontSize: 14 }} data-bv-empty>
              <svg width="58" height="58" viewBox="0 0 58 58" aria-hidden="true">
                {/* ไล่สีแบบเดียวกับหัวกล่องทางขวา ตามเมนู Draw gradient headers (พี่กันสั่ง 13 พ.ย. 2569 "ปุ่มโหลดขอไล่สีเหมือนกัน") */}
                <defs><linearGradient id="bvDropGrad" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor={C.head1} /><stop offset="1" stopColor={gradHead ? C.head2 : C.head1} /></linearGradient></defs>
                <circle cx="29" cy="29" r="29" fill="url(#bvDropGrad)" /><g transform="translate(14.5 14.5) scale(1.2)" fill="none" stroke="rgb(255,255,255)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V5M7.5 9.5L12 5l4.5 4.5M4 15v3a2 2 0 002 2h12a2 2 0 002-2v-3" /></g></svg>
              ลากไฟล์วิดีโอหรือไฟล์เสียงมาวางตรงนี้ หรือกด Load</div>}
            {choose && choose.path === path && <div data-bv-choose onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()} style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, background: C.win, cursor: "default" }}>
              <div style={{ marginBottom: 4, fontSize: 13 }}>Select stream ไฟล์นี้มี {choose.tracks.length} แทร็ก เลือกแทร็กที่จะดูบิตเรต</div>
              {choose.tracks.map((t) => <button key={t.id} type="button" className="bv-btn" onClick={() => void open(path, modeSel, false, t.id)} data-bv-pick={t.id} style={{ ...btn, width: 240, textAlign: "left", padding: "0 10px" }}>{t.label}</button>)}
            </div>}
            {err && <div style={{ position: "absolute", left: 10, bottom: 14, color: C.red }} data-bv-error>{err}</div>}
            {/* อ่านไม่ถึงท้ายไฟล์ ลอยมุมล่างซ้าย ไม่ดันกรอบ (AUDIT ข้อ 118) */}
            {!err && cutAt != null && <div style={{ position: "absolute", left: 10, bottom: 14, color: C.red, background: "rgba(255,255,255,.85)", padding: "0 4px" }} data-bv-cut>อ่านได้ถึง {hms(cutAt)} จากความยาว {hms(info?.duration ?? 0)} ส่วนท้ายไฟล์อาจเสีย</div>}
          </div>
          {/* แถบบอกช่วงที่ซูม · สีส้มคือช่วงที่เห็นอยู่ สีแดงคือช่วงที่ลากเลือก */}
          {/* ลากแถบสีส้มเลื่อนช่วงที่ดู กดร่องข้างแถบกระโดดไปช่วงนั้น · ที่กดได้หนากว่าแถบ หน้าตาเท่าเดิม (BUGS ข้อ 47) */}
          <div onMouseDown={onBarDown} style={{ padding: "4px 0", margin: "-4px 0", cursor: zoom.length ? "grab" : "default" }} data-bv-zoomhit>
          <div ref={barRef} data-bv-zoombar style={{ height: 6, position: "relative", background: zoom.length || sel ? "rgb(215,215,215)" : "transparent" }}>
            {zoom.length > 0 && <div style={{ position: "absolute", top: 0, bottom: 0, left: `${(z0 / totalSec) * 100}%`, width: `${Math.max(0.3, zoomPct)}%`, background: C.zoom }} />}
            {sel && <div style={{ position: "absolute", top: 0, bottom: 0, left: `${(sel[0] / totalSec) * 100}%`, width: `${Math.max(0.3, ((sel[1] - sel[0]) / totalSec) * 100)}%`, background: C.red }} />}
          </div>
          </div>
        </div>
        <div style={{ width: 150, flex: "none", display: "flex", flexDirection: "column", gap: 4 }} data-bv-panel>
          <div style={{ marginBottom: 6 }}>
            <div style={head}>Total Time</div>
            <div style={{ padding: "8px 8px 0", minHeight: 18 }}>{info ? hms(info.duration) : ""}</div>
            {/* บรรทัด ZOOM กับปุ่มรีเซ็ตจองที่ไว้ตลอด ไม่ซูมก็ซ่อนแต่ไม่ดันของข้างล่าง (BUGS ข้อ 45 46) */}
            <div style={{ padding: "2px 8px 0", display: "flex", alignItems: "center", gap: 6, visibility: zoom.length > 0 ? "visible" : "hidden" }} aria-hidden={zoom.length ? undefined : true}>
              <span style={{ flex: 1, fontSize: 11.5, color: C.zoom, fontWeight: 700, whiteSpace: "nowrap" }} data-bv-zoomflag>ZOOM {zoom.length} ({zoomPct.toFixed(1)}%)</span>
              <button type="button" className="bv-btn" onClick={() => { setZoom([]); setSel(null); }} disabled={!zoom.length} tabIndex={zoom.length ? 0 : -1} title="กลับไปดูทั้งไฟล์ แบบเดียวกับเมนู Reset zoom" data-bv-reset
                style={{ flex: "none", height: 20, padding: "0 6px", borderRadius: 2, fontFamily: FONT, fontSize: 11.5, color: "rgb(0,0,0)" }}>Reset</button>
            </div>
          </div>
          {([["Average Bitrate", S.n ? kb(stats.avg) : ""], ["Peak", S.n ? kb(stats.peak) : ""]] as const).map(([h, v]) => <div key={h} style={{ marginBottom: 6 }}>
            <div style={head}>{h}</div>
            <div style={{ padding: "8px 8px 0", minHeight: 18 }}>{v}</div></div>)}
          <div style={{ marginTop: "auto" }}>
            <div style={head}>Cursor</div>
            <div style={{ padding: "8px 8px 0", minHeight: 18, display: "flex", alignItems: "center", gap: 6 }} data-bv-curtime>
              <span>{cur != null && path ? hms(cur) : ""}</span>
              {curType && <button type="button" onClick={(e) => jumpI(e.ctrlKey || e.shiftKey)} title="กดเพื่อไป I เฟรมถัดไป หรือกด Ctrl ค้างแล้วกดเพื่อย้อนไป I เฟรมก่อนหน้า" data-bv-ftype className="bv-ft"
                style={{ borderRadius: 2, background: curType === "I" ? C.over : curType === "P" ? C.head2 : "rgb(255,255,255)", fontWeight: 700, fontSize: 11, padding: "0 5px", cursor: "pointer", fontFamily: FONT }}>{curType}</button>}
            </div>
            <div style={{ padding: "12px 8px 0", minHeight: 18, display: "flex" }} data-bv-curval>
              <span style={{ flex: 1 }}>{ci >= 0 ? kb(kbps(S.b[ci], S.t1[ci] - S.t0[ci])) : curBar ? kb(curBar.v) : ""}</span>
              {path && <span>({md.letter})</span>}
            </div>
          </div>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 12, paddingLeft: 8 }}>
        {/* แถวสถิติลากเลือกแล้ว Ctrl+C คัดลอกได้ (AUDIT ข้อ 123 · ทั้งโปรแกรมตั้งห้ามเลือกข้อความไว้ที่ body เดิมลากเลือกไม่ได้เลย) */}
        <div style={{ flex: 1, minWidth: 0, lineHeight: 1.5, userSelect: "text", cursor: "text" }} title="ลากเลือกตัวเลขแล้วกด Ctrl+C เพื่อคัดลอก" data-bv-stats>
          <div>{S.n ? `MIN = ${kb(stats.min)}  MAX = ${kb(stats.peak)}  AVG = ${kb(stats.avg)}  FRAMES = ${r?.t.length ?? 0}` : " "}</div>
          <div>{info ? (audio
            ? `${+(info.sample_rate / 1000).toFixed(1)} kHz, ${info.channels} ch${info.bit_depth ? `, ${info.bit_depth} bit` : ""}      (${(info.size / 1048576).toFixed(3)} MiB)`
            // ตัดศูนย์ท้ายเฉพาะทศนิยม 29.970 เป็น 29.97 · เดิมตัดศูนย์ของเลขจำนวนเต็มด้วย 30 fps ขึ้นเป็น 3 fps (AUDIT ข้อ 25)
            : `${info.width} × ${info.height}, ${info.fps ? +info.fps.toFixed(3) : "n/a"} fps      (${(info.size / 1048576).toFixed(3)} MiB)`) : " "}</div>
        </div>
        <button type="button" className="bv-btn" onClick={() => void load()} data-bv-load style={btn}>{running ? "Stop" : "Load"}</button>
        <button type="button" className="bv-btn" onClick={close} disabled={!path} data-bv-close style={btn}>Close</button>
      </div>
      <span hidden>{ver}</span>
    </>
  );
}
