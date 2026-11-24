/* กราฟ แผงข้อมูล กล่องบอกค่า แถบปักจุด แถบภาพรวม
   แยกจาก BitratePage.tsx (คอมโพเนนต์ BitrateModern) ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 3) เนื้อโค้ดยกมาทั้งก้อน */
import Dropdown from "../../components/Dropdown";
import { Seg } from "../../components/ui";
import InfoTip from "../../components/InfoTip";
import { IcFile, IcGraph, IcRefresh } from "../../components/icons";
import { BV, NA, STYLES, TIP_CEIL, TIP_STYLE, alpha, chTxt, clock, clockMs, codecName, colorTxt, fmtName, mb, rate, scanTxt } from "./common";
import { BrHZoom, BrVZoom, HZ_MIN, Z_OPTS, vzTxt } from "./zoom";
import type { BrOpenCtx } from "./brCtx";

export default function BrPlot({ pg }: { pg: BrOpenCtx }) {
  const { B, L, R, S, T, audio, box, bstyle, ceil, custom, cutAt, cvRef, drag, dur, err, gopAvg, group, hb, headCompact, headRef, hi, hover, hv, info, jumpI, mode, onDown, onGraph, onMove, onUp, onWheel, ovDrag, ovH, ovMove, ovRef, overSec, pal, pct, ph, pi, pick, pickZ, pin, plotRef, pv, pw, r, rawKbps, readPct, resetZoom, running, sel, setBStyle, setHover, setPin, setSel, setSpan, setVz, span, st, tTotal, tipLeft, toneVer, total, track, typeName, ver, vz, xOf, z0, z1, zKey, zoom, zoomBy } = pg;
  const path = pg.path!;
  return (
    <>
      <div className="agb brn-body">
        <aside className="brn-side">
          <section className="card">
            <h3>Bitrate</h3>
            <dl className="brn-kv">
              <dt>เฉลี่ย</dt><dd><b>{S.n ? rate(st.avg) : NA}</b></dd>
              <dt>สูงสุด</dt><dd>{S.n ? <>{rate(st.peak)} <button type="button" className="linklike brn-at" onClick={() => { const t = (S.t0[st.pAt] + S.t1[st.pAt]) / 2; setPin(t); }} title="ปักจุดตรงนี้">ที่ {clock(S.t0[st.pAt])}</button></> : NA}</dd>
              <dt>ต่ำสุด</dt><dd>{S.n ? <>{rate(st.min)} <button type="button" className="linklike brn-at" onClick={() => { const t = (S.t0[st.mAt] + S.t1[st.mAt]) / 2; setPin(t); }} title="ปักจุดตรงนี้">ที่ {clock(S.t0[st.mAt])}</button></> : NA}</dd>
              <dt className="brn-dtip">เพดาน<InfoTip title="เส้นเพดาน" tip={TIP_CEIL} /></dt><dd data-brn-ceil={rawKbps ? "raw" : "avg"}>{S.n ? <>{rate(ceil)}<span className="small"> <span className="nw">{rawKbps ? "(เสียงดิบ)" : "(เฉลี่ย × 2)"}</span></span></> : NA}</dd>
              {rawKbps > 0 && <><dt>บีบเหลือ</dt><dd data-brn-rawpct>{S.n ? <>{Math.round((st.avg / rawKbps) * 100)}%<span className="small"> <span className="nw">ของเสียงดิบ</span></span></> : NA}</dd></>}
              <dt>เกินเพดาน</dt><dd>{S.n ? <>{overSec >= 1 ? clock(overSec) : `${overSec.toFixed(1)} วินาที`}<span className="small"> <span className="nw">หรือ {Math.round((overSec / Math.max(0.001, total)) * 100)}% ของไฟล์</span></span></> : NA}</dd>
              <dt>ความแกว่ง</dt><dd title="ส่วนเบี่ยงเบนมาตรฐานของบิตเรตเทียบกับค่าเฉลี่ย ยิ่งน้อยยิ่งนิ่ง">{S.n ? <>±{Math.round(st.cv * 100)}%<span className="small"> {st.cv < 0.15 ? "นิ่ง" : st.cv < 0.45 ? "ขึ้นลงพอควร" : "ขึ้นลงมาก"}</span></> : NA}</dd>
            </dl>
            {/* ไฟล์เสียง กดไปดูกราฟเสียงของไฟล์กับแทร็กเดียวกันได้เลย (BUGS ข้อ 119 พี่กันเสริม "อยากให้สามารถกดไปดูกราฟเสียงได้เลย") */}
            {audio && onGraph && path && <button type="button" className="btn btn-ghost btn-sm brn-graph" onClick={() => onGraph(path, Math.max(0, Number((info?.track ?? track).replace(/^a/, "")) || 0))}
              title="เปิดไฟล์นี้ในหน้ากราฟเสียง แทร็กเสียงเดียวกัน ดูรูปคลื่น ความถี่ และความดัง" data-brn-graph><IcGraph size={15} />ดูกราฟเสียง</button>}
          </section>
          <section className="card">
            <h3>Frames</h3>
            <dl className="brn-kv">
              <dt>ทั้งหมด</dt><dd>{r ? r.t.length.toLocaleString() : NA}{running ? <span className="small"> กำลังนับ</span> : null}</dd>
              {audio
                ? <><dt>ต่อเฟรม</dt><dd>{r && r.t.length > 1 ? `${+((dur / r.t.length) * 1000).toFixed(1)} ms` : NA}</dd></>
                : <><dt>คีย์เฟรม</dt><dd>{r ? S.keys.length.toLocaleString() : NA}{gopAvg ? <span className="small"> มีทุก {gopAvg.toFixed(1)} วินาที</span> : null}</dd></>}
            </dl>
            {audio ? <p className="small brn-hint" data-brntypes>เสียงไม่มีคีย์เฟรมกับชนิดเฟรม I P B</p> : <>
            {/* แถว I P B อยู่ครบเสมอ ยังไม่ได้นับขึ้น – · บอกวิธีดูไว้ใต้แถว */}
            <div className="brn-types" data-brntypes>
              <div className="brn-tbar">{(["I", "P", "B"] as const).map((k) => <i key={k} className={"t" + k} style={{ flex: (mode === "frm" && tTotal > 0 ? st.types[k] : 0) || 0.0001 }} title={`${k} ${st.types[k]} เฟรม`} />)}</div>
              {/* I P B บรรทัดเดียว ขนาดเฉลี่ยอยู่ตอนชี้ · ประหยัดที่ให้ข้อมูลวิดีโอ */}
              <div className="brn-tline">{(["I", "P", "B"] as const).map((k) => { const on = mode === "frm" && tTotal > 0; return (
                <span key={k} className="brn-tchip" title={on ? `${k} เฟรม มี ${st.types[k].toLocaleString()} เฟรม เฉลี่ยเฟรมละ ${st.types[k] ? Math.round(st.types[`s${k}`] / st.types[k] / 1024).toLocaleString() : 0} KB` : undefined}><span className={"brn-ft t" + k}>{k}</span>{on ? st.types[k].toLocaleString() : NA}</span>); })}</div>
              {mode !== "frm" && <p className="small brn-hint">เลือกวิธีคิดต่อเฟรม เพื่อนับเฟรม I P B</p>}
            </div></>}
          </section>
          <section className="card">
            <h3>{audio ? "ข้อมูลเสียง" : "ข้อมูลวิดีโอ"}</h3>
            {/* ชื่อแถวอยู่ครบเสมอ ยังไม่มีข้อมูลหรืออ่านไม่ได้ขึ้น – · แทร็กเสียงใช้ชื่อแถวแบบหน้ากราฟเสียง */}
            {audio && info ? <dl className="brn-kv" data-brnaudioinfo>
              <dt>Codec</dt><dd>{codecName(info.codec)}{info.profile ? <span className="small"> {info.profile}</span> : null}</dd>
              <dt>Channels</dt><dd>{chTxt(info.channels)}<span className="small"> ({info.channels} {info.channels === 1 ? "channel" : "channels"})</span></dd>
              <dt>Sample rate</dt><dd>{info.sample_rate ? `${+(info.sample_rate / 1000).toFixed(1)} kHz` : NA}</dd>
              <dt>Bit depth</dt><dd>{info.bit_depth ? `${info.bit_depth}-bit` : NA}</dd>
              <dt>ภาษา</dt><dd>{info.lang || NA}</dd>
              <dt>ชนิดไฟล์</dt><dd>{fmtName(info.format)}</dd>
              <dt>ขนาดไฟล์</dt><dd>{mb(info.size)}</dd>
              <dt>บิตเรตในไฟล์</dt><dd title="บิตเรตที่ไฟล์เขียนไว้ เทียบกับค่าเฉลี่ยที่วัดได้จริงข้างบน">{info.stream_bitrate ? rate(info.stream_bitrate / 1000) : NA}</dd>
              <dt>แทร็ก</dt><dd>{`เสียง ${Number(info.track.slice(1)) + 1} จาก ${info.audio}`}{info.video ? <span className="small"> และมีวิดีโอด้วย</span> : null}</dd>
            </dl> : <dl className="brn-kv">
              <dt>Codec</dt><dd>{info ? <>{codecName(info.codec)}{info.profile ? <span className="small"> {info.profile}</span> : null}</> : NA}</dd>
              <dt>ขนาดภาพ</dt><dd>{info ? <>{info.width} × {info.height}{scanTxt(info.field_order) ? <span className="small"> {scanTxt(info.field_order)}</span> : null}</> : NA}</dd>
              <dt>ความลึกสี</dt><dd>{info && info.bit_depth ? <>{info.bit_depth} บิต<span className="small"> ({info.pix_fmt})</span></> : NA}</dd>
              <dt>มาตรฐานสี</dt><dd>{info && colorTxt(info) ? colorTxt(info) : NA}</dd>
              <dt>Frame rate</dt><dd>{info ? `${+info.fps.toFixed(3)} fps` : NA}</dd>
              <dt>ชนิดไฟล์</dt><dd>{info ? fmtName(info.format) : NA}</dd>
              <dt>ขนาดไฟล์</dt><dd>{info ? mb(info.size) : NA}</dd>
              <dt>บิตเรตในไฟล์</dt><dd title="บิตเรตที่ไฟล์เขียนไว้ เทียบกับค่าเฉลี่ยที่วัดได้จริงข้างบน">{info && info.stream_bitrate ? rate(info.stream_bitrate / 1000) : NA}</dd>
              <dt>แทร็ก</dt><dd>{info ? `วิดีโอ ${info.video} เสียง ${info.audio}` : NA}</dd>
            </dl>}
          </section>
        </aside>

        <section className="card brn-main">
          {/* หัวกราฟไม่พอ ซ่อนข้อความช่วงเวลา (แกนเวลาบอกอยู่แล้ว) วัดจากที่ว่างจริง · เดิมข้อความตกสองบรรทัดหัวกราฟสูงขึ้น (เจอตอนตรวจที่ 1280) */}
          <div className="brn-head" ref={headRef} data-brnhead={headCompact ? "compact" : "full"}>
            <div>
              <b>{audio ? "Audio Bitrate" : "Video Bitrate"}</b>{!headCompact && <span className="small" data-brnheadinfo>{S.n ? ` ช่วง ${clock(z0)}–${clock(z1)}` : ""}</span>}
            </div>
            {/* รูปแบบกราฟ (BUGS ข้อ 42) */}
            {/* ชื่อหน้าดรอปดาวน์ เดิมเห็นแค่คำว่าแท่ง ไม่รู้ว่าเลือกอะไร (BUGS ข้อ 105 พี่กันสั่ง 13 พ.ย. 2569 "ใส่ชื่อหน่อย แบบ ชนิดกราฟ หรืออะไรก็ได้ ตามที่เธอคิด") */}
            <span className="brn-style" data-brnstyle><span className="lbl">รูปแบบกราฟ</span><Dropdown label="รูปแบบกราฟ" value={bstyle} onChange={setBStyle} options={STYLES} /><InfoTip title="รูปแบบกราฟ" tip={TIP_STYLE} /></span>
            {/* แถบซูมเรียงแบบหน้ากราฟเสียง คำว่าซูม ปุ่มแว่นขยายกับเส้นเลื่อน ปุ่มช่วงซูม เส้นแบ่ง ปุ่มรีเซ็ต · หัวกราฟแคบ ปุ่มช่วงซูมเป็นดรอปดาวน์
                (BUGS ข้อ 103 พี่กันสั่ง 13 พ.ย. 2569 "ที่หน้าบิตเรต เธอยังไม่ปรับเรื่องปุ่มซูมเลยนะ เอาให้มันเหมือนกันสิ" · เดิมรีเซ็ตติดแว่นขยาย คำว่าซูมอยู่กลาง) */}
            <div className="brn-zoom zoombox">
              <span className="lbl">ซูม</span>
              <span className="zbtns">
                <button type="button" className="zb" onClick={() => zoomBy(2)} disabled={!zoom.length} aria-label="ซูมออก" title="ซูมออก (หมุนล้อเมาส์ลงในกราฟ)" data-brnzoomout>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M8 11h6M20 20l-4-4" /></svg></button>
                <BrHZoom total={total} span={span} onSpan={setSpan} off={!S.n} />
                <button type="button" className="zb" onClick={() => zoomBy(0.5)} disabled={!S.n || span <= HZ_MIN * 1.01} aria-label="ซูมเข้า" title="ซูมเข้า (หมุนล้อเมาส์ขึ้นในกราฟ)" data-brnzoomin>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M8 11h6M11 8v6M20 20l-4-4" /></svg></button>
              </span>
              <span className="zseg"><Seg small label="ช่วงซูม" value={zKey} onChange={pickZ} options={Z_OPTS} /></span>
              <span className="zdd" title={`ช่วงที่ดูยาว ${clock(span)}`} data-brnzoomdd><Dropdown label="ช่วงซูม" value={zKey} onChange={pickZ} options={Z_OPTS} display={(o) => o?.label ?? clock(span)} /></span>
              <span className="fsep" aria-hidden="true" />
              <button type="button" className="zb" onClick={resetZoom} disabled={!zoom.length && vz === 1} aria-label="รีเซ็ตซูม" title={!zoom.length && vz === 1 ? "ดูทั้งไฟล์และขยายแนวตั้ง 1 เท่าอยู่แล้ว" : "รีเซ็ต กลับทั้งไฟล์ ขยายแนวตั้ง 1 เท่า"} data-brnzoomreset><IcRefresh size={15} /></button>
            </div>
          </div>
          {running && <div className="brn-prog" data-brnprog><i style={{ width: `${readPct}%` }} /><span>{mode === "frm" ? "ถอดภาพเพื่อดูชนิดเฟรม" : "กำลังอ่านไฟล์"} {readPct}%</span></div>}
          <div className="brn-ov" onMouseDown={(e) => { ovDrag.current = 1; ovMove(e.clientX, e.currentTarget); }} onMouseMove={(e) => { if (ovDrag.current && (e.buttons & 1)) ovMove(e.clientX, e.currentTarget); }} onMouseUp={() => { ovDrag.current = null; }} title={zoom.length ? "ลากกรอบเพื่อเลื่อนช่วงที่ดู" : "ภาพรวมทั้งไฟล์"} data-brnov>
            <canvas ref={ovRef} style={{ width: "100%", height: ovH, display: "block" }} />
            {zoom.length > 0 && <div className="brn-win" style={{ left: `calc(${L}px + (100% - ${L + R}px) * ${z0 / total})`, width: `calc((100% - ${L + R}px) * ${span / total})` }} />}
          </div>
          <div className="brn-plotrow">
          <div ref={plotRef} className="brn-plot" onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={() => { setHover(null); drag.current = null; setSel(null); }} onWheel={onWheel}
            onDoubleClick={resetZoom} data-brnplot>
            <canvas ref={cvRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
            {cutAt != null && <div className="brn-cut" style={{ left: Math.max(L + 6, Math.min(xOf(Math.max(cutAt, z0)) + 6, L + pw - 230)), top: T + ph - 34 }} data-brncut
              onMouseDown={(e) => e.stopPropagation()} onMouseUp={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
              อ่านได้ถึง {clock(cutAt)} จาก {clock(info?.duration ?? 0)}
              <InfoTip title="อ่านไม่ถึงท้ายไฟล์" tip={{ w: `โปรแกรมอ่านข้อมูลได้ถึงนาที ${clock(cutAt)} แต่ไฟล์บอกว่ายาว ${clock(info?.duration ?? 0)} ส่วนที่เป็นลายเส้นเอียงคือช่วงที่อ่านไม่ได้ ไม่ใช่ช่วงที่บิตเรตเป็นศูนย์  มักเกิดจากไฟล์ดาวน์โหลดไม่ครบหรือเสียช่วงท้าย  ค่าเฉลี่ยสูงสุดต่ำสุดในแผงซ้ายคิดจากส่วนที่อ่านได้เท่านั้น` }} />
            </div>}
            {sel && <div className="brn-sel" style={{ left: xOf(sel[0]), width: Math.max(1, xOf(sel[1]) - xOf(sel[0])), top: T, height: ph }}><span>{clock(sel[0])} – {clock(sel[1])}</span></div>}
            {hover && !sel && hv > 0 && (
              <div className="brn-tip" style={{ left: tipLeft, top: Math.max(T, Math.min(hover.y - 30, box.h - 120)) }} data-brntip>
                <div className="small">{clockMs(hover.t)}</div>
                <b>{rate(hv)}</b>
                <div className={"small " + (pct(hv) > 0 ? "up" : "down")}>{pct(hv) > 0 ? "สูงกว่า" : "ต่ำกว่า"}ค่าเฉลี่ย {Math.abs(pct(hv))}%</div>
                {mode === "frm" && hi >= 0 && <div className="brn-tipft"><span className={"brn-ft t" + S.typ[hi]}>{S.typ[hi]}</span>{typeName[S.typ[hi]] ?? "ไม่รู้ชนิด"}</div>}
                {group > 1 && <div className="small">แท่งนี้รวม {hb ? hb.i1 - hb.i0 + 1 : group} ช่วง</div>}
              </div>
            )}
            {!S.n && !running && <div className="brn-empty" data-brnerr>{err ? <><b>อ่านไฟล์นี้ไม่ได้</b><span>{err}</span><button type="button" className="btn btn-ghost btn-sm" onClick={pick}><IcFile size={15} />เปิดไฟล์อื่น</button></> : "ยังไม่มีข้อมูล"}</div>}
          </div>
          <BrVZoom value={vz} onChange={setVz} top={T} bottom={B} />
          </div>
          <div className="brn-foot">
            <span className="brn-vz"><span className="lbl">ขยายแนวตั้ง</span>
              <Seg small label="ขยายแนวตั้ง" value={vz === 1 || vz === 2 || vz === 4 ? String(vz) : "x"} onChange={(v) => setVz(Number(v))} options={[{ value: "1", label: "1×" }, { value: "2", label: "2×" }, { value: "4", label: "4×" }]} />
              <span className="brn-vzval" data-brnvz>{vzTxt(vz)}</span></span>
            {/* สีของคำอธิบายตามชุดสีที่เลือก · สีตามโทนใช้คลาสเดิม ชุดอื่นเขียนสีตรง ติด data-keepcolor ตัวแปลงโทนไม่แตะ (ข้อ 37) */}
            {(() => {
              const lg = pal === "bv" ? { lo: `linear-gradient(${BV.lo1}, ${BV.lo0})`, hi: `linear-gradient(${BV.hi1}, ${BV.hi0})`, line: BV.line, over: BV.over, cum: BV.cum }
                : pal === "custom" ? { lo: alpha(custom, 0.35), hi: alpha(custom, 0.85), line: custom, over: "", cum: "" } : null;
              const st2 = (k: "lo" | "hi" | "line" | "over" | "cum") => (lg && lg[k] ? { background: lg[k] } : undefined);
              const barLike = bstyle === "bar" || bstyle === "led";
              return <>
                {barLike ? <>
                  <span className="brn-leg" data-keepcolor><i className="lo" style={st2("lo")} />ต่ำกว่าค่าเฉลี่ยสะสม</span>
                  <span className="brn-leg" data-keepcolor><i className="hi" style={st2("hi")} />สูงกว่าค่าเฉลี่ยสะสม</span>
                </> : <span className="brn-leg" data-keepcolor><i className={"ln" + (bstyle === "dot" ? " dt" : "")} style={st2("line") ?? { background: "var(--accent-d)" }} />บิตเรต</span>}
                <span className="brn-leg" data-keepcolor><i className="over" style={st2("over")} />เกินเพดาน</span>
                <span className="brn-leg" data-keepcolor><i className="cum" style={st2("cum")} />ค่าเฉลี่ยสะสม</span>
              </>;
            })()}
            {!audio && <span className="brn-leg"><i className="key" />คีย์เฟรม</span>}
          </div>
          {/* แถบปักจุดจองที่ไว้ตลอด ยังไม่ปักขึ้นคำแนะนำจาง ๆ กราฟไม่ถูกดัน */}
          {!(pin != null && pi >= 0) && <div className="brn-pin empty" data-brnpinslot>ลากในกราฟเพื่อซูม หมุนล้อเมาส์เพื่อซูมเข้าออก ดับเบิลคลิกเพื่อดูทั้งไฟล์ และคลิกในกราฟเพื่อปักจุดดูค่าตรงนั้น</div>}
          {pin != null && pi >= 0 && (
            <div className="brn-pin" data-brnpin>
              <span className="brn-pinmark" />
              <span>ปักไว้ที่ <b>{clockMs(pin)}</b></span>
              <b>{rate(pv)}</b>
              <span className="small">{pct(pv) > 0 ? "สูงกว่า" : "ต่ำกว่า"}ค่าเฉลี่ย {Math.abs(pct(pv))}%</span>
              {mode === "frm" && <span className="brn-tipft"><span className={"brn-ft t" + S.typ[pi]}>{S.typ[pi]}</span>{typeName[S.typ[pi]] ?? ""}</span>}
              <span style={{ flex: 1 }} />
              {mode === "frm" && <>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => jumpI(true)} data-brnprevi>‹ I เฟรมก่อน</button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => jumpI(false)} data-brnnexti>I เฟรมถัดไป ›</button></>}
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPin(null)} title="เอาจุดที่ปักออก (Esc)">เอาออก</button>
            </div>
          )}
        </section>
      </div>
      <span hidden>{toneVer}{ver}</span>
    </>
  );
}
