/* ตัวกราฟของแต่ละมุมมอง รูปคลื่น สเปกตรัม ความดัง เทียบช่อง วิเคราะห์ ความถี่เฉลี่ย
   แยกจาก GraphPage.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 4) เนื้อโค้ดยกมาทั้งก้อน */
import { flushSync } from "react-dom";
import Dropdown from "../../components/Dropdown";
import { FixedTime } from "../../components/ui";
import { IbPlay } from "../../components/icons";
import InfoTip from "../../components/InfoTip";
import { PSD_SPANS, RAINBOW, RangeTime, TimeRuler, ZOOMS, dbTxt, label, laneMinH, pkTxt, tfmt } from "./common";
import { SaveBtn, WaveStyle, drawAmpRuler, drawWave, lut, sample } from "./draw";
import { Crosshair, Lane, LaneOff, Marks } from "./parts";
import { FZoom, Overview, VZoom, composeLanes, drawSpecLane, vzTxt } from "./zoom";
import { CmpView, LoudView } from "./LoudView";
import { SpekView } from "./SpekView";
import { LOUD_TIP, PsdView } from "./PsdView";
import { Swatch, PEAK_RMS_TIP, WaveIc } from "./graphPrefs";
import type { B3 } from "./graphCtx";

export function plotBits(pg: B3) {
  const { LW, VZ_W, at, boxEl, dur, exportRef, fileName, grabBusy, heldShown, hidden, hover, info, laneAdj, lanesGrab, loudMode, marks, names, ovFold, panTo, paneH, play, plotRef, prefs, psd, psdCh, psdF, psdLog, psdMs, psdSeries, psdSize, resetN, saveImage, sb, scroller, seg, setBoxEl, setCenter, setHover, setLoudMode, setPref, setPsdCh, setPsdF, setPsdLog, setPsdSize, setResetN, setSb, setShowTable, setSpekRes, setSz, setTip, setVz, setWin, setZoom, showTable, spekRes, styleTools, svDrag, svRef, svTo, sz, szClampB, t, t0, t1, th, toast, toggleCh, view, vis, vz, winNow, zoom, zoomBox } = pg;
  const ov = pg.ov!;
  const src = pg.src!;
  const path = pg.path!;
  const peakTxt = (c: string) => { const i = names.indexOf(c); return ov.peaks[i] == null ? "" : ov.peaks[i] <= -119 ? "เงียบทั้งไฟล์" : ov.peaks[i] < -96 ? "แทบเงียบทั้งไฟล์ " + pkTxt(ov.peaks[i]) : "ดังสุด " + pkTxt(ov.peaks[i]); };
  const Ruler = ({ left, right }: { left: number; right: number }) => (
    <TimeRuler t0={t0} t1={t1} left={left} right={right} />
  );
  const onMove = (left: number, right: number) => (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect(), W = r.width - left - right, x = e.clientX - r.left - left;
    if (x >= 0 && x <= W) setHover(t0 + x / W * (t1 - t0));
  };
  /** ความดังเฉลี่ย (RMS) ของจุดนั้น กล่องค่าตอนชี้เขียนว่าดังเฉลี่ย ป้ายช่องข้างซ้ายเป็นดังสุด (AUDIT ข้อ 100) */
  const valueAt = (ch: number, time: number) => {
    const s = src, e = s.env[ch], c = Math.max(0, Math.min(s.cols - 1, Math.floor((time - s.t0) / (s.t1 - s.t0 || 1) * s.cols)));
    return e[c * 3 + 2];
  };

  let plot: React.ReactNode = null;
  const hasLR = names.includes("FL") && names.includes("FR");
  const lrWhy = "ไฟล์นี้ไม่มีช่องซ้ายกับขวาแยกกัน";
  // ช่องที่เลือกไว้ไม่มีในไฟล์นี้ (เช่นเปิดไฟล์ช่องเดียวหลังดู L ไว้) ใช้รวมทุกช่อง ไม่ส่งช่องที่ไม่มีให้กราฟ (AUDIT ข้อ 20 · เดิมกราฟแบนและชี้เมาส์แล้วหน้าพัง)
  const loudLive = loudMode === "mix" || (loudMode === "lr" ? hasLR : names.includes(loudMode)) ? loudMode : "mix";
  const loudOpts: [typeof loudMode, string][] = [["mix", "รวมทุกช่อง"], ["FL", "L ซ้าย"], ["FR", "R ขวา"], ["lr", "เทียบซ้ายขวา"]];
  // สลับช่องแบบค่อย ๆ เปลี่ยนด้วย View Transitions ของเบราว์เซอร์ ภาพเก่าจางออก ภาพใหม่ค่อย ๆ ขึ้น หัวกราฟกับแถบล่างเลื่อนไปที่ใหม่ (ชื่อใน app.css)
  // ตั้งในเครื่องให้ลดการเคลื่อนไหว หรือเบราว์เซอร์ไม่รองรับ สลับทันทีแบบเดิม
  // (พี่กันสั่ง 13 พ.ย. 2569 "หน้า ความดัน ตอนเราเปลี่ยนจากดูรวมทุกช่อง ไปดู L R ภาพมันแบบตัดไปอีกอันเลย เราขอ animation transition ลื่นๆที")
  const switchLoud = (k: typeof loudMode) => {
    if (k === loudMode) return;
    const d = document as Document & { startViewTransition?: (cb: () => void) => unknown };
    if (!d.startViewTransition || matchMedia("(prefers-reduced-motion: reduce)").matches) { setLoudMode(k); return; }
    d.startViewTransition(() => flushSync(() => setLoudMode(k)));
  };
  // หัวกราฟแคบ ปุ่มเลือกช่องสี่ปุ่มเป็นดรอปดาวน์แบบเดียวกับปุ่มแบบกราฟของหน้ารูปคลื่น สลับด้วย @container ใน app.css
  // (ใส่เส้นแบ่งในแถบซูมแล้วหัวกราฟหน้าความดังต้องการราว 906 จุด แต่ที่หน้าต่าง 1280 มี 800 จุด ปุ่มเลือกช่องไปซ้อนใต้แถบซูม เจอตอนตรวจภาพ 13 พ.ย. 2569)
  const loudBox = names.length > 1 ? (
    <span className="loudbox" style={{ display: "inline-flex", alignItems: "center", gap: 6, flex: "none" }}><div className="seg sm loud-seg" data-loudmode>{loudOpts.map(([k, l]) => {
      const off = k !== "mix" && !hasLR;
      return <button key={k} type="button" className={loudMode === k ? "on" : ""} disabled={off} title={off ? lrWhy : k === "mix" ? "ความดังรวมทุกช่อง หน่วย LUFS" : k === "lr" ? "ซ้อนเทียบความดังเฉลี่ยซ้ายกับขวา หน่วย dB" : "ความดังเฉลี่ยของช่องนี้ หน่วย dB"} onClick={() => switchLoud(k)} data-k={k}>{l}</button>;
    })}</div>
      <span className="loud-dd" title={hasLR ? undefined : lrWhy} data-loudmodedd><Dropdown label="ช่องที่ดู" value={loudMode} onChange={switchLoud} options={loudOpts.filter(([k]) => k === "mix" || hasLR).map(([value, label]) => ({ value, label }))} /></span>
      <InfoTip title="หน่วยของความดัง" tip={LOUD_TIP} /></span>
  ) : null;
  const lanesView = view === "wave" || view === "spec";
  if (lanesView) {
    // แถบสูงขึ้นจากเดิม (พี่กัน 7 พ.ย. 2569 *"ใ้ห้ระบบมันขยายกราฟลงมาได้มากกว่านี้ ตอนนี้มันเเค่สองเเถบที่โคตรจะชิดกัน"*) · ลากที่จับใต้กราฟขยายต่อได้ถึง 4 เท่า
    const minH = laneMinH(names.length, false);
    // 252 คือหัวกราฟ แถบเลื่อน แถวปุ่มท้าย ระยะขอบรวมกัน (คอมเมนต์เดิมเขียน 234 ไม่ตรงค่า AUDIT ข้อ 101)
    const laneH = Math.max(minH, Math.floor((paneH - 252 + (ovFold ? 44 : 0) + laneAdj - (names.length - 1) * 6) / Math.max(1, names.length)));
    const colors = lut(prefs.cmap === "rainbow" ? RAINBOW : th.ramp);
    plot = (
      <div className="plot" data-plot ref={plotRef}>
        <div className="plotstick">
        <div className="plothead"><span><b>{view === "wave" ? "รูปคลื่นทุกช่อง" : "ความถี่ทุกช่อง"}</b> <span className="prange">ช่วง <RangeTime t0={t0} t1={t1} dur={dur} /></span></span>
          {/* หัวการ์ดแคบ (จอเล็ก) ตัวเลือกแบบกราฟเป็นดรอปดาวน์ แถบซูมไม่ถูกบีบ (พี่กันสั่ง 11 พ.ย. 2569 "มันบีบเส้นซูมเกินไป ให้เปลี่ยนรูปแบบกราฟเป็นดรอปดาวน์ ถ้าจอมันเล็ก") · สลับด้วย @container ใน app.css */}
          {view === "wave" && <span className="wstyle-seg">{seg<WaveStyle>([["aud", <><WaveIc d="M3 12c2-7 3-7 5 0s3 7 5 0 3-7 5 0 2 4 3 0" />รูปคลื่น</>], ["bars", <><WaveIc d="M5 9v6M10 5v14M15 8v8M20 10v4" />แท่ง</>], ["real", <><WaveIc d="M3 12h2V6h2v12h2V4h2v16h2V7h2v10h2V9h2v3h2" />เต็มช่อง</>]], prefs.style, (v) => setPref("style", v), "data-style")}</span>}
          {view === "wave" && <span className="wstyle-dd" data-styledd><Dropdown label="แบบกราฟ" value={(prefs.style === "fine" ? "aud" : prefs.style) as "aud" | "bars" | "real"} onChange={(v) => setPref("style", v)}
            options={[{ value: "aud", label: "รูปคลื่น" }, { value: "bars", label: "แท่ง" }, { value: "real", label: "เต็มช่อง" }]} /></span>}
          {zoomBox(ZOOMS, "ซูม")}</div>
        <Overview ov={ov} th={th} t0={t0} t1={t1} onPick={(x) => { setCenter(x); setTip(x); if (zoom === "all") setZoom(240); }} left={LW} right={VZ_W} />
        <Ruler left={LW} right={VZ_W} />
        </div>
        <div className="lanewrap" style={{ marginTop: marks.some((m) => m.to > t0 && m.from < t1) ? 28 : 6, position: "relative" }}
          onWheel={(e) => { if (view !== "spec" || sz <= 1 || e.ctrlKey) return; e.stopPropagation(); setSb((b) => szClampB(b + (e.deltaY < 0 ? 0.25 : -0.25) / sz, sz)); }}>
        <div className={"lanes " + lanesGrab.cls} data-wstyle={view === "wave" ? prefs.style : undefined} ref={setBoxEl} style={{ marginTop: 0 }} {...lanesGrab.props} onPointerMove={(e) => { if (!lanesGrab.move(e)) onMove(LW, 0)(e); }} onPointerLeave={() => setHover(null)} data-lanes>
          {names.map((c) => {
            const i = names.indexOf(c), l = label(names, c);
            // ทั้งสามแบบ (รูปคลื่น แท่ง เต็มช่อง) ช่องสูงเท่ากัน มีแกนตัวเลขซ้ายเหมือนกัน ช่องคั่นเท่ากัน กรอบกราฟอยู่ตำแหน่งเดียวกันทุกแบบ
            // (พี่กันทัก 11 พ.ย. 2569 "มันไม่เท่ากันเลย" · เดิมแบบแท่งไม่มีแกนตัวเลข แบบเต็มช่องไม่มีช่องคั่น ช่องล่างกับแถบเลื่อนขึ้นไป 6 จุด)
            // แท่งสูงครึ่งละ ดังสุด × ครึ่งช่อง ตรงกับสเกลของแกนตัวเลขอยู่แล้ว
            const tog = { onToggle: () => toggleCh(c), last: vis.length <= 1 };
            if (hidden.includes(c)) return <LaneOff key={c + "off"} code={l.code} th={l.th} peak={peakTxt(c)} height={view === "wave" ? Math.max(laneH, 60) : laneH} {...tog} />;
            return view === "wave"
              ? <Lane key={c + view} room {...tog} code={l.code} th={l.th} peak={peakTxt(c)} height={Math.max(laneH, 60)} deps={[src, t0, t1, th, prefs.style, i, vz, laneH]}
                  draw={(g, w, h) => drawWave(g, w, h, sample(src, i, t0, t1, w), th, prefs.style, vz)}
                  ruler={(g, w, h) => drawAmpRuler(g, w, h, vz)} />
              : <Lane key={c + view} {...tog} code={l.code} th={l.th} peak={peakTxt(c)} height={laneH} deps={[src, winNow, heldShown, t0, t1, prefs.cmap, th, i, laneH, sz, sb]}
                  draw={(g, w, h) => drawSpecLane(g, w, h, i, winNow, ov, t0, t1, t?.rate ?? 48000, colors, sz, sb, heldShown)} />;
          })}
          <Marks marks={marks} t0={t0} t1={t1} left={LW} right={0} />
          {/* เส้นตั้งกับกล่องบอกค่าขึ้นเฉพาะตอนเมาส์ชี้ (พี่กัน 7 พ.ย. 2569 *"ต้องให้เเสดงเฉพาะเมาส์ชี้"*) */}
          {hover != null && <Crosshair box={boxEl} left={LW} right={0} t0={t0} t1={t1} at={at} rows={vis.map((c) => ({ v: "ดังเฉลี่ย " + dbTxt(valueAt(names.indexOf(c), at)) + " dB", k: `${label(names, c).code} ${label(names, c).th}` }))} />}
        </div>
        {view === "spec" && sz > 1 && <div ref={svRef} className="spekvs" style={{ top: 0, bottom: 0, right: VZ_W + 4 }} title="ลากเพื่อเลื่อนย่านความถี่ขึ้นลง หรือหมุนล้อเมาส์บนกราฟก็ได้" data-specvs
          onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); svDrag.current = true; svTo(e.clientY); }} onPointerMove={(e) => { if (svDrag.current) svTo(e.clientY); }} onPointerUp={() => { svDrag.current = false; }} onPointerCancel={() => { svDrag.current = false; }}>
          <i style={{ height: 100 / sz + "%", bottom: sb * 100 + "%" }} data-specthumb /></div>}
        {view === "spec" ? <FZoom value={sz} onChange={setSz} /> : VZ_W > 0 && <VZoom value={vz} onChange={setVz} />}
        </div>
        {scroller(LW, VZ_W)}
        <div className="agfoot">
          {view === "wave"
            // ทั้งสามแบบ (รูปคลื่น แท่ง เต็มช่อง) โครงเดียวกัน แถวบนป้ายสีกับปุ่ม ⓘ แถวล่างหมายเหตุบรรทัดเดียว สูงเท่ากันทุกแบบ สลับแบบแล้วกราฟไม่ขยับ
            // (พี่กันสั่ง 11 พ.ย. 2569 "เเถบข้างล่างนี้ สามกราฟ ทำห้มันเหมือนกัน เเล้ว fiix" · เดิมแบบแท่งไม่มี ⓘ ไม่มีหมายเหตุ แถบเตี้ยกว่า 49 จุด)
            ? <div className="lg wavelg" data-wavelg>
                <div className="lgrow">
                  {prefs.style === "bars"
                    ? <span><svg width="22" height="14" viewBox="0 0 22 14" style={{ verticalAlign: -2, marginRight: 5 }} aria-hidden="true"><rect width="22" height="14" rx="3" fill={th.lane} stroke={th.peak} /><rect x="4" y="5" width="2" height="4" rx="1" fill={th.rms} /><rect x="8" y="2" width="2" height="10" rx="1" fill={th.rms} /><rect x="12" y="4" width="2" height="6" rx="1" fill={th.rms} /><rect x="16" y="3" width="2" height="8" rx="1" fill={th.rms} /></svg>ความสูงแท่ง คือดังสุด (Peak)</span>
                    : <><span><i style={{ background: th.rms }} />ดังสุด (Peak)</span>{prefs.style !== "real" && <span><i style={{ background: th.ramp[5] }} />ดังเฉลี่ย (RMS)</span>}</>}
                  <InfoTip title="ดังสุดกับดังเฉลี่ย" tip={PEAK_RMS_TIP} />
                  {marks.length > 0 && <span style={{ color: "#b03535" }}><i style={{ background: "rgba(208,59,59,.25)", border: "1px solid rgba(208,59,59,.75)" }} />จุดเสีย</span>}
                </div>
                {(() => { const note = prefs.style === "bars" ? "แบบแท่ง หนึ่งแท่งคือช่วงเวลาสั้น ๆ หนึ่งช่วง และตัวเลขซ้ายคือความสูงคลื่น 1.0 เต็มสเกล" : `${prefs.style === "real" ? "หน้าตาแบบโปรแกรม Audacity" : "แบบตามโปรแกรม Audacity"} ตัวเลขซ้ายคือความสูงคลื่น 1.0 เต็มสเกล`; return <div className="small lgnote" title={note} data-audnote>{note}</div>; })()}
              </div>
            : <div className="speclegend"><span className="nw">−120 dB</span><span className="rampbar" style={{ background: `linear-gradient(90deg,${(prefs.cmap === "rainbow" ? RAINBOW : th.ramp).join(",")})` }} /><span className="nw">0 dB</span><span className="nw" style={{ marginLeft: 6 }}>20 Hz ถึง {Math.round((t?.rate ?? 48000) / 2000)} kHz</span></div>}
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {view === "spec" && seg<"theme" | "rainbow">([["theme", <><Swatch ramp={th.ramp} />สีตามชุด</>], ["rainbow", <><Swatch ramp={RAINBOW} />สีรุ้ง</>]], prefs.cmap, (v) => setPref("cmap", v), "data-cmap")}
            {/* ขยายแนวตั้งอยู่แถวล่าง (เดิมอยู่แถวปุ่มบน ชุดสีตกบรรทัดที่สอง เจอตอนตรวจภาพ) */}
            {view === "wave" && VZ_W > 0 && <><span className="lbl">ขยายแนวตั้ง</span>{seg<number>([[1, "1×"], [2, "2×"], [4, "4×"]], vz, setVz, "data-vz")}<span className="vzval" data-vzval title="ลากแถบแนวตั้งขวามือรูปคลื่น ขึ้นยืด ลงบีบ">{vzTxt(vz)}</span></>}
            <button type="button" className="btn btn-ghost btn-sm" onClick={play} data-graphplay><IbPlay size={15} /><span>เปิดเล่นที่ <FixedTime t={tfmt(at)} longest={tfmt(dur)} /></span></button><SaveBtn onClick={saveImage} /></div>
        </div>
      </div>
    );
    exportRef.current = (outW) => composeLanes(boxEl, outW);
  } else if (view === "loud" && loudLive !== "mix") {
    const cc = loudLive === "lr" ? ["FL", "FR"] : [loudLive];
    plot = <CmpView head={loudBox} onPan={panTo} onBusy={grabBusy} resetN={resetN} scroller={scroller} dur={dur} src={src} names={names} cc={cc} t0={t0} t1={t1} marks={marks} zoomBox={zoomBox(ZOOMS, "ซูม")} at={at} live={hover != null} setHover={setHover} play={play} save={saveImage} exportRef={exportRef} plotRef={plotRef} />;
  } else if (view === "loud") {
    plot = <LoudView head={loudBox} onPan={panTo} onBusy={grabBusy} resetN={resetN} scroller={scroller} ov={ov} th={th} t0={t0} t1={t1} names={names} marks={marks} zoomBox={zoomBox(ZOOMS, "ซูม")} at={at} live={hover != null} setHover={setHover} showTable={showTable} setShowTable={setShowTable} save={saveImage} exportRef={exportRef} plotRef={plotRef} />;
  } else if (view === "cmp") {
    const cc = ["FL", "FR", "FC"].filter((c) => names.includes(c));
    plot = <CmpView onPan={panTo} onBusy={grabBusy} resetN={resetN} scroller={scroller} dur={dur} src={src} names={names} cc={cc} t0={t0} t1={t1} marks={marks} zoomBox={zoomBox(ZOOMS, "ซูม")} at={at} live={hover != null} setHover={setHover} play={play} save={saveImage} exportRef={exportRef} plotRef={plotRef} />;
  } else if (view === "spek") {
    plot = <SpekView axis={prefs.spekAxis} setAxis={(v) => setPref("spekAxis", v)} res={spekRes} setRes={setSpekRes} onBusy={grabBusy} held={heldShown} resetN={resetN} tools={styleTools} light={prefs.spekLight} onPanT={panTo} scroller={scroller} ov={ov} win={winNow} track={t} fileName={fileName} names={names} t0={t0} t1={t1} zoomBox={zoomBox(ZOOMS, "ซูม")} scmap={prefs.scmap} setScmap={(v) => setPref("scmap", v)} th={th} audioOnly={!!info?.audioOnly} play={play} save={saveImage} exportRef={exportRef} plotRef={plotRef} at={at} />;
  } else {
    plot = <PsdView codec={t?.codec ?? ""} filePath={path ?? ""} onReset={() => { setZoom("all"); setWin(null); setResetN((n) => n + 1); }} resetN={resetN} scroller={scroller} psd={psd && psd.db.length === psdSeries.length + (psdMs ? 2 : 0) ? psd : null} names={names} psdCh={psdCh} setPsdCh={setPsdCh} psdLog={psdLog} setPsdLog={setPsdLog} psdSize={psdSize} setPsdSize={setPsdSize} th={th} ov={ov} t0={t0} t1={t1}
      zoomBox={zoomBox(PSD_SPANS, "ช่วงที่เลือก")} onPick={(x) => { setCenter(x); if (zoom === "all") setZoom(30); }} f={psdF} setF={setPsdF} fileName={fileName} save={saveImage} exportRef={exportRef} plotRef={plotRef} toast={toast} />;
  }
  return { peakTxt, Ruler, onMove, valueAt, plot, hasLR, lrWhy, loudOpts, switchLoud, loudBox, lanesView };
}
