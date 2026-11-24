/* ฝั่งซ้ายช่วงบนของหน้าต่างส่งออก PGS ที่เก็บ ตัวสร้าง ขนาดภาพ อัตราเฟรม ขนาดที่คาด และหน้าตาซับที่ตั้งเอง
   แยกจาก PgsDialog.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 10) เนื้อโค้ดยกมาทั้งก้อน */
import Dropdown from "../Dropdown";
import InfoTip from "../InfoTip";
import { CardIcon, Phr, Range, Seg } from "../ui";
import { IbBold, IbItalic, IbRevert, IcFolder } from "../icons";
import { NumBox } from "./StyleDialogs";
import { BOX_TIP, CALIGN_TIP, ENGINE_TIP, EST_TIP, LOOK_TIP, LSPACE_TIP, PGS_TIP, POS_TIP, SIZE_TIP } from "./pgsTips";
import { BD, FPS, STYLE0, ALIGN, ENG_NAME, Swatch } from "./pgsShared";
import type { PgCtx } from "./pgsCtx";

export function PgsBasics({ pg }: { pg: PgCtx }) {
  const { ass, browse, busy, dis, engWhy, engine, est, fps, fsize, lines, p, path, seconv, seconvWhy, setEngine, setFps, setSize, size, superWhy } = pg;
  return (
    <>
              <div className="se-dlgtext"><Phr>วาดซับทุกบรรทัดเป็นภาพแบบแผ่น Blu-ray หน้าตาเหมือนตอนเล่น</Phr> <InfoTip title="PGS" tip={PGS_TIP} /></div>
              <div className="se-drow"><span className="se-dlbl">ที่เก็บ</span><span className="se-path small" title={path} data-pgs-path>{path}</span>
                <button type="button" className={"btn btn-ghost btn-sm" + (busy ? " btn-wait" : "")} aria-disabled={busy || undefined} onClick={() => { if (!busy) void browse(); }} data-pgs-browse><IcFolder size={15} />เปลี่ยนที่เก็บ</button></div>

              <div className="se-pgshead">ตัวสร้าง PGS มีให้เลือกสามตัว<InfoTip title="ตัวสร้าง PGS" tip={ENGINE_TIP} /></div>
              <div className="se-pgsengs" role="radiogroup" aria-label="ตัวสร้าง PGS">
                {([["shelf", "ffmpeg กับ libass วาดภาพ\nเหมือนต้นฉบับที่สุดและเร็ว", undefined], ["super", "ตรงมาตรฐาน Blu-ray\nไฟล์เล็กแต่ทำช้า", superWhy], ["seconv", "ตัวแปลง SeConv วาดซับเอง\nเหมาะกับซับ SRT", seconvWhy]] as const).map(([k, note, no]) => (
                  <button key={k} type="button" role="radio" aria-checked={engine === k} aria-disabled={busy || !!no || undefined} title={no}
                    className={"se-pgseng" + (engine === k ? " on" : "") + (no ? " off" : "")} onClick={() => { if (!busy && !no) setEngine(k); }} data-pgs-engine={k}>
                    <span className="se-pgsengt"><b>{ENG_NAME[k]}</b>{k === "shelf" && <span className="se-pgsbadge">แนะนำ</span>}</span>
                    <span className="small se-pgsengn">{no ?? note}</span>
                  </button>
                ))}
              </div>
              {ass && seconv && <div className="stat warn" style={{ margin: 0 }} data-pgs-seconv-warn><CardIcon kind="warn" /><div>
                <b>Subtitle Edit ไม่อ่านสไตล์ของซับ ASS</b>
                {/* แยกประโยคละบรรทัด เดิมตัดกลางวลี ภาพตัวอย่าง|ทางขวา */}
                <div><Phr>ฟอนต์ สี ตำแหน่ง และเอฟเฟกต์ในไฟล์จะหายหมด แล้วใช้หน้าตาที่ตั้งข้างล่างแทน</Phr></div>
                <div><Phr>ให้เทียบภาพตัวอย่างทางขวาก่อนส่งออก</Phr></div>
              </div></div>}

              <div className="se-drow"><span className="se-dlbl">ขนาดภาพ<InfoTip title="ขนาดภาพของ PGS" tip={SIZE_TIP} /></span>
                <Dropdown label="ขนาดภาพ" value={size} disabled={dis}
                  options={[...(p.video ? [{ value: "video", label: `ตามหนัง ${p.video.w} × ${p.video.h}` }] : []), ...BD.map(([a, b]) => ({ value: `${a}x${b}`, label: `${a} × ${b}` }))]}
                  onChange={setSize} />
              </div>
              <div className="se-drow"><span className="se-dlbl">อัตราเฟรม</span>
                <Dropdown label="อัตราเฟรม" value={fps} disabled={dis} options={FPS.map((x) => ({ value: x.v, label: `${x.label} fps` }))} onChange={setFps} />
                <span className="small">{p.video ? "ตามหนังที่เปิดอยู่" : "ยังไม่มีวิดีโอ เลือกให้ตรงหนังที่จะใส่"}</span>
              </div>
              <div className="se-drow"><span className="se-dlbl">ขนาดที่คาด<InfoTip title="ขนาดไฟล์ที่คาด" tip={EST_TIP} /></span>
                <span className={"se-pgsest" + (est.s === "busy" ? " busy" : "")} data-pgs-est={est.s} title={est.s === "fail" ? est.err : undefined}>{
                  engWhy || lines.length === 0 ? "—"
                    : est.data ? (est.data.images ? `ราว ${fsize(est.data.bytes)} จาก ${est.data.images.toLocaleString("en-US")} ภาพ` : "—")
                      : est.s === "fail" ? "คาดขนาดไม่ได้" : "กำลังคาดขนาด…"}</span>
              </div>
    </>
  );
}

