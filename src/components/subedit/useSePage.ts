/* รวมชุด hook ของตัวแก้ซับ (BUGS ข้อ 155 ขั้น 5) · เรียกตามลำดับเดิม ชุดหลังอ่านค่าของชุดก่อน */
import type { SubEditorProps } from "./editorParts";
import { useSeBase } from "./useSeBase";
import { useSeLoad } from "./useSeLoad";
import { useSeNav } from "./useSeNav";
import { useSeTiming } from "./useSeTiming";
import { useSeSave } from "./useSeSave";
import { useSeBar } from "./useSeBar";

export function useSePage(p: SubEditorProps) {
  const e0 = useSeBase(p);
  const e1 = { ...e0, ...useSeLoad(e0) };
  const e2 = { ...e1, ...useSeNav(e1) };
  const e3 = { ...e2, ...useSeTiming(e2) };
  const e4 = { ...e3, ...useSeSave(e3) };
  return { ...e4, ...useSeBar(e4) };
}
