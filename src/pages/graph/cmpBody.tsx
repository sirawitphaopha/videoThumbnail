/* ตัวกราฟของหน้าเทียบ อ่านไม่ได้ กำลังอ่าน และกราฟของแต่ละแท็บ
   แยกจาก CompareView.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 7) เนื้อโค้ดยกมาทั้งก้อน */
import Dropdown from "../../components/Dropdown";
import { CardIcon, FixedTime, Phr } from "../../components/ui";
import { IcRefresh, IbPlay } from "../../components/icons";
import { LoadLanes, HEAT, PSD_SPANS, RangeTime, THEMES, TimeRuler, ZOOMS, label, pkTxt, spanDigits, tfmt, tfmtD } from "./common";
import { SaveBtn, drawWave, lut, sample } from "./draw";
import { Lane, LaneOff, VBar } from "./parts";
import { FZoom, HZ_MIN, HZoom, TimeScroll, VZoom } from "./zoom";
import { spekEdge } from "./SpekView";
import { CmpChart, Elapsed, FILE_C, FILE_INK, SpekCv, Stat, TH_FILE, drawSpecCmp, drawSpekCmp, edgeAll, f1, khz, loudPts, rmsDb, sgn } from "./compareParts";
import { LABELS, CONV, Who } from "./cmpLabels";
import { PsdCmp } from "./PsdCmp";
import type { CmpCtx } from "./cmpCtx";

