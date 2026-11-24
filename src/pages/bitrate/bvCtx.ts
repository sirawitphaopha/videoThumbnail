/* ชนิดของค่าที่ส่งต่อในบิตเรตแบบเดิม (BUGS ข้อ 155 ขั้น 7) */
import type { useBvState } from "./useBvState";
import type { useBvData } from "./useBvData";
import type { useBvStats } from "./useBvStats";
import type { useBvPlot } from "./useBvPlot";
import type { useBvView } from "./useBvView";

export type V0 = ReturnType<typeof useBvState>;
export type V1 = V0 & ReturnType<typeof useBvData>;
export type V2 = V1 & ReturnType<typeof useBvStats>;
export type V3 = V2 & ReturnType<typeof useBvPlot>;
export type BvCtx = V3 & ReturnType<typeof useBvView>;
