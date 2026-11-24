/* ชนิดของค่าที่ส่งต่อระหว่างชุด hook ของ SubVideo.tsx (BUGS ข้อ 155 ขั้น 10) */
import type { useVidBox } from "./useVidBox";
import type { useVidPlayback } from "./useVidPlayback";
import type { useVidWheel } from "./useVidWheel";
import type { useVidLayer } from "./useVidLayer";

export type Vd0 = ReturnType<typeof useVidBox>;
export type Vd1 = Vd0 & ReturnType<typeof useVidPlayback>;
export type Vd2 = Vd1 & ReturnType<typeof useVidWheel>;
/** ทุกค่าของกรอบ */
export type VdCtx = Vd2 & ReturnType<typeof useVidLayer>;
