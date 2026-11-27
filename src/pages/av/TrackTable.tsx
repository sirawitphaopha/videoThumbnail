/* ตารางแทร็ก แถวไฟล์แนบ Chapter และแถวแยกแบบ gMKVExtractGUI
   แยกจาก AvPage.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 2) เนื้อโค้ดยกมาทั้งก้อน */
import { Fragment } from "react";
import LangPicker from "./LangPicker";
import InfoTip from "../../components/InfoTip";
import { convertLabel } from "../../lib/codecs";
import { Seg } from "../../components/ui";
import { kb } from "../../lib/popup";
import { FtChip, ftName } from "../../lib/ftypes";
import { langName } from "../../lib/langs";
import { setAv } from "../../lib/avJob";
import { IbUndo, IcGraph } from "../../components/icons";
import { BUSY, DelayBox, DtLine, KIND_WORD, KindIcon, MAIN_TIP, baseName, rowText } from "./parts";
import { patch, setMain, move, removeAdded, setDelay } from "./trackOps";
import type { AvCtx } from "./avCtx";
import { trackDetail } from "./TrackSettings";

export default function TrackTable({ pg }: { pg: AvCtx }) {
  const { av, changed, counts, coverDirty, goSlot, method, mi, miErr, nth, openCodec, output, p, panel, postOpen, resetEdits, sel, setChapOpen, setPosterFor, setSubFor, trackPicks, tracks, working, xExtra, xItems, xKeyOf, xOthers, xToggle } = pg;
  const movie = pg.movie!;
  const { detailHead, detailBody } = trackDetail(pg);
  return (
    <>
        {/* ตารางแทร็ก */}
        <div className="card">
          <h3 style={{ justifyContent: "space-between" }}><span>{method === "extract" ? "แทร็กในหนัง ติ๊กชิ้นที่จะแยก" : "แทร็กในไฟล์ใหม่ เรียงตามลำดับ"}</span>
            <span className="row8" style={{ flexWrap: "nowrap" }}>
              {/* สูง 24 เท่าหัวตาราง ปุ่มโผล่แล้วตารางไม่ขยับ */}
              {method !== "extract" && changed && <button type="button" className={"btn btn-xs " + (working ? "btn-wait" : "btn-ghost")} style={{ height: 24, gap: 5 }} aria-disabled={working || undefined}
                title={working ? BUSY : "เอาไฟล์ที่เพิ่ม ปก ฟอนต์ และที่แก้ในตารางออกทั้งหมด ไฟล์หนังยังอยู่"} onClick={resetEdits} data-reset-edits><IbUndo size={14} />คืนเป็นไฟล์เดิม</button>}
              <span className="small" style={{ fontWeight: 400 }} data-counts>ภาพ {counts.video} เสียง {counts.audio} ซับ {counts.subs}{counts.out ? ` เอาออก ${counts.out}` : ""}</span></span></h3>
          <div className="tracks" role="list" aria-label="แทร็กในไฟล์ใหม่">
            <div className="trk head"><span></span><span></span><span>ชนิด</span><span>แทร็กและชื่อแทร็ก</span><span>ภาษา</span><span style={{ textAlign: "center" }}>หลัก<span className="hd-tip">{/* คนอาจเข้าใจว่าวงกลมคือปุ่มติ๊กเลือกแทร็ก (BUGS ข้อ 66 พี่กันสั่ง 12 พ.ย. 2569 "ใส่ ปุ่มรายละเอียดหน่อย เพราะคนน่าจะสับสนกับปุ่มเลือก") */}<InfoTip title="แทร็กหลักคืออะไร" tip={{ w: MAIN_TIP + "\nกดวงกลมเพื่อตั้งแทร็กนั้นเป็นหลัก วงกลมไม่ใช่การติ๊กเลือกว่าจะเอาแทร็กไหน ถ้าไม่อยากได้แทร็กไหนให้กดกากบาทท้ายแถวนั้น" }} /></span></span><span style={{ textAlign: "center", width: 118 }}>ดีเลย์ (ms)</span><span className="trk-naword trk-hd" aria-label="แปลง"><i aria-hidden="true">ไม่แปลง</i><span>แปลง</span></span><span></span></div>
            {tracks.map((t, i) => {
              const { title, parts } = rowText(t, nth(t));
              const ft = ftName(t.kind, t.codec, t.profile);
              /* วิธีแยก · แถวที่อยู่ในหนังมีช่องติ๊กแทนปุ่มเลื่อน (ลำดับไม่มีผลกับการแยก) · ไฟล์ที่เพิ่มเป็นไฟล์อยู่แล้ว ไม่มีอะไรให้แยก */
              const xMode = method === "extract";
              const xit = xMode && t.inMovie ? xItems.find((x) => x.key === xKeyOf(t)) ?? null : null;
              const xOn = !!xit && av.xPick.includes(xit.key);
              const xWhy = !t.inMovie ? "ไฟล์ที่เพิ่มเป็นไฟล์อยู่แล้ว ไม่ต้องแยก" : miErr ? "อ่านข้อมูลแทร็กไม่ได้" : !mi || mi.path !== movie.path ? "กำลังอ่านข้อมูลแทร็ก…" : !xit?.item ? "แทร็กนี้แยกเป็นไฟล์ไม่ได้" : undefined;
              const pills = [
                <span key="a" className={"tpill " + (t.inMovie ? "in" : "new")}>{t.inMovie ? "ในไฟล์" : "เพิ่มใหม่"}</span>,
                !t.keep ? <span key="b" className="tpill off">เอาออก</span> : null,
                t.convert && t.keep ? <span key="f" className="tpill conv">แปลง</span> : null,
                !t.inMovie && t.delayFromName != null && t.delay === t.delayFromName && t.delay !== 0 ? <span key="c" className="tpill warn">ดีเลย์จากชื่อไฟล์</span> : null,
                t.charset === "CP874" ? <span key="d" className="tpill warn">TIS-620</span> : t.charset === "CP1252" ? <span key="d" className="tpill warn" title="ไม่ใช่ UTF-8 และไม่ใช่อักษรไทย อ่านแบบ Windows-1252 (ซับภาษายุโรปแบบเก่า)">Windows-1252</span> : null,
                output === "mkv" && !t.inMovie && t.codec === "webvtt" ? <span key="e" className="tpill conv">แปลงเป็น SRT</span> : null,
                xit?.item ? <span key="x" className="tpill conv">แยกเป็น .{xit.item.ext}</span> : null,
              ].filter(Boolean);
              /* ตอนแยก ค่าของงานรวม (ภาษา หลัก ดีเลย์ แปลง เอาออก) ไม่มีผล โปรแกรมแยกตามค่าเดิมในหนัง จึงปิดไว้พร้อมเหตุผล */
              const off = working ? BUSY : xMode ? "ตอนแยกใช้ค่าเดิมในหนัง ค่านี้ใช้ตอนรวมเข้าไฟล์หนัง" : undefined;
              /* กดแถวเดิมอีกครั้งพับเก็บส่วนตั้งค่าแทร็ก (BUGS ข้อ 33) */
              return (
                <Fragment key={t.key}>
                <div role="listitem" className={"trk" + (t.keep ? "" : " out") + (t.key === sel ? " sel" : "") + (xMode ? " xmode" : "") + (xMode && !t.inMovie ? " xna" : "")} onClick={() => { setAv({ sel: sel === t.key ? null : t.key }); if (!coverDirty) setPosterFor(null); }} data-trk={t.key} data-kind={t.kind} aria-expanded={panel === "under" ? t.key === sel : undefined}>
                  {xMode ? (
                  <div className="mv xpick" onClick={(e) => e.stopPropagation()}>
                    {t.inMovie && <span className={"chk" + (xWhy ? " off" : "")} aria-checked={xOn} aria-disabled={!!xWhy || undefined} aria-label={`เลือก ${title} เพื่อแยกเป็นไฟล์`} title={xWhy}
                      {...kb(() => { if (!xWhy && xit) xToggle(xit.key); })} role="checkbox" data-xpick={xit?.key}><span className={"cbx " + (xOn ? "on" : "off")}>{xOn && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>}</span></span>}
                  </div>
                  ) : (
                  <div className="mv" onClick={(e) => e.stopPropagation()}>
                    <button type="button" aria-label={`เลื่อน ${title} ขึ้น`} aria-disabled={i === 0 || !!off || undefined} title={off} onClick={() => { if (i > 0 && !off) move(t.key, -1); }}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true"><path d="M6 15l6-6 6 6" /></svg></button>
                    <button type="button" aria-label={`เลื่อน ${title} ลง`} aria-disabled={i === tracks.length - 1 || !!off || undefined} title={off} onClick={() => { if (i < tracks.length - 1 && !off) move(t.key, 1); }}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg></button>
                  </div>
                  )}
                  <KindIcon k={t.kind} />
                  <div><FtChip name={ft} /></div>
                  <div style={{ minWidth: 0 }}>
                    <div className="nm">{title}</div>
                    <div className="dt"><DtLine parts={[...pills, t.name ? <>ชื่อ <b style={{ color: "var(--txt2)" }}>{t.name}</b></> : "", ...parts]} /></div>
                  </div>
                  {t.kind === "video" ? <span className="small">{langName(t.lang)}</span>
                    : <LangPicker value={t.lang} label={`ภาษาของ ${title}`} onChange={(v) => patch(t.key, { lang: v })} disabled={off} />}
                  <div style={{ display: "flex", justifyContent: "center" }} onClick={(e) => e.stopPropagation()}>
                    {t.kind === "video" ? <span className="small">—</span>
                      : <span className={"radio" + (t.default ? " on" : "")} aria-checked={t.default} aria-label={`ตั้ง ${title} เป็น${KIND_WORD[t.kind]}หลัก`}
                        aria-disabled={!!off || !t.keep || undefined} title={off ?? (!t.keep ? "แทร็กที่เอาออกตั้งเป็นหลักไม่ได้" : undefined)}
                        {...kb(() => { if (!off && t.keep) setMain(t.key); })} role="radio" data-main style={{ cursor: off || !t.keep ? "not-allowed" : "pointer", marginTop: 0 }} />}
                  </div>
                  {/* แถวภาพไม่มีดีเลย์ ขีดวางตามโครงช่องดีเลย์ ตรงตำแหน่งเลข 0 ของแถวอื่น (พี่กันสั่ง 11 พ.ย. 2569 "ตรงเลย 0") */}
                  {t.kind === "video" ? <div className="delay trk-na" aria-label="ไม่มีดีเลย์"><i /><span className="avnum">—</span><i /></div> : <DelayBox value={t.delay} onChange={(v) => setDelay(t.key, v)} label={title} off={off} />}
                  {t.kind === "audio" ? (
                    <button type="button" className={"dd" + (off || !t.keep ? " btn-wait" : "")} aria-disabled={!!off || !t.keep || undefined} title={off ?? (!t.keep ? "แทร็กที่เอาออกไม่ต้องแปลง" : "ตั้งค่าแปลงเสียง")}
                      style={t.convert ? { border: "1px solid #9fc4ea", background: "#f3f8fe", color: "#2f6496" } : undefined}
                      onClick={(e) => { e.stopPropagation(); if (!off && t.keep) openCodec(t.key); }} data-conv>
                      <span style={{ whiteSpace: "nowrap", minWidth: 0 }}>{t.convert ? `${convertLabel(t.convert)}${t.inMovie ? (t.pair ?? true ? " เพิ่มคู่" : " แทนที่") : ""}` : "ไม่แปลง"}</span>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
                    </button>
                  ) : t.kind === "subtitle" ? (
                    /* ปุ่มดูซับมีคำ วางในช่องเดียวกับปุ่มตั้งค่าแปลงของแถวเสียง ซับไม่ต้องแปลงอยู่แล้ว (BUGS ข้อ 98 พี่กันถาม 13 พ.ย. 2569 "เราจะดูซํบยังไงงง มันมีหน้าซับ เเต่เราไม่รู้ต้องเปิดจากไหน" · เดิมเป็นไอคอนรูปตาเปล่าท้ายแถว) */
                    <button type="button" className="btn btn-ghost btn-sm trk-actbtn" aria-label={`ดูซับ ${title}`} title="เปิดตัวดูซับ ดูข้อความกับเวลาทุกบรรทัด" onClick={(e) => { e.stopPropagation(); setSubFor(t.key); }} data-subview>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>ดูซับ</button>)
                    /* แถวภาพไม่แปลง ขีดอยู่กึ่งกลางคำว่าไม่แปลงของแถวเสียง (พี่กันสั่ง 11 พ.ย. 2569 "อยู่กึ่งกลางคำว่า ไม่แปลง") */
                    /* วิธีแยก แถวภาพ AVC HEVC เลือกได้ว่าแยกเป็น .mkv หรือสตรีมล้วน (BUGS ข้อ 35 ต่อ) · ช่องนี้ไม่จางแบบช่องของงานรวม */
                    : xMode && xit?.raw ? <span className="xkeep xraw" onClick={(e) => e.stopPropagation()} data-xraw={xit.key}>
                        <span className="xraw-cap">แยกภาพเป็น</span>
                        <span className="xraw-row"><Seg small label="แยกภาพเป็น" value={av.xRaw.includes(xit.key) ? "raw" : "mkv"} onChange={(v) => setAv((s) => ({ xRaw: v === "raw" ? [...s.xRaw.filter((k) => k !== xit.key), xit.key] : s.xRaw.filter((k) => k !== xit.key) }))}
                          options={[{ value: "mkv", label: ".mkv" }, { value: "raw", label: "." + xit.raw }]} />
                        <InfoTip title="แยกภาพเป็นไฟล์แบบไหน" tip={{ w: `.mkv เป็นไฟล์วิดีโอที่มีแต่ภาพ เปิดเล่นได้ทันทีและเก็บความยาวกับจังหวะภาพไว้ครบ ส่วน .${xit.raw} เป็นสตรีมภาพล้วนแบบที่ mkvextract แยก ไม่มีกล่องไฟล์ โปรแกรมเล่นส่วนใหญ่เปิดตรง ๆ ไม่ได้ ใช้เอาไปรวมใหม่ในโปรแกรมอย่าง MKVToolNix ซึ่งต้องบอกอัตราเฟรมเองตอนรวม ทั้งสองแบบไม่แปลงภาพใหม่ คุณภาพเท่าเดิม` }} /></span>
                      </span>
                    : <span className="trk-naword" aria-label="ไม่มีการแปลง"><i aria-hidden="true">ไม่แปลง</i><span>—</span></span>}
                  <div className="avacts" onClick={(e) => e.stopPropagation()}>
                    {/* ดูกราฟเสียงของแทร็กนี้ เปิดหน้ากราฟที่แทร็กเดียวกัน ลำดับนับจากแทร็กเสียงของไฟล์นั้น (พี่กันขอ 15 พ.ย. 2569 "อยากได้ปุ่มกดดูกราฟเสียง") */}
                    {t.kind === "audio" && t.ff != null && !xMode && <button type="button" className="ib" aria-label={`ดูกราฟเสียง ${title}`} title="เปิดหน้ากราฟเสียงของแทร็กนี้"
                      onClick={() => p.onGraph(t.src, tracks.filter((x) => x.src === t.src && x.kind === "audio" && x.ff != null).sort((a, b) => a.ff! - b.ff!).findIndex((x) => x.key === t.key))} data-trkgraph><IcGraph size={14} /></button>}
                    {/* แถวภาพของหนังไม่มีปุ่ม · แถวภาพของไฟล์ที่เพิ่มใช้ปุ่มเอาออกและเอากลับแบบแถวในหนัง (AUDIT ข้อ 15) */}
                    {t.kind === "video" && t.inMovie ? null : !t.inMovie && t.kind !== "video" ? (
                      <button type="button" className="ib bad" aria-label={`เอาไฟล์ ${baseName(t.src)} ออก`} title={off ?? "เอาไฟล์นี้ออก"} aria-disabled={!!off || undefined} onClick={() => { if (!off) removeAdded(t.src); }} data-remove>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
                    ) : t.keep ? (
                      <button type="button" className="ib bad" aria-label={`เอา ${title} ออกจากไฟล์ใหม่`} title={off ?? "เอาแทร็กนี้ออกจากไฟล์ใหม่"} aria-disabled={!!off || undefined} onClick={() => { if (!off) patch(t.key, { keep: false, default: false }); }} data-remove>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
                    ) : (
                      <button type="button" className="ib" aria-label={t.inMovie ? `เอา ${title} กลับ` : `ใส่ ${title} ในไฟล์ใหม่`} title={off ?? (t.inMovie ? "เอากลับ" : "ใส่แทร็กนี้ในไฟล์ใหม่")} aria-disabled={!!off || undefined} onClick={() => { if (!off) patch(t.key, { keep: true }); }} data-undo>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path d="M9 14L4 9l5-5" /><path d="M4 9h10a6 6 0 010 12h-3" /></svg></button>
                    )}
                  </div>
                </div>
                {/* แบบกางใต้แถวที่กด ค่าตั้งต้น (พี่กันเลือกแบบ 2) แถวอื่นเลื่อนลง ยังเห็นแทร็กข้าง ๆ */}
                {panel === "under" && t.key === sel && <div className="card trk-under" role="group" aria-label="ตั้งค่าแทร็ก" data-track-detail>{detailHead}{detailBody}</div>}
                </Fragment>
              );
            })}
            {/* ไฟล์แนบกับบทของหนังเป็นแถวในตาราง ติ๊กแยกจากแถวนั้นได้ (BUGS ข้อ 35 ต่อ พี่กันสั่ง 12 พ.ย. 2569 "เราอยากให้เเถว cover มันเเสดงที่เเทร็กเลย เเละ extrack ออกจากจุดนั้นได้เลย")
                เดิมอยู่ในการ์ดไฟล์แนบและบทใต้การ์ดวิธี · ตอนรวมแถวบอกว่าติดไปกับไฟล์ใหม่ตามเดิม ปกบอกให้ไปจัดการที่ช่องโปสเตอร์ */}
            {xOthers.map((x) => {
              const xMode = method === "extract";
              const on = av.xPick.includes(x.key);
              const why = x.item ? undefined : "ชิ้นนี้แยกเป็นไฟล์ไม่ได้";
              const row = (k: string) => x.s.rows.find((r) => r[0] === k)?.[1] ?? "";
              const isMenu = x.s.kind === "menu";
              const mime = row("MIME type"), img = mime.startsWith("image/");
              const isCover = img && /^(small_)?cover/i.test(x.label);
              const land = isCover && /cover_land/i.test(x.label);
              const slotName = land ? "ปกนอน" : "ปกตั้ง";
              const go = !xMode && isCover ? () => goSlot(land ? "cover_land" : "cover") : undefined;
              const chip = isMenu ? "XML" : (x.s.ext ?? "").toUpperCase() || "ไฟล์";
              const title = isMenu ? "Chapter ของหนัง" : isCover ? `${slotName} ${x.label}` : x.label;
              const what = xMode ? (isMenu ? `แยกเป็นไฟล์ .${x.item?.ext ?? "xml"} ที่เปิดในโปรแกรมทำบทได้` : "ชื่อไฟล์ที่ได้ต่อท้ายชื่อหนัง")
                : isMenu ? "Chapter ติดไปกับไฟล์ใหม่ตามเดิม" : isCover ? `กดเพื่อไปที่ช่อง${slotName}ของโปสเตอร์ข้างล่าง`
                // MP4 เก็บไฟล์แนบไม่ได้ ฝั่ง Rust ข้ามแล้วบอกหลังรวมเท่านั้น (AUDIT ข้อ 96)
                : output === "mp4" ? "MP4 เก็บไฟล์แนบไม่ได้ ไฟล์นี้จะไม่ติดไป" : "ติดไปกับไฟล์ใหม่ตามเดิม";
              const dims = row("Dimensions").replace(/ pixels?$/, "");
              const pills = [
                <span key="a" className="tpill in">ในไฟล์</span>,
                xMode && x.item ? <span key="x" className="tpill conv">{`แยกเป็น .${x.item.ext}`}</span> : null,
              ].filter(Boolean);
              return (
                <div key={x.key} role="listitem" className={"trk xrow" + (xMode ? " xmode" : "") + (go ? " xgo" : "") + (go && postOpen ? " sel" : "")} data-xother={x.key} data-kind={isMenu ? "menu" : "attachment"}
                  onClick={go} title={go ? `ไปที่ช่อง${slotName}ของโปสเตอร์` : undefined} tabIndex={go ? 0 : undefined} onKeyDown={go ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } } : undefined}>
                  <div className={"mv" + (xMode ? " xpick" : "")} onClick={(e) => e.stopPropagation()}>
                    {xMode && <span className={"chk" + (why ? " off" : "")} aria-checked={on} aria-disabled={!!why || undefined} aria-label={`เลือก ${title} เพื่อแยกเป็นไฟล์`} title={why}
                      {...kb(() => { if (!why) xToggle(x.key); })} role="checkbox" data-xpick={x.key}><span className={"cbx " + (on ? "on" : "off")}>{on && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>}</span></span>}
                  </div>
                  <span className="kind x" aria-hidden="true">
                    {isMenu ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></svg>
                      : img ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="M21 17l-5-5-9 8" /></svg>
                      : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9z" /><path d="M14 3v6h6" /></svg>}
                  </span>
                  <div><FtChip name={chip} /></div>
                  <div style={{ minWidth: 0 }}>
                    <div className="nm">{title}</div>
                    <div className="dt"><DtLine parts={[...pills, isMenu ? "Chapter ของหนัง" : img ? (dims ? `รูป ${dims}` : "รูป") : "ไฟล์แนบ", row("Size")].filter(Boolean)} /></div>
                  </div>
                  {/* ประโยคอธิบายอยู่ในช่องว่างของคอลัมน์ภาษาถึงแปลง แถวสูงเท่าแถวแทร็ก ไม่ตกบรรทัดที่สาม
                      แถวบทของหนังตอนรวม มีปุ่มดูและแก้บทในช่องแปลง (BUGS ข้อ 99) */}
                  {isMenu && method === "merge" ? <>
                    <span className="small xnote" style={{ gridColumn: "5 / 8" }} data-chapnote>{av.chapters ? (av.chapters.length ? `แก้ Chapter แล้ว ${av.chapters.length} อัน จะลงไฟล์ใหม่ตอนรวม` : "ลบ Chapter หมดแล้ว ไฟล์ใหม่จะไม่มี Chapter") : what}</span>
                    <button type="button" className="btn btn-ghost btn-sm trk-actbtn" style={{ gridColumn: "8" }} onClick={(e) => { e.stopPropagation(); setChapOpen(true); }} aria-disabled={working || undefined} title={working ? BUSY : "เปิดรายการ Chapter ดูเวลาและชื่อ แก้ เพิ่ม หรือลบ"} data-chapopen>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></svg>ดูและแก้ Chapter</button>
                  </> : <span className="small xnote" style={{ gridColumn: "5 / 9" }}>{what}</span>}<div className="avacts" />
                </div>
              );
            })}
            {method === "extract" && xExtra.map((x) => {
              const on = av.xPick.includes(x.key);
              const why = x.kind === "timestamps" && !trackPicks.length ? "ติ๊กแทร็กภาพ เสียง หรือซับก่อน" : undefined;
              return (
                <div key={x.key} role="listitem" className="trk xrow xmode" data-xextra={x.key} data-kind="menu">
                  <div className="mv xpick" onClick={(e) => e.stopPropagation()}>
                    <span className={"chk" + (why ? " off" : "")} aria-checked={on} aria-disabled={!!why || undefined} aria-label={`เลือก ${x.title} เพื่อแยกเป็นไฟล์`} title={why}
                      {...kb(() => { if (!why) xToggle(x.key); })} role="checkbox" data-xpick={x.key}><span className={"cbx " + (on ? "on" : "off")}>{on && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>}</span></span>
                  </div>
                  <span className="kind x" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9z" /><path d="M14 3v6h6" /></svg></span>
                  <div><FtChip name={x.chip} /></div>
                  <div style={{ minWidth: 0 }}>
                    <div className="nm">{x.title} <InfoTip title={x.title} tip={x.tip} /></div>
                    <div className="dt"><DtLine parts={[<span key="a" className="tpill in">ในไฟล์</span>, <span key="x" className="tpill conv">{`แยกเป็น .${x.ext}`}</span>]} /></div>
                  </div>
                  <span className="small xnote" style={{ gridColumn: "5 / 9" }}>{x.what}</span><div className="avacts" />
                </div>
              );
            })}
          </div>
        </div>
    </>
  );
}
