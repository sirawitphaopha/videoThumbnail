/* หน้าก่อนเห็นกราฟ สามแบบ กำลังถามจำนวนแทร็ก ยังไม่เปิดไฟล์ และเลือกแทร็ก
   แยกจาก BitratePage.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 3) เนื้อโค้ดยกมาทั้งก้อน */
import { thumbUrl } from "../../lib/api";
import { dropClick } from "../../components/ui";
import { IcBitrate, IcFile } from "../../components/icons";
import bvIcon from "../../assets/thanks/bitrateviewer.ico";
import { audioIcon, clock, codecName, infoOf } from "./common";
import type { BrCtx } from "./brCtx";

export function askingView({ pg }: { pg: BrCtx }) {
  const { home, pick, thumbOf } = pg;
  const asking = pg.asking!;
    const nm = asking.split(/[\\/]/).pop() ?? asking, tha = thumbOf(asking);
    return (
      <div className="ag brn" data-brn data-brnasking>
        <div className="brn-top"><div className="agtop">
          <button type="button" className="btn btn-ghost" onClick={home} title="กลับหน้ารวม ดูไฟล์ที่เปิดล่าสุด" data-brnhome>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>หน้ารวม</button>
          <div className="fchip">
            {tha ? <img className="fthumb" src={thumbUrl(tha) ?? ""} alt="" /> : <div className="fnote brn-fnote"><IcBitrate size={22} /></div>}
            <div style={{ minWidth: 0 }}>
              <div className="nm" title={asking}>{nm.replace(/\.[^.]+$/, "")}<span className="ext">{nm.match(/\.[^.]+$/)?.[0] ?? ""}</span></div>
              <div className="meta">กำลังอ่านรายชื่อแทร็กในไฟล์…</div>
            </div>
          </div>
          <button type="button" className="btn btn-ghost" onClick={pick} data-brnopen><IcFile size={16} />เปิดไฟล์อื่น</button>
        </div></div>
        {/* ยังไม่รู้ว่าจะเป็นหน้าเลือกแทร็กหรือหน้ากราฟ ส่วนล่างว่างไว้ ไม่เดาหน้าตาผิด (ราวครึ่งวินาที) */}
      </div>
    );
}


export function brStartView({ pg }: { pg: BrCtx }) {
  const { extCard, film, forget, modeSel, movies, onClassic, open, pick, recent, thumbOf } = pg;
    const shelf = movies.filter((m) => !m.missing).slice(0, 6);
    return (
      <div className="ag brn" data-brn>
        <div className="gmodebar">
          <div className="seg" role="group" aria-label="แบบหน้า"><button type="button" className="on" aria-pressed>แบบชั้นหนัง</button><button type="button" onClick={() => onClassic?.(null)} data-brnclassic style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><img src={bvIcon} alt="" width={16} height={16} style={{ display: "block", flex: "none" }} />แบบ Bitrate Viewer</button></div>
          <span className="small">ดูว่าแต่ละช่วงของวิดีโอหรือเสียงใช้ข้อมูลมากแค่ไหน โดยอ่านอย่างเดียว ไฟล์จึงไม่ถูกแตะ</span>
        </div>
        <div className="drop" style={{ minHeight: 180 }} onClick={dropClick(pick)} data-brndrop>
          <b style={{ color: "var(--txt2)" }}>ลากไฟล์หนังหรือไฟล์เสียงมาวางตรงนี้</b><span>หรือ</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={pick}><IcFile size={15} />เลือกไฟล์จากเครื่อง</button>
          <span className="small">อ่านบิตเรตด้วย ffprobe ถ้าไฟล์มีหลายแทร็กจะขึ้นให้เลือกว่าจะดูวิดีโอหรือเสียงแทร็กไหน</span>
        </div>
        {recent.length > 0 && <><div className="small">ไฟล์ที่เปิดล่าสุด กดเพื่อดูอีกครั้ง ส่วนปุ่มกากบาทเอาออกจากรายการโดยไฟล์ในเครื่องไม่ถูกแตะ</div>
          <div className="graph-recent">{recent.map((p) => {
            const nm = p.split(/[\\/]/).pop() ?? p, th = thumbOf(p);
            return (
              <div key={p} className="recentrow">
                <button type="button" className="dd" onClick={() => void open(p, modeSel)} title={p} data-brnrecent={nm}>
                  <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: "1 1 auto", overflow: "hidden" }}>
                    <span className="rtype">{th ? <img src={thumbUrl(th) ?? ""} alt="" style={{ width: 18, height: 27, borderRadius: 3, objectFit: "cover" }} /> : <i className="rnote">{film}</i>}{extCard(nm)}</span>
                    <span style={{ whiteSpace: "nowrap", minWidth: 0 }}>{nm.replace(/\.[^.]+$/, "")}</span></span>
                  {infoOf(p) && <span className="small" style={{ flex: "none" }}>{codecName(infoOf(p)!.codec)} ยาว {clock(infoOf(p)!.duration)}</span>}
                </button>
                <button type="button" className="rmx" onClick={() => forget(p)} aria-label={`เอา ${nm} ออกจากรายการเปิดล่าสุด`} title="เอาออกจากรายการ ไฟล์ในเครื่องไม่ถูกแตะ">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
                </button>
              </div>
            );
          })}</div></>}
        {shelf.length > 0 && <><div className="small">หรือเลือกจากชั้นวาง</div>
          <div className="graph-recent">{shelf.map((m) => (
            <button key={m.id} type="button" className="dd" onClick={() => void open(m.path, modeSel)}>
              <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: "1 1 auto", overflow: "hidden" }}><span className="rtype">{(m.thumb ?? m.linked?.[0]?.thumb) ? <img src={thumbUrl(m.thumb ?? m.linked?.[0]?.thumb ?? null) ?? ""} alt="" style={{ width: 18, height: 27, borderRadius: 3, objectFit: "cover" }} /> : <i className="rnote">{film}</i>}{extCard(m.path)}</span><span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{m.name.replace(/\.[^.]+$/, "")}</span></span>
              <span className="small">{m.videoShort ?? ""}</span>
            </button>))}</div></>}
      </div>
    );
}


