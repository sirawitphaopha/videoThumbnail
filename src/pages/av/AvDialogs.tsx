/* หน้าต่างซ้อนของหน้า แผงตั้งค่าเสียง Chapter ตัวดูซับ หาดีเลย์ ครอปรูป และหน้าต่างถาม
   แยกจาก AvPage.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 2) เนื้อโค้ดยกมาทั้งก้อน */
import Dialog from "../../components/Dialog";
import CropDialog from "../../components/CropDialog";
import CodecPanel from "../../components/CodecPanel";
import DelayDialog from "./DelayDialog";
import SubViewer from "../../components/SubViewer";
import ChapterDialog from "./ChapterDialog";
import { CardIcon, Phr, LoadPill } from "../../components/ui";
import { fmtSize } from "../../lib/format";
import { setAv } from "../../lib/avJob";
import { IbBack, IbNext, IcMix } from "../../components/icons";
import { StopDialog, baseName } from "./parts";
import { patch, setDelay } from "./trackOps";
import type { AvCtx } from "./avCtx";

export default function AvDialogs({ pg }: { pg: AvCtx }) {
  const noCheck = !(pg.settings?.checkOutputAfter ?? true);
  const { askDelete, askStop, askVtt, av, chapOpen, codecFor, codecSpeed, crop, delayFor, encs, loading, openCodec, openCover, pct, pressStart, refAudio, run, setAskDelete, setAskStop, setAskVtt, setChapOpen, setCodecFor, setCodecSpeed, setCrop, setDelayFor, setSlot, setSubFor, settings, start, subFor, tracks, vtts } = pg;
  const movie = pg.movie!;
  return (
    <>
      {codecFor && (() => { const ct = tracks.find((t) => t.key === codecFor); return ct ? (
        <CodecPanel track={ct} encoders={encs} speed={codecSpeed} onClose={() => { setCodecFor(null); setCodecSpeed(null); }}
          onApply={(convert, pair, convName) => { patch(ct.key, { convert, pair, convName }); setCodecFor(null); setCodecSpeed(null); }} />) : null; })()}
      {chapOpen && <ChapterDialog open path={movie.path} duration={movie.duration ?? null} edited={av.chapters}
        onClose={() => setChapOpen(false)} onSave={(chapters) => setAv({ chapters })} />}
      {subFor && (() => { const st = tracks.find((t) => t.key === subFor); return st ? (
        <SubViewer track={st} movie={movie.path} refStream={refAudio ? refAudio.ff ?? refAudio.tid : null}
          refIdx={refAudio ? tracks.filter((x) => x.inMovie && x.kind === "audio" && (x.ff ?? x.tid) < (refAudio.ff ?? refAudio.tid)).length : null} onClose={() => setSubFor(null)} />) : null; })()}
      {delayFor && refAudio && (() => { const dt = tracks.find((t) => t.key === delayFor); return dt ? (
        <DelayDialog movie={{ path: movie.path, duration: movie.duration ?? null }} refTrack={refAudio} track={dt} onClose={() => setDelayFor(null)}
          onApply={(d) => { setDelay(dt.key, d); setDelayFor(null); }}
          onSpeed={(pair, d) => { setDelay(dt.key, d); setDelayFor(null); setCodecSpeed(pair.join(">")); openCodec(dt.key); }} />) : null; })()}
      {loading === "cover" && <LoadPill text="กำลังอ่านรูป…" />}
      {crop && (
        <CropDialog key={crop.slot + crop.info.path} info={crop.info} start={crop.start} target={crop.slot} defaultFormat={(settings?.posterFormat ?? "jpg") as "jpg" | "png"} defaultQuality={settings?.jpgQuality ?? 90}
          onCancel={() => setCrop(null)}
          onUse={(c) => { setSlot(crop.slot, { mode: "new", neu: { info: crop.info, choice: c } }); setCrop(null); }}
          onPickImage={(f) => openCover(f, crop.slot)} />
      )}

      {/* ก่อนรวม บอกว่าซับ VTT จะแปลงเป็น SRT (พี่กันสั่ง 7 พ.ย. 2569 *"ระบบจะต้องบอกด้วยนะ ว่าก่อนจะรวม ระบบจะ แปลง vtt เป็น srt เป็น popup ขึ้นก็ได้"*) */}
      <Dialog open={askVtt} onClose={() => setAskVtt(false)} title="ก่อนรวม โปรแกรมจะแปลงซับ VTT เป็น SRT"
        actions={<><button type="button" className="btn btn-ghost btn-sm" onClick={() => setAskVtt(false)}><IbBack size={15} />ย้อนกลับ</button>
          <button type="button" className="btn btn-main btn-sm" onClick={() => { setAskVtt(false); pressStart(true); }} data-vtt-ok><IcMix size={15} />แปลงแล้วรวมต่อ</button></>}>
        <div style={{ fontSize: 14, lineHeight: 1.6 }} data-vtt-dialog>
          {vtts.map((t) => <div key={t.key}><b style={{ overflowWrap: "anywhere" }}>{baseName(t.src)}</b> → SRT</div>)}
          <div style={{ marginTop: 6 }}><Phr>MKV เก็บซับ VTT ได้ แต่โปรแกรมเล่นหลายตัว (mpv และตัวที่ใช้ ffmpeg) ยังอ่านไม่ได้ ซับจะไม่ขึ้น</Phr></div>
          <div><Phr>แปลงเป็น SRT แล้วข้อความกับเวลาเหมือนเดิม หายแค่ตำแหน่งบนจอที่ VTT ตั้งไว้ และไฟล์ VTT เดิมในเครื่องไม่ถูกแก้</Phr></div>
        </div>
      </Dialog>
      {/* ลบไฟล์เดิม ยืนยัน 2 ขั้น (แบบหน้าใส่โปสเตอร์) · กดนอกหน้าต่างไม่ปิด */}
      <Dialog open={askDelete === 1} onClose={() => setAskDelete(0)} title="ลบไฟล์เดิมหลังตรวจผ่าน (ขั้นที่ 1 จาก 2)"
        actions={<><button type="button" className="btn btn-ghost btn-sm" onClick={() => setAskDelete(0)}>ยกเลิก</button><button type="button" className="btn btn-main btn-sm" onClick={() => setAskDelete(2)}><IbNext size={15} />ถัดไป</button></>}>
        {/* ปิดการตรวจไฟล์ใหม่ไว้ ฝั่ง Rust ไม่ลบ ย้ายไปโฟลเดอร์ไฟล์เดิมแทน (outfile.rs finish_output · AUDIT ข้อ 83 · เดิมหน้าต่างบอกเรื่องถังขยะทุกครั้ง) */}
        {noCheck && <div className="stat warn" style={{ marginBottom: 10 }} data-delete-nocheck><CardIcon kind="warn" /><div><b>ตอนนี้ปิดการตรวจไฟล์ใหม่หลังรวมไว้</b><Phr>ไฟล์เดิมจะไม่ลงถังขยะ แต่ย้ายไปโฟลเดอร์ไฟล์เดิมแทน เปิดการตรวจได้ที่หน้าตั้งค่า หัวข้อใส่โปสเตอร์</Phr></div></div>}
        <div style={{ fontSize: 14, lineHeight: 1.6 }}><Phr>{noCheck ? "เมื่อรวมเสร็จ ไฟล์เดิมจะถูกย้ายไปโฟลเดอร์ไฟล์เดิม" : "เมื่อไฟล์ใหม่ตรวจผ่าน ไฟล์เดิมจะถูกย้ายไปถังขยะของ Windows"}</Phr><br /><b>{baseName(movie.path)}</b> ขนาด <span className="nw">{fmtSize(movie.size)}</span>{!noCheck && <><br /><Phr>ถ้าไฟล์ใหม่ตรวจไม่ผ่าน ไฟล์เดิมไม่ถูกลบ</Phr></>}</div>
      </Dialog>
      <Dialog open={askDelete === 2} onClose={() => setAskDelete(1)} title="ยืนยันอีกครั้ง (ขั้นที่ 2 จาก 2)" splitActions
        actions={<><button type="button" className="btn btn-danger btn-sm" onClick={() => { setAskDelete(0); start(); }}>ยืนยันลบ</button><button type="button" className="btn btn-ghost btn-sm" onClick={() => setAskDelete(1)}><IbBack size={15} />ย้อนกลับ</button></>}>
        <div style={{ fontSize: 14, lineHeight: 1.6 }}>{noCheck
          ? <>ย้ายไฟล์เดิม <b>{baseName(movie.path)}</b> <Phr>ไปโฟลเดอร์ไฟล์เดิมหลังรวมเสร็จ</Phr><br /><Phr>ไฟล์ยังอยู่ในเครื่อง ไดรฟ์ไม่ได้ที่ว่างคืนจนกว่าจะลบเอง</Phr></>
          : <>ลบไฟล์เดิม <b>{baseName(movie.path)}</b> <Phr>หลังตรวจไฟล์ใหม่ผ่าน</Phr><br /><Phr>กู้คืนได้จากถังขยะของ Windows จนกว่าจะล้างถังขยะ</Phr></>}</div>
      </Dialog>
      <StopDialog open={askStop && !(run.state === "working" && run.progress?.final)} pct={pct} name={av.runMovie} onClose={() => setAskStop(false)} />
    </>
  );
}
