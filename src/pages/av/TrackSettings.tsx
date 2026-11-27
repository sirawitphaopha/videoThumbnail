/* ส่วนตั้งค่าแทร็ก เนื้อเดียวกันทั้งแบบกางใต้แถวที่กด หน้าต่างซ้อน และแผงขวา
   แยกจาก AvPage.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 2) เนื้อโค้ดยกมาทั้งก้อน */
import Dialog from "../../components/Dialog";
import LangPicker from "./LangPicker";
import InfoTip from "../../components/InfoTip";
import { convertLabel } from "../../lib/codecs";
import ThaiInput from "../../components/ThaiInput";
import { Phr, J } from "../../components/ui";
import { kb } from "../../lib/popup";
import { langName } from "../../lib/langs";
import { IcSearch } from "../../components/icons";
import { BUSY, DelayBox, KIND_WORD, MAIN_TIP, rowText } from "./parts";
import { patch, setMain, setDelay } from "./trackOps";
import type { AvCtx } from "./avCtx";

/** หัวกับเนื้อของส่วนตั้งค่าแทร็กที่เลือก · ไม่มีแทร็กที่เลือกได้ null ทั้งคู่ */
export function trackDetail(pg: AvCtx) {
  const { nth, openCodec, output, refAudio, selected, setDelayFor, working } = pg;
  const detailHead = selected ? (
    <h3 style={{ justifyContent: "space-between" }}><span style={{ minWidth: 0, overflowWrap: "anywhere" }}>ตั้งค่าแทร็ก {rowText(selected, nth(selected)).title}</span>
      <span className={"tpill " + (selected.inMovie ? "in" : "new")}>{selected.inMovie ? "ในไฟล์" : "เพิ่มใหม่"}</span></h3>
  ) : null;
  const detailBody = selected ? (
    <div className="avdetail">
      <div className="avfield"><span className="avlbl">ภาษาและชื่อแทร็ก</span>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {selected.kind === "video" ? <span className="small" style={{ width: 130 }}>{langName(selected.lang)}</span>
            : <LangPicker value={selected.lang} width={130} label="ภาษาของแทร็กที่เลือก" onChange={(v) => patch(selected.key, { lang: v })} disabled={working ? BUSY : undefined} />}
          <div style={{ flex: 1, minWidth: 0 }}><ThaiInput value={selected.name} onChange={(v) => patch(selected.key, { name: v })} label="ชื่อแทร็ก" readOnly={working} /></div>
        </div>
        <span className="small"><Phr>{`ชื่อที่โปรแกรมเล่นแสดงตอนเลือกเสียงหรือซับ ส่วนไฟล์ที่เพิ่มจะตั้งภาษาจากชื่อไฟล์ให้ก่อน (คำ${J}ว่า พากย์${J}ไทย th tha)`}</Phr></span></div>
      {selected.kind !== "video" && (
        <div className="avfield"><span className="avlbl"><span>ตั้งเป็น{KIND_WORD[selected.kind]}หลัก <InfoTip title={`${KIND_WORD[selected.kind]}หลักคืออะไร`} tip={{ w: MAIN_TIP }} /></span></span>
          {/* ปุ่มวงกลมแบบเดียวกับคอลัมน์หลักในตาราง หลักมีได้แทร็กเดียวแบบปุ่มเลือกข้อเดียว (BUGS ข้อ 91 พี่กันสั่ง 13 พ.ย. 2569 "เอาปุ่มให้เหมือนกัน ถ้าจะวงกลม ก็วงกลม" · เดิมเป็นช่องติ๊กสี่เหลี่ยม) */}
          <div className={"chk" + (working || !selected.keep ? " off" : "")} aria-checked={selected.default} {...kb(() => { if (!working && selected.keep) setMain(selected.key); })} role="radio" data-main-panel>
            <span className={"radio" + (selected.default ? " on" : "")} aria-hidden="true" />
            <span>{selected.kind === "audio" ? "เปิดหนังแล้วเล่นเสียงนี้ก่อน" : "เปิดหนังแล้วขึ้นซับนี้ก่อน"}</span></div>
          <span className="small"><Phr>{`${KIND_WORD[selected.kind]}หลักมีได้แทร็กเดียว เลือกอันนี้แล้วอันเดิมจะเลิกเป็นหลัก${selected.kind === "audio" ? " " : output === "mp4" ? "" : " "}${selected.kind === "audio" ? "ซับหลักตั้งแยกกัน" : output === "mp4" ? "\nไฟล์ MP4 ถ้าไม่เลือกซับหลัก โปรแกรมเล่นส่วนใหญ่จะเปิดซับแรกให้เอง" : "ถ้าไม่เลือกซับหลักเลย หนังจะเปิดแบบไม่มีซับ"}`}</Phr></span></div>
      )}
      {selected.kind !== "video" && (
        <div className="avfield"><span className="avlbl">ดีเลย์</span>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}><DelayBox value={selected.delay} onChange={(v) => setDelay(selected.key, v)} label="แทร็กที่เลือก" wide off={working ? BUSY : undefined} />
            <span className="small">ms ค่าติดลบแปลว่า{KIND_WORD[selected.kind]}มาเร็วขึ้น</span>
            {selected.kind === "audio" && !selected.inMovie && refAudio && (
              <button type="button" className={"btn btn-sm " + (working ? "btn-wait" : "btn-ghost")} aria-disabled={working || undefined} title={working ? BUSY : "เทียบคลื่นเสียงกับเสียงเดิมในหนัง"}
                onClick={() => { if (!working) setDelayFor(selected.key); }} data-find-delay><IcSearch size={15} />หาค่าดีเลย์</button>)}</div>
          <span className="small">{selected.delayFromName != null ? <Phr>{`อ่านจากชื่อไฟล์ (คำว่า DELAY ${selected.delayFromName}ms) และแก้เองได้`}</Phr> : <Phr>{`ปุ่มลบและบวกปรับทีละ 100 ms กด Shift ค้างไว้จะปรับทีละ 10 ms ส่วน${J}ค่าที่ใส่ได้อยู่ระหว่างลบและบวก 600,000 ms (10 นาที)`}</Phr>}</span></div>
      )}
      {/* แปลงเสียงในส่วนตั้งค่าแทร็ก (BUGS ข้อ 34 พี่กัน "ให้มัน แปลไฟล์ได้ ก็ดีนะ ที่จุดนี้เลย" ยืนยัน 12 พ.ย. 2569 "แปลงไฟล์เสียง เข้าไจถูกละ")
          ปุ่มเดียวกับปุ่มแปลงในแถว เปิดแผงตั้งค่าเสียงตัวเดียวกัน ค่าตรงกันสองที่ · แทร็กซับกับภาพไม่มีหัวข้อนี้ */}
      {selected.kind === "audio" && (() => {
        const why = working ? BUSY : !selected.keep ? "แทร็กที่เอาออกไม่ต้องแปลง" : undefined;
        const how = selected.inMovie ? (selected.pair ?? true ? " เพิ่มคู่" : " แทนที่") : "";
        // ป้ายสั้นแบบปุ่มในแถว (Opus 64) ในประโยคเติมหน่วย kbps ให้บิตเรต · TVBR ของ qaac เป็นระดับคุณภาพ ไม่ใช่ kbps
        const lab = selected.convert ? convertLabel(selected.convert) : "";
        const labText = lab + (/\s\d+$/.test(lab) && !/TVBR \d+$/.test(lab) ? " kbps" : "");
        return (
          <div className="avfield" data-detail-conv><span className="avlbl">แปลงเสียง</span>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <button type="button" className={"dd" + (why ? " btn-wait" : "")} aria-disabled={!!why || undefined} title={why ?? "ตั้งค่าแปลงเสียง"}
                style={selected.convert ? { border: "1px solid #9fc4ea", background: "#f3f8fe", color: "#2f6496" } : undefined}
                onClick={() => { if (!why) openCodec(selected.key); }} data-detail-conv-btn>
                <span style={{ whiteSpace: "nowrap", minWidth: 0 }}>{selected.convert ? convertLabel(selected.convert) + how : "ไม่แปลง"}</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
              </button>
              {selected.convert && !why && <button type="button" className="btn btn-ghost btn-sm" onClick={() => patch(selected.key, { convert: null, convName: "" })} data-detail-conv-off>ไม่แปลง</button>}
            </div>
            <span className="small"><Phr>{why ?? (selected.convert
              ? `แปลงเป็น ${labText}${selected.inMovie ? (selected.pair ?? true ? " แล้วเพิ่มคู่กับแทร็กเดิม" : " แล้วแทนที่แทร็กเดิม") : ""}  กดปุ่มเพื่อแก้ค่า`
              : "คัดลอกเสียงเดิมไปทั้งก้อน คุณภาพเท่าเดิม  กดปุ่มเพื่อเลือกชนิดเสียงที่จะแปลง")}</Phr></span></div>
        );
      })()}
      {!selected.inMovie && (
        <div className="avfield"><span className="avlbl">ไฟล์</span>
          <span className="small" style={{ overflowWrap: "anywhere" }}>{selected.src}</span>
          {selected.notes?.map((n, i) => <span key={i} className="small"><Phr>{n}</Phr></span>)}</div>
      )}
    </div>
  ) : null;
  return { detailHead, detailBody };
}

