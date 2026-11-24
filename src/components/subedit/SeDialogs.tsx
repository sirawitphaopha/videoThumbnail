/* หน้าต่างซ้อนของตัวแก้ซับ คำสั่งบรรทัด วิดีโอ ฟอนต์ PGS ใส่กลับ และหน้าต่างถามก่อนบันทึก
   แยกจาก SubEditor.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 5) เนื้อโค้ดยกมาทั้งก้อน */
import { subDocApi, type SubDoc } from "../../lib/api";
import { autosaveStrict, getSubEdit, markSaved, openDoc } from "../../lib/subEdit";
import { isAss } from "../../lib/subText";
import { seek, vidKeys } from "../../lib/vidFrames";
import Dialog from "../Dialog";
import { CardIcon, J, Keep, Phr, Seg, Skel } from "../ui";
import { IbSave, IcFolder } from "../icons";
import { shownText } from "./SubVideo";
import FontDialog from "./FontDialog";
import { DetailsDialog, DummyDialog, JumpDialog } from "./VideoDialogs";
import { flushPad } from "./PadView";
import RemuxDialog from "./RemuxDialog";
import PgsDialog from "./PgsDialog";
import { LOST, dirOf, nameOf } from "./editorParts";
import type { SeOpen } from "./seCtx";

