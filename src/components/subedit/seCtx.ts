/* ชนิดของค่าที่ส่งต่อระหว่างชุด hook ของตัวแก้ซับ (BUGS ข้อ 155 ขั้น 5) */
import type { useSeBase } from "./useSeBase";
import type { useSeLoad } from "./useSeLoad";
import type { useSeNav } from "./useSeNav";
import type { useSeTiming } from "./useSeTiming";
import type { useSeSave } from "./useSeSave";
import type { useSeBar } from "./useSeBar";
import type { seVals } from "./seVals";

export type E0 = ReturnType<typeof useSeBase>;
export type E1 = E0 & ReturnType<typeof useSeLoad>;
export type E2 = E1 & ReturnType<typeof useSeNav>;
export type E3 = E2 & ReturnType<typeof useSeTiming>;
export type E4 = E3 & ReturnType<typeof useSeSave>;
/** ทุกค่าจากชุด hook */
export type SeCtx = E4 & ReturnType<typeof useSeBar>;
/** ค่าตอนเปิดเอกสารแล้ว ส่วนหน้าจอรับก้อนนี้ */
export type SeOpen = SeCtx & ReturnType<typeof seVals>;