export function PgsLook({ pg }: { pg: PgCtx }) {
  const { ass, seconv, setFont, setS, setStyle, style, useStyle } = pg;
  return (
    <>
              {useStyle && <>
                <div className="se-pgshead">{ass ? "หน้าตาซับที่ Subtitle Edit วาด" : "หน้าตาซับ SRT"}<InfoTip title="หน้าตาซับ" tip={LOOK_TIP} />
                  <button type="button" className="btn btn-ghost btn-sm se-pgsreset" onClick={() => setStyle(STYLE0)} data-pgs-style-reset><IbRevert size={14} />ค่าตั้งต้น</button></div>
                <div className="se-drow"><span className="se-dlbl">ฟอนต์</span>
                  <button type="button" className="btn btn-ghost btn-sm se-stfont" onClick={() => setFont(true)} title="เลือกฟอนต์จากฟอนต์ที่ลงในเครื่อง" data-pgs-font style={{ fontFamily: `"${style.font}"` }}>{style.font}</button>
                  <label className="se-f se-pin">ขนาด<NumBox value={style.size} onChange={(x) => setS("size", Math.max(8, Math.min(300, x)))} width={56} data="pgs-size" /></label>
                  <button type="button" className={"btn btn-ghost btn-sm se-sttog" + (style.bold ? " pressed" : "")} aria-pressed={style.bold} onClick={() => setS("bold", !style.bold)} data-pgs-bold><IbBold size={14} />หนา</button>
                  {/* SeConv ไม่มีตัวเลือกตัวเอียงทั้งไฟล์ แท็กตัวเอียงในบรรทัดยังใช้ได้ */}
                  <button type="button" className={"btn btn-ghost btn-sm se-sttog" + (style.italic && !seconv ? " pressed" : "") + (seconv ? " btn-wait" : "")} aria-pressed={style.italic && !seconv}
                    aria-disabled={seconv || undefined} title={seconv ? "Subtitle Edit ไม่มีตัวเลือกตัวเอียงทั้งไฟล์ แต่แท็กตัวเอียงในบรรทัดยังใช้ได้" : undefined}
                    onClick={() => { if (!seconv) setS("italic", !style.italic); }} data-pgs-italic><IbItalic size={14} />เอียง</button>
                </div>
                <div className="se-drow"><span className="se-dlbl">สี</span>
                  <Swatch value={style.color} onChange={(v) => setS("color", v)} label="ตัวอักษร" data="color" />
                  <Swatch value={style.outlineColor} onChange={(v) => setS("outlineColor", v)} label="ขอบ" data="outline" />
                  <Swatch value={style.shadowColor} onChange={(v) => setS("shadowColor", v)} label="เงา" data="shadow" />
                </div>
                <div className="se-drow"><span className="se-dlbl">ขอบหนา</span>
                  <div className="se-pgsrange" data-pgs-outline><Range value={style.outline} min={0} max={10} step={0.5} onChange={(v) => setS("outline", v)} label="ความหนาขอบ" /></div><span className="se-pgsval">{style.outline}</span></div>
                <div className="se-drow"><span className="se-dlbl">เงา</span>
                  <div className="se-pgsrange" data-pgs-shadow><Range value={style.shadow} min={0} max={10} step={0.5} onChange={(v) => setS("shadow", v)} label="ระยะเงา" /></div><span className="se-pgsval">{style.shadow}</span>
                  <span className="se-pgssub">ทึบ</span><div className="se-pgsrange sm" data-pgs-shadowop><Range value={style.shadowOpacity} min={0} max={100} step={5} onChange={(v) => setS("shadowOpacity", v)} label="ความทึบของเงา" format={(v) => `${v}%`} /></div><span className="se-pgsval">{style.shadowOpacity}%</span></div>
                <div className="se-drow"><span className="se-dlbl">ตำแหน่ง<InfoTip title="ตำแหน่งของซับ" tip={POS_TIP} /></span>
                  <span className="se-pgsalign" role="radiogroup" aria-label="ตำแหน่งของซับ" data-pgs-align>
                    {ALIGN.map(([n, name]) => <button key={n} type="button" role="radio" aria-checked={style.align === n} aria-label={name} title={name}
                      className={style.align === n ? "on" : undefined} onClick={() => setS("align", n)} data-pgs-align-n={n}><i /></button>)}
                  </span>
                  <span className="small" data-pgs-align-name>{ALIGN.find(([n]) => n === style.align)?.[1] ?? ""}</span></div>
                <div className="se-drow"><span className="se-dlbl">ห่างขอบ</span>
                  <label className="se-f se-pin">บนล่าง<NumBox value={style.marginV} onChange={(x) => setS("marginV", Math.max(0, Math.min(500, x)))} width={60} data="pgs-margin" /></label>
                  <label className="se-f se-pin">ซ้ายขวา<NumBox value={style.marginH} onChange={(x) => setS("marginH", Math.max(0, Math.min(900, x)))} width={60} data="pgs-margin-h" /></label>
                  <span className="small">จุด เมื่อภาพสูง 1080</span></div>

                {seconv && <>
                  <div className="se-pgssubhead">เฉพาะ Subtitle Edit</div>
                  <div className="se-drow"><span className="se-dlbl">ระยะบรรทัด<InfoTip title="ระยะบรรทัด" tip={LSPACE_TIP} /></span>
                    <div className="se-pgsrange" data-pgs-lspace><Range value={style.lineSpacing} min={0} max={100} step={5} onChange={(v) => setS("lineSpacing", v)} label="ระยะบรรทัด" format={(v) => `${v}%`} /></div><span className="se-pgsval">{style.lineSpacing}%</span></div>
                  <div className="se-drow"><span className="se-dlbl">จัดบรรทัด<InfoTip title="จัดบรรทัดในก้อนซับ" tip={CALIGN_TIP} /></span>
                    <Seg small label="จัดบรรทัดในก้อนซับ" value={style.contentAlign} onChange={(v) => setS("contentAlign", v)}
                      options={[{ value: "center", label: "กึ่งกลาง" }, { value: "left", label: "ชิดซ้าย" }, { value: "right", label: "ชิดขวา" }, { value: "from-alignment", label: "ตามตำแหน่ง" }]} /></div>
                  <div className="se-drow"><span className="se-dlbl">กล่องพื้นหลัง<InfoTip title="กล่องพื้นหลัง" tip={BOX_TIP} /></span>
                    <Seg small label="กล่องพื้นหลัง" value={style.boxType} onChange={(v) => setS("boxType", v)}
                      options={[{ value: "none", label: "ไม่มี" }, { value: "one-box", label: "กล่องเดียว" }, { value: "box-per-line", label: "กล่องละบรรทัด" }]} /></div>
                  {style.boxType !== "none" && <>
                    <div className="se-drow"><span className="se-dlbl">กล่อง</span>
                      <Swatch value={style.boxColor} onChange={(v) => setS("boxColor", v)} label="สีพื้น" data="box" />
                      <span className="se-pgssub">ทึบ</span><div className="se-pgsrange sm" data-pgs-boxop><Range value={style.boxOpacity} min={0} max={100} step={5} onChange={(v) => setS("boxOpacity", v)} label="ความทึบของกล่อง" format={(v) => `${v}%`} /></div><span className="se-pgsval">{style.boxOpacity}%</span></div>
                    <div className="se-drow"><span className="se-dlbl">ขนาดกล่อง</span>
                      <label className="se-f se-pin">ขอบใน<NumBox value={style.boxPadding} onChange={(x) => setS("boxPadding", Math.max(0, Math.min(100, x)))} width={56} data="pgs-box-pad" /></label>
                      <label className="se-f se-pin">มุมมน<NumBox value={style.boxRadius} onChange={(x) => setS("boxRadius", Math.max(0, Math.min(100, x)))} width={56} data="pgs-box-radius" /></label>
                      <span className="small">จุด เมื่อภาพสูง 1080</span></div>
                  </>}
                </>}
              </>}
    </>
  );
}