export default function SeDialogs({ pg }: { pg: SeOpen }) {
  const { applyDummy, ask, autoList, base, browse, cmds, doSave, ev, font, fr, key, lostOf, openSaveAs, p, pgs, remux, saveNew, saving, setAsk, setAutoList, setFont, setPgs, setRemux, setSave, setVdlg, st, vdlg, vsrc, vst } = pg;
  const doc = pg.doc!;
  return (
    <>
      {cmds.dialogs}
      <JumpDialog open={vdlg === "jump"} fr={fr} pos={vst.pos ?? 0} onClose={() => setVdlg(null)} onJump={seek} />
      <DetailsDialog open={vdlg === "details"} onClose={() => setVdlg(null)} name={nameOf(p.video)} table={vst.table} dummy={vst.dummy} fr={fr} keys={vidKeys(vst).list.length} />
      <DummyDialog open={vdlg === "dummy"} onClose={() => setVdlg(null)} onUse={applyDummy} />
      <FontDialog open={!!font} current={font?.current ?? { name: "", size: "" }} sample={ev ? shownText(ev, doc).replace(/\n/g, " ") : ""} onClose={() => setFont(null)} onApply={(t, r) => font?.apply(t, r)} />
      <PgsDialog open={pgs} onClose={() => setPgs(false)} doc={doc} base={getSubEdit().meta?.base ?? base} movie={vsrc.kind === "movie" ? vsrc.path : null} cur={ev?.id ?? null}
        video={vst.table && vsrc.kind === "movie" ? { w: vst.table.w, h: vst.table.h, rate: vst.table.rate, fps: vst.table.fps } : null}
        onDone={(m) => setSave({ s: "done", note: m })} />
      <RemuxDialog open={remux} onClose={() => setRemux(false)} doc={doc} onSaveAsFile={() => openSaveAs(doc.kind)}
        onFail={(m) => setSave({ s: "failed", err: `ใส่ซับกลับเข้าหนังไม่สำเร็จ  ${m}` })}
        onDone={(r, written, stamp) => {
          if (import.meta.env.DEV) (window as unknown as { __lastRemux?: unknown }).__lastRemux = r;
          // ระหว่างรวมไฟล์มีการเปิดซับอื่นแทนแล้ว ผลนี้ไม่ใช่ของเอกสารที่เปิดอยู่ ไม่นับว่าบันทึก ไม่เปลี่ยนที่มา (F25)
          if (getSubEdit().meta?.key !== key) return;
          markSaved(written, { source: written.source ? { ...written.source, path: r.output, ...stamp } : written.source, enc: written.enc, exact: written.exact });
          if (written.source && r.output !== written.source.path) p.onMovieMoved?.(written.source.path, r.output);
          const orig = r.original === "trash" ? "ไฟล์เดิมลงถังขยะ" : r.original === "kept" ? "ไฟล์เดิมอยู่ในโฟลเดอร์ไฟล์เดิม" : "";
          if (r.same === false) setSave({ s: "failed", err: `ใส่ซับกลับเข้าหนังแล้ว แต่ซับที่อ่านกลับจากไฟล์ใหม่ไม่ตรงกับที่แก้ ตรวจไฟล์ ${nameOf(r.output)} อีกครั้ง  ${orig}` });
          else setSave({ s: "done", note: `ใส่ซับกลับเข้าหนังแล้ว ${orig}` });
        }} />
      <Dialog open={ask?.k === "changed"} onClose={() => setAsk(null)} kind="work" title="ไฟล์ซับถูกแก้จากที่อื่น" width={560}
        actions={<>
          <button type="button" className="btn btn-ghost" onClick={() => setAsk(null)}>ยกเลิก</button>
          <button type="button" className="btn btn-ghost" onClick={() => { setAsk(null); openSaveAs(doc.kind); }} data-se-changed-new>บันทึกเป็นไฟล์ใหม่</button>
          <button type="button" className="btn btn-main" onClick={() => { setAsk(null); void doSave(true, true); }} data-se-changed-force>บันทึกทับ</button>
        </>}>
        {/* สองย่อหน้าละบรรทัดเดียว ไม่ให้บรรทัดบนโดนกระจายแบบไทยจนตัวอักษรถ่าง (CLAUDE.md) */}
        <div className="se-dlgtext"><Phr>{`${nameOf(doc.source?.path ?? "")} ถูกแก้หรือบันทึกจากโปรแกรมอื่นหลังเปิดในหน้านี้`}</Phr></div>
        <div className="se-dlgtext"><Phr>{`${["ถ้า", "บันทึก", "ทับ สิ่ง", "ที่", "แก้", "จาก", "ที่", "อื่น", "จะ", "หาย"].join(J)}  แต่ไฟล์นั้นยังกู้คืนได้จากถังขยะ`}</Phr></div>
      </Dialog>
      <Dialog open={ask?.k === "inexact"} onClose={() => setAsk(null)} kind="work" title="ไฟล์นี้มีตัวอักษรที่อ่านไม่ออก" width={560}
        actions={<>
          <button type="button" className="btn btn-ghost" onClick={() => setAsk(null)}>ยกเลิก</button>
          <button type="button" className="btn btn-main" onClick={() => { setAsk(null); void doSave(false, true); }} data-se-inexact-ok>บันทึกต่อ</button>
        </>}>
        <div className="se-dlgtext"><Phr>{`ตอนเปิด โปรแกรมอ่านบางตัวด้วยรหัส ${doc.enc.charset} ไม่ออก  บันทึกแล้วตัวนั้นจะเปลี่ยนเป็นตัวอื่น  ถ้าภาษาไทยในตารางขึ้นผิด ให้ยกเลิกแล้วเปิดด้วยรหัสอื่นก่อน`}</Phr></div>
      </Dialog>
      <Dialog open={ask?.k === "saveas"} onClose={() => setAsk(null)} kind="work" title="บันทึกเป็นไฟล์ใหม่" width={620}
        actions={ask?.k === "saveas" ? <>
          <button type="button" className="btn btn-ghost" onClick={() => setAsk(null)}>ยกเลิก</button>
          <button type="button" className={"btn " + (saving ? "btn-wait" : "btn-main")} aria-disabled={saving || undefined} onClick={() => !saving && void saveNew(ask.to, ask.path)} data-se-saveas-ok>
            <IbSave size={15} /><Keep all={["บันทึก", "กำลังบันทึก…"]}>{saving ? "กำลังบันทึก…" : "บันทึก"}</Keep></button>
        </> : null}>
        {ask?.k === "saveas" && <div className="se-saveas" data-se-saveas-dlg>
          <div className="se-erow">
            <span className="se-f">ชนิดไฟล์</span>
            <Seg<string> label="ชนิดไฟล์" value={ask.to} onChange={(to) => { if (to === "pgs") { setAsk(null); setPgs(true); } else openSaveAs(to as SubDoc["kind"]); }}
              options={[{ value: "ass", label: "ASS" }, { value: "srt", label: "SRT" }, ...(doc.kind === "vtt" ? [{ value: "vtt", label: "VTT" }] : []), ...(doc.kind === "ssa" ? [{ value: "ssa", label: "SSA" }] : []), { value: "pgs", label: "PGS ภาพ" }]} />
          </div>
          <div className="se-erow"><span className="se-f">ที่เก็บ</span><span className="se-path" title={ask.path} data-se-saveas-path>{ask.path}</span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => void browse(ask)} data-se-saveas-browse><IcFolder size={15} />เปลี่ยนที่เก็บ</button></div>
          {ask.to === "srt" && isAss(doc) && (
            <div className="stat warn" style={{ margin: 0 }} data-se-lost><CardIcon kind="warn" /><div>
              <b>บันทึกเป็น SRT แล้วของเหล่านี้หาย</b>
              {lostOf == null ? <Skel w="70%" h={16} /> : lostOf.length === 0 ? <div>ไม่มีอะไรหาย ตัวหนา ตัวเอียง ขีดเส้นใต้ ขีดฆ่า เก็บได้ครบ</div>
                : <ul className="se-lostlist">{lostOf.map((l) => <li key={l.key}><Phr>{`${LOST[l.key] ?? l.key}${l.key === "fonts" ? "" : ` (${l.n.toLocaleString("en-US")} บรรทัด)`}`}</Phr></li>)}</ul>}
              <div className="small"><Phr>ตัวหนา ตัวเอียง ขีดเส้นใต้ และขีดฆ่า เก็บได้ครบ  ส่วนไฟล์ ASS เดิมไม่ถูกแตะ</Phr></div>
            </div></div>
          )}
          {ask.to === "ass" && !isAss(doc) && <div className="small">เปลี่ยนเป็น ASS แล้วตั้งขนาดภาพของซับตามหนัง{p.playRes ? ` ${p.playRes[0]} × ${p.playRes[1]}` : " 1920 × 1080"} และมีสไตล์ Default หนึ่งสไตล์</div>}
        </div>}
      </Dialog>
      <Dialog open={ask?.k === "exists"} onClose={() => setAsk(null)} kind="work" title="ในโฟลเดอร์มีไฟล์ชื่อนี้อยู่แล้ว" width={560}
        actions={ask?.k === "exists" ? <>
          <button type="button" className="btn btn-ghost" onClick={() => setAsk(null)}>ยกเลิก</button>
          <button type="button" className="btn btn-main" onClick={() => { const a = ask; void subDocApi.freeName(a.path).then((f) => saveNew(a.to, f)); }} data-se-exists-renum>ตั้งชื่อใหม่ต่อเลข</button>
        </> : null}>
        {ask?.k === "exists" && <div className="se-dlgtext"><Phr>{`${nameOf(ask.path)} มีอยู่แล้วใน ${dirOf(ask.path)}  โปรแกรมไม่เขียนทับไฟล์อื่น  ตั้งชื่อใหม่โดยต่อเลขท้าย หรือยกเลิกแล้วเลือกที่เก็บใหม่`}</Phr></div>}
      </Dialog>
      <Dialog open={!!autoList} onClose={() => setAutoList(null)} kind="menu" title="ฉบับบันทึกอัตโนมัติ" width={640}>
        {autoList && <div className="se-autos" data-se-autolist>
          <div className="small"><Phr>โปรแกรมบันทึกเองทุก 60 วินาทีระหว่างแก้ เก็บ 10 ฉบับล่าสุดต่อไฟล์ เปิดฉบับไหนแล้วกดบันทึก จะเขียนทับไฟล์เดิมที่แก้</Phr></div>
          {st.dirty && <div className="small se-dirty"><Phr>ที่แก้ค้างอยู่ในหน้านี้ โปรแกรมเก็บเป็นฉบับอัตโนมัติให้ก่อนเปิดฉบับอื่น</Phr></div>}
          {autoList.length === 0 ? <div className="small">ยังไม่มีฉบับบันทึกอัตโนมัติ</div> : autoList.slice(0, 40).map((a) => (
            <div key={a.path} className="se-auto">
              <span className="se-cut"><b>{a.name}</b> <span className="small nw">{`${a.at} ${a.events.toLocaleString("en-US")} บรรทัด`}</span></span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => {
                // ที่แก้ค้างในหน้านี้เก็บเป็นฉบับอัตโนมัติก่อน แล้วค่อยเปิดฉบับที่เลือก ไม่มีอะไรหาย · เก็บไม่ได้ ไม่เปิดทับ (F7)
                void flushPad().then(() => autosaveStrict()).then(() => subDocApi.openAutosave(a.path)).then((d) => { openDoc(d, { name: a.name, movie: p.video, key, base: (d.source?.path ?? a.path).replace(/\.[^.\\/]+$/, "") }, { dirty: true }); setAutoList(null); }, (e) => setSave({ s: "failed", err: String(e) }));
              }} data-se-autoopen>เปิด</button>
            </div>
          ))}
        </div>}
      </Dialog>
    </>
  );
}
