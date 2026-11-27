/* ตัวกรองของหัวข้อบรรทัดโค้ด จำไว้ในเครื่อง (BUGS ข้อ 160)
   ปุ่มลัดสามแบบ ทั้งหมด ใช้งานจริง (สี่กลุ่มที่อยู่ในโปรแกรมที่ติดตั้ง) งานเบื้องหลัง · ติ๊กรายกลุ่มเองแล้วปุ่มลัดเป็น เลือกเอง
   ชนิดบรรทัดติ๊กได้สามชนิด ต้องเหลืออย่างน้อยหนึ่งชนิด · กราฟซ้อนตามกลุ่มหรือตามชนิดบรรทัด */
import { useState } from "react";
import type { Group, GroupId } from "./lineData";
import type { Filter } from "./lineCalc";

export type Preset = "all" | "live" | "dev" | "custom";
export type Stack = "group" | "kind";
type Saved = { groups: GroupId[]; kinds: [boolean, boolean, boolean]; stack: Stack };
const KEY = "lines-filter";

function load(all: GroupId[]): Saved {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? "null") as Saved | null;
    if (s && Array.isArray(s.groups) && Array.isArray(s.kinds) && s.kinds.length === 3) {
      const groups = s.groups.filter((g) => all.includes(g));
      return { groups: groups.length ? groups : all, kinds: s.kinds.some(Boolean) ? s.kinds : [true, true, true], stack: s.stack === "kind" ? "kind" : "group" };
    }
  } catch { /* เก็บไม่ได้หรือค่าเพี้ยน ใช้ค่าตั้งต้น */ }
  return { groups: all, kinds: [true, true, true], stack: "group" };
}

export function useLineFilter(groups: Group[]) {
  const all = groups.map((g) => g.id), live = groups.filter((g) => g.live).map((g) => g.id), dev = groups.filter((g) => !g.live).map((g) => g.id);
  const [s, setS] = useState<Saved>(() => load(all));
  const save = (n: Saved) => { setS(n); try { localStorage.setItem(KEY, JSON.stringify(n)); } catch { /* เก็บไม่ได้ ใช้ค่าในหน้าไปก่อน */ } };
  const same = (a: GroupId[], b: GroupId[]) => a.length === b.length && b.every((x) => a.includes(x));
  const preset: Preset = same(s.groups, all) ? "all" : same(s.groups, live) ? "live" : same(s.groups, dev) ? "dev" : "custom";
  const setPreset = (p: Preset) => { if (p !== "custom") save({ ...s, groups: p === "all" ? all : p === "live" ? live : dev }); };
  /** ติ๊กกลุ่ม · ต้องเหลืออย่างน้อยหนึ่งกลุ่ม เรียงตามลำดับกลุ่มเดิม สีไม่เปลี่ยนตาม */
  const toggleGroup = (g: GroupId) => {
    const on = s.groups.includes(g);
    if (on && s.groups.length === 1) return;
    save({ ...s, groups: all.filter((x) => (x === g ? !on : s.groups.includes(x))) });
  };
  const toggleKind = (k: 0 | 1 | 2) => {
    const next = [...s.kinds] as [boolean, boolean, boolean]; next[k] = !next[k];
    if (next.some(Boolean)) save({ ...s, kinds: next });
  };
  const filter: Filter = { groups: s.groups, kinds: s.kinds };
  return { filter, preset, setPreset, toggleGroup, toggleKind, stack: s.stack, setStack: (v: Stack) => save({ ...s, stack: v }) };
}
