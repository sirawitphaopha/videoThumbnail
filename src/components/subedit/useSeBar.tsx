/* คำสั่งของบรรทัด แถบปุ่มย่อ จัดแถบตามความกว้าง และช่องทางทดสอบ
   แยกจาก SubEditor.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 5) เนื้อโค้ดยกมาทั้งก้อน */
import { useEffect, useLayoutEffect, useMemo } from "react";
import { type SubDoc } from "../../lib/api";
import { getSubEdit, redo, undo } from "../../lib/subEdit";
import { useHotkeys } from "../../lib/hotkeys";
import { hk, keyLabel } from "../../lib/keymap";
import { type TagMode } from "../../lib/subText";
import { getVid, seek, seekTime, vidKeys, vidRate, vidSrc, zoomStep } from "../../lib/vidFrames";
import { groupsW, type TbItem } from "./MainBar";
import { toggleVidPlay } from "../../lib/vidPlay";
import { IbJump, IbJumpEnd, IbJumpStart, IbProps, IbResample, IbSelVisible, IbShiftTime, IbSnapEnd, IbSnapScene, IbSnapStart, IbStyles, IbTagCycle, IbToFrame, IbTranslate, IbWand, IbZoomIn, IbZoomOut, IcSettings } from "../icons";
import { useLineCmds } from "./LineCmds";
import { padBusy } from "./PadView";
import type { E4 } from "./seCtx";

