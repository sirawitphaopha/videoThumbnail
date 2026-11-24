/* ชนิดของค่าที่ส่งต่อในหน้าตั้งค่า (BUGS ข้อ 155 ขั้น 8) */
import type { useSetBase } from "./useSetBase";
import type { useSetChecks } from "./useSetChecks";
import type { setBits } from "./setBits";

export type T0 = ReturnType<typeof useSetBase>;
export type SetCtx = T0 & ReturnType<typeof useSetChecks>;
/** ค่าตอนมีค่าตั้งแล้ว การ์ดทุกใบรับก้อนนี้ */
export type SetOpen = SetCtx & ReturnType<typeof setBits>;
