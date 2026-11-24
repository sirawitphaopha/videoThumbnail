/* ฝั่งขวาของหน้าต่างครอป ช่องปก ตัวอย่างหลังครอป แบบปก ไฟล์รูปที่ได้ คุณภาพ JPG คำเตือน และขนาดรูปที่ได้
   แยกจาก CropDialog.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 9) เนื้อโค้ดยกมาทั้งก้อน */
import { Range, Seg, CardIcon, Phr } from "../ui";
import { fmtSize } from "../../lib/format";
import { IcPoster, IcTall, IcWide, IbCrop, IcFile } from "../icons";
import { digitKey } from "../ColorPick";
import { PREVIEW_ROOM, PREVIEW_ROOM_SHORT, PREVIEW_K_SHORT, PREVIEW_K_TALL, FORMAT_ROOM, START } from "./cropCalc";
import { Preview } from "./CropPreview";
import type { CrCtx } from "./cropCtx";

export function CropRight({ pg }: { pg: CrCtx }) {
  const { busy, edge, format, info, lay, mode, orient, p, pad, pickOrient, pngCard, qText, quality, render, setFormat, setMode, setOrient, setQText, setQuality, setView, short, smallCard, smallLeft, switchSlot, tag, tight, typeQ, using, view, wideSlot } = pg;
  return (
    <>
        <div className={short || p.link ? undefined : "cropright"} style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12, minWidth: 0, alignSelf: "stretch", position: "relative", ...(short || p.link ? { borderLeft: "1px solid var(--line)", paddingLeft: 11 } : { paddingLeft: 12 }) }}>
          {p.link && (
            <div className="setrow" style={{ borderTop: 0, paddingTop: 0 }}>
              <div className="lbl">ช่องปก</div>
              <Seg small label="ช่องปก" value={p.link.orient} onChange={switchSlot} options={[{ value: "tall", label: <><IcTall size={14} /><span className="nw">ปกตั้ง 2 : 3</span></> }, { value: "wide", label: <><IcWide size={14} /><span className="nw">ปกนอน 16 : 9</span></> }]} />
            </div>
          )}
          <div style={{ fontWeight: 600, fontSize: 14 }}>ตัวอย่างหลังครอป</div>
          {/* จองที่เท่าตัวอย่างสูงสุด (สูง 165 + ป้ายใต้รูป) สลับแบบปกแล้วแถวข้างล่างไม่ขยับ (พี่กันสั่ง 9 พ.ย. 2569 "กันที่ไว้ที มันขยับไปมาอ่ะ") */}
          <div style={{ display: "flex", gap: 18, alignItems: "flex-end", justifyContent: "center", flexWrap: "wrap", minHeight: short ? PREVIEW_ROOM_SHORT : PREVIEW_ROOM }} data-previews>
            {(() => {
              // ปกจับคู่ไม่ได้อยู่ในไฟล์ ไอคอนใน Windows ไม่เปลี่ยน (Icaros อ่านปกจากในไฟล์) จึงไม่มีตัวอย่างไอคอน
              const sizes = (wideSlot
                ? [{ w: 128, h: 72, cap: "บนชั้นวาง" }, { w: 160, h: 90, cap: "แผงรายละเอียด" }, { w: 64, h: 36, cap: "ไอคอน Windows" }]
                : [{ w: 72, h: 108, cap: "บนชั้นวาง" }, { w: 110, h: 165, cap: "แผงรายละเอียด" }, { w: 40, h: 60, cap: "ไอคอน Windows" }]).slice(0, p.link ? 2 : 3);
              const pvK = short ? PREVIEW_K_SHORT : wideSlot ? 1 : PREVIEW_K_TALL;
              const cell = (s: { w: number; h: number; cap: string }, k = pvK) => (
                <div key={s.cap} style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
                  <Preview info={info} view={view} lay={lay} mode={wideSlot ? "crop" : mode} pad={pad} w={Math.round(s.w * k)} h={Math.round(s.h * k)} />
                  <div className="small" style={{ marginTop: 6 }}>{s.cap}</div>
                </div>
              );
              // ปกนอนวางสามรูปเรียงแถวเดียวแล้วเบียด · แผงรายละเอียดใหญ่ครึ่งบน อีกสองรูปแถวล่าง ในที่ที่จองไว้เท่าเดิม
              // (พี่กันสั่ง 11 พ.ย. 2569 "ให้รูป แผงรายละเอียดอยู่ครึ่งบน เเสดงอันใหญ่ เเละอีกสองตัวอย่างอยู่ด้านล่าง") · หน้าต่างเตี้ยที่ไม่พอสูงยังเรียงแถวเดียว
              if (wideSlot && !short) {
                const big = sizes.find((s) => s.cap === "แผงรายละเอียด")!, rest = sizes.filter((s) => s !== big);
                return (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, width: "100%" }} data-previews-wide>
                    {cell({ ...big, w: 272, h: 153 }, 1)}
                    <div style={{ display: "flex", gap: 28, alignItems: "flex-end", justifyContent: "center" }}>{rest.map((s) => cell(s))}</div>
                  </div>
                );
              }
              return sizes.map((s) => cell(s));
            })()}
          </div>
          {pickOrient && <div className="setrow" style={{ borderTop: "1px solid var(--line)", paddingTop: edge, paddingBottom: tight, marginTop: short ? 0 : -5, marginLeft: -12, paddingLeft: 12 }} data-crop-orient>
            <div className="lbl">ปก</div>
            <Seg small label="ปก" value={orient} onChange={(o) => { if (o === orient || using) return; setOrient(o); setView(START); }} options={[{ value: "tall", label: <><IcTall size={14} /><span className="nw">ปกตั้ง 2 : 3</span></> }, { value: "wide", label: <><IcWide size={14} /><span className="nw">ปกนอน 16 : 9</span></> }]} />
          </div>}
          {!wideSlot && <div className="setrow" style={{ borderTop: pickOrient ? "1px solid transparent" : "1px solid var(--line)", paddingTop: pickOrient ? tight : edge, paddingBottom: tight, marginTop: pickOrient ? -12 : short ? 0 : -5, marginLeft: -12, paddingLeft: 12 }} data-crop-mode>
            <div className="lbl">แบบปก</div>
            <Seg small label="แบบปก" value={mode} onChange={setMode} options={[{ value: "crop", label: <><IbCrop size={14} />ตัดให้พอดี 2 : 3</> }, { value: "pad", label: <><IcPoster size={14} />เติมขอบ</> }, { value: "original", label: <><IcFile size={14} />ตามรูปเดิม</> }]} />
          </div>}
          {/* เลือก ตามรูปเดิม กับรูปที่ไม่ใช่ 2 : 3 เตือนตรงจุดที่กำลังเลือก ไม่ไปขึ้นบนการ์ดหลังเลือกเสร็จ (BUGS ข้อ 8 · พี่กัน "เนี่ย ถ้าเลือกรูปเดิม แบบที่เราเลือก เเล้วระบบมันเตือน") */}
          {!wideSlot && mode === "original" && !info.twoThree && <div className="stat warn" style={{ marginTop: -6, marginBottom: 6, padding: "6px 10px" }} data-origwarn><CardIcon kind="warn" /><div><b>ปกจะไม่เต็มช่องบนชั้นวาง</b><Phr>{`รูปนี้เป็น${info.aspect.replace(/^รูป/, "")} ไม่ใช่ 2 : 3 จะเห็นขอบว่างรอบปก`}</Phr></div></div>}
          {/* แบบปกนอนไม่มีแถวแบบปก เส้นใต้ตัวอย่างย้ายมาอยู่แถวนี้ ให้เส้นแบ่งตรงกับแบบปกตั้ง (BUGS ข้อ 58 พี่กันสั่ง "ครอปเเนวนอน…ใส่เส้นเเบ่งให้เหมือนเพื่อน") */}
          {!p.link && <div className="setrow" style={wideSlot && !pickOrient ? { borderTop: "1px solid var(--line)", paddingBlock: edge, marginTop: short ? 0 : -5, marginLeft: -12, paddingLeft: 12 } : { borderTop: "1px solid transparent", marginTop: -12, paddingTop: tight, paddingBottom: tight }} data-crop-format>
            <div className="lbl">ไฟล์รูปที่ได้ {tag && <span className="extag extcv" style={{ marginLeft: 6 }}>{tag}</span>}</div>
            <Seg small label="ไฟล์รูปที่ได้" value={format} onChange={setFormat} options={[{ value: "jpg", label: "JPG" }, { value: "png", label: "PNG" }]} />
          </div>}
          {/* แถบคุณภาพอยู่ใต้แถว ไฟล์รูปที่ได้ ทันที ตามที่เลือกชนิดไฟล์ (BUGS ข้อ 55 ต่อ พี่กันสั่ง 12 พ.ย. 2569 "ขอเเถบคุณภาพอยู่ใต้ ไฟล์ที่ได้") */}
          {p.link ? null : format === "jpg" ? (
            <div style={{ display: "flex", alignItems: "center", gap: 12, minHeight: FORMAT_ROOM }}>
              <span style={{ fontSize: 14, whiteSpace: "nowrap" }}>คุณภาพ JPG</span>
              <Range value={Math.max(50, quality)} min={50} max={100} step={5} label="คุณภาพ JPG" format={(v) => `${v}%`} onChange={(v) => { setQText(null); setQuality(v); }} />
              <span className="qnum">
                <input value={qText ?? String(quality)} inputMode="numeric" maxLength={3} aria-label="คุณภาพ JPG พิมพ์เลข 1 ถึง 100" data-quality-input
                  onFocus={(e) => e.currentTarget.select()}
                  onChange={(e) => typeQ(e.target.value)}
                  onBlur={() => setQText(null)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } else digitKey(e, typeQ); }} />%
              </span>
            </div>
          ) : pngCard}
          {/* รูปที่แนบใน MKV ตรง ๆ ไม่ได้ บอกตรงจุดที่เลือกชนิดไฟล์ หน้าหลักแจ้งแค่สั้น ๆ (BUGS ข้อ 55 พี่กันสั่ง 12 พ.ย. 2569 "หน้านั้นก็บอกด้วยสิ ว่าเเนบ mkv ไม่ได้") */}
          {/* กล่องเตือนสีเหลืองแบบกล่องปกไม่เต็มช่อง (พี่กันถาม "เตือน สีเหลืองไหม") · เนื้อความแถวเดียว กว้าง 300 จาก 368 จุดที่จอเล็ก ไม่ถ่าง (เดิมยาว 427 จุด ตกบรรทัดแล้วบรรทัดบนถ่าง) */}
          {!p.link && !info.attachable && <div className="stat warn" style={{ marginTop: -6, marginBottom: 6, padding: "6px 10px" }} data-convnote><CardIcon kind="warn" /><div><b>{`รูป .${info.ext} แนบใน MKV ตรง ๆ ไม่ได้`}</b><Phr>{`แปลงเป็น ${format.toUpperCase()} ตามที่เลือกก่อนแนบ  และรูปเดิมไม่ถูกแก้`}</Phr></div></div>}
          <div className="small" data-size>
            {render ? <>ได้รูปขนาด <span className="nw">{render.width} × {render.height} px</span> ไฟล์ {format.toUpperCase()} ราว <span className="nw">{fmtSize(render.bytes)}</span>{busy ? " กำลังคิดใหม่…" : ""}</> : "กำลังคิดขนาดไฟล์…"}
            {/* รูปที่ต้องแปลงมีกล่องเตือนข้างบนบอกแล้ว ไม่พูดซ้ำตรงนี้ (เดิมซ้ำกันสองที่) */}
            {!short && (p.link || !tag) && <br />}{short ? null : p.link ? <Phr>{"ตอนนี้ยังไม่เขียนไฟล์ โปรแกรมจำค่าครอปไว้แล้วทำรูปจริงตอนกดยืนยัน และรูปเดิมในเครื่องไม่ถูกแก้"}</Phr> : tag ? null : "รูปเดิมในเครื่องไม่ถูกแก้"}
          </div>
          {!smallLeft && smallCard}
        </div>
    </>
  );
}
