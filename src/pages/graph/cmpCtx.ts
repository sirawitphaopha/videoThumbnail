/* ชนิดของค่าที่ส่งต่อในหน้าเทียบสองไฟล์ (BUGS ข้อ 155 ขั้น 7) */
import type { useCmpData } from "./useCmpData";
import type { useCmpView } from "./useCmpView";

export type K0 = ReturnType<typeof useCmpData>;
export type CmpCtx = K0 & ReturnType<typeof useCmpView>;
