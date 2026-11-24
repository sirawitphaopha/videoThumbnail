/* หน้าต่างของคำสั่งบรรทัด คีย์ลัด และข้อความผลของคำสั่ง (ฟังก์ชันธรรมดา ไม่ใช่ hook)
   แยกจาก LineCmds.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 10) เนื้อโค้ดยกมาทั้งก้อน */
import { type Hotkey } from "../../lib/hotkeys";
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

  const hotkeys: Hotkey[] = [
    { code: "KeyI", ctrl: true, run: () => setDlg("shift") },
    { code: "Digit3", ctrl: true, field: true, run: run.snapStart },
    { code: "Digit4", ctrl: true, field: true, run: run.snapEnd },
    { code: "Digit5", ctrl: true, field: true, run: run.snapScene },
    { code: "Digit6", ctrl: true, field: true, run: run.toFrame },
    { code: "KeyD", ctrl: true, field: true, run: () => run.duplicate(-1) },
    { code: "KeyD", ctrl: true, shift: true, field: true, run: () => run.duplicate(1) },
    { code: "ArrowUp", alt: true, run: () => run.move(-1) },
    { code: "ArrowDown", alt: true, run: () => run.move(1) },
    { code: "KeyC", ctrl: true, run: () => void run.copy(false) },
    { code: "KeyX", ctrl: true, run: () => void run.copy(true) },
    { code: "KeyV", ctrl: true, run: () => void run.paste() },
    { code: "KeyV", ctrl: true, shift: true, run: () => void run.pasteOver() },
    { code: "Delete", ctrl: true, run: run.del },
    { code: "KeyF", ctrl: true, field: true, run: () => openFind(false) },
    { code: "KeyH", ctrl: true, field: true, run: () => openFind(true) },
    { code: "F3", field: true, run: () => { if (find) findNext(); else openFind(false); } },
  ];

  /** ผลของคำสั่ง ขึ้นแทนที่ตัวนับบรรทัดชั่วคราว แถบไม่แน่นขึ้น */
  const noteEl = note ? <span className={"small se-cnote" + (note.bad ? " bad" : "")} role={note.bad ? "alert" : "status"} title={note.t} data-se-cnote>{note.t}</span> : null;
  return { dialogs, hotkeys, noteEl };
}