export function cmpBody(pg: CmpCtx) {
  const { NM, S, T, allTxt, cmpGrab, cmpUse, common, dur, files, filesKey, hiC, hidden, hrPsd, maxNyq, n, nameOf, nyq, panT, paneH, play, playFrom, plotRef, psd, psdCh, psdF, psdKey, psdSpan, psdT, ready, saveImage, setCenter, setCmpCh, setPsdCh, setPsdF, setPsdSpan, setSpan, setVz, setZoom, span, t0, t1, tab, toggleCh, union, vis, vrCmp, vrLoud, vrPsd, vrSpec, vrSpek, vz, zoom, zoomReset } = pg;
  let body: React.ReactNode;
  const errAt = S.findIndex((s) => s.err);
  if (errAt >= 0) {
    body = <div className="plot"><div className="stat bad"><CardIcon kind="bad" /><div><b>อ่าน{LABELS[errAt]}ไม่ได้</b><Phr>{S[errAt].err ?? ""}</Phr></div></div></div>;
  } else if (!ready) {
    const at = Math.max(0, S.findIndex((s) => !s.ov)), pct = S[at].pct ?? 0, since = S[at].since;
    body = (
      <div className="plot" data-cmploading>
        <div style={{ fontSize: 13.5, marginBottom: 8 }}>อ่านเสียง{LABELS[at]} <b>{Math.round(pct)}%</b>{since != null && <> <Elapsed since={since} /></>} อ่านทีละไฟล์ตามลำดับ</div>
        <div className="bar"><i style={{ width: `${pct}%` }} /></div>
        <LoadLanes n={files.length * 2} />
      </div>
    );
  } else {
    const OV = S.map((s) => s.ov!);
    const others = files.map((_, i) => i).slice(1);
    // แถบซูมเรียงแบบเดียวกับหน้าไฟล์เดียว คำว่าซูมนำหน้า เส้นแบ่งกั้นปุ่มรีเซ็ต หัวกราฟแคบปุ่มช่วงซูมเป็นดรอปดาวน์
    // (พี่กันทัก 13 พ.ย. 2569 "แบ่งถูกละเหรอ ทำไปเเยำคำว่าซูมออก" · "ตัวนี้เปลี่ยนเป็นดรอปดาวด้วย ถ้าจอเล็ก" · หน้าเทียบมีแถบของตัวเองแยก เจอตอนไล่ทุกหน้า)
    const pickCmpZoom = (v: string) => { const k: number | "all" = v === "all" ? "all" : Number(v); setZoom(k); if (k !== "all" && zoom === "all") setCenter(Math.min(dur / 2, 60)); };
    const zoomBar = (
      <span className="zoombox" style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span className="lbl">ซูม</span>
        <span className="zbtns">
          <button type="button" className="zb" onClick={() => setSpan(span * 2)} disabled={zoom === "all"} aria-label="ซูมออก" title="ซูมออก (Ctrl หมุนล้อเมาส์ลง)" data-zoomout><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="M20 20l-4.8-4.8M7.5 10.5h6" /></svg></button>
          <HZoom dur={dur} span={span} onSpan={setSpan} />
          <button type="button" className="zb" onClick={() => setSpan(span / 2)} disabled={span <= HZ_MIN} aria-label="ซูมเข้า" title="ซูมเข้า (Ctrl หมุนล้อเมาส์ขึ้น)" data-zoomin><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="M20 20l-4.8-4.8M7.5 10.5h6M10.5 7.5v6" /></svg></button>
        </span>
        <span className="zseg"><div className="seg sm">{ZOOMS.map(([k, l]) => <button key={String(k)} type="button" className={String(zoom) === String(k) ? "on" : ""} onClick={() => pickCmpZoom(String(k))} data-cmpzoom={String(k)}>{l}</button>)}</div></span>
        <span className="zdd" title={`ช่วงที่ดูยาว ${tfmtD(span, spanDigits(span))}`} data-zoomdd><Dropdown label="ช่วงซูม" value={String(zoom)} onChange={pickCmpZoom} keepLeftOf={spekEdge}
          options={ZOOMS.map(([k, l]) => ({ value: String(k), label: l }))} display={(o) => o?.label ?? tfmtD(span, spanDigits(span))} /></span>
        <span className="fsep" aria-hidden="true" />
        <button type="button" className="zb" onClick={zoomReset} aria-label="รีเซ็ตซูม" title="รีเซ็ต กลับทั้งไฟล์ ซูมแนวตั้ง 1 เท่า" data-zoom-reset><IcRefresh size={15} /></button></span>
    );
    const foot = (lg: React.ReactNode) => (
      <div className="agfoot"><div className="lg">{lg}</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{files.map((p, i) => <button key={p} type="button" className="btn btn-ghost btn-sm" onClick={() => play(p)}><IbPlay size={15} /><span>เปิด{LABELS[i]} {p.match(/\.([^.\\/]+)$/)?.[1].toUpperCase() ?? ""} ที่ <FixedTime t={tfmt(playFrom)} longest={tfmt(dur)} /></span></button>)}<SaveBtn onClick={saveImage} /></div></div>
    );
    const Ruler = () => (
      <TimeRuler t0={t0} t1={t1} left={96} right={30} />
    );
    const edges = OV.map((ov, i) => edgeAll(ov, NM[i], nyq[i]));
    const ea = edges[0], eb = edges[1];
    const cutNote = n === 2
      ? (eb.top < ea.top - 1500 && !eb.full
        ? { kind: "info" as const, b: `${LABELS[1]}ไม่มีเสียงเหนือ ${khz(eb.top)} kHz`, d: `${LABELS[0]}มีเสียงถึงราว ${khz(ea.top)} kHz${ea.top > 20000 ? " ซึ่งหูคนไม่ได้ยิน (หูได้ยินถึงราว 20 kHz)" : ""} ส่วนช่วงที่ต่ำกว่านั้นภาพแทบเหมือนกัน` }
        : { kind: "info" as const, b: "ช่วงความถี่ของสองไฟล์ใกล้เคียงกัน", d: `${LABELS[0]}มีเสียงถึงราว ${khz(ea.top)} kHz และ${LABELS[1]}ราว ${khz(eb.top)} kHz` })
      : { kind: "info" as const, b: `ช่วงความถี่${allTxt}`, d: edges.map((e, i) => `${LABELS[i]} ราว ${khz(e.top)} kHz`).join(", ") };
    const nLanes = union.reduce((sum, c) => sum + NM.filter((x) => x.includes(c)).length, 0);
    // 205 คือหัวกราฟ แถวเวลา แถบเลื่อน ผลสรุป แถวปุ่มท้าย ระยะขอบรวมกัน (วัดจากหน้าจริง)
    const laneH = Math.max(union.length > 4 ? 40 : 46, Math.floor((paneH - 205 - (nLanes - 1) * 6) / Math.max(1, nLanes)));
    const colors = lut(THEMES["ชมพู"].ramp);
    if (tab === "wave" || tab === "spec") {
      const lanes = union.flatMap((c) => files.flatMap((_, f) => {
        const names = NM[f], ov = OV[f], i = names.indexOf(c);
        if (i < 0) return [];
        const l = label(names, c), pk = ov.peaks[i], k = "abcd"[f];
        const peak = pk == null ? "" : pk <= -119 ? "เงียบทั้งไฟล์" : "ดังสุด " + pkTxt(pk);
        const tog = { onToggle: () => toggleCh(c), last: vis.length <= 1 };
        if (hidden.includes(c)) return [<LaneOff key={c + k + "off"} code={l.code} th={`${l.th} ${LABELS[f]}`} peak={peak} height={laneH} {...tog} />];
        return [tab === "wave"
          ? <Lane key={c + k + tab} {...tog} code={l.code} th={`${l.th} ${LABELS[f]}`} peak={peak} height={laneH} deps={[ov, t0, t1, i, laneH, vz, f, hiC[files[f]]]}
              draw={(g, w, h) => { const hi = hiC[files[f]]; drawWave(g, w, h, sample(hi ? { env: hi.env, cols: hi.cols, t0: hi.t0, t1: hi.t1 } : { env: ov.env, cols: ov.cols, t0: 0, t1: ov.duration }, i, t0, t1, w), TH_FILE[f], "fine", vz); }} />
          : <Lane key={c + k + tab} {...tog} code={l.code} th={`${l.th} ${LABELS[f]}`} peak={peak} height={laneH} deps={[ov, t0, t1, i, laneH, maxNyq, vrSpec.z, vrSpec.b, hiC[files[f]]]}
              draw={(g, w, h) => drawSpecCmp(g, w, h, i, ov, t0, t1, nyq[f], maxNyq, colors, vrSpec.z, vrSpec.b, hiC[files[f]])} />];
      }));
      const pks = OV.map((ov) => Math.max(...ov.peaks));
      const over = others.find((i) => pks[i] > -0.05 && pks[i] > pks[0] + 0.05);
      body = (
        <div className="plot cmpplot" data-plot ref={plotRef} data-cmpview={tab}>
          <div className="plotstick"><div className="plothead"><span><b>{tab === "wave" ? "รูปคลื่นทุกช่อง" : "ความถี่ทุกช่อง"}</b> <span className="prange">ช่วง <RangeTime t0={t0} t1={t1} dur={dur} /></span></span>{zoomBar}</div>
          <Ruler />
          </div>
          <div className="lanewrap" style={{ position: "relative" }} onWheel={tab === "spec" ? vrSpec.wheel : undefined}>
            <div className={"lanes cmplanes " + cmpGrab.cls} {...cmpGrab.props} data-lanes>{lanes}</div>
            {tab === "spec" && <VBar dark v={vrSpec} right={34} top={0} bottom={0} />}
            {tab === "wave" ? <VZoom value={vz} onChange={setVz} /> : <FZoom value={vrSpec.z} onChange={vrSpec.setZ} />}
          </div>
          <TimeScroll dur={dur} t0={t0} t1={t1} left={96} right={30} onPan={panT} />
          {tab === "wave"
            ? (over != null
              ? <Stat kind="warn" b={`ดังสุดของ${LABELS[over]}ขึ้นเป็น ${pkTxt(pks[over])}`} d={`${LABELS[0]} ${pkTxt(pks[0])}${CONV ? " เพราะการแปลงแบบเสียคุณภาพทำให้ยอดคลื่นขยับเล็กน้อย" : ""} ดูแท็บความดังว่าเกิน 0 ช่วงไหน`} />
              : <Stat kind="info" b={`รูปคลื่นของ${allTxt}`} d={`ดังสุด ${pks.map((p, i) => `${LABELS[i]} ${pkTxt(p)}`).join(", ")}`} />)
            : <Stat {...cutNote} />}
        {foot(tab === "wave" ? <><span>{TH_FILE.slice(0, n).map((x, i) => <i key={i} style={{ background: x.peak }} />)}ดังสุด (Peak)</span><span>{FILE_INK.slice(0, n).map((x, i) => <i key={i} style={{ background: x }} />)}ดังเฉลี่ย (RMS)</span></>
            : <><span className="nw">−120 dB</span><span className="rampbar" style={{ background: `linear-gradient(90deg,${THEMES["ชมพู"].ramp.join(",")})` }} /><span className="nw">0 dB</span></>)}
          </div>
      );
    } else if (tab === "loud") {
      const hot = others.find((i) => (OV[i].truePeak ?? -99) >= 0);
      const rows: { k: string; v: string[]; note: string; bad: boolean[] }[] = [
        { k: "ความดังรวม", v: OV.map((o) => `${f1(o.integrated)} LUFS`), note: "ทั้งไฟล์ ตามมาตรฐาน EBU R128", bad: [] },
        { k: "ดังสุด (True Peak)", v: OV.map((o, i) => `${i && (o.truePeak ?? -99) > 0 ? "+" : ""}${f1(o.truePeak)} dBTP`), note: hot != null ? LABELS[hot] + "ถึงหรือเกิน 0" : `ไม่ถึง 0 ${allTxt}`, bad: OV.map((o, i) => i > 0 && (o.truePeak ?? -99) >= 0) },
        { k: "ช่วงความดัง", v: OV.map((o) => `${f1(o.lra)} LU`), note: "ห่างระหว่างช่วงเบากับช่วงดัง", bad: [] },
        { k: "ช่วงเงียบผิดปกติ", v: OV.map((o) => (o.silences.length ? `${o.silences.length} ช่วง` : "ไม่พบ")), note: "เงียบทุกช่องเกิน 1 วินาที", bad: OV.map((o, i) => i > 0 && o.silences.length > OV[0].silences.length) },
      ];
      const luDiffs = others.map((i) => Math.abs((OV[i].integrated ?? 0) - (OV[0].integrated ?? 0)));
      body = (
        <div className="plot cmpplot" data-plot ref={plotRef} data-cmpview="loud">
          <div className="plotstick"><div className="tiles" data-cmptiles>{rows.map((r) => (
            <div className="tile cmptile" key={r.k}><span>{r.k}</span>{r.v.map((x, i) => <div className="tv" key={i}><Who i={i} /><b style={r.bad[i] ? { color: "var(--bad-ink)" } : undefined}>{x}</b></div>)}<em>{r.note}</em></div>))}</div>
          <div className="plothead"><span><b>ความดังตลอดไฟล์</b> <span className="prange">ช่วง <RangeTime t0={t0} t1={t1} dur={dur} /></span></span>{zoomBar}</div></div>
          <div style={{ flex: "1 0 110px", display: "flex", gap: 8, minHeight: 0 }} onWheel={vrLoud.wheel}>
            <div style={{ position: "relative", flex: 1, minWidth: 0, display: "flex" }}>
              <CmpChart key="loud" vr={vrLoud} grab={cmpGrab} fill height={110} deps={[filesKey, t0, t1]} lo={-60} hi={0} step={10} unit="LUFS" ref23
                series={(w) => OV.map((o, i) => [loudPts(o, t0, t1, w), FILE_C[i]] as [Float32Array, string])} />
              <VBar v={vrLoud} right={8} />
            </div>
            <FZoom value={vrLoud.z} onChange={vrLoud.setZ} />
          </div>
          <TimeScroll dur={dur} t0={t0} t1={t1} left={44} right={34} onPan={panT} />
          {hot != null
            ? <Stat kind="warn" b={`ดังสุดของ${LABELS[hot]} ${(OV[hot].truePeak ?? 0) > 0 ? "+" : ""}${f1(OV[hot].truePeak)} dBTP ถึงหรือเกิน 0`} d={CONV ? "เครื่องเล่นบางตัวเสียงแตกช่วงที่ดังสุด ให้ตั้ง Gain −1 dB ในแผงตั้งค่าเสียงแล้วแปลงใหม่" : "เครื่องเล่นบางตัวเสียงแตกช่วงที่ดังสุด"} />
            : <Stat kind="info" b={n === 2 ? `ความดังรวมต่างกัน ${luDiffs[0].toFixed(1)} LU` : `ความดังรวมต่างจาก${LABELS[0]}มากสุด ${Math.max(...luDiffs).toFixed(1)} LU`} d={`เส้นแทบทับกันแปลว่าความดังไม่เปลี่ยน และต่างกันไม่ถึง 1 LU หูแยกไม่ออก`} />}
        {foot(<span><span className="ln" style={{ background: "#8a6474" }} />เส้นอ้างอิง −23 LUFS</span>)}
          </div>
      );
    } else if (tab === "cmp") {
      const idx = NM.map((x) => x.indexOf(cmpUse)), l = label(NM[0], cmpUse);
      const W = 600, base = rmsDb(OV[0], idx[0], t0, t1, W);
      // ไฟล์ที่ต่างจากไฟล์แรกมากที่สุดเป็นตัวสรุป
      const stats = others.map((f) => {
        const d2 = rmsDb(OV[f], idx[f], t0, t1, W);
        let sum = 0, cnt = 0, mx = 0, mxAt = t0;
        for (let x = 0; x < W; x++) { if (base[x] < -60 || d2[x] < -60) continue; const d = d2[x] - base[x]; sum += Math.abs(d); cnt++; if (Math.abs(d) > Math.abs(mx)) { mx = d; mxAt = t0 + (t1 - t0) * x / W; } }
        return { f, avg: cnt ? sum / cnt : 0, mx, mxAt };
      });
      const top = stats.reduce((a, b) => (Math.abs(b.mx) > Math.abs(a.mx) ? b : a));
      body = (
        <div className="plot cmpplot" data-plot ref={plotRef} data-cmpview="cmp">
          <div className="plothead"><span style={{ display: "flex", alignItems: "center", gap: 10 }}><b>ซ้อนเทียบ</b>
            <span className="psdch-seg"><div className="seg sm">{common.map((c) => <button key={c} type="button" className={cmpUse === c ? "on" : ""} onClick={() => setCmpCh(c)} data-cmpch={c}>{label(NM[0], c).code} {label(NM[0], c).th.split(" ")[0]}</button>)}</div></span>
            {/* หัวกราฟแคบ ปุ่มช่องเป็นดรอปดาวน์ ไฟล์ 5.1 7.1 มีหกถึงแปดปุ่ม (พี่กันสั่ง 13 พ.ย. 2569 "ตัวนี้เปลี่ยนเป็นดรอปดาวด้วย ถ้าจอเล็ก") */}
            <span className="psdch-dd" data-cmpchdd><Dropdown label="ช่องที่ดู" value={cmpUse} onChange={setCmpCh} options={common.map((c) => ({ value: c, label: `${label(NM[0], c).code} ${label(NM[0], c).th.split(" ")[0]}` }))} /></span></span>{zoomBar}</div>
          <div style={{ flex: "1 0 120px", display: "flex", gap: 8, minHeight: 0 }} onWheel={vrCmp.wheel}>
            <div style={{ position: "relative", flex: 1, minWidth: 0, display: "flex" }}>
              <CmpChart key="cmp" vr={vrCmp} grab={cmpGrab} fill height={120} deps={[filesKey, t0, t1, cmpUse, hiC]} lo={-48} hi={0} step={12} unit="dB" series={(w) => OV.map((o, i) => [rmsDb(o, idx[i], t0, t1, w, hiC[files[i]]), FILE_C[i]] as [Float32Array, string])} />
              <VBar v={vrCmp} right={8} />
            </div>
            <FZoom value={vrCmp.z} onChange={vrCmp.setZ} />
          </div>
          <div className="small" style={{ margin: "6px 0 2px" }}><b style={{ color: "var(--txt)" }}>{n === 2 ? `ผลต่าง ${LABELS[1]} ลบ ${LABELS[0]}` : `ผลต่าง แต่ละไฟล์ ลบ ${LABELS[0]}`}</b> กราฟแยก แกนบวกลบ 2 dB</div>
          <div style={{ marginRight: 30 }}><CmpChart grab={cmpGrab} height={80} deps={[filesKey, t0, t1, cmpUse]} lo={-2} hi={2} step={1} unit="dB" diff series={(w) => { const x = rmsDb(OV[0], idx[0], t0, t1, w); return others.map((f) => { const y = rmsDb(OV[f], idx[f], t0, t1, w), d = new Float32Array(w); for (let i = 0; i < w; i++) d[i] = x[i] < -60 || y[i] < -60 ? 0 : y[i] - x[i]; return [d, n === 2 ? "#7a4fb0" : FILE_C[f]] as [Float32Array, string]; }); }} /></div>
          <TimeScroll dur={dur} t0={t0} t1={t1} left={44} right={34} onPan={panT} />
          <Stat kind={Math.abs(top.mx) >= 1 ? "warn" : "info"} b={`ช่อง ${l.code}${n > 2 ? ` ${LABELS[top.f]}` : ""} ต่างกันเฉลี่ย ${top.avg.toFixed(1)} dB มากสุด ${sgn(top.mx)} dB ที่ ${tfmt(top.mxAt)}`}
            d={Math.abs(top.mx) >= 1 ? "ต่างเกินราว 1 dB ที่หูเริ่มแยกได้ ลองเปิดฟังช่วงนั้นเทียบกัน" : "ต่ำกว่าที่หูแยกได้ (ราว 1 dB) และไม่นับช่วงที่เบากว่า −60 dB"} />
        {foot(n === 2 ? <span><span className="ln" style={{ background: "#7a4fb0" }} />ผลต่าง</span> : null)}
          </div>
      );
    } else if (tab === "spek") {
      const heat = lut(HEAT);
      const sub = (i: number) => { const t = T[i]!; return `${t.codec}, ${t.rate.toLocaleString("en-US")} Hz${t.bits ? `, ${t.bits}-bit` : ""}${t.bitrate ? `, ${Math.round(t.bitrate / 1000).toLocaleString("en-US")} kb/s` : ""}, ${NM[i].length} channels mixed${nyq[i] !== maxNyq ? " แกนตั้งเท่ากันทุกไฟล์" : ""}`; };
      body = (
        <div className="plot cmpplot" data-plot ref={plotRef} data-cmpview="spek">
          <div className="plothead"><span><b>ความถี่</b> <span className="prange">ช่วง <RangeTime t0={t0} t1={t1} dur={dur} /></span></span>{zoomBar}</div>
          <div style={{ flex: `1 0 ${n * 122}px`, display: "flex", gap: 8, minHeight: 0 }} onWheel={vrSpek.wheel}>
            <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
              {files.map((p, i) => <SpekCv key={p} grab={cmpGrab} deps={[OV[i], t0, t1, maxNyq, vrSpek.z, vrSpek.b, hiC[p]]} draw={(g, w, h) => drawSpekCmp(g, w, h, OV[i], NM[i], nyq[i], maxNyq, t0, t1, nameOf(p), sub(i), edges[i].full ? null : edges[i].top, heat, HEAT, vrSpek.z, vrSpek.b, hiC[p])} data={"abcd"[i]} />)}
            </div>
            <FZoom value={vrSpek.z} onChange={vrSpek.setZ} />
          </div>
          <TimeScroll dur={dur} t0={t0} t1={t1} left={62} right={116} onPan={panT} />
          <Stat {...cutNote} />
          {foot(null)}
        </div>
      );
    } else {
      const ok = psd && psd.key === psdKey;
      const cmpPsdOpts: [string, string][] = [["mix", "รวมทุกช่อง"], ...common.filter((c) => c !== "LFE").slice(0, 6).map((c) => [c, label(NM[0], c).code] as [string, string])];
      body = (
        <div className="plot cmpplot" data-plot ref={plotRef} data-cmpview="psd">
          {/* หัวกราฟแคบ ปุ่มช่องกับปุ่มช่วงที่เลือกเป็นดรอปดาวน์แบบหน้าความถี่เฉลี่ยของไฟล์เดียว (พี่กันสั่ง 13 พ.ย. 2569 "ตัวนี้เปลี่ยนเป็นดรอปดาวด้วย ถ้าจอเล็ก") */}
          <div className="plothead"><span style={{ display: "flex", alignItems: "center", gap: 10 }}><b>ความถี่เฉลี่ย</b>
            <span className="psdch-seg"><div className="seg sm">{cmpPsdOpts.map(([k, l2]) => <button key={k} type="button" className={psdCh === k ? "on" : ""} onClick={() => setPsdCh(k)} data-cmppsdch={k}>{l2}</button>)}</div></span>
            <span className="psdch-dd" data-cmppsdchdd><Dropdown label="ช่องที่ดู" value={psdCh} onChange={setPsdCh} options={cmpPsdOpts.map(([value, label]) => ({ value, label }))} /></span></span>
            <span className="zoombox zfix" style={{ display: "flex", alignItems: "center", gap: 8 }}><span className="lbl">ช่วงที่เลือก</span>
              <span className="zseg"><div className="seg sm">{PSD_SPANS.map(([k, l2]) => <button key={String(k)} type="button" className={String(psdSpan) === String(k) ? "on" : ""} onClick={() => setPsdSpan(k)} data-cmppsdspan={String(k)}>{l2}</button>)}</div></span>
              <span className="zdd" data-cmppsdspandd><Dropdown label="ช่วงที่เลือก" value={String(psdSpan)} onChange={(v) => setPsdSpan(v === "all" ? "all" : Number(v))} options={PSD_SPANS.map(([k, l2]) => ({ value: String(k), label: l2 }))} /></span></span></div>
          {ok ? <PsdCmp list={psd.list} maxNyq={maxNyq} f={psdF} setF={setPsdF} vr={vrPsd} hr={hrPsd} grab={cmpGrab} onReset={() => { setPsdSpan("all"); zoomReset(); }} /> : <div className="skel" style={{ height: 300, borderRadius: 8 }} data-cmppsdwait />}
          <div className="small" style={{ marginTop: 4 }}>{psdSpan === "all" ? `ทั้งไฟล์ ${tfmt(dur)}` : `${tfmt(psdT[0])}–${tfmt(psdT[1])} รอบกลางช่วงที่ดู`} คิดทีละไฟล์ตามลำดับ{ok ? ` และ${n === 2 ? "ทั้งสองไฟล์" : allTxt}ใช้ช่องความถี่กว้าง ${(psd.list[0].rate / psd.list[0].size).toFixed(1)} Hz เท่ากัน จึงเทียบกันได้ตรง` : ""}</div>
          {foot(null)}
        </div>
      );
    }
  }
  return { body, errAt };
}
