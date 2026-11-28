/* เมนูเวลา บรรทัด เลือก เครื่องมือ แถบปุ่มเหนือตาราง และคำสั่งที่แถบปุ่มย่อใช้ (ฟังก์ชันธรรมดา ไม่ใช่ hook)
   แยกจาก LineCmds.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 10) เนื้อโค้ดยกมาทั้งก้อน */
import { IbTools, IbRows, IbSelect, IbShiftTime, IbWand, IcClock, IcSearch } from "../icons";
import { TIME_TIP, LINE_TIP, TOOL_TIP, SEL_TIP, type ToolCmd, type MRow } from "./lineData";
import { CmdMenu } from "./CmdMenu";
import { keyLabel } from "../../lib/keymap";
import type { Ln2 } from "./lineCtx";

export function lineMenus(hk: Ln2) {
  const { adjWhy, ass, c, doc, joinWhy, noKeys, noLine, noSel, noVid, openFind, pick, run, setDlg, swapWhy } = hk;
  // ---------------------------------------------------------------- เมนู
  const timeMenu: MRow[][] = [
    [
      { label: "สอดเวลาเริ่มกับภาพ", key: keyLabel("sub.snap-start"), why: noSel ?? noVid, run: run.snapStart, data: "snapstart" },
      { label: "สอดเวลาจบกับภาพ", key: keyLabel("sub.snap-end"), why: noSel ?? noVid, run: run.snapEnd, data: "snapend" },
      { label: "สอดเวลาไปยังฉาก", key: keyLabel("sub.snap-scene"), why: noSel ?? noKeys, run: run.snapScene, data: "snapscene" },
      { label: "เลื่อนไปยังเฟรมปัจจุบัน", key: keyLabel("sub.to-frame"), why: noLine ?? noVid, run: run.toFrame, data: "toframe" },
    ],
    [
      { label: "ทำให้เวลาต่อกัน เปลี่ยนเวลาเริ่ม", why: adjWhy, run: () => run.adjoin(true), data: "adjstart" },
      { label: "ทำให้เวลาต่อกัน เปลี่ยนเวลาจบ", why: adjWhy, run: () => run.adjoin(false), data: "adjend" },
    ],
    [{ label: "เรียงบรรทัด…", why: doc.events.length > 1 ? undefined : "มีบรรทัดเดียว", run: () => setDlg("sort"), data: "sort" }],
  ];
  const lineMenu: MRow[][] = [
    [
      [{ label: "แทรกก่อน", why: noLine, run: () => run.insert(false, false), data: "insbefore" },
        { label: "แทรกหลัง", why: noLine, run: () => run.insert(true, false), data: "insafter" }],
      [{ label: "แทรกก่อน ที่เวลาภาพ", why: noLine ?? noVid, run: () => run.insert(false, true), data: "insbeforev" },
        { label: "แทรกหลัง ที่เวลาภาพ", why: noLine ?? noVid, run: () => run.insert(true, true), data: "insafterv" }],
    ],
    [
      { label: "ทำสำเนาบรรทัด", why: noSel, run: () => run.duplicate(0), data: "dup" },
      [{ label: "แยกก่อนเฟรมที่แสดง", key: keyLabel("sub.split-before"), why: noSel ?? noVid, run: () => run.duplicate(-1), data: "splitbefore" },
        { label: "แยกหลังเฟรมที่แสดง", key: keyLabel("sub.split-after"), why: noSel ?? noVid, run: () => run.duplicate(1), data: "splitafter" }],
      { label: "แยกตรงเคอร์เซอร์ แบ่งเวลาตามความยาวข้อความ", why: noLine, run: () => run.split("estimate"), data: "splitest" },
      { label: "แยกตรงเคอร์เซอร์ ใช้เวลาเดิมทั้งสองบรรทัด", why: noLine, run: () => run.split("preserve"), data: "splitkeep" },
      { label: "แยกตรงเคอร์เซอร์ ที่เฟรมที่แสดง", why: noLine ?? noVid, run: () => run.split("video"), data: "splitvid" },
      [{ label: "รวม ต่อข้อความ", why: joinWhy, run: () => run.join(false), data: "joincat" },
        { label: "รวม เก็บข้อความบรรทัดแรก", why: joinWhy, run: () => run.join(true), data: "joinfirst" }],
    ],
    [
      [{ label: "ย้ายขึ้น", key: keyLabel("sub.move-up"), why: noSel, run: () => run.move(-1), data: "moveup" },
        { label: "ย้ายลง", key: keyLabel("sub.move-down"), why: noSel, run: () => run.move(1), data: "movedown" }],
      { label: "สลับสองบรรทัด", why: swapWhy, run: run.swap, data: "swap" },
    ],
    [
      [{ label: "คัดลอก", key: keyLabel("sub.copy"), why: noSel, run: () => void run.copy(false), data: "copy" },
        { label: "ตัด", key: keyLabel("sub.cut"), why: noSel, run: () => void run.copy(true), data: "cut" }],
      [{ label: "วาง", key: keyLabel("sub.paste"), run: () => void run.paste(), data: "paste" },
        { label: "วางทับ…", key: keyLabel("sub.paste-over"), why: noLine, run: () => void run.pasteOver(), data: "pasteover" }],
      { label: "ลบบรรทัด", key: keyLabel("sub.delete"), why: noSel, run: run.del, data: "delete" },
    ],
  ];
  const selMenu: MRow[][] = [
    [
      { label: "เลือกบรรทัดตามเงื่อนไข…", run: () => setDlg("select"), data: "select" },
      { label: "เลือกบรรทัดที่ขึ้นบนภาพ", why: noVid, run: run.visible, data: "visible" },
      { label: "เลือกทุกบรรทัด", key: keyLabel("sub.select-all"), run: () => pick(doc.events.map((e) => e.id), c.active ?? doc.events[0]?.id), data: "all" },
    ],
    [{ label: "ไปที่บรรทัดหรือเวลา…", run: () => setDlg("goto"), data: "goto" }],
  ];
  const noAss = ass ? undefined : "ซับ SRT ไม่มีสไตล์และขนาดภาพ เปลี่ยนเป็น ASS ก่อน (ปุ่มเปลี่ยนเป็น ASS ในช่องแก้บรรทัด)";
  const toolMenu: MRow[][] = [[
    { label: "สไตล์ของซับ…", why: noAss, run: () => setDlg("styles"), data: "styles" },
    { label: "คุณสมบัติสคริปต์…", why: noAss, run: () => setDlg("props"), data: "props" },
    { label: "เปลี่ยนความละเอียดของคำบรรยาย…", why: noAss, run: () => setDlg("resample"), data: "resample" },
    { label: "ตัวช่วยแปล…", why: noLine, run: () => setDlg("translate"), data: "translate" },
    { label: "ส่งออกเป็น PGS…", why: doc.events.some((e) => !e.comment && e.end > e.start) ? undefined : "ซับนี้ไม่มีบรรทัดที่ขึ้นบนภาพ", run: c.onPgs, data: "pgs" },
  ]];

  const bar = (
    <div className={"se-cmds" + (c.compact ? " compact" : "")} data-se-cmds data-compact={c.compact ? "1" : undefined}>
      <button type="button" className="btn btn-ghost btn-sm" title={`ค้นหา (${keyLabel("sub.find")}) หรือค้นและแทนที่ (${keyLabel("sub.replace")})`} aria-label="ค้นหา" onClick={() => openFind(true)} data-se-find><IcSearch size={15} width={2.2} /><span className="se-cl">ค้นหา</span></button>
      <button type="button" className="btn btn-ghost btn-sm" title={`เลื่อนเวลาของบรรทัดไปข้างหน้าหรือถอยหลัง (${keyLabel("sub.shift")})`} aria-label="เลื่อนเวลา" onClick={() => setDlg("shift")} data-se-shift><IbShiftTime size={15} /><span className="se-cl">เลื่อนเวลา</span></button>
      <button type="button" className="btn btn-ghost btn-sm" title="ปรับเวลาทุกบรรทัดตามกติกาของ Aegisub เผื่อหน้า เผื่อท้าย ต่อบรรทัดที่ใกล้กัน ดูดเข้า keyframe" aria-label="ปรับเวลา" onClick={() => setDlg("post")} data-se-post><IbWand size={15} /><span className="se-cl">ปรับเวลา</span></button>
      <CmdMenu label="เวลา" icon={<IcClock size={15} />} title="เมนูเวลา สอดเวลากับภาพ ทำให้เวลาต่อกัน เรียงบรรทัด" head="เมนูเวลา" tip={TIME_TIP} sections={timeMenu} data="time" width={330} />
      <CmdMenu label="บรรทัด" icon={<IbRows size={15} />} title="เมนูบรรทัด แทรก แยก รวม ย้าย คัดลอก วาง" head="เมนูบรรทัด" tip={LINE_TIP} sections={lineMenu} data="line" width={460} />
      <CmdMenu label="เลือก" icon={<IbSelect size={15} />} title="เมนูเลือกบรรทัด และไปที่บรรทัดหรือเวลา" head="เมนูเลือก" tip={SEL_TIP} sections={selMenu} data="sel" width={300} />
      <CmdMenu label="เครื่องมือ" icon={<IbTools size={15} />} title="สไตล์ของซับ คุณสมบัติสคริปต์ เปลี่ยนความละเอียด ตัวช่วยแปล" head="เครื่องมือ" tip={TOOL_TIP} sections={toolMenu} data="tool" width={320} />
    </div>
  );
  /** คำสั่งที่แถบปุ่มย่อใช้ (BUGS ข้อ 113) */
  const tools: Record<"snapStart" | "snapEnd" | "visible" | "snapScene" | "toFrame" | "styles" | "props" | "shift" | "translate" | "resample" | "post", ToolCmd> = {
    snapStart: { run: run.snapStart, why: noSel ?? noVid },
    snapEnd: { run: run.snapEnd, why: noSel ?? noVid },
    visible: { run: run.visible, why: noVid },
    snapScene: { run: run.snapScene, why: noSel ?? noKeys },
    toFrame: { run: run.toFrame, why: noLine ?? noVid },
    styles: { run: () => setDlg("styles"), why: noAss },
    props: { run: () => setDlg("props"), why: noAss },
    shift: { run: () => setDlg("shift") },
    translate: { run: () => setDlg("translate"), why: noLine },
    resample: { run: () => setDlg("resample"), why: noAss },
    post: { run: () => setDlg("post") },
  };
  return { timeMenu, lineMenu, selMenu, noAss, toolMenu, bar, tools };
}
