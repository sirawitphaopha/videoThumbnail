/* ตัวแก้แถวในตารางแทร็ก (BUGS ข้อ 155 ขั้น 2 แยกจาก AvPage.tsx) แก้ที่เก็บกลาง avJob ตรง ๆ ไม่ต้องอยู่ในตัวหน้า */
import { setAv, type AvTrack } from "../../lib/avJob";
import { MAX_DELAY } from "./parts";

export const patch = (key: string, ch: Partial<AvTrack>) => setAv((s) => ({ tracks: s.tracks.map((t) => (t.key === key ? { ...t, ...ch } : t)) }));
  /** แทร็กหลักมีได้แทร็กเดียวต่อชนิด · กดซ้ำที่แทร็กหลักเดิม = ไม่มีแทร็กหลักของชนิดนั้น */
export const setMain = (key: string) => setAv((s) => {
    const me = s.tracks.find((t) => t.key === key);
    if (!me || me.kind === "video") return {};
    const on = !me.default;
    return { tracks: s.tracks.map((t) => (t.kind === me.kind ? { ...t, default: t.key === key ? on : false } : t)) };
  });
export const move = (key: string, d: -1 | 1) => setAv((s) => {
    const i = s.tracks.findIndex((t) => t.key === key), j = i + d;
    if (i < 0 || j < 0 || j >= s.tracks.length) return {};
    const list = [...s.tracks];
    [list[i], list[j]] = [list[j], list[i]];
    return { tracks: list };
  });
export const removeAdded = (src: string) => setAv((s) => ({ tracks: s.tracks.filter((t) => t.inMovie || t.src !== src), sel: null }));
export const setDelay = (key: string, v: number) => patch(key, { delay: Math.max(-MAX_DELAY, Math.min(MAX_DELAY, Math.round(v))) });
