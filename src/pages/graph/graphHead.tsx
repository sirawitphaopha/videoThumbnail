/* หัวหน้า แถบตัวเลือก แถบซูม ปุ่มสไตล์
   แยกจาก GraphPage.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 4) เนื้อโค้ดยกมาทั้งก้อน */
import { thumbUrl } from "../../lib/api";
import { addFiles } from "../../lib/convertJob";
import Dropdown from "../../components/Dropdown";
import { chText } from "../../components/ui";
import { fmtSize } from "../../lib/format";
import { IcExpand, IcBitrate, IcRefresh } from "../../components/icons";
import FullBtn from "../../components/FullBtn";
import { PadCustom } from "../../components/ColorPick";
import { Prefs, CUSTOM, THEMES, THEME_ORDER, VIEWS, VIEW_ICON, spanDigits, spekRamp, tfmt, tfmtD, themeOf } from "./common";
import { GraphOptions } from "./parts";
import { HZ_MIN, HZoom, TimeScroll } from "./zoom";
import { spekEdge } from "./SpekView";
import { Swatch, PREF_KEY } from "./graphPrefs";
import type { B1 } from "./graphCtx";

export function headBits(pg: B1) {
  const { cmpBack, compareOther, dur, error, fileName, goHome, grabBusy, info, movie, names, onBitrate, openOther, panTo, prefs, setCmp, setCmpBack, setMode, setPref, setPrefs, setResetN, setSb, setSpan, setSwSnap, setSzRaw, setTagFor, setTrack, setVz, setWin, setZoom, span, swSnap, switchView, t0, t1, th, track, updateSettings, view, zoom, zoomAll, zoomBy } = pg;
  const path = pg.path!;
  const thumb = info?.audioOnly
    ? <div className="fnote" style={{ background: th.lane, color: th.rms, border: `1px solid ${th.peak}` }}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M9 18V5l11-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="17" cy="16" r="3" /></svg></div>
    : movie?.thumb ? <img className="fthumb" src={thumbUrl(movie.thumb) ?? ""} alt="" /> : <div className="fthumb none" />;
  const head = (
    <div className="agtop">
      {/* กลับหน้ารวมกราฟเสียง (คิว 7 · เดิมมีแค่ เปิดไฟล์อื่น ที่เปิดหน้าต่างเลือกไฟล์ กลับหน้ารวมไม่ได้) */}
      <button type="button" className="btn btn-ghost" onClick={goHome} title="กลับหน้ารวมกราฟเสียง ดูไฟล์ที่เปิดล่าสุด" data-graphhome>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>หน้ารวม</button>
      {cmpBack && path && cmpBack.files.includes(path) && <button type="button" className="btn btn-ghost" onClick={() => { const c = cmpBack; setCmpBack(null); setCmp(c); }} title="กลับไปหน้าเทียบสองไฟล์" data-graphbackcmp><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v18M4 7h4v10H4zM16 7h4v10h-4z" /></svg>กลับไปเทียบ</button>}
      <div className="fchip">{thumb}<div style={{ minWidth: 0 }}>
        <button type="button" className="nm linklike" onClick={() => path && setTagFor(path)} title="กดเพื่อดูข้อมูลเพลงกับรูปปก" data-graphtags>{fileName.replace(/\.[^.]+$/, "")}<span className="ext">{fileName.match(/\.[^.]+$/)?.[0] ?? ""}</span></button>
        <div className="meta">{info ? `${info.audioOnly ? "ไฟล์เสียง " : ""}${fmtSize(info.size)} ยาว ${tfmt(info.duration)}${info.audioOnly && !movie ? " และไม่ได้อยู่บนชั้นวาง" : ""}` : error ? "อ่านข้อมูลเสียงไม่ได้" : "กำลังอ่านข้อมูลไฟล์"}</div>
      </div></div>
      {info && info.tracks.length > 1 && (
        <span data-graphtrack><Dropdown label="แทร็กเสียง" value={String(track)} onChange={(v) => setTrack(Number(v))}
          options={info.tracks.map((x) => ({ value: String(x.index), label: `เสียง ${x.index + 1} ${x.lang ?? "ไม่ระบุภาษา"} ${x.codec} ${chText(x.layout)}` }))} /></span>
      )}
      <button type="button" className="btn btn-ghost" onClick={openOther}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>เปิดไฟล์อื่น</button>
      {/* เทียบกับไฟล์อื่นจากกราฟที่เปิดอยู่ ไม่ต้องผ่านคิวแปลง (พี่กันสั่ง 9 พ.ย. 2569 "เราเปิดกราฟอยู่แล้ว เราอยากเปิดเทียบกับไฟล์อื่นเลย") */}
      <button type="button" className="btn btn-ghost" onClick={compareOther} title="เลือกไฟล์อื่นมาเทียบกับไฟล์นี้" data-graphcompare><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v18M4 7h4v10H4zM16 7h4v10h-4z" /></svg>เทียบ</button>
      {/* หน้าแปลงเสียงอยู่ข้างปุ่มเปิดไฟล์อื่น (มอคอัปหัวข้อ 7) · กดจากหน้ากราฟ ไฟล์ที่ดูอยู่เข้าคิวเลย ไม่ต้องเลือกใหม่ (พี่กันบอก 9 พ.ย. 2569 "มันต้องใช้ไฟล์นั้นเลยสิ") · รอแปลงอยู่แล้วไม่เพิ่มแถว กันกดซ้ำโดยไม่ตั้งใจ */}
      <button type="button" className="btn btn-ghost" onClick={() => { if (path) addFiles([path], true, track); setMode("convert"); }} title="แปลงไฟล์นี้ โดยใส่เข้าคิวแปลงเสียง" data-graphconvert><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 7h13l-3-3M20 17H7l3 3" /></svg>แปลงเสียง</button>
      {/* ดูบิตเรตของแทร็กเสียงที่ดูอยู่ ไปหน้าบิตเรตพร้อมไฟล์และแทร็กนี้ · ไฟล์เสียงล้วนก็กดได้ (พี่กันสั่ง 10 พ.ย. 2569 "เพิ่มดูบิตเรต จากดูกราฟเสียงได้" · "ทำไมเราดูบิตเรตของเสียงไม่ได้") */}
      {onBitrate && path && info && <button type="button" className="btn btn-ghost" onClick={() => onBitrate(path, `a${track}`)} title="ดูบิตเรตของแทร็กเสียงนี้ และสลับไปดูวิดีโอหรือแทร็กอื่นได้ในหน้าบิตเรต" data-graphbitrate><IcBitrate size={16} />Bitrate</button>}
    </div>
  );
  const seg = <T extends string | number>(opts: [T, React.ReactNode][], cur: T, set: (v: T) => void, attr: string) => (
    <div className="seg sm">{opts.map(([k, l]) => <button key={String(k)} type="button" className={cur === k ? "on" : ""} onClick={() => set(k)} {...{ [attr]: String(k) }}>{l}</button>)}</div>
  );
  // เส้นเลื่อนกับปุ่มนาทีเป็นซูมตัวเดียวกัน คำว่าซูมอยู่หน้าสุดคลุมทั้งสองอย่าง เส้นแบ่งกั้นแค่ปุ่มรีเซ็ต
  // (พี่กันสั่ง 13 พ.ย. 2569 "ขอเส้นแบ่งเหมือนด้านล่าด้วย" แล้วทัก "แบ่งถูกละเหรอ ทำไปเเยำคำว่าซูมออก" · "อันไหนคอือซูมกันเเน่นะ เส้นซูม หรือนาทีที่เห็น" หลังแคลร์วางเส้นแบ่งกั้นระหว่างเส้นเลื่อนกับคำว่าซูม)
  const pickZoom = (v: string) => { setZoom(v === "all" ? "all" : Number(v)); setWin(null); };
  const zoomBox = (opts: [number | "all", string][], lbl: string) => (
    <span className={"zoombox" + (lbl === "ซูม" ? "" : " zfix")} style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span className="lbl">{lbl}</span>
      {lbl === "ซูม" && <span className="zbtns">
        <button type="button" className="zb" onClick={() => zoomBy(2)} disabled={zoom === "all"} aria-label="ซูมออก" title="ซูมออก (Ctrl หมุนล้อเมาส์ลง)" data-zoomout><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="M20 20l-4.8-4.8M7.5 10.5h6" /></svg></button>
        <HZoom dur={dur} span={span} onSpan={setSpan} onBusy={grabBusy} />
        <button type="button" className="zb" onClick={() => zoomBy(0.5)} disabled={span <= HZ_MIN * 1.01} aria-label="ซูมเข้า" title="ซูมเข้า (Ctrl หมุนล้อเมาส์ขึ้น)" data-zoomin><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="M20 20l-4.8-4.8M7.5 10.5h6M10.5 7.5v6" /></svg></button>
      </span>}
      {/* หัวกราฟแคบ ปุ่มช่วงซูมเป็นดรอปดาวน์ สลับด้วย @container ใน app.css (พี่กันสั่ง 13 พ.ย. 2569 "ตัวนี้เปลี่ยนเป็นดรอปดาวด้วย ถ้าจอเล็ก")
          ลากเส้นเลื่อนไปค่าที่ไม่ตรงปุ่มไหน ดรอปดาวน์ขึ้นความยาวช่วงที่ดูแบบเดียวกับเวลาบนหัวกราฟ */}
      <span className="zseg">{seg(opts.map(([k, l]) => [String(k), l] as [string, string]), String(zoom), pickZoom, "data-zoom")}</span>
      <span className="zdd" title={`ช่วงที่ดูยาว ${tfmtD(span, spanDigits(span))}`} data-zoomdd><Dropdown label={lbl === "ซูม" ? "ช่วงซูม" : lbl} value={String(zoom)} onChange={pickZoom} keepLeftOf={spekEdge}
        options={opts.map(([k, l]) => ({ value: String(k), label: l }))} display={(o) => o?.label ?? tfmtD(span, spanDigits(span))} /></span>
      {lbl === "ซูม" && <>
        <span className="fsep" aria-hidden="true" />
        <button type="button" className="zb" aria-label="รีเซ็ตซูม" title="รีเซ็ต กลับทั้งไฟล์ ซูมแนวตั้ง 1 เท่า" data-zoom-reset onClick={() => { setZoom("all"); setWin(null); setVz(1); setSzRaw(1); setSb(0); setResetN((n) => n + 1); }}><IcRefresh size={15} /></button>
      </>}</span>
  );
  /** แถบเลื่อนซ้ายขวาใต้กราฟ แบบ Audacity · ก้อนกว้างตามช่วงที่ซูม ลากเพื่อเลื่อน กดที่แถบเพื่อกระโดด */
  const scroller = (left: number, right: number) => (
    <TimeScroll dur={dur} t0={t0} t1={t1} left={left} right={right} onPan={panTo} onBusy={grabBusy} />
  );
  // ปุ่มสีหน้าวิเคราะห์อยู่มุมขวาบนของกราฟ พี่กันเลือกแบบแถบสีพร้อมชื่อจากมอคอัป pick-ui.html (9 พ.ย. 2569) · ปุ่มหน้ารูปคลื่นกับหน้าความถี่อยู่แถวปุ่มมุมมองตามเดิม พี่กันไม่ได้สั่งย้าย ("รายละเอียด แท่ง audisity ไม่ได้ให้ย้าย")
  const spekSw = (n: Prefs["scmap"]) => <Swatch ramp={spekRamp(n, th.ramp, prefs.spekLight)} />;
  const styleTools = (
    <div className={"plottools onspek" + (prefs.spekLight ? " light" : "")} data-plottools>
      {seg<Prefs["scmap"]>([["heat", <>{spekSw("heat")}สีความร้อน</>], ["rainbow", <>{spekSw("rainbow")}สีรุ้ง</>], ["mono", <>{spekSw("mono")}ขาวดำ</>], ["theme", <>{spekSw("theme")}สีตามชุด</>]], prefs.scmap, (v) => setPref("scmap", v), "data-scmap")}
      <button type="button" className={"sptick" + (prefs.spekLight ? " on" : "")} role="checkbox" aria-checked={prefs.spekLight} onClick={() => setPref("spekLight", !prefs.spekLight)} data-speklight>
        <i aria-hidden="true">{prefs.spekLight && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7" /></svg>}</i>พื้นสว่าง
      </button>
    </div>
  );
  const ctl = (
    <div className="agctl">
      <div className="seg agviews">{VIEWS.map(([k, l]) => <button key={k} type="button" className={view === k ? "on" : ""} onClick={() => switchView(k)} data-view={k}
        disabled={k === "cmp" && !names.includes("FL")} title={k === "cmp" && !names.includes("FL") ? "ซ้อนเทียบใช้กับแทร็กที่มีช่องซ้ายขวา" : undefined}>{VIEW_ICON[k]}{l}</button>)}</div>
      {/* ปุ่มแบบรูปคลื่นย้ายลงหัวการ์ดรูปคลื่น (BUGS ข้อ 12 · พี่กัน "พอเราปรับโโยเอา audacity มาเป็นตัวหลัก เจ้ากราฟแท่งมันจะเหลือ 1 อัน เอามันย้ายลงมาในการ์ดเลย") */}
      <div className="sws" style={{ marginLeft: "auto" }} role="group" aria-label="ชุดสี">{THEME_ORDER.map((n) => <button key={n} type="button" className={"sw" + (prefs.theme === n ? " on" : "")} aria-label={"ชุดสี" + n} title={"ชุดสี" + n} onClick={() => setPref("theme", n)} data-theme={n}
        style={{ background: `linear-gradient(135deg,${THEMES[n].ramp[2]},${THEMES[n].ramp[5]} 60%,${THEMES[n].ramp[7]})` }} />)}{/* เปิดแผงจำชุดสีตอนนั้นไว้ · สีเดิมคือสีที่กราฟใช้อยู่ตอนเปิด · ตกลงใช้สีกำหนดเองแม้ยังไม่ได้แตะสี · ยกเลิกคืนชุดสีเดิมทั้งชุด */}
        <PadCustom pad={prefs.customColor} what="สีกราฟ" custom={prefs.theme === CUSTOM} panelStyle={{ left: "auto", right: 0, zIndex: 30 }}
          oldColor={swSnap?.old} onOpen={() => setSwSnap({ theme: prefs.theme, color: prefs.customColor, old: prefs.theme === CUSTOM ? prefs.customColor : THEMES[prefs.theme].rms })}
          onOk={() => setPrefs((p) => { const n = { ...p, theme: CUSTOM }; try { localStorage.setItem(PREF_KEY, JSON.stringify(n)); } catch { /* เก็บไม่ได้ ใช้ค่าในหน้าไปก่อน */ } return n; })}
          onCancel={() => { const sn = swSnap; if (sn) setPrefs((p) => { const n = { ...p, theme: sn.theme, customColor: sn.color }; try { localStorage.setItem(PREF_KEY, JSON.stringify(n)); } catch { /* เก็บไม่ได้ */ } return n; }); }}
          onPad={(c) => setPrefs((p) => { const n = { ...p, customColor: c, theme: CUSTOM }; try { localStorage.setItem(PREF_KEY, JSON.stringify(n)); } catch { /* เก็บไม่ได้ ใช้ค่าในหน้าไปก่อน */ } return n; })}
          trigger={(open, toggle) => <button type="button" className={"sw sw-custom" + (prefs.theme === CUSTOM ? " on" : "")} aria-expanded={open} aria-label="ชุดสีกำหนดเอง" title="ชุดสีกำหนดเอง เลือกสีหลักสีเดียว โปรแกรมไล่ชุดสีให้" onClick={toggle} data-sw-custom
            // สีที่เลือกเล็กลง มีขอบขาวคั่นกับขอบรุ้ง (BUGS ข้อ 79 · พี่กันสั่ง 13 พ.ย. 2569 "สีที่เลือกเล็กลงกว่านี้ เเละใส่ขอบขาว")
            style={{ padding: 2, background: `${prefs.theme === CUSTOM ? `linear-gradient(135deg,${th.ramp[2]},${th.ramp[5]} 60%,${th.ramp[7]})` : `linear-gradient(135deg,${themeOf(prefs.customColor).ramp[2]},${themeOf(prefs.customColor).ramp[5]} 60%,${themeOf(prefs.customColor).ramp[7]})`} content-box, linear-gradient(white, white) padding-box, conic-gradient(#e0457b,#f0a23b,#e8d23a,#4cc38a,#3b8fe0,#8a5ae0,#e0457b) border-box` }} />} /></div>
      <GraphOptions on={zoomAll} onChange={(v) => updateSettings({ graphZoomAll: v })} />
      {/* ขยายกราฟเต็มจอ พับแผงลำโพงซ้าย กดอีกครั้งกางคืน จำไว้ (พี่กันสั่ง 8 พ.ย. 2569) */}
      <button type="button" className={"btn btn-ghost btn-sm" + (prefs.wide ? " pressed" : "")} style={{ width: 32, padding: 0, flex: "none" }} aria-pressed={prefs.wide} title={prefs.wide ? "แสดงแผงลำโพง" : "ซ่อนแผงลำโพง กราฟกว้างขึ้น"} aria-label={prefs.wide ? "แสดงแผงลำโพง" : "ซ่อนแผงลำโพง"} onClick={() => setPref("wide", !prefs.wide)} data-graphwide><IcExpand size={14} /></button>
      <FullBtn />
      {/* ชื่อชุดสีที่เคยเขียนต่อท้ายเอาออก ปุ่ม แบบ Audacity เพิ่มเข้ามาแล้วชื่อตกบรรทัดสองตัวเดียว · ชุดที่เลือกมีวงกรอบ ชี้แล้วขึ้นชื่อ */}
    </div>
  );
  return { thumb, head, seg, pickZoom, zoomBox, scroller, spekSw, styleTools, ctl };
}
