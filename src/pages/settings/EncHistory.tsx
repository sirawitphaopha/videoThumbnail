/* ประวัติรุ่นของตัวแปลงที่แนบมา ท้ายหัวข้อตัวแปลงเสียง (BUGS ข้อ 159)
   ใช้แถวแบบหัวข้อชนิดไฟล์ (.ftrow) วันที่ช่องซ้าย สิ่งที่เปลี่ยนช่องขวาบรรทัดละตัวแปลง · ข้อมูลอยู่ encHistoryData.ts */
import { Phr } from "../../components/ui";
import { ENC_HISTORY, type EncChange } from "./encHistoryData";

const line = (c: EncChange) => `รุ่น ${c.from ? `${c.from} → ${c.to}` : `${c.to} แนบมาครั้งแรก`}${c.note ? ` ${c.note}` : ""}`;

export default function EncHistory() {
  return (
    <div data-enc-history>
      <h4 className="imghead">ประวัติรุ่นของตัวแปลงที่แนบมา</h4>
      <div className="small" style={{ marginBottom: 2 }}><Phr>{"รุ่นที่แนบมากับโปรแกรมเปลี่ยนเมื่อไหร่ เรียงจากครั้งล่าสุดลงไป"}</Phr></div>
      {ENC_HISTORY.map((h) => (
        <div key={h.iso} className="ftrow" data-enc-hist={h.iso}>
          <div className="ftname">{h.date}</div>
          <div className="ftbody">{h.changes.map((c) => (
            <div key={c.tool + c.to} className="small" data-enc-change><b style={{ color: "var(--txt)" }}>{c.tool}</b> <Phr>{line(c)}</Phr></div>))}</div>
        </div>))}
    </div>
  );
}
