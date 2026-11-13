/* แถวปุ่มเสียง 19 ปุ่มของหน้าแก้ซับ (แผนหน้าแก้ซับ ขั้น 5 · BUGS ข้อ 109 · เรียงตาม default_toolbar.json ของ Aegisub ไม่เอาคาราโอเกะ)
   แบบ 2 ไอคอนพร้อมชื่อสั้นเต็มความกว้างใต้ภาพหนังกับคลื่นเสียงเป็นหลัก ที่ว่างไม่พอสลับเป็นแบบ 1 ไอคอนอย่างเดียว (useFitClass วัดที่ว่างจริง)
   พี่กันเลือกจากมอคอัป docs/mockups/sub-audio-toolbar.html · สีตามหน้าที่ (พี่กันสั่ง 13 พ.ย. 2569 "ใส่สีหน่อย")
   เขียว เล่น · แดง หยุด · ส้ม ขอบช่วงที่เลือก · น้ำเงิน ไปบรรทัดและเลื่อนภาพ · เขียวน้ำทะเล เผื่อเวลา · ม่วง ไปที่ช่วงกับแป้นตัวเลข · ชมพู ป้าย A ของปุ่มอัตโนมัติ · ส้มแดง ภาพความถี่
   สีเขียนเป็นชื่อสีกับ color-mix ใน subedit.css (กฎ CLAUDE.md ตัวแปลงโทนแปลงรหัสสีทุกตัวในไฟล์สไตล์) */
import { useFitClass } from "../../lib/fitSwitch";
import type { AudOpts } from "../../lib/subTiming";
import type { Tip } from "../../lib/codecAdv";
import InfoTip from "../InfoTip";

const BAR_TIP: Tip = {
  w: "ปุ่มเล่นเสียงกับตั้งเวลาของบรรทัดที่เลือก ชี้ปุ่มไหนขึ้นชื่อปุ่มกับคีย์ลัด ปุ่มสี่ปุ่มท้ายแถวเป็นปุ่มเปิดปิด พื้นสีเข้มคือเปิดอยู่",
  o: [
    ["ยืนยันทันที", "ลากขอบบนคลื่นเสียงแล้วเวลาลงบรรทัดเลย ไม่ต้องกดยืนยัน", "ตั้งเวลาได้เร็ว", "ลากพลาดก็ลงบรรทัดทันที ต้องเลิกทำ"],
    ["ไปต่อเอง", "กดยืนยันแล้วไปบรรทัดถัดไป บรรทัดสุดท้ายสร้างบรรทัดใหม่ต่อท้าย", "ไล่ตั้งเวลาทั้งไฟล์ได้ต่อเนื่อง", "อยากตรวจบรรทัดเดิมซ้ำต้องกดกลับ"],
    ["เลื่อนตาม", "เลือกบรรทัดแล้วภาพคลื่นเสียงเลื่อนไปที่บรรทัดนั้นเอง", "ไม่ต้องหาบรรทัดบนคลื่นเสียงเอง", "ดูช่วงอื่นค้างไว้ระหว่างเปลี่ยนบรรทัดไม่ได้"],
    ["แป้นตัวเลข", "คีย์ลัดบนแป้นตัวเลขด้านขวาใช้ได้แม้กำลังพิมพ์ในช่อง", "ตั้งเวลาไปพิมพ์ไปได้โดยไม่ต้องจับเมาส์", "ระหว่างเปิด พิมพ์ตัวเลขด้วยแป้นตัวเลขไม่ได้"],
  ],
  r: "เปิดไปต่อเองกับเลื่อนตามไว้ตามค่าตั้งต้นของ Aegisub ส่วนยืนยันทันทีกับแป้นตัวเลขเปิดเมื่อคล่องแล้ว",
};

export type AudAct = "prev" | "next" | "playsel" | "playline" | "stop" | "before" | "after" | "begin" | "end" | "toend" | "leadin" | "leadout" | "commit" | "goto";
type Tog = "autoCommit" | "autoNext" | "autoScroll" | "spectrum" | "medusa";
type Btn = { id: AudAct | Tog; tog?: boolean; icon: React.ReactNode; s: string; t: string; k: string; need?: "audio" | "line" } | { sep: true };

const G = (c: string, kids: React.ReactNode) => <g className={`se-c-${c}`} stroke="currentColor">{kids}</g>;
const TRI = (x: number, c = "play") => <path className={`se-c-${c}`} d={`M${x} 8.5v7l5.5-3.5z`} fill="currentColor" stroke="currentColor" />;
const A = (x = 16.5) => <text className="se-c-auto" x={x} y="9" fontSize="8.5" fontWeight="700" fill="currentColor" stroke="none" fontFamily="Sarabun, sans-serif">A</text>;

