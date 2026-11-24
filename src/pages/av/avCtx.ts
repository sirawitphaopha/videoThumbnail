/* ชนิดของค่าที่ส่งต่อระหว่างชุด hook ของหน้าเสียงและซับ (BUGS ข้อ 155 ขั้น 2) · ลำดับชุดตามลำดับที่ useAvPage เรียก */
import type { useAvBase } from "./useAvBase";
import type { useAvFiles } from "./useAvFiles";
import type { useAvSummary } from "./useAvSummary";
import type { useAvRun } from "./useAvRun";
import type { usePairs } from "./usePairs";
import type { useExtract } from "./useExtract";
import type { useAvLayout } from "./useAvLayout";

export type C0 = ReturnType<typeof useAvBase>;
export type C1 = C0 & ReturnType<typeof useAvFiles>;
export type C2 = C1 & ReturnType<typeof useAvSummary>;
export type C3 = C2 & ReturnType<typeof useAvRun>;
export type C4 = C3 & ReturnType<typeof usePairs>;
export type C5 = C4 & ReturnType<typeof useExtract>;
/** ทุกค่าของหน้า ส่วนของหน้าแต่ละชิ้นรับก้อนนี้ทาง prop pg */
export type AvCtx = C5 & ReturnType<typeof useAvLayout>;
