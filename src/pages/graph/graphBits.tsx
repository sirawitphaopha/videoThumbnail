/* ปุ่มสลับกราฟกับแปลงเสียง และหน้าต่างข้อมูลเพลง ใช้ทุกแบบของหน้า
   แยกจาก GraphPage.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 4) เนื้อโค้ดยกมาทั้งก้อน */
import TagDialog from "./TagDialog";
import { IcMix, IcGraph } from "../../components/icons";
import type { GCtx } from "./graphCtx";

export function modeBits(pg: GCtx) {
  const { mode, setMode, setTagFor, tagFor } = pg;
  const modeSeg = (
    <div className="seg gmode" role="tablist" aria-label="โหมดหน้ากราฟเสียง">
      <button type="button" role="tab" aria-selected={mode === "graph"} className={mode === "graph" ? "on" : ""} onClick={() => setMode("graph")} data-gmode="graph"><IcGraph size={15} />ดูกราฟ</button>
      <button type="button" role="tab" aria-selected={mode === "convert"} className={mode === "convert" ? "on" : ""} onClick={() => setMode("convert")} data-gmode="convert"><IcMix size={15} />แปลงเสียง</button>
    </div>
  );
  const tagDlg = tagFor && <TagDialog path={tagFor} onClose={() => setTagFor(null)} />;
  return { modeSeg, tagDlg };
}
