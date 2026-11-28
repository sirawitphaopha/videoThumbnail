/* หัวข้อการเล่นเสียงในหน้าตั้งค่า (BUGS ข้อ 164.3 · ROADMAP ข้อ 35.6)
   พี่กันสั่ง 28 พ.ย. 2569 "35.6 ทำด้วย และสร้างหน้าตั้งค่าเรื่องการเล่นเสียง ให้ทุกแง่มุม และเลือกตัวถอดได้"
   ทุกค่าของตัวเล่นในหน้ากราฟเสียง ตัวถอดทีละชนิดไฟล์ ความดัง เล่นวน กราฟเลื่อนตาม ปุ่มหยุด ออกจากหน้า แถบวัดระดับ
   ค่าเก็บในเครื่อง (lib/playPrefs.ts) เปลี่ยนแล้วมีผลทันที ไม่ต้องเปิดหน้ากราฟใหม่ */
import InfoTip from "../../components/InfoTip";
import { Phr, Seg, Switch } from "../../components/ui";
import { IcRefresh } from "../../components/icons";
import { gSetLoop, gSetVol, useGPlay } from "../../lib/graphPlay";
import { DEC_KINDS, PLAY_DEFAULT, resetPlayPrefs, setPlayPrefs, usePlayPrefs } from "../../lib/playPrefs";
import type { Tip } from "../../lib/codecAdv";
import type { SetOpen } from "./setCtx";

export const DEC_TIP: Tip = {
  w: "โปรแกรมที่แปลงไฟล์เสียงกลับเป็นเสียงดิบเพื่อเล่นในหน้ากราฟ\nไม่ได้แก้ไฟล์ และเสียงที่ได้ยินเหมือนกันทุกตัวถอด",
  o: [
    ["ffmpeg", "ถอดได้ทุกชนิดและข้ามไปกลางไฟล์ได้ทันที จึงเป็นค่าตั้งต้น", "", ""],
    ["ตัวถอดของ codec", "เช่น flac.exe ไว้ลองเทียบเมื่อสงสัยว่าอ่านผิด\nใช้ได้เฉพาะไฟล์ชนิดนั้น ส่วนเสียงในไฟล์หนังใช้ ffmpeg", "", ""],
    ["Takc กับ lame", "ข้ามไปกลางไฟล์ไม่ได้ จึงต้องถอดทั้งไฟล์ก่อนเล่น\nไฟล์ยาวจึงรอนานขึ้น แล้วเก็บไว้เล่นซ้ำจนปิดโปรแกรม", "", ""],
    ["ถอดไม่ได้", "โปรแกรมกลับไปใช้ ffmpeg แล้วบอกในแถบเล่น", "", ""],
  ],
};
const METER_TIP: Tip = {
  w: "แถบแนวตั้งข้างชื่อช่องในหน้ากราฟ บอกความดังของเสียงที่กำลังเล่นทีละช่อง\nแสดงระดับของไฟล์จริงเสมอ ไม่ขึ้นลงตามความดังลำโพง",
  o: [
    ["ขีดค้างยอด", "ขีดเส้นเข้มค้างที่ดังสุดล่าสุดไว้ครู่หนึ่ง จึงเห็นยอดที่ผ่านไปเร็ว", "", ""],
    ["ช่วงที่แสดง", "ล่างสุดของแถบ ถ้าเลือก −90 dB จะเห็นเสียงเบามากด้วย\nส่วน −48 dB แถบขยับเฉพาะเสียงดังพอสมควร", "", ""],
  ],
};

