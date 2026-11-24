/* หน้าต่างซ้อนของหน้าใส่โปสเตอร์ รายละเอียดงาน ครอป ทิ้งแทร็กที่ใส่ MP4 ไม่ได้ ลบไฟล์เดิม หยุดงาน
   แยกจาก PosterPage.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 8) เนื้อโค้ดยกมาทั้งก้อน */
import Dialog from "../../components/Dialog";
import ImageViewer from "../../components/ImageViewer";
import CropDialog from "../../components/CropDialog";
import { CardIcon, LoadPill, Phr } from "../../components/ui";
import { posterApi } from "../../lib/api/index";
import { fmtSize } from "../../lib/format";
import { IbBack, IbNext, IbStop } from "../../components/icons";
import { FolderImages, baseName, kindWord, trackTitle } from "./parts";
import type { PoCtx } from "./posterCtx";

export default function PosterDialogs({ pg }: { pg: PoCtx }) {
  const { ack, askDelete, askMp4, askStop, big, choice, cropOpen, drop, listOpen, loadPoster, loading, movie, moviePath, mp4Bad, mp4VideoBad, pct, pendingDrop, poster, pressStart, rendering, run, runMode, runMore, setAck, setAskDelete, setAskMp4, setAskStop, setBig, setChoice, setCropOpen, setDrop, setListOpen, setOne, setPoster, setRunMore, setUserCrop, settings, start } = pg;
  return (
    <>

      {loading === "poster" && <LoadPill text="กำลังอ่านรูป…" />}
      {loading === "movie" && <LoadPill text="กำลังอ่านไฟล์หนัง…" />}
      {rendering && <LoadPill text="กำลังทำรูป…" />}
      {runMore && (
        <Dialog open onClose={() => setRunMore(null)} width={520} title={runMore.title} actions={<button type="button" className="btn btn-ghost btn-sm" onClick={() => setRunMore(null)}>ปิด</button>}>
          <div data-run-detail style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 14, overflowWrap: "anywhere" }}>{runMore.lines.map((l, i) => <div key={i}><Phr>{l}</Phr></div>)}</div>
        </Dialog>
      )}
      {cropOpen && poster && (
        <CropDialog key={poster.path} info={poster} start={choice} defaultFormat={(settings?.posterFormat ?? "jpg") as "jpg" | "png"} defaultQuality={settings?.jpgQuality ?? 90}
          onCancel={() => { setCropOpen(false); if (!choice) { setPoster(null); posterApi.clear().catch(() => {}); } }}
          onUse={(c) => { setChoice(c); setUserCrop(true); setCropOpen(false); }}
          onPickImage={loadPoster} />
      )}
      <FolderImages open={listOpen} movie={moviePath} format={(settings?.posterFormat ?? "jpg") as "jpg" | "png"} onClose={() => setListOpen(false)}
        onPick={(f) => { setListOpen(false); loadPoster(f); }} />

      {big && <ImageViewer src={big.src} thumb={big.src} originRect={big.rect} info={{ name: big.name }} onClose={() => setBig(null)} />}
      {/* แทร็กที่ใส่ใน MP4 ไม่ได้ · ทำต่อแล้วแทร็กที่ใส่ไม่ได้ถูกทิ้ง ซับ ASS เหลือตัวหนังสือล้วน · มาจากปุ่มเริ่มแล้วเริ่มงานต่อเลย (BUGS ข้อ 57) */}
      {/* ภาพใส่ MP4 ไม่ได้ ทิ้งภาพไม่ได้ เหลือปุ่มกลับไปใช้ MKV อย่างเดียว · เดิมปุ่มทิ้งแทร็กทิ้งภาพไปด้วย ได้ MP4 ที่มีแต่เสียงแต่ขึ้นตรวจผ่าน (AUDIT 12 พ.ย. 2569 ข้อ 7) */}
      <Dialog open={!!askMp4 && mp4Bad.length > 0} onClose={() => setAskMp4(null)} width={520} title={mp4VideoBad ? "ไฟล์นี้ส่งออกเป็น MP4 ไม่ได้" : "บางแทร็กใส่ใน MP4 ไม่ได้เต็มที่"}
        actions={<>
          {!mp4VideoBad && <button type="button" className="btn btn-ghost btn-sm" onClick={() => {
            const nextDrop = drop.concat(mp4Bad.filter((x) => x.mp4 === "no" && x.kind !== "video").map((x) => x.index));
            setDrop(nextDrop); setAck(ack.concat(mp4Bad.filter((x) => x.mp4 === "style").map((x) => x.index)));
            const from = askMp4; setAskMp4(null);
            if (from === "start" && choice && run.state !== "working") pressStart(nextDrop, true);
          }} data-mp4-go>{mp4Bad.some((x) => x.mp4 === "no") ? "ทิ้งแทร็กที่ใส่ไม่ได้แล้วทำต่อ" : "ทำต่อด้วย MP4"}</button>}
          <button type="button" className="btn btn-main btn-sm" onClick={() => { setDrop([]); setAck([]); setOne({ outputFormat: "mkv" }); setAskMp4(null); }} data-mp4-mkv><IbBack size={15} />กลับไปใช้ MKV</button>
        </>}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }} data-mp4warn>
          {mp4Bad.map((x) => (
            <div key={x.index} className="stat warn"><CardIcon kind="warn" /><div><b>{trackTitle(x)}</b><Phr>{x.mp4 === "style" ? (x.why ?? "") : x.kind === "video" ? `ภาพเป็นชนิด ${x.codec} ไฟล์ MP4 ต้องมีภาพ จึงต้องใช้ MKV แทน` : `${x.why ?? ""} ถ้าทำต่อ ${kindWord(x.kind)}นี้จะหายจากไฟล์ใหม่`}</Phr></div></div>
          ))}
        </div>
      </Dialog>

      {/* ลบไฟล์เดิม ยืนยัน 2 ขั้น (ต้นแบบบรรทัด 917–930) · กดนอกหน้าต่างไม่ปิด */}
      <Dialog open={askDelete === 1} onClose={() => setAskDelete(0)} title="ลบไฟล์เดิมหลังตรวจผ่าน (ขั้นที่ 1 จาก 2)"
        actions={<><button type="button" className="btn btn-ghost btn-sm" onClick={() => setAskDelete(0)}>ยกเลิก</button><button type="button" className="btn btn-main btn-sm" onClick={() => setAskDelete(2)}><IbNext size={15} />ถัดไป</button></>}>
        <div style={{ fontSize: 14, lineHeight: 1.6 }}><Phr>เมื่อไฟล์ใหม่ตรวจผ่าน ไฟล์เดิมจะถูกย้ายไปถังขยะของ Windows</Phr><br /><b>{movie ? baseName(movie.path) : ""}</b> ขนาด <span className="nw">{movie ? fmtSize(movie.size) : ""}</span><br /><Phr>ถ้าไฟล์ใหม่ตรวจไม่ผ่าน ไฟล์เดิมไม่ถูกลบ</Phr></div>
      </Dialog>
      <Dialog open={askDelete === 2} onClose={() => setAskDelete(1)} title="ยืนยันอีกครั้ง (ขั้นที่ 2 จาก 2)" splitActions
        actions={<><button type="button" className="btn btn-danger btn-sm" onClick={() => { setAskDelete(0); start(pendingDrop.current ?? drop); pendingDrop.current = null; }}>ยืนยันลบ</button><button type="button" className="btn btn-ghost btn-sm" onClick={() => setAskDelete(1)}><IbBack size={15} />ย้อนกลับ</button></>}>
        <div style={{ fontSize: 14, lineHeight: 1.6 }}>ลบไฟล์เดิม <b>{movie ? baseName(movie.path) : ""}</b> <Phr>หลังตรวจไฟล์ใหม่ผ่าน</Phr><br /><Phr>กู้คืนได้จากถังขยะของ Windows จนกว่าจะล้างถังขยะ</Phr></div>
      </Dialog>
      {/* ยืนยันหยุด */}
      <Dialog open={askStop} onClose={() => setAskStop(false)} title={runMode === "cover" ? "ยืนยันหยุดเปลี่ยนโปสเตอร์" : runMode === "mp4" ? "ยืนยันหยุดส่งออก MP4" : "ยืนยันหยุดครอบไฟล์"}
        actions={<><button type="button" className="btn btn-ghost btn-sm" onClick={() => setAskStop(false)}><IbNext size={15} />ทำต่อ</button><button type="button" className="btn btn-bad btn-sm" onClick={() => { setAskStop(false); posterApi.cancel(); }}><IbStop size={15} />หยุด</button></>}>
        <div style={{ fontSize: 14, lineHeight: 1.6 }}>{runMode === "cover"
          ? <><Phr>ยังไม่ได้เปลี่ยนรูปแนบ หยุดตอนนี้</Phr> <Phr>{`ไฟล์เดิม ${movie ? baseName(movie.path) : ""} ไม่ถูกแตะ`}</Phr></>
          : <><Phr>{`ไฟล์ใหม่ที่ทำไปได้ ${pct}% จะถูกลบทิ้ง`}</Phr> <Phr>{`ไฟล์เดิม ${movie ? baseName(movie.path) : ""} ไม่ถูกแตะ`}</Phr></>}</div>
      </Dialog>
    </>
  );
}
