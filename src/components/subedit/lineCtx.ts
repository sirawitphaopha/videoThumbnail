/* ชนิดของค่าที่ส่งต่อระหว่างชุดของ useLineCmds (BUGS ข้อ 155 ขั้น 10) */
import type { SubDoc } from "../../lib/api";
import type { useLineState } from "./useLineState";
import type { lineRun } from "./lineRun";
import type { lineFind } from "./lineFind";
import type { lineMenus } from "./lineMenus";

/** ค่าที่จำไว้กับเอกสารที่มีแน่นอนแล้ว (หลังบรรทัดออกก่อน) */
export type Ln0 = ReturnType<typeof useLineState> & { doc: SubDoc };
export type Ln1 = Ln0 & ReturnType<typeof lineRun>;
export type Ln2 = Ln1 & ReturnType<typeof lineFind>;
export type Ln3 = Ln2 & ReturnType<typeof lineMenus>;
