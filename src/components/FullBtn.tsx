// ปุ่มเต็มจอของหน้ากราฟเสียงกับหน้าบิตเรต (BUGS ข้อ 39) · ⓘ บอกวิธีออก
import { useFullscreen } from "../lib/fullscreen";
import InfoTip from "./InfoTip";

const FULL_TIP = { w: "เต็มจอ ซ่อนแถบชื่อหน้าต่าง เมนูซ้าย และหัวหน้า เหลือกราฟกับแถบเครื่องมือเต็มทั้งจอ · ออกจากเต็มจอ กด Esc หรือ F11 หรือกดปุ่มนี้อีกครั้ง" };

export default function FullBtn() {
  const [full, setFull] = useFullscreen();
  const d = full ? "M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" : "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, flex: "none" }}>
      <button type="button" className={"btn btn-ghost btn-sm" + (full ? " pressed" : "")} style={{ width: 32, padding: 0 }} aria-pressed={full}
        title={full ? "ออกจากเต็มจอ · Esc หรือ F11" : "เต็มจอ · ออกด้วย Esc หรือ F11"} aria-label={full ? "ออกจากเต็มจอ" : "เต็มจอ"} onClick={() => setFull(!full)} data-fullbtn>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
      </button>
      <InfoTip title="เต็มจอ" tip={FULL_TIP} />
    </span>
  );
}
