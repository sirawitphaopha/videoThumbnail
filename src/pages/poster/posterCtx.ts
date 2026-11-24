/* ชนิดของค่าที่ส่งต่อระหว่างชุด hook ของ PosterPage.tsx (BUGS ข้อ 155 ขั้น 8) */
import type { usePosterBase } from "./usePosterBase";
import type { usePosterFiles } from "./usePosterFiles";
import type { usePosterRun } from "./usePosterRun";

export type Po0 = ReturnType<typeof usePosterBase>;
export type Po1 = Po0 & ReturnType<typeof usePosterFiles>;
/** ทุกค่าของหน้า */
export type PoCtx = Po1 & ReturnType<typeof usePosterRun>;
