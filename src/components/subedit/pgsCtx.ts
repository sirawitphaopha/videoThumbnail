/* ชนิดของค่าที่ส่งต่อระหว่างชุด hook ของ PgsDialog.tsx (BUGS ข้อ 155 ขั้น 10) */
import type { usePgsState } from "./usePgsState";
import type { usePgsRun } from "./usePgsRun";

export type Pg0 = ReturnType<typeof usePgsState>;
/** ทุกค่าของหน้าต่าง */
export type PgCtx = Pg0 & ReturnType<typeof usePgsRun>;
