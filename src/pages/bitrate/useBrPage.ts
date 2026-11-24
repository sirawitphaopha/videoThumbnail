/* รวมชุด hook ของหน้าบิตเรตแบบใหม่ (BUGS ข้อ 155 ขั้น 3) · เรียกตามลำดับเดิม ชุดหลังอ่านค่าของชุดก่อน */
import { useBrState, type BrProps } from "./useBrState";
import { useBrData } from "./useBrData";
import { useBrStats } from "./useBrStats";
import { useBrDraw } from "./useBrDraw";
import { useBrMouse } from "./useBrMouse";

export function useBrPage(p: BrProps) {
  const c0 = useBrState(p);
  const c1 = { ...c0, ...useBrData(c0) };
  const c2 = { ...c1, ...useBrStats(c1) };
  const c3 = { ...c2, ...useBrDraw(c2) };
  return { ...c3, ...useBrMouse(c3) };
}
