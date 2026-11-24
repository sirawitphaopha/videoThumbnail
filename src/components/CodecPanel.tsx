/* แผงตั้งค่าเสียง แบบง่ายกับขั้นสูง (มอคอัปหัวข้อ 2 · แผนเสียงและซับ ขั้น 4)
   เลือกชนิด Lossy (Opus AAC MP3 AC-3) หรือ Lossless (FLAC WavPack) · ตัวแปลง (ตัวต้นฉบับเป็นค่าตั้งต้น ffmpeg เป็นตัวรอง)
   แบบง่าย ชุดค่า 4 ชุดพร้อมขนาดที่คาด · ขั้นสูง การ์ดละช่อง ชื่อ ⓘ และค่าอยู่หัวการ์ด แถบเลื่อนเป็นขั้นพร้อมช่องพิมพ์ค่าเอง ขนาดที่คาดเปลี่ยนตามค่าทันที
   เริ่มจากแบบง่ายแล้วเปิดขั้นสูงแก้ต่อได้ ค่าที่เลือกไม่หาย · การ์ดเปลี่ยนตามตัวแปลงที่เลือก · ตัวย่อมีคำเต็มครั้งแรกที่เจอในแต่ละการ์ด
   แทร็กในหนัง เลือกเพิ่มคู่กับแทร็กเดิม (ค่าตั้งต้นที่พี่กันเคาะ) หรือแทนที่ · คำสั่งที่จะรันจริงจากฝั่ง Rust (encode_preview) พร้อมปุ่มคัดลอก
   ค่าที่กดใช้จำไว้เป็นค่าตั้งต้นของชนิดนั้นครั้งหน้า
   จัดโครงตามความหมาย 24 พ.ย. 2569 (BUGS ข้อ 155 ขั้น 9) ค่าอยู่ชุด hook codec/useCodecVals codec/useCodecOut ส่วนหน้าจออยู่ codec/CodecHead CodecTabs CodecFoot ฟังก์ชันล้วนอยู่ codec/codecCalc */
import Dialog from "./Dialog";
import { baseName } from "./codec/codecCalc";
import { useCodecVals, type CpProps } from "./codec/useCodecVals";
import { useCodecOut } from "./codec/useCodecOut";
import { CodecNoEng, CodecHead } from "./codec/CodecHead";
import { easyView, advView } from "./codec/CodecTabs";
import { CodecFoot } from "./codec/CodecFoot";

/** ชุดค่าแบบง่ายเป็นค่าที่ส่งฝั่ง Rust ใช้กับดรอปดาวน์หน้าแปลงเสียง (ย้ายไป codec/codecCalc.ts ส่งต่อจากที่เดิม) */
export { presetSpec } from "./codec/codecCalc";

export default function CodecPanel(p: CpProps) {
  const c0 = useCodecVals(p);
  const c1 = { ...c0, ...useCodecOut(c0) };
  const pg = c1;
  const { apply, blocked, pair, t, tab } = pg;
  return (
    <>
      <CodecNoEng pg={pg} />
    <Dialog open onClose={p.onClose} width={900} height="calc(100vh - 32px)" title={<span>ตั้งค่าแปลงเสียง <span className="cpfile" data-cpfile style={{ overflowWrap: "anywhere" }}>{p.title ?? (t.inMovie ? (t.name || "เสียงในหนัง") : baseName(t.src))}</span></span>}
      actions={<>
        <span className="small" style={{ marginRight: "auto", alignSelf: "center" }}>ค่าที่กดใช้จำไว้เป็นค่าตั้งต้นของชนิดนี้ครั้งหน้า ขนาดเป็นค่าประมาณ ของจริงขึ้นกับเสียงในแทร็ก</span>
        {t.convert && <button type="button" className="btn btn-ghost btn-sm" onClick={() => p.onApply(null, pair, "")} data-conv-off>ไม่แปลง</button>}
        <button type="button" className="btn btn-ghost btn-sm" onClick={p.onClose}>ยกเลิก</button>
        <button type="button" className={"btn btn-sm " + (blocked ? "btn-wait" : "btn-main")} aria-disabled={!!blocked || undefined} title={blocked ?? undefined} onClick={apply} data-conv-use>ใช้ค่านี้</button>
      </>}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, flex: "1 0 auto" }} data-codec-panel data-tab={tab}>
        <CodecHead pg={pg} />
        {/* เรียกเป็นฟังก์ชัน ได้ Fragment ชนิดเดียวกันทั้งสองทางแบบโค้ดเดิม React ใช้กล่องที่ตำแหน่งตรงกันต่อตอนสลับแบบง่ายกับขั้นสูง (ผู้ช่วยตรวจทานขั้น 13 ของ BUGS ข้อ 155) · ฟังก์ชัน *View ห้ามมี hook */}
        {tab === "easy" ? easyView({ pg }) : advView({ pg })}
        <CodecFoot pg={pg} />
      </div>
    </Dialog>
    </>
  );
}
