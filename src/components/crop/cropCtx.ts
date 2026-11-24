/* ชนิดของค่าที่ส่งต่อระหว่างชุด hook ของ CropDialog.tsx (BUGS ข้อ 155 ขั้น 9) */
import type { useCropState } from "./useCropState";
import type { useCropDrag } from "./useCropDrag";
import type { cropCards } from "./cropCards";

export type Cr0 = ReturnType<typeof useCropState>;
export type Cr1 = Cr0 & ReturnType<typeof useCropDrag>;
/** ทุกค่าของหน้าต่าง */
export type CrCtx = Cr1 & ReturnType<typeof cropCards>;
