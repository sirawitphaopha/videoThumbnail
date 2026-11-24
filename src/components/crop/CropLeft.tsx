/* ฝั่งซ้ายของหน้าต่างครอป ภาพกับกรอบครอป ดูเต็มจอ สีขอบหรือซูม ปรับเอียง ปุ่มหมุนพลิก และตารางคุณภาพ JPG
   แยกจาก CropDialog.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 9) เนื้อโค้ดยกมาทั้งก้อน */
import { Range } from "../ui";
import { fmtSize } from "../../lib/format";
import { IcRefresh, IbTick, IbRotL, IbRotR, IbFlip, IcExpand, IcCopy } from "../icons";
import { PadCustom } from "../ColorPick";
import { SW, SH, TABLE_ROOM, PADS, QUAL_NOTE, START, layout, clampCenter } from "./cropCalc";
import { ImageLayer } from "./CropPreview";
import type { CrCtx } from "./cropCtx";

export function CropLeft({ pg }: { pg: CrCtx }) {
  const { ar, cropping, down, format, full, fullS, hexCopied, info, lay, mode, move, own, p, pad, pickPad, quality, render, setFull, setHexCopied, setMode, setPad, setTilt, setView, setZoom, short, smallCard, smallLeft, turn, up, view, wideSlot } = pg;
  return (
    <>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, width: SW, flex: "none" }}>
          <div className="stageroom">
          <div className={full ? "cropfull" : "stagehold"} data-crop-fullview={full || undefined}>
          <div className="stage" style={full ? { transform: `scale(${fullS})`, "--hs": 1 / fullS } as React.CSSProperties : undefined} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
            onWheel={(e) => { if (cropping) setZoom(view.z * (e.deltaY < 0 ? 1.1 : 1 / 1.1)); }}>
            <ImageLayer info={info} view={view} k={1} originX={SW / 2} originY={SH / 2} />
            {cropping ? (
              <div className="cropbox" style={{ left: lay.boxL, top: lay.boxT, width: lay.boxW, height: lay.boxH }} onPointerDown={down("move")}
                tabIndex={0} role="group" aria-label="กรอบครอป ลูกศรเลื่อน บวกลบซูม"
                onKeyDown={(e) => {
                  const step = e.shiftKey ? 0.05 : 0.01;
                  const mv = (dx: number, dy: number) => { e.preventDefault(); setView((v) => ({ ...v, ...clampCenter(v.cx + dx, v.cy + dy, layout(info, v, ar)) })); };
                  if (e.key === "ArrowLeft") mv(-step, 0); if (e.key === "ArrowRight") mv(step, 0);
                  if (e.key === "ArrowUp") mv(0, -step); if (e.key === "ArrowDown") mv(0, step);
                  if (e.key === "+" || e.key === "=") { e.preventDefault(); setZoom(view.z * 1.1); }
                  if (e.key === "-") { e.preventDefault(); setZoom(view.z / 1.1); }
                }}>
                {(["nw", "ne", "sw", "se"] as const).map((k) => <span key={k} className={"hd " + k} onPointerDown={down(k)} />)}
              </div>
            ) : null}
          </div>
          {full ? (
            <div className="cropfullbar">
              <span style={{ whiteSpace: "nowrap" }}>ซูม</span>
              <Range value={Math.round(view.z * 100)} min={100} max={400} step={5} label="ซูม" format={(v) => `${v}%`} onChange={(v) => { if (cropping) setZoom(v / 100); }} />
              <span style={{ whiteSpace: "nowrap", minWidth: 40, textAlign: "right" }}>{Math.round(view.z * 100)}%</span>
              <button type="button" className="btn btn-main btn-sm" onClick={() => setFull(false)} data-crop-full-close><IbTick size={15} />ตกลง</button>
            </div>
          ) : (
            <button type="button" className="bigbtn stagebig" title="ขยายเต็มจอ" aria-label="ขยายหน้าครอปเต็มจอ" data-crop-full onClick={() => setFull(true)}><IcExpand size={15} /></button>
          )}
          </div>
          </div>
          <div className="small" style={short ? undefined : { marginTop: -6, marginBottom: -5.4, marginRight: -12, paddingRight: 12, paddingBottom: 7.4, borderBottom: "1px solid var(--line)" }} data-crop-line>{cropping ? "ลากกรอบเพื่อเลื่อน ลากมุมเพื่อย่อขยาย และหมุนล้อเมาส์เพื่อซูม" : mode === "pad" ? "รูปไม่ถูกตัดเลยสักส่วน และที่ว่างเติมด้วยสีขอบที่เลือก" : "ใช้ทั้งรูปตามสัดส่วนเดิมโดยไม่ตัดและไม่เติมขอบ ปกแนวนอนจึงขึ้นชั้นวางเป็นแนวนอน"}</div>
          {/* แถวเดียวกัน แบบเติมขอบใช้ซูมไม่ได้ จึงเป็นสีขอบแทน ไม่มีแถวเพิ่มหรือหาย */}
          {!wideSlot && mode === "pad" ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10, height: 32, position: "relative" }} data-pads>
              <span style={{ fontSize: 14 }}>สีขอบ</span>
              {PADS.map((c) => <button key={c.c} type="button" className={"swatch" + (pad === c.c ? " on" : "")} style={{ background: c.c }} aria-label={"สีขอบ " + c.label} aria-pressed={pad === c.c} title={c.label} onClick={() => setPad(c.c)} />)}
              {own && <button type="button" className={"swatch" + (pad === own ? " on" : "")} style={{ background: own }} aria-label={"สีที่เลือกเอง " + own.toUpperCase()} aria-pressed={pad === own} title={"สีที่เลือกเอง " + own.toUpperCase()} onClick={() => setPad(own)} data-own-swatch />}
              <PadCustom pad={pad} onPad={pickPad} custom={!PADS.some((c) => c.c === pad)} />
              <span className="small">{PADS.find((c) => c.c === pad)?.label ?? pad.toUpperCase()}</span>
              {/* สีที่เลือกเองมีปุ่มคัดลอกรหัสสีข้างรหัส (BUGS ข้อ 55 ต่อ พี่กันสั่ง 12 พ.ย. 2569 "code เสียง ขอปุ่ม icon copy" หมายถึงรหัสสี) */}
              {!PADS.some((c) => c.c === pad) && <button type="button" className="padcopy" aria-label={hexCopied ? "คัดลอกรหัสสีแล้ว" : "คัดลอกรหัสสี " + pad.toUpperCase()} title={hexCopied ? "คัดลอกแล้ว" : "คัดลอกรหัสสี"} data-own-copy
                onClick={() => { navigator.clipboard?.writeText(pad.toUpperCase()).then(() => { setHexCopied(true); setTimeout(() => setHexCopied(false), 1500); }).catch(() => {}); }}>
                {hexCopied ? <IbTick size={14} /> : <IcCopy size={14} />}</button>}
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 12, height: 32, opacity: cropping ? 1 : 0.45 }}>
              <span style={{ fontSize: 14, whiteSpace: "nowrap" }}>ซูม</span>
              <Range value={Math.round(view.z * 100)} min={100} max={400} step={5} label="ซูม" format={(v) => `${v}%`} onChange={(v) => { if (cropping) setZoom(v / 100); }} />
              <span className="small" style={{ whiteSpace: "nowrap", minWidth: 40, textAlign: "right" }}>{Math.round(view.z * 100)}%</span>
            </div>
          )}
          {p.link && (
            <div style={{ display: "flex", alignItems: "center", gap: 12 }} data-tilt>
              <span style={{ fontSize: 14, whiteSpace: "nowrap" }}>ปรับเอียง</span>
              <Range value={view.tilt} min={-15} max={15} step={0.5} label="ปรับเอียง" format={(v) => `${v}°`} onChange={setTilt} />
              <button type="button" className="btn btn-ghost btn-sm" aria-label="เอียงทวนเข็มครึ่งองศา" data-tilt-minus onClick={() => setTilt(view.tilt - 0.5)}>−</button>
              <button type="button" className="btn btn-ghost btn-sm" aria-label="เอียงตามเข็มครึ่งองศา" data-tilt-plus onClick={() => setTilt(view.tilt + 0.5)}>+</button>
              <span className="small" style={{ whiteSpace: "nowrap", minWidth: 40, textAlign: "right" }} data-tilt-val>{view.tilt > 0 ? "+" : view.tilt < 0 ? "−" : ""}{Math.abs(view.tilt)}°</span>
            </div>
          )}
          <div style={{ display: "flex", gap: 8, marginTop: short ? 0 : 3 }} data-crop-tools>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => turn(-90)}><IbRotL size={15} />หมุนซ้าย</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => turn(90)}><IbRotR size={15} />หมุนขวา</button>
            <button type="button" className={"btn btn-ghost btn-sm" + (view.flip ? " pressed" : "")} aria-pressed={view.flip} onClick={() => setView((v) => ({ ...v, flip: !v.flip }))}><IbFlip size={15} />พลิกซ้ายขวา</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setView(START); setMode("crop"); }}><IcRefresh size={15} />กลับเป็นแบบเดิม</button>
          </div>
          {/* จองที่เท่าตารางคุณภาพทั้ง JPG และ PNG สลับแล้วหน้าต่างสูงเท่าเดิม */}
          {!p.link && !short && <div style={{ height: TABLE_ROOM, display: "flex", flexDirection: "column", gap: 12 }} data-table-room>
          {smallLeft && smallCard}
          {format === "jpg" && (
            <>
              {render && render.sizes.length > 0 && (
                <table className="fmt" style={{ fontSize: 13 }} data-qtable>
                  <thead><tr><th>คุณภาพ</th><th>ไฟล์ราว</th><th>ความต่างที่ตาเห็น</th></tr></thead>
                  <tbody>{render.sizes.map(([q, b]) => (
                    <tr key={q} className={q === quality ? "on" : ""}><td>{q === quality ? <b>{q}%</b> : `${q}%`}</td><td><span className="nw">{fmtSize(b)}</span></td><td>{QUAL_NOTE[q]}</td></tr>
                  ))}</tbody>
                </table>
              )}
            </>
          )}
          </div>}
        </div>
    </>
  );
}
