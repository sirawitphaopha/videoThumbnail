/* ระดับเสียงหลังเปลี่ยนความเร็ว แทร็กเดิมในหนัง คำเตือน และกล่องคำสั่งที่จะรันพร้อมปุ่มคัดลอก
   แยกจาก CodecPanel.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 9) เนื้อโค้ดยกมาทั้งก้อน */
import InfoTip from "../InfoTip";
import { CardIcon, Keep, Phr, Seg } from "../ui";
import { TIPS } from "../../lib/codecAdv";
import { IcCopy, IcPlus, IbSwap } from "../icons";
import { cmdGroups } from "./codecCalc";
import type { CpCtx } from "./codecCtx";

export function CodecFoot({ pg }: { pg: CpCtx }) {
  const { c, copied, coreAudio, keepPitch, missingNative, name, outCh, pair, plan, planErr, qaacCbrOff, setCopied, setKeepPitch, setPair, speed, t, tab, warn } = pg;
  const speedNote = speed && (
    <div data-pitch-box>
      <div className="small ilbl" style={{ marginBottom: 4 }}><b style={{ color: "var(--txt2)" }}>ระดับเสียงหลังเปลี่ยนความเร็ว</b><InfoTip title="ระดับเสียงหลังเปลี่ยนความเร็ว" tip={TIPS.pitch} /></div>
      <div style={{ display: "flex" }}><Seg small label="ระดับเสียงหลังเปลี่ยนความเร็ว" value={keepPitch ? "keep" : "restore"} onChange={(v) => setKeepPitch(v === "keep")}
        options={[{ value: "restore", label: "คืนระดับเสียงเดิม (แนะนำ)" }, { value: "keep", label: "คงระดับเสียงแบบในไฟล์" }]} /></div>
      <div className="small" style={{ marginTop: 4 }} data-pitch-note><Phr>{`${keepPitch
        ? "ยืดเวลาอย่างเดียวและคงระดับเสียงเท่าในไฟล์ ใช้กับแผ่นที่สตูดิโอแก้ระดับเสียงมาแล้ว"
        : "เล่นช้าลงหรือเร็วขึ้นแบบหมุนแผ่น ระดับเสียงจึงกลับเป็นแบบเดิมก่อนทำแผ่น แผ่น PAL ส่วนใหญ่ต้องใช้แบบนี้"}${t.duration ? ` ความยาวจะเปลี่ยนจาก ${Math.round(t.duration)} เป็นราว ${Math.round(t.duration * Number(speed.split(">")[0]) / Number(speed.split(">")[1]))} วินาที` : ""}`}</Phr></div>
    </div>
  );
  return (
    <>
        {speedNote}
        {t.inMovie && (
          <div><div className="small" style={{ marginBottom: 4 }}><b style={{ color: "var(--txt2)" }}>แทร็กเดิมในหนัง หลังแปลงจะ</b></div>
            <div style={{ display: "flex" }}><Seg small label="แปลงแล้วจะ" value={pair ? "pair" : "replace"} onChange={(v) => setPair(v === "pair")}
              options={[{ value: "pair", label: <><IcPlus size={14} />เพิ่มคู่กับแทร็กเดิม</> }, { value: "replace", label: <><IbSwap size={14} />แทนที่แทร็กเดิม</> }]} /></div>
            <div className="small" style={{ marginTop: 4 }}>{pair ? `แทร็กใหม่ชื่อ ${name} ต่อท้ายแทร็กเดิม แทร็กเดิมอยู่ครบ` : "แทร็กเดิมถูกแทนที่ด้วยแทร็กที่แปลง"}</div></div>
        )}
        {missingNative && <div className="stat warn" data-native-missing><CardIcon kind="warn" /><div><b>{c.name} ยังใช้ไม่ได้</b><Phr>{missingNative}</Phr></div></div>}
        {/* qaac แบบ CBR กับ CoreAudioToolbox 7.9.8 ขึ้นไป เสียงผิดเพี้ยน (README ของ qaac ประกาศ 21 ธ.ค. 2567 · พี่กันสั่ง 10 พ.ย. 2569 "ต้อง note ของเราด้วย") */}
        {qaacCbrOff && tab === "adv" && <div className="stat info" data-qaac-cbr><CardIcon kind="info" /><div><b>ปิดโหมด CBR ของ qaac ไว้</b><Phr>{`เครื่องนี้ใช้ CoreAudioToolbox ${coreAudio} ซึ่งผู้ทำ qaac แจ้งว่ารุ่น 7.9.8 ขึ้นไปทำให้ AAC แบบ CBR มีเสียงผิดเพี้ยนเป็นช่วง ๆ และทดสอบกับเพลงจริงแล้วพบจริง ให้ใช้ TVBR CVBR หรือ ABR แทน`}</Phr></div></div>}
        {warn && <div className="stat warn"><CardIcon kind="warn" /><div><Phr>{warn}</Phr> <Phr>ยังแปลงต่อได้ตามปกติ</Phr></div></div>}
        {/* ALAC 8 ช่องติดป้ายเป็น 7.1 ลำโพงหน้าคู่กลาง (encode.rs wide71) · พี่กันถาม 11 พ.ย. 2569 "ต้องมีเตือนบอกไหม" */}
        {c.id === "alac" && outCh === 8 && <div className="stat warn" data-alac71><CardIcon kind="warn" /><div>
          <b>ALAC เก็บเสียง 8 ช่องได้แบบเดียว คือ 7.1 ch แบบลำโพงหน้าคู่กลาง</b>
          <Phr>เสียงลำโพงข้างของต้นฉบับจะติดป้ายเป็นลำโพงหน้าคู่กลาง เสียงครบทุกช่องและไม่เสียคุณภาพ แต่เครื่องเล่นจะส่งเสียงข้างไปออกลำโพงหน้า ถ้าจะเล่นกับชุดลำโพง 7.1 เลือก FLAC หรือ WavPack แทน</Phr></div></div>}
        <div className="cpsep" aria-hidden="true" />
        {/* กล่องคำสั่งยืดรับที่เหลือของหน้าต่าง ไม่ให้เหลือที่ว่างล่าง */}
        <div style={{ display: "flex", flexDirection: "column", flex: "1 1 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <span className="small ilbl"><b style={{ color: "var(--txt2)" }}>คำสั่งที่จะรัน</b>&nbsp;(Command line)<InfoTip title="Command line" tip={TIPS.cmd} /></span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { if (plan) navigator.clipboard?.writeText(plan.text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {}); }} data-copy><Keep icon={<IcCopy size={14} />} all={["คัดลอกแล้ว", "คัดลอก"]}>{copied ? "คัดลอกแล้ว" : "คัดลอก"}</Keep></button>
          </div>
          <pre data-cmd style={{ flex: 1, minHeight: 40, margin: 0, whiteSpace: "pre-wrap", overflowWrap: "break-word", fontFamily: "var(--mono)", fontSize: 12, lineHeight: 1.55, background: "#fff", border: "1px solid var(--line)", borderRadius: 8, padding: "8px 10px", userSelect: "text", color: "var(--txt)" }}>
            {planErr ?? (plan
              // ตัดบรรทัดเฉพาะตรงเว้นวรรค · เดิมตัดหลังขีด -i กลายเป็นสองบรรทัด อ่านผิดคำสั่ง (เจอตอนตรวจภาพ) · คัดลอกใช้ plan.text ตรงตัว
              // ตัวเลือกที่ขึ้นต้นด้วยขีดติดกับค่าของมัน "-f wav" ไม่แยกบรรทัด (ตัดบรรทัดตามความหมาย CLAUDE.md)
              ? plan.text.split("\n").map((line, li) => <span key={li}>{li > 0 && <br />}{cmdGroups(line).map((w, wi) => <span key={wi}>{wi > 0 ? " " : ""}<span style={{ whiteSpace: "nowrap" }}>{w}</span></span>)}</span>)
              : "…")}</pre>
          {plan && <div className="small" style={{ marginTop: 4 }}><Phr>{plan.note}</Phr></div>}
        </div>
    </>
  );
}
