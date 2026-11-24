/* ชนิดของค่าที่ส่งต่อระหว่างชุด hook ของ SubtitlePage.tsx (BUGS ข้อ 155 ขั้น 8) */
import type { useSubPageFile } from "./useSubPageFile";
import type { useSubPageView } from "./useSubPageView";

export type Sp0 = ReturnType<typeof useSubPageFile>;
/** ทุกค่าของหน้า */
export type SpCtx = Sp0 & ReturnType<typeof useSubPageView>;