export const AUD_BTNS: Btn[] = [
  { id: "prev", icon: G("nav", <><path d="M14.5 6l-6 6 6 6" /><path d="M5 5v14" /></>), s: "บรรทัดก่อน", t: "ไปบรรทัดก่อน", k: "Z", need: "line" },
  { id: "next", icon: G("nav", <><path d="M9.5 6l6 6-6 6" /><path d="M19 5v14" /></>), s: "บรรทัดถัดไป", t: "ไปบรรทัดถัดไป", k: "X", need: "line" },
  { id: "playsel", icon: <>{G("edge", <path d="M7 5H4v14h3M17 5h3v14h-3" />)}{TRI(9.5)}</>, s: "เล่นช่วง", t: "เล่นช่วงที่เลือก รวมช่วงที่ลากแล้วแต่ยังไม่ยืนยัน", k: "Space หรือ S", need: "audio" },
  { id: "playline", icon: <>{G("play", <rect x="3" y="5" width="18" height="14" rx="2" />)}{TRI(9.5)}</>, s: "เล่นบรรทัด", t: "เล่นทั้งบรรทัดตามเวลาที่ยืนยันแล้ว", k: "R", need: "audio" },
  { id: "stop", icon: <rect className="se-c-stop" x="6.5" y="6.5" width="11" height="11" rx="1.5" fill="currentColor" stroke="currentColor" />, s: "หยุด", t: "หยุดเสียง", k: "H", need: "audio" },
  { sep: true },
  { id: "before", icon: <>{TRI(3)}{G("edge", <><path d="M17 5h-3v14h3" /><path d="M20 9v6" opacity=".45" /></>)}</>, s: "ก่อนช่วง", t: "เล่นครึ่งวินาทีก่อนเวลาเริ่ม ไว้ฟังว่าเสียงต้นประโยคขาดไหม", k: "Q", need: "audio" },
  { id: "after", icon: <>{G("edge", <><path d="M7 5h3v14H7" /><path d="M4 9v6" opacity=".45" /></>)}{TRI(14)}</>, s: "หลังช่วง", t: "เล่นครึ่งวินาทีหลังเวลาจบ ไว้ฟังว่าเสียงท้ายประโยคขาดไหม", k: "W", need: "audio" },
  { id: "begin", icon: <>{G("edge", <><path d="M8 5H5v14h3" /><path d="M19 9v6" opacity=".45" /></>)}{TRI(10.5)}</>, s: "ต้นช่วง", t: "เล่นครึ่งวินาทีแรกของช่วงที่เลือก", k: "E", need: "audio" },
  { id: "end", icon: <>{G("edge", <><path d="M5 9v6" opacity=".45" /><path d="M16 5h3v14h-3" /></>)}{TRI(8)}</>, s: "ท้ายช่วง", t: "เล่นครึ่งวินาทีสุดท้ายของช่วงที่เลือก", k: "D", need: "audio" },
  { id: "toend", icon: <>{G("edge", <path d="M7 5H4v14h3" />)}{G("play", <path d="M10 8l4 4-4 4M15.5 8l4 4-4 4" />)}</>, s: "จนจบไฟล์", t: "เล่นจากเวลาเริ่มของช่วงไปจนจบไฟล์", k: "T", need: "audio" },
  { sep: true },
  { id: "leadin", icon: <>{G("edge", <path d="M16 5h-3v14h3" />)}{G("lead", <path d="M13 12H3.5M6.5 9l-3 3 3 3" />)}</>, s: "เผื่อหน้า", t: "ขยับเวลาเริ่มให้เร็วขึ้น 100 ms ให้ซับขึ้นก่อนเสียงนิดหนึ่ง", k: "C", need: "line" },
  { id: "leadout", icon: <>{G("edge", <path d="M8 5h3v14H8" />)}{G("lead", <path d="M11 12h9.5M17.5 9l3 3-3 3" />)}</>, s: "เผื่อท้าย", t: "ขยับเวลาจบให้ช้าลง 350 ms ให้ซับค้างหลังเสียงจบนิดหนึ่ง", k: "V", need: "line" },
  { sep: true },
  { id: "commit", icon: G("play", <path d="M4.5 12.5l5 5 10-11" />), s: "ยืนยัน", t: "บันทึกเวลาที่ลากไว้บนคลื่นเสียงลงบรรทัด", k: "Enter หรือ G", need: "line" },
  { id: "goto", icon: G("go", <><circle cx="12" cy="12" r="6.5" /><path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4" /><circle cx="12" cy="12" r="1.2" fill="currentColor" /></>), s: "ไปที่ช่วง", t: "เลื่อนภาพคลื่นเสียงให้ช่วงที่เลือกอยู่กลางกรอบ", k: "ไม่มีคีย์ลัด", need: "line" },
  { sep: true },
  { id: "autoCommit", tog: true, icon: <>{G("play", <path d="M3.5 13.5l4.5 4.5 8-9" />)}{A()}</>, s: "ยืนยันทันที", t: "เปิดไว้ ลากขอบบนคลื่นเสียงแล้วบันทึกเวลาเลย ไม่ต้องกดยืนยัน", k: "ปุ่มเปิดปิด" },
  { id: "autoNext", tog: true, icon: <>{G("play", <path d="M3 12.5l4 4 6.5-7.5" />)}{G("nav", <path d="M14.5 15h6.5M18 12l3 3-3 3" />)}{A()}</>, s: "ไปต่อเอง", t: "เปิดไว้ กดยืนยันแล้วไปบรรทัดถัดไปเอง ตั้งเวลาต่อได้ทันที", k: "ปุ่มเปิดปิด" },
  { id: "autoScroll", tog: true, icon: <>{G("nav", <><rect x="2.5" y="8" width="14" height="11" rx="2" /><path d="M5.5 13.5h7M10 11l2.5 2.5L10 16" /></>)}{A(17)}</>, s: "เลื่อนตาม", t: "เปิดไว้ เลือกบรรทัดในตารางแล้วภาพคลื่นเสียงเลื่อนไปที่บรรทัดนั้นเอง", k: "ปุ่มเปิดปิด" },
  { id: "spectrum", tog: true, icon: G("spec", <path d="M4 20v-6M8 20V8M12 20v-9M16 20V5M20 20v-7" />), s: "ความถี่", t: "สลับภาพคลื่นเสียงระหว่างรูปคลื่นกับภาพความถี่", k: "ปุ่มเปิดปิด", need: "audio" },
  { id: "medusa", tog: true, icon: <><rect x="2.5" y="6.5" width="19" height="11" rx="2" />{G("go", <path d="M6 10h.01M9.5 10h.01M13 10h.01M16.5 10h.01M8 14h8" />)}</>, s: "แป้นตัวเลข", t: "เปิดไว้ คีย์ลัดบนแป้นตัวเลขด้านขวาใช้ได้แม้เคอร์เซอร์อยู่ในช่องพิมพ์ 0 กับ 2 ไปบรรทัดก่อนและถัดไป 5 เล่นช่วง 1 กับ 3 ฟังก่อนและหลังช่วง 8 หยุด 4 กับ 6 เลื่อนเวลาเริ่ม 7 กับ 9 หดหรือยืดเวลาจบทีละ 10 ms Enter ยืนยัน (Aegisub เรียกว่า Medusa Mode)", k: "ปุ่มเปิดปิด" },
];

/** compact = แบบ 1 ไอคอนอย่างเดียวใต้คลื่นเสียง (หน้าต่างเตี้ย) · ไม่ส่ง = แบบ 2 เต็มความกว้าง ที่ว่างแนวนอนไม่พอเหลือไอคอนเอง */
export default function AudioBar(p: { opts: AudOpts; noAudio?: string; noLine?: string; compact?: boolean; onAct: (a: AudAct) => void; onToggle: (k: Tog, v: boolean) => void }) {
  useFitClass("[data-subedit] .se-atb:not(.compact)");
  return (
    <div className={"se-atb" + (p.compact ? " compact" : "")} role="toolbar" aria-label="ปุ่มตั้งเวลาและเล่นเสียง" data-se-atb={p.compact ? "compact" : "wide"}>
      {AUD_BTNS.map((b, i) => {
        if ("sep" in b) return <span key={`s${i}`} className="se-as" aria-hidden="true" />;
        const why = b.need === "audio" ? p.noAudio : b.need === "line" ? p.noLine : undefined;
        const on = b.tog ? !!p.opts[b.id as Tog] : undefined;
        return (
          <button key={b.id} type="button" className={"se-ab" + (why ? " off" : "")} aria-pressed={on} aria-disabled={!!why || undefined} aria-label={b.s}
            title={why ?? `${b.t} (${b.k})`} data-se-ab={b.id}
            onClick={() => { if (why) return; if (b.tog) p.onToggle(b.id as Tog, !on); else p.onAct(b.id as AudAct); }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{b.icon}</svg>
            <span>{b.s}</span>
          </button>
        );
      })}
      <span className="se-atip"><InfoTip title="ปุ่มเล่นเสียงและตั้งเวลา" tip={BAR_TIP} /></span>
    </div>
  );
}
