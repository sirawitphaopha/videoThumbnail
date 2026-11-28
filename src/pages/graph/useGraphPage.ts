/* รวมชุด hook ของหน้ากราฟเสียง (BUGS ข้อ 155 ขั้น 4) · เรียกตามลำดับเดิม ชุดหลังอ่านค่าของชุดก่อน */
import { useGraphBase, type GraphProps } from "./useGraphBase";
import { useGraphFile } from "./useGraphFile";
import { useGraphView } from "./useGraphView";
import { useGraphWindow } from "./useGraphWindow";
import { useGraphActions } from "./useGraphActions";
import { useGraphPlay } from "./playBar";
import { usePageActive } from "../../lib/pageActive";
import { useCtx } from "../../components/CtxMenu";

export function useGraphPage(p: GraphProps) {
  const g0 = useGraphBase(p);
  const g1 = { ...g0, ...useGraphFile(g0) };
  const g2 = { ...g1, ...useGraphView(g1) };
  const g3 = { ...g2, ...useGraphWindow(g2) };
  const g4 = { ...g3, ...useGraphActions(g3) };
  // เล่นเสียงจากกราฟ (BUGS ข้อ 163.4) · จุดเริ่มเล่นคือจุดที่กดเลือกไว้ หลุดช่วงที่ดูอยู่ใช้ต้นช่วง แบบปุ่มเปิดเล่นเดิม
  const start = g4.tip >= g4.t0 && g4.tip <= g4.t1 ? g4.tip : g4.t0;
  const gplay = useGraphPlay({ path: g4.path, track: g4.track, names: g4.names, hidden: g4.hidden, tip: start, setTip: g4.setTip, t0: g4.t0, t1: g4.t1, zoomAll: g4.zoom === "all", setCenter: g4.setCenter, active: usePageActive(), dur: g4.dur });
  // เมนูคลิกขวาของรายการเปิดล่าสุด (BUGS ข้อ 164.5) · ฟังก์ชัน startView ห้ามมี hook สถานะเมนูจึงอยู่ที่นี่
  const recentMenu = useCtx<{ path: string; name: string }>();
  return { ...g4, gplay, playStart: start, recentMenu };
}