/** แบบหน้าต่างซ้อนกลางจอกับแบบแผงขวา (แบบกางใต้แถวอยู่ใน TrackTable) */
export default function TrackPanels({ pg }: { pg: AvCtx }) {
  const { closeSel, nth, panel, selected, sideBox, sideOn } = pg;
  const { detailHead, detailBody } = trackDetail(pg);
  return (
    <>
        {/* ตั้งค่าแทร็ก แบบหน้าต่างซ้อนกลางจอ กับแบบแผงขวา (เลือกในหน้าตั้งค่า BUGS ข้อ 33) · แบบกางใต้แถวที่กดอยู่ในตารางข้างบน */}
        {selected && panel === "dialog" && (
          <Dialog open kind="menu" onClose={closeSel} width={780}
            title={<span className="trkdlg-t"><span>ตั้งค่าแทร็ก {rowText(selected, nth(selected)).title}</span><span className={"tpill " + (selected.inMovie ? "in" : "new")}>{selected.inMovie ? "ในไฟล์" : "เพิ่มใหม่"}</span></span>}
            actions={<button type="button" className="btn btn-main btn-sm" onClick={closeSel} data-track-done>เสร็จสิ้น</button>}>
            <div data-track-detail>{detailBody}</div>
          </Dialog>)}
        {sideOn && (
          <aside className="avside" data-track-detail aria-label="ตั้งค่าแทร็ก" style={sideBox ? { top: sideBox.top, bottom: sideBox.bottom } : { visibility: "hidden" }}>
            {/* ปุ่มเสร็จสิ้นติดล่างสุดของแผง มีเส้นแบ่ง เนื้อข้างบนเลื่อนได้ (พี่กันสั่ง 12 พ.ย. 2569 "เอาคำว่า เสร็จสิ้น อยู่ล่างสุดูและเอาขีดแบ่ง") */}
            <div className="avside-body"><div className="card">{detailHead}{detailBody}</div></div>
            <div className="avside-foot"><button type="button" className="btn btn-main btn-sm" onClick={closeSel} data-track-done>เสร็จสิ้น</button></div>
          </aside>)}

    </>
  );
}
