/* เนื้อหน้าซับไตเติล ตัวดูซับ ตัวแก้ซับ OCR และหน้าต่างถามก่อนเปลี่ยนไฟล์
   แยกจาก SubtitlePage.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 8) เนื้อโค้ดยกมาทั้งก้อน */
import Dialog from "../../components/Dialog";
import SubEditor from "../../components/subedit/SubEditor";
import { autosaveStrict, closeDoc, getSubEdit, requestSave } from "../../lib/subEdit";
import { SUB_EXT } from "../../lib/api/index";
import { CardIcon, J, Keep, Phr, Skel, dropClick } from "../../components/ui";
import { IcFile, IcFolder } from "../../components/icons";
import SubViewer from "../../components/SubViewer";
import OcrPage from "../ocr/OcrPage";
import InfoTip from "../../components/InfoTip";
import { MOVIE_EXT, nameOf, PLANNED } from "./subPageShared";
import type { SpCtx } from "./subPageCtx";

export default function SubPageBody({ pg }: { pg: SpCtx }) {
  const { addSub, addVideo, busy, doExport, err, exp, file, guard, imgMode, isImage, ocrDoc, onSettings, over, pick, refStream, reveal, setErr, setExp, setFile, setGuard, setImgMode, setVideoErr, setView, showDrop, st, subTab, videoErr } = pg;
  return (
    <>
      <div className="ag">
        {showDrop && (
          <div className={"drop" + (over ? " over" : err ? " bad" : "")} style={{ minHeight: file ? 120 : 180 }} onClick={dropClick(pick)} data-drop="subtitle">
            {over ? <b>ปล่อยเมาส์เพื่อเปิดไฟล์นี้</b>
              : err ? <b>{err}</b>
              : <><b style={{ color: "var(--txt2)" }}>ลากไฟล์หนังหรือไฟล์ซับมาวางตรงนี้</b><span>หรือ</span></>}
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => void pick()}><IcFile size={15} />เลือกไฟล์จากเครื่อง</button>
            {/* ไฟล์ซับรับเพิ่มเป็นราว 20 ชนิด (BUGS ข้อ 123) แยกบรรทัดตรงรอยต่อระหว่างไฟล์หนังกับไฟล์ซับ */}
            <span className="small" style={{ whiteSpace: "pre-line", textAlign: "center" }} data-sub-accept>{`รับไฟล์หนัง ${MOVIE_EXT.map((e) => e.toUpperCase()).join(" ")}\nและไฟล์ซับ ${SUB_EXT.map((e) => e.toUpperCase()).join(" ")}`}</span>
          </div>
        )}
        {file && !over && err && <div className="stat bad" data-sub-err><CardIcon kind="bad" /><div style={{ flex: 1 }}><b>{err}</b><div className="minirow"><button type="button" className="btn btn-ghost btn-sm" onClick={() => setErr(null)}>ปิด</button></div></div></div>}
        {videoErr && <div className="stat bad" data-sub-videoerr><CardIcon kind="bad" /><div style={{ flex: 1 }}><b>{videoErr}</b><div className="minirow"><button type="button" className="btn btn-ghost btn-sm" onClick={() => setVideoErr(null)}>ปิด</button></div></div></div>}

        {busy ? (
          <div className="card" aria-busy="true" data-sub-busy><Skel w="40%" h={18} /><Skel w="100%" h={34} style={{ marginTop: 10 }} /></div>
        ) : file && file.subs.length === 0 ? (
          <div className="stat info" data-sub-file><CardIcon kind="info" /><div><b>ไฟล์นี้ไม่มีซับในตัว</b><Phr>เพิ่มไฟล์ซับเพื่อดูคู่กับหนังเรื่องนี้</Phr>
            <div className="minirow"><button type="button" className="btn btn-ghost btn-sm" onClick={() => void addSub()} data-sub-addsub-empty><IcFile size={15} />เพิ่มไฟล์ซับ</button></div></div></div>
        ) : null}
        {exp && exp.s !== "busy" && (
          <div className={"stat " + (exp.s === "done" ? "ok" : exp.s === "conflict" ? "warn" : "bad")} data-sub-exp={exp.s}>
            <CardIcon kind={exp.s === "done" ? "ok" : exp.s === "conflict" ? "warn" : "bad"} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <b>{exp.s === "done" ? `Export ${exp.label} แล้ว` : exp.s === "conflict" ? "ในโฟลเดอร์มีไฟล์ชื่อนี้อยู่แล้ว" : `Export ${exp.label} ไม่สำเร็จ`}{exp.s === "failed" && exp.detail && <InfoTip title="ข้อความจากเครื่องมือ" tip={{ w: `บรรทัดสุดท้ายที่เครื่องมือพิมพ์ไว้ตอนหยุด\n${exp.detail}` }} noAbbr plain />}</b>
              <Phr>{exp.s === "failed" ? exp.err : `${nameOf(exp.file)}${exp.s === "done" && exp.pair ? ` และ ${nameOf(exp.pair)}` : ""}${exp.s === "conflict" ? "  ตั้งชื่อใหม่โดยต่อเลขท้าย หรือไม่ Export ไฟล์นี้ ไฟล์เดิมไม่ถูกเขียนทับ" : ""}`}</Phr>
              <div className="minirow">
                {exp.s === "done" && <button type="button" className="btn btn-ghost btn-sm" onClick={() => reveal(exp.file)} data-sub-reveal><IcFolder size={15} />เปิดโฟลเดอร์</button>}
                {exp.s === "conflict" && <>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => void doExport(exp.key, exp.label, exp.item, "number")} data-sub-renum>ตั้งชื่อใหม่</button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setExp(null)} data-sub-skip>ไม่ Export</button></>}
                {exp.s === "failed" && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setExp(null)}>ปิด</button>}
              </div>
            </div>
          </div>
        )}

        {!file && !busy && (
          <div className="small" data-sub-planned>
            <div style={{ marginBottom: 4 }}>สิ่งที่จะเพิ่มในหน้านี้ตามโรดแมป</div>
            <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.8 }}>{PLANNED.map((t) => <li key={t}><Phr>{t}</Phr></li>)}</ul>
          </div>
        )}
        {st && file && !busy && (isImage(st) && !(imgMode === "edit" && ocrDoc)
          ? imgMode === "ocr" ? <OcrPage key={st.key} track={st} movie={file.movie ? file.path : file.video ?? ""} onEdit={() => setImgMode("edit")} />
          : <SubViewer inline onOcr={() => setImgMode("ocr")} tab={subTab} key={`${st.key}|${file.video ?? ""}`} track={st} movie={file.movie ? file.path : file.video ?? ""} refStream={refStream} refIdx={file.refIdx}
            onAddMovie={!file.movie ? () => void addVideo() : undefined} onClose={() => setView(null)} />
          : <SubEditor key={st.key} track={st} tab={subTab} moviePath={file.path} video={file.movie ? file.path : file.video ?? ""} refStream={refStream} refIdx={file.refIdx}
            label={st.inMovie ? `${nameOf(file.path)} ซับที่ ${file.subs.indexOf(st) + 1}` : nameOf(st.src)} fps={file.vid?.fps ?? null} playRes={file.vid?.res ?? null}
            onAddMovie={!file.movie ? () => void addVideo() : undefined} onSettings={onSettings}
            onMovieMoved={(from, to) => setFile((f) => (f && f.movie && f.path === from ? { ...f, path: to } : f))} />)}
      </div>
      <Dialog open={!!guard} onClose={() => { if (!guard?.busy) setGuard(null); }} kind="work" title="ซับที่แก้ยังไม่ได้บันทึก" width={560}
        actions={guard?.busy ? <button type="button" className="btn btn-wait" aria-disabled="true"><Keep all={["กำลังบันทึก…", "บันทึกแล้วไปต่อ"]}>กำลังบันทึก…</Keep></button> : <>
          <button type="button" className="btn btn-ghost" onClick={() => setGuard(null)} data-sub-guard-back>กลับไปแก้ต่อ</button>
          <button type="button" className="btn btn-ghost" onClick={() => { const g = guard; if (!g) return; void autosaveStrict().then(() => { setGuard(null); closeDoc(); g.go(); }, (e) => setGuard({ ...g, busy: false, err: String(e instanceof Error ? e.message : e) })); }} data-sub-guard-skip>ไม่บันทึก</button>
          <button type="button" className="btn btn-main" data-sub-guard-save onClick={async () => {
            const g = guard;
            if (!g) return;
            setGuard({ ...g, busy: true });
            const ok = await requestSave();
            // บันทึกทับไม่ได้ทันที (ต้องเลือกชื่อไฟล์ใหม่ หรือไฟล์ถูกแก้จากที่อื่น) ปิดหน้าต่างนี้ ให้หน้าต่างของหน้าแก้ซับถามต่อ
            if (ok === true) { setGuard(null); closeDoc(); g.go(); } else if (ok === null) setGuard({ ...g, busy: false, err: "ยังไม่มีหน้าแก้ซับให้บันทึก" }); else setGuard(null);
          }}><Keep all={["กำลังบันทึก…", "บันทึกแล้วไปต่อ"]}>บันทึกแล้วไปต่อ</Keep></button>
        </>}>
        <div className="small" style={{ fontSize: 14, color: "var(--txt2)" }}><Phr>{`แก้ ${getSubEdit().meta?.name ?? "ซับ"} ไปแล้ว แต่ยังไม่ได้บันทึกลงไฟล์  ถ้าไม่บันทึก โปรแกรมเก็บ${J}ฉบับ${J}บันทึก${J}อัตโนมัติ${J}ไว้ให้  เปิดคืนได้จากปุ่มฉบับอัตโนมัติ`}</Phr></div>
        {guard?.err && <div className="hint e" role="alert" style={{ marginTop: 10 }}>{guard.err}</div>}
      </Dialog>
    </>
  );
}
