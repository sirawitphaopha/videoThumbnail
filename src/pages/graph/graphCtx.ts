/* ชนิดของค่าที่ส่งต่อในหน้ากราฟเสียง (BUGS ข้อ 155 ขั้น 4) · G ชุด hook ตามลำดับ · B ชิ้นหน้าจอที่คิดหลังจุดคืนหน้าแต่ละช่วง */
import type { useGraphBase } from "./useGraphBase";
import type { useGraphFile } from "./useGraphFile";
import type { useGraphView } from "./useGraphView";
import type { useGraphWindow } from "./useGraphWindow";
import type { useGraphActions } from "./useGraphActions";
import type { modeBits } from "./graphBits";
import type { headBits } from "./graphHead";
import type { panelBits } from "./graphPanel";
import type { plotBits } from "./graphPlot";

export type G0 = ReturnType<typeof useGraphBase>;
export type G1 = G0 & ReturnType<typeof useGraphFile>;
export type G2 = G1 & ReturnType<typeof useGraphView>;
export type G3 = G2 & ReturnType<typeof useGraphWindow>;
/** ทุกค่าจากชุด hook */
export type GCtx = G3 & ReturnType<typeof useGraphActions>;
export type B1 = GCtx & ReturnType<typeof modeBits>;
export type B2 = B1 & ReturnType<typeof headBits>;
export type B3 = B2 & ReturnType<typeof panelBits>;
export type B4 = B3 & ReturnType<typeof plotBits>;
