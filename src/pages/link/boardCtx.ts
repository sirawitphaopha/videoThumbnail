/* ชนิดของค่าที่ส่งต่อระหว่างชุด hook ของ LinkBoard.tsx (BUGS ข้อ 155 ขั้น 8) */
import type { useBoardData } from "./useBoardData";
import type { useBoardDrag } from "./useBoardDrag";

export type Bo0 = ReturnType<typeof useBoardData>;
/** ทุกค่าของหน้า */
export type BoCtx = Bo0 & ReturnType<typeof useBoardDrag>;
