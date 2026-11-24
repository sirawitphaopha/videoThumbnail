/* ค้นและแทนที่ ค้นต่อไป แทนที่ทีละจุดหรือทั้งหมด และเปิดหน้าต่างค้นหา (ฟังก์ชันธรรมดา ไม่ใช่ hook)
   แยกจาก LineCmds.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 10) เนื้อโค้ดยกมาทั้งก้อน */
import { edit, getSubEdit } from "../../lib/subEdit";
import { findAll, replaceAll, replaceOne, type FindOpts, type Hit } from "../../lib/subCmds";
import { n0 } from "./lineData";
import type { Ln1 } from "./lineCtx";

export function lineFind(hk: Ln1) {
  const { c, cur, find, fopts, hit, pick, repl, setDlg, setFind, setFmsg } = hk;
  // ---------------------------------------------------------------- ค้นและแทนที่
  const fo = (): FindOpts => ({ ...fopts, find, replace: repl });
  /** หาจุดถัดไปจากจุดที่เจอล่าสุด ถ้าไม่มีเริ่มจากบรรทัดที่กำลังแก้ วนกลับต้นไฟล์ */
  const findNext = () => {
    const d = cur();
    const hits = findAll(d, new Set(getSubEdit().sel), fo());
    if (typeof hits === "string") { setFmsg({ t: hits, bad: true }); return null; }
    if (!hits.length) { setFmsg({ t: "ไม่เจอคำนี้", bad: true }); hit.current = null; return null; }
    const order = new Map(d.events.map((e, i) => [e.id, i]));
    const FI = { text: 0, style: 1, actor: 2, effect: 3 };
    const key = (h: Hit) => [order.get(h.id) ?? 0, FI[h.field], h.at] as const;
    const after = (a: readonly number[], b: readonly number[]) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
    const h0 = hit.current;
    const from = h0 && order.has(h0.id) ? key(h0) : [(order.get(getSubEdit().active ?? -1) ?? 0), -1, -1] as const;
    const nx = hits.find((h) => after(key(h), from) > 0) ?? hits[0];
    hit.current = nx;
    const line = (order.get(nx.id) ?? 0) + 1;
    pick([nx.id], nx.id);
    setFmsg({ t: `เจอที่บรรทัด ${n0(line)} จากทั้งหมด ${n0(hits.length)} จุด`, bad: false });
    return nx;
  };
  const doReplace = () => {
    const h = hit.current;
    const d = cur();
    // จุดที่เจอล่าสุดยังตรงอยู่ แทนที่แล้วค้นต่อ ไม่งั้นค้นหาจุดแรกก่อน
    const still = h && findAll(d, new Set(getSubEdit().sel), fo());
    if (!h || typeof still === "string" || !still || !still.some((x) => x.id === h.id && x.field === h.field && x.at === h.at)) { findNext(); return; }
    edit("แทนที่", (x) => replaceOne(x, h, fo()));
    const e = getSubEdit().doc?.events.find((x) => x.id === h.id);
    const grow = e ? e[h.field].length - d.events.find((x) => x.id === h.id)![h.field].length : 0;
    hit.current = { ...h, at: h.at + h.len + grow - 1, len: 1 };
    findNext();
  };
  const doReplaceAll = () => {
    const r = replaceAll(cur(), new Set(getSubEdit().sel), fo());
    if (typeof r === "string") { setFmsg({ t: r, bad: true }); return; }
    if (r.n) edit(`แทนที่ทั้งหมด ${r.n} จุด`, () => r.doc);
    hit.current = null;
    setFmsg({ t: r.n ? `แทนที่แล้ว ${n0(r.n)} จุด` : "ไม่เจอคำนี้", bad: !r.n });
  };
  const openFind = (replace: boolean) => {
    // ข้อความที่ลากเลือกไว้ในช่องพิมพ์เป็นคำค้น (แบบ Aegisub)
    const ta = c.textBox.current as HTMLTextAreaElement | null;
    const s = ta && document.activeElement === ta ? ta.value.slice(ta.selectionStart, ta.selectionEnd) : "";
    if (s && !s.includes("\n")) setFind(s);
    setFmsg(null);
    setDlg(replace ? "replace" : "find");
  };
  return { fo, findNext, doReplace, doReplaceAll, openFind };
}
