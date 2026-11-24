/* ชนิดของค่าที่ส่งต่อระหว่างชุด hook ของ CodecPanel.tsx (BUGS ข้อ 155 ขั้น 9) */
import type { useCodecVals } from "./useCodecVals";
import type { useCodecOut } from "./useCodecOut";

export type Cp0 = ReturnType<typeof useCodecVals>;
/** ทุกค่าของแผง */
export type CpCtx = Cp0 & ReturnType<typeof useCodecOut>;
