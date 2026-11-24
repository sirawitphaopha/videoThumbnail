/* ชนิดของค่าที่ส่งต่อระหว่างชุด hook ของ SubAudio.tsx (BUGS ข้อ 155 ขั้น 10) */
import type { useAudData } from "./useAudData";
import type { useAudDraw } from "./useAudDraw";
import type { useAudMouse } from "./useAudMouse";

export type Au0 = ReturnType<typeof useAudData>;
export type Au1 = Au0 & ReturnType<typeof useAudDraw>;
/** ทุกค่าของกรอบ */
export type AuCtx = Au1 & ReturnType<typeof useAudMouse>;
