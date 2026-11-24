/* ชนิดของค่าที่ส่งต่อระหว่างชุด hook ของ ImgConvDialog.tsx (BUGS ข้อ 155 ขั้น 9) */
import type { useIcvState } from "./useIcvState";
import type { useIcvRun } from "./useIcvRun";

export type Icv0 = ReturnType<typeof useIcvState>;
/** ทุกค่าของหน้าต่าง */
export type IcvCtx = Icv0 & ReturnType<typeof useIcvRun>;
