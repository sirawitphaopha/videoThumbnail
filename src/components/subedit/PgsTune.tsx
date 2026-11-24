/* ส่วนปรับแต่ง PGS จำนวนสี ความสด ตารางสี ค่าเฉพาะตัวสร้างชั้นหนังกับ SUPer และกล่องข้อจำกัดที่เจอในซับ
   แยกจาก PgsDialog.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 10) เนื้อโค้ดยกมาทั้งก้อน */
import Dropdown from "../Dropdown";
import InfoTip from "../InfoTip";
import { CardIcon, Phr, Range, Seg, Switch } from "../ui";
import { IbRevert } from "../icons";
import { NumBox } from "./StyleDialogs";
import { COLORS_TIP, COMP_TIP, DITHER_TIP, DROP_TIP, KBPS_TIP, LAYOUT_TIP, MATRIX_TIP, QUANT_TIP, REDRAW_TIP, VIVID_TIP, VSF_TIP, WIN_TIP } from "./pgsTips";
import { OPTS0 } from "./pgsShared";
import type { PgCtx } from "./pgsCtx";

export function PgsTune({ pg }: { pg: PgCtx }) {
  const { ass, dis, engine, opts, seconv, setO, setOpts, warns } = pg;
  return (
    <>
              <div className="se-pgshead">ปรับแต่ง PGS
                {!seconv && <button type="button" className="btn btn-ghost btn-sm se-pgsreset" onClick={() => setOpts(OPTS0)} data-pgs-opts-reset><IbRevert size={14} />ค่าตั้งต้น</button>}</div>
              {seconv ? <div className="small se-pgsnote" data-pgs-seconv-opts><Phr>Subtitle Edit ทำจานสีและกรอบของ PGS เอง ตัวเลือกส่วนนี้จึงใช้กับตัวสร้างชั้นหนังและ SUPer เท่านั้น</Phr></div> : <>
              <div className="se-drow"><span className="se-dlbl">สีต่อภาพ<InfoTip title="จำนวนสีต่อภาพ" tip={COLORS_TIP} /></span>
                <div className="se-pgsrange" data-pgs-colors><Range value={opts.colors} min={16} max={255} step={1} onChange={(v) => setO("colors", v)} label="จำนวนสีต่อภาพ" /></div><span className="se-pgsval">{opts.colors} สี</span></div>
              <div className="se-drow"><span className="se-dlbl">ความสด<InfoTip title="ความสดของสี" tip={VIVID_TIP} /></span>
                <div className="se-pgsrange" data-pgs-vivid><Range value={opts.vivid} min={0} max={50} step={5} onChange={(v) => setO("vivid", v)} label="ความสดของสี" format={(v) => `${v}%`} /></div><span className="se-pgsval">{opts.vivid}%</span></div>
              {ass && <div className="se-drow"><span className="se-dlbl">สีแบบตัวเล่น<InfoTip title="สีตามบรรทัด YCbCr Matrix" tip={VSF_TIP} /></span>
                <Switch on={opts.vsfilter} onChange={(v) => setO("vsfilter", v)} label="ทำสีตามบรรทัด YCbCr Matrix ของซับแบบตัวเล่น" /><span className="small">ทำสีตามบรรทัด YCbCr Matrix แบบ mpv</span></div>}
              <div className="se-drow"><span className="se-dlbl">ตารางสี<InfoTip title="ตารางสีของจานสี" tip={MATRIX_TIP} /></span>
                <Seg small label="ตารางสี" value={opts.matrix} onChange={(v) => setO("matrix", v)} options={[{ value: "auto", label: "อัตโนมัติ" }, { value: "709", label: "BT.709" }, { value: "601", label: "BT.601" }]} /></div>

              <div className="se-pgssubhead">{engine === "super" ? "เฉพาะ SUPer" : "เฉพาะตัวสร้างชั้นหนัง"}</div>
              {engine === "shelf" ? <>
                <div className="se-drow"><span className="se-dlbl">กระจายจุดสี<InfoTip title="กระจายจุดสี" tip={DITHER_TIP} /></span>
                  <Switch on={opts.dither} onChange={(v) => setO("dither", v)} label="กระจายจุดสีตอนลดสี" /><span className="small">ใช้เมื่อภาพมีสีเกินจำนวนที่ตั้ง</span></div>
                <div className="se-drow"><span className="se-dlbl">กรอบพร้อมกัน<InfoTip title="กรอบบนจอ" tip={WIN_TIP} /></span>
                  <Seg small label="กรอบพร้อมกัน" value={String(opts.windows)} onChange={(v) => setO("windows", Number(v))} options={[{ value: "2", label: "2 กรอบ" }, { value: "1", label: "1 กรอบ" }]} /></div>
              </> : <>
                <div className="se-drow"><span className="se-dlbl">ระดับบีบอัด<InfoTip title="ระดับบีบอัดของ SUPer" tip={COMP_TIP} /></span>
                  <div className="se-pgsrange" data-pgs-comp><Range value={opts.compression} min={0} max={100} step={5} onChange={(v) => setO("compression", v)} label="ระดับบีบอัด" /></div><span className="se-pgsval">{opts.compression}</span></div>
                <div className="se-drow"><span className="se-dlbl">ตัวลดสี<InfoTip title="ตัวลดสีของ SUPer" tip={QUANT_TIP} /></span>
                  <Dropdown label="ตัวลดสี" value={String(opts.quantizer)} disabled={dis} onChange={(v) => setO("quantizer", Number(v))}
                    options={[{ value: "3", label: "libimagequant (แนะนำ)" }, { value: "0", label: "QtzrUTC" }, { value: "2", label: "HexTree" }, { value: "1", label: "Pillow" }]} /></div>
                <div className="se-drow"><span className="se-dlbl">จัดกรอบ<InfoTip title="การจัดกรอบของ SUPer" tip={LAYOUT_TIP} /></span>
                  <Seg small label="การจัดกรอบ" value={String(opts.layout)} onChange={(v) => setO("layout", Number(v))} options={[{ value: "2", label: "เต็มที่" }, { value: "1", label: "ปกติ" }, { value: "0", label: "ปลอดภัย" }]} /></div>
                <div className="se-drow"><span className="se-dlbl">กันภาพตกหล่น<InfoTip title="กันภาพตกหล่น" tip={DROP_TIP} /></span>
                  <Switch on={opts.allowNormal} onChange={(v) => setO("allowNormal", v)} label="วาดใหม่ทีละกรอบ" /><span className="small">วาดใหม่ทีละกรอบ</span>
                  <Switch on={opts.ahead} onChange={(v) => setO("ahead", v)} label="เตรียมสีล่วงหน้า" /><span className="small">เตรียมสีล่วงหน้า</span></div>
                <div className="se-drow"><span className="se-dlbl">วาดซ้ำทุก<InfoTip title="วาดซ้ำ" tip={REDRAW_TIP} /></span>
                  <NumBox value={opts.redraw} onChange={(x) => setO("redraw", Math.max(0, Math.min(60, x)))} width={56} data="pgs-redraw" /><span className="small">วินาที</span></div>
                <div className="se-drow"><span className="se-dlbl">บิตเรตไม่เกิน<InfoTip title="ตรวจบิตเรต" tip={KBPS_TIP} /></span>
                  <NumBox value={opts.maxKbps} onChange={(x) => setO("maxKbps", Math.max(0, Math.min(48000, Math.round(x))))} width={72} data="pgs-kbps" /><span className="small">kbps</span></div>
              </>}
              </>}

              {warns.length > 0 && <div className="stat warn" style={{ margin: 0 }} data-pgs-warn><CardIcon kind="warn" /><div>
                <b>ข้อจำกัดของ PGS ที่เจอในซับนี้</b>
                <ul className="se-lostlist">{warns.map((x) => <li key={x}><Phr>{x}</Phr></li>)}</ul>
              </div></div>}
    </>
  );
}
