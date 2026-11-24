/* รวมชุด hook ของหน้าเสียงและซับเป็นก้อนเดียว (BUGS ข้อ 155 ขั้น 2) · เรียกตามลำดับเดิมของหน้า ชุดหลังอ่านค่าของชุดก่อน */
import { useAvBase, type AvProps } from "./useAvBase";
import { useAvFiles } from "./useAvFiles";
import { useAvSummary } from "./useAvSummary";
import { useAvRun } from "./useAvRun";
import { usePairs } from "./usePairs";
import { useExtract } from "./useExtract";
import { useAvLayout } from "./useAvLayout";

export function useAvPage(p: AvProps) {
  const c0 = useAvBase(p);
  const c1 = { ...c0, ...useAvFiles(c0) };
  const c2 = { ...c1, ...useAvSummary(c1) };
  const c3 = { ...c2, ...useAvRun(c2) };
  const c4 = { ...c3, ...usePairs(c3) };
  const c5 = { ...c4, ...useExtract(c4) };
  return { ...c5, ...useAvLayout(c5) };
}
