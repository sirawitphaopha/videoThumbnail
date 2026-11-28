/* หน้าต่างของคำสั่งบรรทัด คีย์ลัด และข้อความผลของคำสั่ง (ฟังก์ชันธรรมดา ไม่ใช่ hook)
   แยกจาก LineCmds.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 10) เนื้อโค้ดยกมาทั้งก้อน */
import { type Hotkey } from "../../lib/hotkeys";
import { hk as key } from "../../lib/keymap";
import { edit, getSubEdit } from "../../lib/subEdit";
import { gotoTarget, postProcess, selectLines, shiftTimes, sortLines, type PostOpts, type SelectOpts, type ShiftOpts, type SortKey } from "../../lib/subCmds";
import { FindDialog, GotoDialog, OverDialog, PostDialog, SelectDialog, ShiftDialog, SortDialog } from "./CmdDialogs";
import { StyleManager } from "./StyleDialogs";
import { ResampleDialog, TranslateDialog } from "./ToolDialogs";
import PropsDialog from "./PropsDialog";
import { n0 } from "./lineData";
import type { Ln3 } from "./lineCtx";

export function lineDialogs(hk: Ln3) {
  const { ass, c, cur, dl, dlg, doOver, doReplace, doReplaceAll, doc, find, findNext, fmsg, fopts, fr, hit, note, openFind, pick, repl, run, setDlg, setFind, setFopts, setNote, setRepl } = hk;
  const dialogs = <>
    <ShiftDialog open={dlg === "shift"} onClose={() => setDlg(null)} frames={!!fr} selCount={c.sel.length} kind={doc.kind}
      onRun={(o: ShiftOpts) => {
        const d = cur(), s = new Set(getSubEdit().sel);
        const first = d.events.findIndex((e) => s.has(e.id));
        const n = o.affect === 0 ? d.events.length : o.affect === 1 ? s.size : first < 0 ? 0 : d.events.length - first;
        edit("เลื่อนเวลา", (x) => shiftTimes(x, s, o, fr, dl));
        setNote({ t: `เลื่อนเวลา ${n0(n)} บรรทัดแล้ว`, bad: false });
        return n;
      }} />
    <PostDialog open={dlg === "post"} onClose={() => setDlg(null)} doc={doc} keys={!!fr && c.keys.length > 0} selCount={c.sel.length}
      onRun={(o: PostOpts) => {
        const r = postProcess(cur(), new Set(getSubEdit().sel), o, fr, c.keys, dl);
        if (typeof r === "string") return r;
        const before = cur();
        const n = r.events.filter((e, i) => e !== before.events[i]).length;
        edit("ปรับเวลาทั้งไฟล์", () => r);
        setNote({ t: n ? `ปรับเวลาแล้ว ${n0(n)} บรรทัด` : "ไม่มีบรรทัดที่ต้องปรับ", bad: false });
        return null;
      }} />
    <SelectDialog open={dlg === "select"} onClose={() => setDlg(null)} ass={ass}
      onRun={(o: SelectOpts) => {
        const r = selectLines(cur(), getSubEdit().sel, o);
        if (typeof r === "string") return r;
        pick(r, r.includes(getSubEdit().active ?? -1) ? getSubEdit().active! : r[0]);
        return r.length ? `เลือกไว้ ${n0(r.length)} บรรทัด` : "ไม่มีบรรทัดที่ตรง";
      }} />
    <FindDialog open={dlg === "find" || dlg === "replace"} replace={dlg === "replace"} onClose={() => setDlg(null)} ass={ass} find={find} repl={repl}
      setFind={(s) => { setFind(s); hit.current = null; }} setRepl={setRepl} opts={fopts} setOpts={(o) => { setFopts(o); hit.current = null; }} msg={fmsg}
      onNext={() => { findNext(); }} onReplace={doReplace} onReplaceAll={doReplaceAll} />
    <OverDialog open={dlg === "over"} onClose={() => setDlg(null)} ass={ass} onRun={doOver} />
    <GotoDialog open={dlg === "goto"} onClose={() => setDlg(null)} onGo={(q) => { const id = gotoTarget(cur(), q); if (id == null) return false; pick([id], id); return true; }} />
    <SortDialog open={dlg === "sort"} onClose={() => setDlg(null)} ass={ass} selCount={c.sel.length}
      onRun={(k: SortKey, only: boolean) => { edit("เรียงบรรทัด", (d) => sortLines(d, k, only ? new Set(getSubEdit().sel) : null)); }} />
    {ass && <StyleManager open={dlg === "styles"} onClose={() => setDlg(null)} doc={doc} playRes={null} />}
    {ass && <ResampleDialog open={dlg === "resample"} onClose={() => setDlg(null)} doc={doc} video={c.videoRes} onDone={(t) => setNote({ t, bad: false })} />}
    <TranslateDialog open={dlg === "translate"} onClose={() => setDlg(null)} doc={doc} onPlay={c.playLine} onSeek={c.seekMs} onDone={(t) => setNote({ t, bad: false })} />
    {ass && <PropsDialog open={dlg === "props"} onClose={() => setDlg(null)} doc={doc} video={c.videoRes} movie={c.movie} onDone={(t) => setNote({ t, bad: false })} />}
  </>;

  // คีย์ลัดมาจากทะเบียนกลาง keymap.ts (BUGS ข้อ 162.3) · เลือกทุกบรรทัดใช้ได้ทั้งหน้า ไม่ต้องโฟกัสตาราง ส่วนในช่องพิมพ์ Ctrl+A ยังเลือกข้อความตามปกติ
  // F3 ค้นต่อไปใช้ได้ระหว่างหน้าต่างค้นหาเปิด แบบ Aegisub (BUGS ข้อ 162.2 · ผู้ช่วยตรวจทาน F21)
  const hotkeys: Hotkey[] = [
    key("sub.shift", () => setDlg("shift")),
    key("sub.select-all", () => pick(cur().events.map((e) => e.id), getSubEdit().active ?? cur().events[0]?.id)),
    key("sub.snap-start", run.snapStart),
    key("sub.snap-end", run.snapEnd),
    key("sub.snap-scene", run.snapScene),
    key("sub.to-frame", run.toFrame),
    key("sub.split-before", () => run.duplicate(-1)),
    key("sub.split-after", () => run.duplicate(1)),
    key("sub.move-up", () => run.move(-1)),
    key("sub.move-down", () => run.move(1)),
    key("sub.copy", () => void run.copy(false)),
    key("sub.cut", () => void run.copy(true)),
    key("sub.paste", () => void run.paste()),
    key("sub.paste-over", () => void run.pasteOver()),
    key("sub.delete", run.del),
    key("sub.find", () => openFind(false)),
    key("sub.replace", () => openFind(true)),
    key("sub.find-next", () => { if (find) findNext(); else openFind(false); }, { dialog: "[data-find]" }),
  ];

  /** ผลของคำสั่ง ขึ้นแทนที่ตัวนับบรรทัดชั่วคราว แถบไม่แน่นขึ้น */
  const noteEl = note ? <span className={"small se-cnote" + (note.bad ? " bad" : "")} role={note.bad ? "alert" : "status"} title={note.t} data-se-cnote>{note.t}</span> : null;
  return { dialogs, hotkeys, noteEl };
}
