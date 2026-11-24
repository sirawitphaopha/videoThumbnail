/* แถบไฟล์กับแถวตัวเลือก วิธีคิด สเกล ความละเอียด แบบแท่ง ชุดสี
   แยกจาก BitratePage.tsx (คอมโพเนนต์ BitrateModern) ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 3) เนื้อโค้ดยกมาทั้งก้อน */
import { thumbUrl } from "../../lib/api";
import Dropdown from "../../components/Dropdown";
import { Seg } from "../../components/ui";
import InfoTip from "../../components/InfoTip";
import { IbStop, IcBitrate, IcFile, IcRefresh } from "../../components/icons";
import bvIcon from "../../assets/thanks/bitrateviewer.ico";
import FullBtn from "../../components/FullBtn";
import { PadCustom } from "../../components/ColorPick";
import { BV, BV_LINES, MODES, TIP_MODE, TIP_RES, TIP_SCALE, chTxt, clock, codecName, fmtName, mb } from "./common";
import type { BrOpenCtx } from "./brCtx";

export default function BrControls({ pg }: { pg: BrOpenCtx }) {
  const { audio, audioWhy, ctlCompact, ctlRef, custom, err, home, info, lines, mode, modeSel, name, onClassic, open, pal, palSnap, pick, res, resOpts, resShow, resSizes, running, scale, setCustom, setLines, setMode, setPal, setPalSnap, setRes, setScale, stop, th, track } = pg;
  const path = pg.path!;
  return (
    <>
      {/* แถบไฟล์กับแถวตัวเลือก มีเส้นแบ่งใต้แถบ แบบหน้ากราฟเสียง (พี่กันบอก 10 พ.ย. 2569 "เส้นแบ่ง") */}
      <div className="brn-top">
      <div className="agtop">
        <button type="button" className="btn btn-ghost" onClick={home} title="กลับหน้ารวม ดูไฟล์ที่เปิดล่าสุด" data-brnhome>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>หน้ารวม</button>
        <div className="fchip">
          {th ? <img className="fthumb" src={thumbUrl(th) ?? ""} alt="" /> : <div className="fnote brn-fnote"><IcBitrate size={22} /></div>}
          <div style={{ minWidth: 0 }}>
            <div className="nm" title={path}>{name.replace(/\.[^.]+$/, "")}<span className="ext">{name.match(/\.[^.]+$/)?.[0] ?? ""}</span></div>
            <div className="meta">{info ? (audio ? [codecName(info.codec), chTxt(info.channels), `${+(info.sample_rate / 1000).toFixed(1)} kHz`, fmtName(info.format), mb(info.size), `ยาว ${clock(info.duration)}`] : [codecName(info.codec), `${info.width} × ${info.height}`, `${+info.fps.toFixed(3)} fps`, fmtName(info.format), mb(info.size), `ยาว ${clock(info.duration)}`]).join(", ") : err ? <span className="brn-err">อ่านไฟล์นี้ไม่ได้</span> : "กำลังอ่านข้อมูลไฟล์…"}</div>
          </div>
        </div>
        {/* สลับแทร็กแบบหน้ากราฟเสียง (พี่กันสั่ง 10 พ.ย. 2569 "ไฟล์ที่มีหลายเสียง สามารถกดเลือกดูข้อมูลอื่นได้") */}
        {info && info.tracks.length > 1 && <span data-brntrack><Dropdown label="แทร็ก" value={info.track} onChange={(v) => void open(path, modeSel, false, v)} options={info.tracks.map((t) => ({ value: t.id, label: t.label }))} /></span>}
        <button type="button" className="btn btn-ghost" onClick={pick} data-brnopen><IcFile size={16} />เปิดไฟล์อื่น</button>
        {running
          ? <button type="button" className="btn btn-ghost" onClick={stop} data-brnstop><IbStop size={16} />หยุดอ่าน</button>
          : <button type="button" className="btn btn-ghost" onClick={() => void open(path, modeSel, true)} title="อ่านไฟล์ใหม่ทั้งไฟล์ (F5)" data-brnreload><IcRefresh size={16} />อ่านใหม่</button>}
      </div>

      {/* แถวไม่พอ ปุ่มแถววิธีคิดกับสเกลเปลี่ยนเป็นดรอปดาวน์ วัดจากที่ว่างจริง ไม่ใช้เลขตายตัว (กฎ CLAUDE.md · บทเรียน BUGS ข้อ 76) */}
      <div className={"agctl brn-ctl" + (ctlCompact ? " compact" : "")} ref={ctlRef} data-brnctl={ctlCompact ? "compact" : "full"}>
        <span className="lbl">วิธีคิด</span>
        {ctlCompact
          ? <span data-brnmodedd><Dropdown label="วิธีคิดบิตเรต" value={mode} onChange={setMode} options={MODES.map((m) => ({ value: m.value, label: m.label }))} disabled={audio ? audioWhy : undefined} /></span>
          : <Seg label="วิธีคิดบิตเรต" value={mode} onChange={setMode} options={MODES.map((m) => ({ value: m.value, label: m.label }))} disabledReason={audio ? audioWhy : undefined} />}
        <InfoTip title="วิธีคิดบิตเรต" tip={TIP_MODE} />
        <span className="brn-sep" />
        <span className="lbl always">แท่งละ</span>
        <span data-brnres><Dropdown label="ความละเอียดแท่ง" value={res} onChange={setRes} options={resOpts} display={resShow} sizes={resSizes}
          disabled={mode !== "sec" ? `ความละเอียดใช้กับวิธีคิดต่อวินาทีเท่านั้น วิธีที่เลือกอยู่แบ่งแท่งละหนึ่ง${mode === "frm" ? "เฟรม" : " GOP"}` : undefined} /></span>
        <InfoTip title="ความละเอียดแท่ง" tip={TIP_RES} />
        <span className="brn-sep" />
        <span className="lbl">สเกล</span>
        {ctlCompact
          ? <span data-brnscaledd><Dropdown label="ความสูงของกราฟ" value={scale} onChange={setScale} options={[{ value: "ceil", label: "ตามเพดาน" }, { value: "data", label: "ตามข้อมูล" }]} /></span>
          : <Seg label="ความสูงของกราฟ" value={scale} onChange={setScale} options={[{ value: "ceil", label: "ตามเพดาน" }, { value: "data", label: "ตามข้อมูล" }]} />}
        <InfoTip title="ความสูงของกราฟ" tip={TIP_SCALE} />
        <span className="brn-sep" />
        <span className="lbl">เส้น</span>
        <div className="seg brn-multi" role="group" aria-label="เส้นแนวนอนบนกราฟ">
          {([["avg", "ค่าเฉลี่ย"], ["max", "สูงสุด"], ["min", "ต่ำสุด"]] as const).map(([k, l]) => (
            <button key={k} type="button" className={lines[k] ? "on" : ""} aria-pressed={lines[k]} onClick={() => setLines((x) => ({ ...x, [k]: !x[k] }))} data-brnline={k}>
              <i className={"brn-dot " + k} data-keepcolor style={pal === "bv" ? { background: k === "avg" ? BV_LINES.avg : `repeating-linear-gradient(90deg, ${BV_LINES[k]} 0 4px, transparent 4px 7px)` } : pal === "custom" && k === "avg" ? { background: custom } : undefined} />{l}</button>))}
        </div>
        {/* ชุดสีกราฟ วงกลมในแถวตัวเลือกฝั่งขวา แบบหน้ากราฟเสียง (BUGS ข้อ 37 ข้อ 42 · พี่กันสั่ง 13 พ.ย. 2569 "เอาวงกลมสี เอาออกไปข้างนอกกราฟ ห้เหมือนจุดอื่น") */}
        <div className="sws brn-pal" role="group" aria-label="ชุดสีกราฟ" data-keepcolor data-brnpal>
          <button type="button" className={"sw" + (pal === "tone" ? " on" : "")} aria-pressed={pal === "tone"} aria-label="สีตามโทนของโปรแกรม" title="สีตามโทนของโปรแกรม เปลี่ยนโทนในหน้าตั้งค่าแล้วกราฟเปลี่ยนตาม" onClick={() => setPal("tone")} data-pal="tone"
            style={{ background: "linear-gradient(135deg, var(--accent-soft), var(--accent) 60%, var(--accent-d))" }} />
          <button type="button" className={"sw" + (pal === "bv" ? " on" : "")} aria-pressed={pal === "bv"} aria-label="สีแบบ Bitrate Viewer" title="สีแบบโปรแกรม Bitrate Viewer แท่งม่วงฟ้า ส่วนเหนือค่าเฉลี่ยสีชมพู" onClick={() => setPal("bv")} data-pal="bv"
            style={{ background: `linear-gradient(135deg, ${BV.lo0}, ${BV.lo1} 55%, ${BV.hi1})` }} />
          <PadCustom pad={custom} what="สีกราฟ" custom={pal === "custom"} panelStyle={{ left: "auto", right: 0, zIndex: 30 }}
            oldColor={palSnap?.color} onOpen={() => setPalSnap({ pal, color: custom })}
            onOk={() => setPal("custom")}
            onCancel={() => { const sn = palSnap; if (sn) { setPal(sn.pal); setCustom(sn.color); } }}
            onPad={(cl) => { setCustom(cl); setPal("custom"); }}
            trigger={(open, toggle) => <button type="button" className={"sw sw-custom" + (pal === "custom" ? " on" : "")} aria-expanded={open} aria-label="สีกำหนดเอง" title="สีกำหนดเอง เลือกสีเดียว โปรแกรมใช้สีนั้นทั้งกราฟ" onClick={toggle} data-pal="custom"
              style={{ padding: 2, background: `linear-gradient(${custom}, ${custom}) content-box, linear-gradient(white, white) padding-box, conic-gradient(#e0457b,#f0a23b,#e8d23a,#4cc38a,#3b8fe0,#8a5ae0,#e0457b) border-box` }} />} />
        </div>
        <button type="button" className="btn btn-ghost btn-sm brn-classic" onClick={() => onClassic?.(path, info?.track ?? track)} title="สลับไปหน้าตาแบบโปรแกรม Bitrate Viewer เดิม ไฟล์กับแทร็กนี้ตามไปด้วย" data-brnclassic><img src={bvIcon} alt="" width={16} height={16} style={{ display: "block", flex: "none" }} />แบบ Bitrate Viewer</button>
        <FullBtn />
      </div>
      </div>
    </>
  );
}
