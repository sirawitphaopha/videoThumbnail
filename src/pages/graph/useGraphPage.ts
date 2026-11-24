/* รวมชุด hook ของหน้ากราฟเสียง (BUGS ข้อ 155 ขั้น 4) · เรียกตามลำดับเดิม ชุดหลังอ่านค่าของชุดก่อน */
import { useGraphBase, type GraphProps } from "./useGraphBase";
import { useGraphFile } from "./useGraphFile";
import { useGraphView } from "./useGraphView";
import { useGraphWindow } from "./useGraphWindow";
import { useGraphActions } from "./useGraphActions";

export function useGraphPage(p: GraphProps) {
  const g0 = useGraphBase(p);
  const g1 = { ...g0, ...useGraphFile(g0) };
  const g2 = { ...g1, ...useGraphView(g1) };
  const g3 = { ...g2, ...useGraphWindow(g2) };
  return { ...g3, ...useGraphActions(g3) };
}