export default function SetPlayback({ pg }: { pg: SetOpen }) {
  const { sec, goSec } = pg;
  const pp = usePlayPrefs();
  const { vol, loop } = useGPlay();
  const atDefault = JSON.stringify(pp) === JSON.stringify(PLAY_DEFAULT) && vol === 1 && !loop;
  return (
    <div className="setcard" data-setcard="playback" hidden={sec !== "playback"}>
      <h3 style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}><span>การเล่นเสียง</span>
        <button type="button" className={"btn btn-sm " + (atDefault ? "btn-wait" : "btn-ghost")} aria-disabled={atDefault || undefined} title={atDefault ? "ใช้ค่าตั้งต้นอยู่แล้ว" : undefined}
          onClick={() => { if (atDefault) return; resetPlayPrefs(); gSetVol(1); gSetLoop(false); }} data-play-reset><IcRefresh size={15} />กลับค่าตั้งต้น</button></h3>
      <div className="small" style={{ marginBottom: 6 }}><Phr>ตัวเล่นเสียงในหน้ากราฟเสียง ตั้งแล้วมีผลทันทีกับการเล่นครั้งถัดไป</Phr></div>

      <div className="imghead" style={{ display: "flex", alignItems: "center", gap: 6 }}>ตัวถอดเสียง<InfoTip title="ตัวถอดเสียง" tip={DEC_TIP} noAbbr /></div>
      {DEC_KINDS.map((k) => (
        <div key={k.kind} className="setrow" data-seg260 data-play-dec={k.kind}><div className="lbl">{k.name}<span className="small">ไฟล์ .{k.ext}{k.seek ? "" : " ถ้าใช้ตัวถอดของ codec ต้องถอดทั้งไฟล์ก่อนเล่น"}</span></div>
          <Seg label={`ตัวถอด ${k.name}`} value={pp.dec[k.kind] === k.own ? k.own : "ffmpeg"} onChange={(v) => setPlayPrefs({ dec: { ...pp.dec, [k.kind]: v } })}
            options={[{ value: "ffmpeg", label: "ffmpeg" }, { value: k.own, label: k.ownName }]} /></div>
      ))}
      <div className="setrow" data-seg260 data-play-dec="other"><div className="lbl">ชนิดอื่น<span className="small">Opus AAC AC-3 DTS TrueHD ALAC และเสียงในไฟล์หนัง</span></div>
        <Seg label="ตัวถอดชนิดอื่น" value="ffmpeg" onChange={() => {}} disabledReason="ชนิดเหล่านี้ไม่มีตัวถอดแยกที่แนบมา จึงใช้ ffmpeg อย่างเดียว" options={[{ value: "ffmpeg", label: "ffmpeg เท่านั้น" }]} /></div>

      <div className="imghead">ตัวเล่น</div>
      <div className="setrow"><div className="lbl">ความดังลำโพง<span className="small">ปรับเฉพาะเสียงที่ออกลำโพง ไม่แก้ไฟล์ ปรับในแถบเล่นได้เหมือนกัน</span></div>
        <span className="gp-vol" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <input type="range" min={0} max={100} step={1} value={Math.round(vol * 100)} onChange={(e) => gSetVol(Number(e.target.value) / 100)} aria-label="ความดังลำโพง" data-play-vol style={{ width: 160, accentColor: "var(--accent)" }} />
          <span className="gp-volv">{Math.round(vol * 100)}%</span></span></div>
      <div className="setrow"><div className="lbl">เล่นวน<span className="small">เล่นจบแล้วกลับไปเล่นจากจุดเริ่มอีกรอบ ตรงกับปุ่มเล่นวนในแถบเล่น</span></div>
        <Switch on={loop} onChange={gSetLoop} label="เล่นวน" /></div>
      <div className="setrow"><div className="lbl">กราฟเลื่อนตามขีดตำแหน่งเล่น<span className="small">ตอนซูมอยู่ ขีดเลยขอบขวาแล้วกราฟเลื่อนไปช่วงถัดไปเอง</span></div>
        <Switch on={pp.follow} onChange={(v) => setPlayPrefs({ follow: v })} label="กราฟเลื่อนตามขีดตำแหน่งเล่น" /></div>
      <div className="setrow" data-seg260><div className="lbl">กดปุ่มหยุดแล้ว</div>
        <Seg label="กดปุ่มหยุดแล้ว" value={pp.stopBack ? "back" : "stay"} onChange={(v) => setPlayPrefs({ stopBack: v === "back" })}
          options={[{ value: "back", label: "กลับจุดที่เริ่มเล่น" }, { value: "stay", label: "ค้างที่จุดที่หยุด" }]} /></div>
      <div className="setrow" data-seg260><div className="lbl">ออกจากหน้ากราฟแล้ว</div>
        <Seg label="ออกจากหน้ากราฟแล้ว" value={pp.stopOnLeave ? "stop" : "keep"} onChange={(v) => setPlayPrefs({ stopOnLeave: v === "stop" })}
          options={[{ value: "stop", label: "หยุดเล่น" }, { value: "keep", label: "เล่นต่อ" }]} /></div>
      <div className="setrow"><div className="lbl">คีย์ลัดของการเล่น<span className="small">เล่นหรือหยุดชั่วคราว หยุด ไปต้นไฟล์ ไปท้ายไฟล์ และเล่นวน</span></div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => goSec("hotkeys")} data-play-keys>ไปหัวข้อคีย์ลัด</button></div>

      <div className="imghead" style={{ display: "flex", alignItems: "center", gap: 6 }}>แถบวัดระดับเสียง<InfoTip title="แถบวัดระดับเสียง" tip={METER_TIP} /></div>
      <div className="setrow"><div className="lbl">แสดงแถบวัดระดับเสียง<span className="small">ข้างชื่อช่องในหน้ากราฟ ขึ้นเฉพาะตอนเล่น</span></div>
        <Switch on={pp.meter} onChange={(v) => setPlayPrefs({ meter: v })} label="แสดงแถบวัดระดับเสียง" /></div>
      <div className="setrow" data-seg260><div className="lbl">ขีดค้างยอด</div>
        <Seg label="ขีดค้างยอด" value={String(pp.hold)} onChange={(v) => setPlayPrefs({ hold: Number(v) })} disabledReason={pp.meter ? undefined : "ปิดแถบวัดระดับเสียงอยู่"}
          options={[{ value: "0.5", label: "0.5 วินาที" }, { value: "1.5", label: "1.5 วินาที" }, { value: "3", label: "3 วินาที" }]} /></div>
      <div className="setrow" data-seg260><div className="lbl">ช่วงที่แสดง</div>
        <Seg label="ช่วงที่แสดง" value={String(pp.floor)} onChange={(v) => setPlayPrefs({ floor: Number(v) })} disabledReason={pp.meter ? undefined : "ปิดแถบวัดระดับเสียงอยู่"}
          options={[{ value: "-48", label: "−48 dB" }, { value: "-60", label: "−60 dB" }, { value: "-90", label: "−90 dB" }]} /></div>
    </div>
  );
}