export function chooseView({ pg }: { pg: BrCtx }) {
  const { film, home, modeSel, name, open, pick, thumbOf } = pg;
  const path = pg.path!;
  const choose = pg.choose!;
    const thc = thumbOf(path);
    return (
      <div className="ag brn" data-brn data-brnchoose>
        <div className="brn-top"><div className="agtop">
          <button type="button" className="btn btn-ghost" onClick={home} title="กลับหน้ารวม ดูไฟล์ที่เปิดล่าสุด" data-brnhome>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>หน้ารวม</button>
          <div className="fchip">
            {thc ? <img className="fthumb" src={thumbUrl(thc) ?? ""} alt="" /> : <div className="fnote brn-fnote"><IcBitrate size={22} /></div>}
            <div style={{ minWidth: 0 }}>
              <div className="nm" title={path}>{name.replace(/\.[^.]+$/, "")}<span className="ext">{name.match(/\.[^.]+$/)?.[0] ?? ""}</span></div>
              <div className="meta">มี {choose.tracks.length} แทร็ก เลือกแทร็กที่จะดูบิตเรต</div>
            </div>
          </div>
          <button type="button" className="btn btn-ghost" onClick={pick} data-brnopen><IcFile size={16} />เปิดไฟล์อื่น</button>
        </div></div>
        <section className="card brn-choose">
          <h3>ดูบิตเรตของแทร็กไหน</h3>
          {/* วิดีโออยู่ส่วนบน เส้นขีดคั่น แล้วตามด้วยแทร็กเสียงทั้งหมด (BUGS ข้อ 106 พี่กันสั่ง 13 พ.ย. 2569 "ทำแบ่งเป็นสองส่วเนเลย ภาพอยู่บน ขั้นด้วยขีด เเละก็เสียง") */}
          {[choose.tracks.filter((t) => t.id === "v"), choose.tracks.filter((t) => t.id !== "v")].filter((g) => g.length).map((g, gi) => (
            <div key={gi} className={"brn-pickgrp" + (gi ? " sep" : "")} data-brnpickgrp={g[0].id === "v" ? "video" : "audio"}>
              <div className="small brn-pickh">{g[0].id === "v" ? "ภาพ" : "เสียง"}</div>
              <div className="graph-recent">{g.map((t) => (
                <button key={t.id} type="button" className="dd" onClick={() => void open(path, modeSel, false, t.id)} data-brnpick={t.id}>
                  <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: "1 1 auto", overflow: "hidden" }}><i className="rnote">{t.id === "v" ? film : audioIcon}</i><span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{t.label}</span></span>
                  <span className="small">{t.id === "v" ? "คิดได้ 4 วิธี" : "คิดต่อวินาที"}</span>
                </button>))}</div>
            </div>))}
          <p className="small">เปลี่ยนแทร็กทีหลังได้ที่ปุ่มแทร็กด้านบนของกราฟ</p>
        </section>
      </div>
    );
}