export function useSeBar(c: E4) {
  const { audioAct, compact, dl, doSave, doc, ev, fr, frWhy, gbar, labelW, movieAud, nudge, openSaveAs, p, pageOn, root, sameKind, saveNew, saveRef, scrollBy, setCompact, setPgs, setTags, setVdlg, st, tags, tm, vst } = c;
  const textBox = useMemo(() => ({ get current() { return root.current?.querySelector<HTMLElement>("[data-se-text]") ?? null; } }), []);
  const vsrc = vidSrc(vst);
  const cmds = useLineCmds({ doc, sel: st.sel, active: st.active, fr, frWhy, pos: vst.pos, keys: vidKeys(vst).list, delay: dl, textBox,
    videoRes: p.playRes, playLine: () => audioAct("playline"), seekMs: (ms) => seekTime(ms + dl, "start"), movie: vsrc.kind === "movie" ? vsrc.path : null, compact, onPgs: () => setPgs(true) });

  // ---------------------------------------------------------------- แถบปุ่มย่อ (BUGS ข้อ 113 · default_toolbar.json ส่วน main ของ Aegisub)
  // ลำดับและกลุ่มตาม Aegisub ข้ามปุ่มที่โปรแกรมนี้ไม่มีหรือมีที่อื่นแล้ว คือ ซับใหม่ เปิด บันทึก (แถวบน) ไฟล์แนบ รวบรวมฟอนต์ ออโตเมชัน ผู้ช่วยสไตล์ คันจิ ตรวจคำผิด
  const t = cmds.tools;
  const noPos = !fr ? frWhy || "ยังไม่มีวิดีโอ" : vst.pos == null ? "ยังไม่มีภาพ" : undefined;
  const noSrc = vsrc.kind === "none" ? (vst.closed ? "ปิดวิดีโออยู่" : "ยังไม่มีวิดีโอ") : undefined;
  const TAGS: Record<TagMode, string> = { full: "แท็กเต็ม", sym: "ย่อเป็น ☀", hide: "ซ่อนแท็ก" };
  const nextTag: Record<TagMode, TagMode> = { full: "sym", sym: "hide", hide: "full" };
  const tb: TbItem[][] = t ? [
    [
      { id: "jump", label: "ข้ามไปยัง…", title: "ข้ามไปยังเฟรมหรือเวลา", icon: <IbJump size={15} />, tone: "nav", key: keyLabel("vid.jump"), why: noPos, run: () => setVdlg("jump") },
      { id: "zoomin", label: "ขยายภาพหนัง", title: "ขยายภาพหนังขึ้นหนึ่งขั้น 12.5%", icon: <IbZoomIn size={15} />, tone: "nav", key: keyLabel("vid.zoom-in"), why: noSrc ?? (vst.zoom >= 300 ? "ขยายสุดแล้ว 300%" : undefined), run: () => zoomStep(1) },
      { id: "zoomout", label: "ย่อภาพหนัง", title: "ย่อภาพหนังลงหนึ่งขั้น 12.5%", icon: <IbZoomOut size={15} />, tone: "nav", key: keyLabel("vid.zoom-out"), why: noSrc ?? (vst.zoom && vst.zoom <= 12.5 ? "ย่อสุดแล้ว 12.5%" : undefined), run: () => zoomStep(-1) },
      { id: "jumpstart", label: "ภาพไปเวลาเริ่มของบรรทัด", title: "เลื่อนภาพไปเฟรมแรกของบรรทัดที่กำลังแก้", icon: <IbJumpStart size={15} />, tone: "nav", key: keyLabel("vid.to-start"), why: noPos ?? (ev ? undefined : "ยังไม่ได้เลือกบรรทัด"), run: () => { if (ev) seekTime(ev.start + dl, "start"); } },
      { id: "jumpend", label: "ภาพไปเวลาจบของบรรทัด", title: "เลื่อนภาพไปเฟรมสุดท้ายของบรรทัดที่กำลังแก้", icon: <IbJumpEnd size={15} />, tone: "nav", key: keyLabel("vid.to-end"), why: noPos ?? (ev ? undefined : "ยังไม่ได้เลือกบรรทัด"), run: () => { if (ev) seekTime(ev.end + dl, "end"); } },
    ],
    [
      { id: "snapstart", label: "สอดเวลาเริ่มกับภาพ", title: "ตั้งเวลาเริ่มของบรรทัดที่เลือกเป็นเฟรมที่ภาพแสดงอยู่", icon: <IbSnapStart size={15} />, tone: "edge", key: keyLabel("sub.snap-start"), ...t.snapStart },
      { id: "snapend", label: "สอดเวลาจบกับภาพ", title: "ตั้งเวลาจบของบรรทัดที่เลือกเป็นเฟรมที่ภาพแสดงอยู่", icon: <IbSnapEnd size={15} />, tone: "edge", key: keyLabel("sub.snap-end"), ...t.snapEnd },
      { id: "visible", label: "เลือกบรรทัดที่ขึ้นบนภาพ", title: "เลือกทุกบรรทัดที่ขึ้นอยู่ในเฟรมที่ภาพแสดง", icon: <IbSelVisible size={15} />, tone: "edge", ...t.visible },
      { id: "snapscene", label: "สอดเวลาไปยังฉาก", title: "ตั้งเวลาของบรรทัดที่เลือกให้ยาวเต็มฉากที่ภาพแสดงอยู่ ตั้งแต่ keyframe ก่อนหน้าถึง keyframe ถัดไป", icon: <IbSnapScene size={15} />, tone: "edge", key: keyLabel("sub.snap-scene"), ...t.snapScene },
      { id: "toframe", label: "เลื่อนไปยังเฟรมปัจจุบัน", title: "เลื่อนบรรทัดที่เลือกไปพร้อมกัน ให้บรรทัดที่กำลังแก้เริ่มที่เฟรมที่ภาพแสดง", icon: <IbToFrame size={15} />, tone: "edge", key: keyLabel("sub.to-frame"), ...t.toFrame },
    ],
    [
      { id: "styles", label: "สไตล์ของซับ…", title: "จัดการสไตล์ของซับ ฟอนต์ ขนาด สี ขอบ เงา", icon: <IbStyles size={15} />, tone: "go", ...t.styles },
      { id: "props", label: "คุณสมบัติสคริปต์…", title: "คุณสมบัติสคริปต์ หัวเรื่อง ชื่อคนทำซับ ความละเอียด", icon: <IbProps size={15} />, tone: "go", ...t.props },
    ],
    [
      { id: "shift", label: "เลื่อนเวลา…", title: "เลื่อนเวลาของบรรทัดไปข้างหน้าหรือถอยหลัง", icon: <IbShiftTime size={15} />, tone: "lead", key: keyLabel("sub.shift"), ...t.shift },
      { id: "translate", label: "ตัวช่วยแปล…", title: "ตัวช่วยแปล แปลทีละท่อนข้อความ แท็กอยู่ที่เดิม", icon: <IbTranslate size={15} />, tone: "lead", ...t.translate },
      { id: "resample", label: "เปลี่ยนความละเอียดของคำบรรยาย…", title: "เปลี่ยนขนาดภาพของซับ แล้วคูณขนาดและตำแหน่งให้หน้าตาเท่าเดิม", icon: <IbResample size={15} />, tone: "lead", ...t.resample },
      { id: "post", label: "ปรับเวลาทั้งไฟล์…", title: "ปรับเวลาทุกบรรทัดตามกติกาของ Aegisub เผื่อหน้า เผื่อท้าย ต่อบรรทัดที่ใกล้กัน ดูดเข้า keyframe", icon: <IbWand size={15} />, tone: "lead", ...t.post },
    ],
    [
      { id: "options", label: "ตั้งค่า", title: "ตั้งค่าโปรแกรม ไปหัวข้อเสียงและซับ", icon: <IcSettings size={15} />, why: p.onSettings ? undefined : "หน้านี้ไปหน้าตั้งค่าไม่ได้", run: () => p.onSettings?.() },
      { id: "tagcycle", label: `สลับการแสดงแท็ก ตอนนี้${TAGS[tags]}`, title: `สลับการแสดงแท็กในตาราง ตอนนี้${TAGS[tags]} กดแล้วเป็น${TAGS[nextTag[tags]]}`, icon: <IbTagCycle size={15} />, run: () => setTags(nextTag[tags]) },
    ],
  ] : [];
  // แถวเหนือตารางแคบเกินให้แถบปุ่มย่อเห็นสองกลุ่มแรก ย่อปุ่มคำสั่งกับเมนูเป็นไอคอน · ความกว้างแบบมีชื่อจำไว้ตอนแสดงแบบมีชื่อ คิดจากค่านี้ทุกครั้ง ไม่สลับไปมา
  useLayoutEffect(() => {
    const el = gbar.current;
    if (!el) return;
    const runFit = () => {
      const cm = el.querySelector<HTMLElement>("[data-se-cmds]");
      if (!cm || !el.clientWidth) return;
      if (!cm.classList.contains("compact")) labelW.current = cm.offsetWidth;
      const kids = [...el.children] as HTMLElement[];
      const fixed = kids.filter((k) => k !== cm && !k.hasAttribute("data-mainbar")).reduce((s, k) => s + k.offsetWidth, 0);
      const gap = parseFloat(getComputedStyle(el).columnGap) || 0;
      const free = el.clientWidth - labelW.current - fixed - gap * Math.max(0, kids.length - 1);
      const want = tb.length >= 2 && free < groupsW(tb, 2);
      setCompact((c) => (c === want ? c : want));
    };
    runFit();
    const ro = new ResizeObserver(runFit);
    ro.observe(el);
    return () => ro.disconnect();
  });

  // คีย์ลัดทั้งหมดมาจากทะเบียนกลาง keymap.ts ตั้งใหม่ได้ในหน้าตั้งค่า หัวข้อคีย์ลัด (BUGS ข้อ 162.3) · คีย์ตั้งต้นตาม default_hotkey.json ของ Aegisub
  const save = () => { const d = getSubEdit().doc; if (!d || (!getSubEdit().dirty && !padBusy() && sameKind(d))) return; void doSave(); };
  useHotkeys([
    ...cmds.hotkeys,
    hk("sub.undo", () => undo()),
    hk("sub.redo", () => redo()),
    // ใช้เงื่อนไขเดียวกับปุ่มบันทึก ยังไม่แก้อะไรแล้วไม่เขียนไฟล์ใหม่ ไม่ส่งไฟล์เดิมลงถังขยะ และข้ามการกดค้าง (ผู้ช่วยตรวจทาน F24)
    hk("sub.save", (e) => { if (!e.repeat) save(); }),
    hk("sub.save-as", () => { const d = getSubEdit().doc; if (d) openSaveAs(d.kind); }),
    // เล่นหรือหยุดหนังในกรอบวิดีโอ (video/play ของ Aegisub · vidPlay.ts) กับคีย์ลัดวิดีโอที่ใช้ได้ทั้งหน้า รวมตอนพิมพ์ในช่อง
    hk("vid.play", () => toggleVidPlay()),
    hk("vid.next-frame", () => { const pos = getVid().pos; if (pos != null) seek(pos + 1); }),
    hk("vid.prev-frame", () => { const pos = getVid().pos; if (pos != null) seek(pos - 1); }),
    hk("vid.to-start", () => { if (ev) seekTime(ev.start + dl, "start"); }),
    hk("vid.to-end", () => { if (ev) seekTime(ev.end + dl, "end"); }),
    hk("vid.jump", () => { if (vidRate()) setVdlg("jump"); }),
    hk("vid.zoom-in", () => zoomStep(1)),
    hk("vid.zoom-out", () => zoomStep(-1)),
    // คีย์ลัดเสียง (กลุ่ม Audio ของ Aegisub) ใช้ตอนไม่ได้พิมพ์ในช่อง · Enter กับ Space ตอนโฟกัสอยู่ที่ปุ่ม ให้ปุ่มทำงานตามปกติ
    hk("aud.commit", () => audioAct("commit")),
    hk("aud.play-sel", () => audioAct("playsel")),
    hk("aud.play-line", () => audioAct("playline")),
    hk("aud.before", () => audioAct("before")),
    hk("aud.after", () => audioAct("after")),
    hk("aud.begin", () => audioAct("begin")),
    hk("aud.end", () => audioAct("end")),
    hk("aud.to-end", () => audioAct("toend")),
    hk("aud.stop", () => audioAct("stop")),
    hk("aud.scroll-left", () => scrollBy(-128)),
    hk("aud.scroll-right", () => scrollBy(128)),
    hk("aud.prev", () => audioAct("prev")),
    hk("aud.next", () => audioAct("next")),
    hk("aud.lead-in", () => audioAct("leadin")),
    hk("aud.lead-out", () => audioAct("leadout")),
    hk("aud.len-up", () => nudge("len", 1)),
    hk("aud.len-down", () => nudge("len", -1)),
    // แป้นตัวเลข (Medusa Mode) ใช้ได้แม้กำลังพิมพ์ เปิดจากปุ่มแป้นตัวเลขเท่านั้น ปิดอยู่ตัวเลขพิมพ์ลงช่องตามปกติ
    ...(tm.opts.medusa ? [
      hk("medusa.prev", () => audioAct("prev")),
      hk("medusa.next", () => audioAct("next")),
      hk("medusa.play-sel", () => audioAct("playsel")),
      hk("medusa.before", () => audioAct("before")),
      hk("medusa.after", () => audioAct("after")),
      hk("medusa.stop", () => audioAct("stop")),
      hk("medusa.start-down", () => nudge("start", -1)),
      hk("medusa.start-up", () => nudge("start", 1)),
      hk("medusa.len-down", () => nudge("len", -1)),
      hk("medusa.len-up", () => nudge("len", 1)),
      hk("medusa.commit", () => audioAct("commit")),
    ] : []),
  ], pageOn);

  // ทางลัดให้ตัวตรวจ เฉพาะรุ่นทดสอบ
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const w = window as unknown as Record<string, unknown>;
    w.__subEditSave = () => saveRef.current();
    w.__subEditSaveNew = (to: SubDoc["kind"], target: string) => saveNew(to, target);
    // แหล่งเสียงของหนังที่ส่งให้คลื่นเสียงกับตัวเล่น มีเวลาเฟรมแรกของภาพ (BUGS ข้อ 115)
    w.__audSrc = movieAud;
  });
  return { textBox, vsrc, cmds, t, noPos, noSrc, TAGS, nextTag, tb };
}
