/* ชนิดของค่าที่ส่งต่อในมุมมองความถี่เฉลี่ย (BUGS ข้อ 155 ขั้น 7) */
import type { usePsdData } from "./usePsdData";
import type { usePsdDraw } from "./usePsdDraw";

export type P0 = ReturnType<typeof usePsdData>;
export type PsdCtx = P0 & ReturnType<typeof usePsdDraw>;
