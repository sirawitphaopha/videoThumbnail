/* หน้าบิตเรตวิดีโอแบบใหม่ ให้เข้ากับหน้าตาของชั้นหนังและโทนสี · ลงโปรแกรมแล้ว 10 พ.ย. 2569 พี่กันสั่ง "เอามอคอัปเข้าโปรแกรมเลยนะ"
   แบบเดิม (Bitrate Viewer) อยู่ BitrateClassic.tsx สลับได้ ตัวหน้านี้จำว่าเลือกแบบไหน
   พี่กันสั่ง 10 พ.ย. 2569 "หน้า bitrate viewers เราเอาแบบเดิมไว้ และเราให้เธอ re-designed ใหม่หมด ให้เข้ากับเว็บ และโทนสี
   และบางการตั้งค่าการเลือก ให้ภาษาไทย และคงคำศัพเฉพาะไว้ ทำมอคอัปมาเลย" · "อย่าลืมว่า เรามี 4 โทนสีนะ"
   ยังไม่ได้ลงโปรแกรม · ใช้ฝั่งข้อมูลชุดเดียวกับหน้าเดิม (bitrateApi เหตุการณ์ bitrate-progress bitrate-done)
   ในมอคอัป ข้อมูลมาจากคลิปตัวอย่างที่อ่านด้วย ffprobe จริง (data-ตัวอย่างหนัง.json)
   โครงหน้ายึดหน้ากราฟเสียง การ์ดชื่อไฟล์ด้านบน แผงข้อมูลซ้าย หัวกราฟพร้อมปุ่มซูม แถบภาพรวมทั้งไฟล์ คำอธิบายสีด้านล่าง
   สีกราฟอ่านจากตัวแปรสีของโทนที่เลือก เปลี่ยนโทนแล้ววาดใหม่ทันที
   จัดโครงตามความหมาย 24 พ.ย. 2569 (BUGS ข้อ 155 ขั้น 3) แบบใหม่ย้ายไป BitrateModern.tsx กับชุด hook useBr*.ts ไฟล์นี้เหลือตัวสลับสองแบบ */
import { useEffect, useRef, useState } from "react";
import BitrateClassic from "./BitrateClassic";
import bvIcon from "../../assets/thanks/bitrateviewer.ico";
import { store } from "./common";
import "../../styles/bitrate.css";
import BitrateModern from "./BitrateModern";

export default function BitratePage({ initialPath = null, initialTrack = null, onConsumed, onGraph }: { initialPath?: string | null; initialTrack?: string | null; onConsumed?: () => void; onGraph?: (path: string, track: number) => void } = {}) {
  const [view, setView] = useState<"new" | "classic">(() => (store.get("bv-view") === "classic" ? "classic" : "new"));
  /** ไฟล์กับแทร็กที่ส่งต่อตอนสลับแบบ · แทร็กตามไปด้วย อีกแบบไม่ถามแทร็กซ้ำ (BUGS ข้อ 83 · เดิมส่งแค่ไฟล์ ดูวิดีโออยู่สลับแล้วขึ้นหน้าเลือกแทร็ก) */
  const [carry, setCarry] = useState<{ path: string; track: string | null } | null>(null);
  const go = (v: "new" | "classic", p: string | null, t: string | null = null) => { store.set("bv-view", v); setCarry(p ? { path: p, track: t || null } : null); setView(v); };
  // ตัวตรวจกับหน้ามอคอัปสลับแบบผ่านตัวนี้
  useEffect(() => { (window as unknown as { __bitrateView?: (v: "new" | "classic") => void }).__bitrateView = (v) => go(v, null); });
  const start = initialPath ?? carry?.path ?? null;
  const startTrack = initialPath ? initialTrack : carry?.track ?? null;
  const done = () => { setCarry(null); onConsumed?.(); };
  /** ไฟล์กับแทร็กที่แบบ Bitrate Viewer เปิดอยู่ ใช้ตอนกดแบบชั้นหนังในแถบปุ่มคู่ */
  const classicCur = useRef<{ path: string | null; track: string | null }>({ path: null, track: null });
  if (view === "classic") return (
    // แถบปุ่มคู่สลับแบบอยู่ทั้งสองแบบ ตอนเป็นแบบ Bitrate Viewer ปุ่มนั้นกดค้าง (BUGS ข้อ 85 · พี่กันสั่ง 13 พ.ย. 2569 "เราขอปุ่มนี้ค้างไว้ตอนเปลี่ยนไปหน้าแบบ bitrate view")
    <div style={{ flex: 1, minHeight: 0, height: "100%", display: "flex", flexDirection: "column" }} data-bvwrap>
      <div className="gmodebar" style={{ position: "static", margin: 0, flex: "none", display: "flex", alignItems: "center", gap: 12 }}>
        <div className="seg" role="group" aria-label="แบบหน้า">
          <button type="button" onClick={() => go("new", classicCur.current.path, classicCur.current.track)} title="สลับไปหน้าตาแบบชั้นหนัง ไฟล์กับแทร็กที่เปิดอยู่ตามไปด้วย" data-bvmodern>แบบชั้นหนัง</button>
          <button type="button" className="on" aria-pressed style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><img src={bvIcon} alt="" width={16} height={16} style={{ display: "block", flex: "none" }} />แบบ Bitrate Viewer</button>
        </div>
        <span className="small">หน้าตาแบบโปรแกรม Bitrate Viewer เดิม อ่านอย่างเดียว ไฟล์จึงไม่ถูกแตะ</span>
      </div>
      <BitrateClassic initialPath={start} initialTrack={startTrack} onConsumed={done} onCurrent={(p, t) => { classicCur.current = { path: p, track: t }; }} />
    </div>
  );
  return <BitrateModern initialPath={start} initialTrack={startTrack} onConsumed={done} onClassic={(p, t) => go("classic", p, t)} onGraph={onGraph} />;
}

