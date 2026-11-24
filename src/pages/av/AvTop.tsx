/* แถบชื่อหนังตรึงบน กับช่องลากไฟล์เสียงซับ
   แยกจาก AvPage.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 2) เนื้อโค้ดยกมาทั้งก้อน */
import InfoTip from "../../components/InfoTip";
import { CardIcon, dropClick } from "../../components/ui";
import { pickAddFiles, pickFile, thumbUrl } from "../../lib/api";
import { fmtDuration, fmtSize } from "../../lib/format";
import { IcFile, IbSwap } from "../../components/icons";
import { BUSY, DtLine, dirName } from "./parts";
import type { AvCtx } from "./avCtx";

export default function AvTop({ pg }: { pg: AvCtx }) {
  const { addFiles, covers, inLib, loadMovie, loading, method, movieErr, offIn, over, working } = pg;
  const movie = pg.movie!;
  return (
    <>
        {/* ไฟล์หนัง */}
        <div className="avtop" data-drop="movie">
          <div className="avchip" data-movie-chip>
            {inLib?.thumb ? <img className="avthumb" src={thumbUrl(inLib.thumb) ?? undefined} alt="" /> : <div className="avthumb" />}
            <div style={{ minWidth: 0 }}>
              <div className="nm">{movie.name}<span className="ext">.{movie.ext}</span></div>
              <div className="meta"><DtLine parts={[dirName(movie.path), fmtSize(movie.size), movie.duration ? fmtDuration(movie.duration) : "",
                `ภาพ ${movie.tracks.filter((t) => t.kind === "video").length} เสียง ${movie.tracks.filter((t) => t.kind === "audio").length} ซับ ${movie.tracks.filter((t) => t.kind === "subtitle").length}`,
                covers.cover.old ? "ปกตั้ง" : "", covers.cover_land.old ? "ปกนอน" : ""]} /></div>
            </div>
          </div>
          <button type="button" className={"btn btn-sm " + (working ? "btn-wait" : "btn-ghost")} aria-disabled={working || undefined} title={working ? BUSY : undefined}
            onClick={async () => { if (working) return; const f = await pickFile("movie"); if (f) loadMovie(f); }}><IbSwap size={15} />เปลี่ยนไฟล์หนัง</button>
          {/* ช่องลากไฟล์เสียงหรือซับอยู่แถวเดียวกับแถบชื่อหนัง ชิดฝั่งขวา แถบนี้ตรึงบนสุด ช่องลากจึงเห็นตลอด (BUGS ข้อ 65 ต่อ พี่กันสั่ง 12 พ.ย. 2569 "เราให้เอาเเถบลากไฟล์เอามาอยู่ตรงขื่อนี้ เอาไง้ฝั่งขวา")
              รอบก่อนแคลร์ทำเป็นแถวแยกใต้แถบชื่อหนัง ไม่ตรงที่สั่ง · รายชื่อไฟล์ที่รับย้ายไปปุ่ม ⓘ ช่องจะได้พอดีแถว */}
          {offIn(method === "extract", <div className={"avdrop" + (over === "add" ? " over" : "")} data-drop="add" onClick={dropClick(async () => { if (working) return; const f = await pickAddFiles(); if (f.length) addFiles(f); })}>
            <span>{over === "add" ? <b>ปล่อยเมาส์เพื่อเพิ่มไฟล์</b> : loading === "add" ? "กำลังอ่านไฟล์…" : <b style={{ color: "var(--txt2)" }}>ลากไฟล์เสียงหรือซับมาวางเพิ่ม</b>}</span>
            <span onClick={(e) => e.stopPropagation()}><InfoTip title="ไฟล์ที่เพิ่มได้" tip={{ w: "รับไฟล์เสียง AC-3 E-AC-3 DTS AAC FLAC WAV MP3 และ Opus ไฟล์ซับ SRT ASS VTT SUP และ IDX กับฟอนต์ของซับ TTF และ OTF ลากมาวางหลายไฟล์พร้อมกันได้" }} /></span>
            <button type="button" className={"btn btn-sm " + (working ? "btn-wait" : "btn-ghost")} aria-disabled={working || undefined} title={working ? BUSY : undefined}
              onClick={async (e) => { e.stopPropagation(); if (working) return; const f = await pickAddFiles(); if (f.length) addFiles(f); }}><IcFile size={15} />เลือกไฟล์จากเครื่อง</button>
          </div>, "ไฟล์ที่เพิ่มใช้ตอนรวมหรือจับคู่")}
        </div>
        {movieErr && <div className="stat bad" role="alert"><CardIcon kind="bad" /><div><b>{movieErr}</b></div></div>}
    </>
  );
}
