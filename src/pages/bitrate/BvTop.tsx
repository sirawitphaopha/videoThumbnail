/* แถบบนของบิตเรตแบบเดิม ปุ่มเปิดไฟล์ เมนู วิธีคิด แทร็ก
   แยกจาก BitrateClassic.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 7) เนื้อโค้ดยกมาทั้งก้อน */
import { dropStyle, sideStyle } from "../../lib/popupFit";
import { FixedTime, Phr } from "../../components/ui";
import { C, DESC_IDLE, FONT, MODES, hms, hr, mi, sep } from "./classicParts";
import type { BvCtx } from "./bvCtx";

export default function BvTop({ pg }: { pg: BvCtx }) {
  const { S, audio, auto, desc, descLeft, gaps, grad, gradHead, info, item, load, marks, menu, menuPanel, menuWrap, mode, modeSel, name, noZoom, open, path, place, recent, running, setAuto, setDesc, setGrad, setGradHead, setMarks, setMenu, setMode, setSel, setShowCur, setTrack, setTrkOpen, setZoom, showCur, side, span, toggleGaps, totalSec, track, trkOpen, trkPanel, trkPlace, trkSide, trkWrap, visCount, zoom } = pg;
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 6, paddingLeft: 4, minHeight: 20 }}>
        <div ref={menuWrap} style={{ position: "relative", flex: "none" }}>
          <button type="button" aria-label="เมนู Bitrate Viewer" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((v) => !v)} data-bv-menu
            className="bv-btn" style={{ width: 22, height: 20, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 2, cursor: "pointer", padding: 0 }}>
            <svg width="14" height="12" viewBox="0 0 14 12" aria-hidden="true"><rect x="1" y="6" width="2" height="5" fill={C.purpleLo} /><rect x="4" y="3" width="2" height="8" fill={C.pinkHi} /><rect x="7" y="5" width="2" height="6" fill={C.purpleLo} /><rect x="10" y="1" width="2" height="10" fill={C.over} /></svg>
          </button>
          {menu && <div ref={menuPanel} role="menu" className="pop-in" data-bv-menupanel onMouseLeave={() => setDesc(null)} style={{ position: "absolute", ...sideStyle(side, "left"), ...dropStyle(place), overflowY: "auto", zIndex: 40, minWidth: 260, background: "rgb(250,250,250)", border: "1px solid rgb(150,150,150)", boxShadow: "2px 3px 8px rgba(0,0,0,.25)", padding: "3px 0", fontSize: 12.5 }}>
            <div style={sep}>Open recent file</div>
            {recent.length ? recent.map((p) => item(p.split(/[\\/]/).pop() ?? p, "", () => void open(p, mode), { d: "recent", k: p })) : <div style={{ ...mi(true), cursor: "default" }}><span style={{ width: 16 }} />ยังไม่มีไฟล์</div>}
            <div style={hr} />
            {info && info.tracks.length > 1 && <><div style={sep}>Stream</div>
              {info.tracks.map((t) => item(t.label, "", () => path && void open(path, modeSel, false, t.id), { d: "stream", on: info.track === t.id, k: "trk" + t.id }))}
              <div style={hr} /></>}
            {MODES.map((m) => item(m.label, m.key, () => setMode(m.id), { d: m.id, on: mode === m.id, off: audio && m.id !== "sec" && "กดไม่ได้เพราะไฟล์เสียงไม่มีคีย์เฟรมกับชนิดเฟรม" }))}
            <div style={hr} />
            {item("Recalculate current file", "F5", () => path && void open(path, mode, true), { d: "recalc", off: !path && "กดไม่ได้เพราะยังไม่ได้เปิดไฟล์" })}
            {item(running ? "Stop calculation" : "Load file…", "", () => void load(), { d: running ? "stop" : "load", k: "load" })}
            <div style={hr} />
            {item("Standard scale mode", "Ctrl+A", () => setAuto((v) => !v), { d: "scale", on: !auto })}
            {item("Use fixed colors", "Ctrl+C", () => setGrad((v) => !v), { d: "fixed", on: !grad })}
            {item("Draw gradient headers", "Ctrl+D", () => setGradHead((v) => !v), { d: "heads", on: gradHead })}
            {item("Separate bars", "", toggleGaps, { d: "gaps", on: gaps })}
            <div style={hr} />
            {item("Average bitrate line", "Ctrl+Click", () => setMarks((m) => ({ ...m, avg: !m.avg })), { d: "avg", on: marks.avg })}
            {item("Maximum bitrate line", "Shift+Click", () => setMarks((m) => ({ ...m, max: !m.max })), { d: "max", on: marks.max })}
            {item("Minimum bitrate line", "Alt+Click", () => setMarks((m) => ({ ...m, min: !m.min })), { d: "min", on: marks.min })}
            {item("Track mouse position", "Ctrl+RightClick", () => setTrack((v) => !v), { d: "track", on: track })}
            {item("Show cursor line", "Alt+RightClick", () => setShowCur((v) => !v), { d: "cursor", on: showCur })}
            {item("Zoom out", "Wheel up", () => setZoom((z) => z.slice(0, -1)), { d: "zoomout", off: noZoom })}
            {item("Reset zoom", "", () => { setZoom([]); setSel(null); }, { d: "reset", off: noZoom })}
          </div>}
          {/* กล่องคำอธิบายข้างเมนูทางขวา ขอบบนตรงเมนู สูงคงที่ ชี้แถวไหนกล่องก็ไม่ยืด · เดิมวางท้ายเมนู เมนูสูงเกินจอจนต้องเลื่อน (เจอตอนตรวจ 13 พ.ย. 2569)
              เหตุผลที่กดไม่ได้ขึ้นก่อนคำอธิบาย */}
          {menu && <div className={"bv-desc" + (desc ? "" : " idle")} aria-live="polite" data-bv-desc style={{ left: descLeft, ...(place.up ? { bottom: "calc(100% + 6px)" } : { top: "calc(100% + 6px)" }) }}>
            {desc ? <>{desc.why && <span className="why"><Phr>{desc.why + "  "}</Phr></span>}<Phr>{desc.d}</Phr></> : DESC_IDLE}
          </div>}
        </div>
        <div style={{ flex: 1, minWidth: 0, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={path ?? undefined} data-bv-title>Bitrate Viewer{name ? ` - ${name}` : ""}</div>
        {info && info.tracks.length > 1 && <div ref={trkWrap} style={{ position: "relative", flex: "none" }} data-bv-track>
          <button type="button" className="bv-btn" aria-haspopup="listbox" aria-expanded={trkOpen} onClick={() => setTrkOpen((v) => !v)} title="เลือกแทร็กที่จะดูบิตเรต ภาพหรือเสียง"
            style={{ height: 22, padding: "0 8px", borderRadius: 2, fontFamily: FONT, fontSize: 12.5, color: "rgb(0,0,0)", display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
            {info.tracks.find((t) => t.id === info.track)?.label ?? "Stream"}<svg width="9" height="6" viewBox="0 0 9 6" aria-hidden="true"><path d="M0.5 0.5L4.5 5L8.5 0.5" fill="none" stroke="rgb(40,40,40)" strokeWidth="1.3" /></svg>
          </button>
          {trkOpen && <div ref={trkPanel} role="listbox" className="pop-in" style={{ position: "absolute", ...sideStyle(trkSide, "right"), ...dropStyle(trkPlace), overflowY: "auto", zIndex: 40, minWidth: "100%", background: "rgb(250,250,250)", border: "1px solid rgb(150,150,150)", boxShadow: "2px 3px 8px rgba(0,0,0,.25)", padding: "3px 0" }}>
            {info.tracks.map((t) => <button key={t.id} type="button" role="option" aria-selected={info.track === t.id} className="bv-mi" style={mi()} data-bv-trackopt={t.id}
              onClick={() => { setTrkOpen(false); if (path && t.id !== info.track) void open(path, modeSel, false, t.id); }}>
              <span style={{ width: 16, flex: "none" }}>{info.track === t.id ? "✓" : ""}</span><span style={{ flex: 1, textAlign: "left" }}>{t.label}</span></button>)}
          </div>}
        </div>}
        {/* ปุ่มแบบชั้นหนังย้ายไปแถบปุ่มคู่ด้านบนของหน้า (BitratePage) อยู่ทั้งสองแบบ (BUGS ข้อ 85) */}
        {/* กว้างเท่าข้อความยาวสุดของไฟล์นี้เสมอ ไม่ซูมก็จองที่ไว้ ปุ่มแบบชั้นหนังไม่ขยับ (BUGS ข้อ 45) */}
        {path && <div style={{ flex: "none", fontSize: 12, color: "rgb(70,70,70)", visibility: zoom.length > 0 ? "visible" : "hidden" }} data-bv-zoomstat><FixedTime t={`${visCount} / ${S.n} samples, ${hms(span)}`} longest={`${S.n} / ${S.n} samples, ${hms(totalSec)}`} /></div>}
      </div>
    </>
  );
}
