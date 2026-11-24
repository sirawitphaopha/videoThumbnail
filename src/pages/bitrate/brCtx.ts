/* ชนิดของค่าที่ส่งต่อระหว่างชุด hook ของหน้าบิตเรตแบบใหม่ (BUGS ข้อ 155 ขั้น 3) */
import type { useBrState } from "./useBrState";
import type { useBrData } from "./useBrData";
import type { useBrStats } from "./useBrStats";
import type { useBrDraw } from "./useBrDraw";
import type { useBrMouse } from "./useBrMouse";
import type { openVals } from "./brOpenVals";

export type C0 = ReturnType<typeof useBrState>;
export type C1 = C0 & ReturnType<typeof useBrData>;
export type C2 = C1 & ReturnType<typeof useBrStats>;
export type C3 = C2 & ReturnType<typeof useBrDraw>;
/** ทุกค่าของหน้า */
export type BrCtx = C3 & ReturnType<typeof useBrMouse>;
/** ค่าของหน้าตอนเปิดไฟล์แล้ว ส่วนแถวตัวเลือกกับกราฟรับก้อนนี้ */
export type BrOpenCtx = BrCtx & ReturnType<typeof openVals>;
