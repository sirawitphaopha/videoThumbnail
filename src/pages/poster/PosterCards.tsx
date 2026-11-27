/* การ์ดสามช่อง ไฟล์หนัง รูปโปสเตอร์ และผลลัพธ์
   แยกจาก PosterPage.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 8) เนื้อโค้ดยกมาทั้งก้อน */
import { CardIcon, Phr, Seg, dropClick } from "../../components/ui";
import ThaiInput from "../../components/ThaiInput";
import { pickFile, posterApi, thumbUrl } from "../../lib/api/index";
import { fmtDuration, fmtSize } from "../../lib/format";
import { ftName } from "../../lib/ftypes";
import { IbCrop, IcClose, IcFile, IcFolder, IcPoster } from "../../components/icons";
import { BUSY, Btn, baseName } from "./parts";
import type { PoCtx } from "./posterCtx";

export default function PosterCards({ pg }: { pg: PoCtx }) {
  const { bigBtn, choice, frameUrl, inLib, loadMovie, loadPoster, loading, mode, movie, movieErr, moviePath, nameProblem, newAr, newExt, newName, newStem, output, over, poster, posterErr, rechoose, rendering, setChoice, setCropOpen, setListOpen, setPoster, setPosterErr, setTyped, setUserCrop, userCrop, working } = pg;
  return (
    <>
        <div className="three">
          {/* ① ไฟล์หนัง */}
          <div className="card" data-card="movie">
            <h3><span className="step">1</span>ไฟล์หนัง</h3>
            {movie && !movieErr && over !== "movie" ? (
              <>
                <div className="vfile" data-drop="movie">
                  <div className="pbigwrap">
                    {inLib?.thumb ? <img className="vthumb cover" src={thumbUrl(inLib.thumb) ?? undefined} alt="" data-moviethumb /> : frameUrl ? <img className="vthumb" src={thumbUrl(frameUrl) ?? undefined} alt="ภาพจากหนัง" data-moviethumb /> : <div className="vthumb" data-moviethumb />}
                    {bigBtn(inLib?.thumb ? thumbUrl(inLib.thumb) : frameUrl ? thumbUrl(frameUrl) : null, movie ? baseName(movie.path) : "ไฟล์หนัง")}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, lineHeight: 1.5, wordBreak: "break-word" }}><Phr>{baseName(movie.path)}</Phr></div>
                    <div className="small"><span className="nw">{fmtSize(movie.size)}</span>{movie.duration ? <> ยาว <span className="nw">{fmtDuration(movie.duration)}</span></> : null}<br />{/* ขนาดภาพกับ codec ใช้คำอังกฤษทั่วไป (BUGS ข้อ 64 พี่กันสั่ง 12 พ.ย. 2569 "ขนาดภาพ เเละ codec ขอภาษษอังกิต ที่คำทั่วไป" · ข้อ 64 ต่อ "เอา res ออก ใส่ px") */}<span className="nw">{movie.width} × {movie.height} px</span>{movie.streams.find((x) => x.kind === "video") && <>, Codec <span data-moviecodec>{ftName("video", movie.streams.find((x) => x.kind === "video")!.codec)}</span></>}{movie.streams.some((x) => x.kind === "audio") && <><br />เสียง <span data-movieaudio>{[...new Set(movie.streams.filter((x) => x.kind === "audio").map((x) => ftName("audio", x.codec)))].join(", ")}</span></>}</div>
                    <div className="small">ลากไฟล์อื่นมาวางทับเพื่อเปลี่ยนได้</div>
                  </div>
                </div>
                <Btn off={working && BUSY} style={{ marginTop: 10 }} onClick={async () => { const f = await pickFile("movie"); if (f) loadMovie(f); }}><IcFile size={15} />เลือกไฟล์จากเครื่อง</Btn>
              </>
            ) : (
              <>
                <div className={"drop" + (over === "movie" ? " over" : movieErr ? " bad" : "")} data-drop="movie" onClick={dropClick(async () => { if (working) return; const f = await pickFile("movie"); if (f) loadMovie(f); })}>
                  {over === "movie" ? <b>ปล่อยเมาส์เพื่อใส่ไฟล์นี้</b>
                    : movieErr ? <><b>{movieErr}</b><div><Phr>ไฟล์หนังรองรับ MKV MP4 M4V MOV AVI WebM TS M2TS MPG MPEG VOB FLV</Phr></div></>
                    : loading === "movie" ? "กำลังอ่านไฟล์หนัง…" : <>ลากไฟล์หนังมาวางตรงนี้<br />MKV MP4 และอีก 10 ชนิด</>}
                  <Btn off={working && BUSY} onClick={async () => { const f = await pickFile("movie"); if (f) loadMovie(f); }}><IcFile size={15} />เลือกไฟล์จากเครื่อง</Btn>
                </div>
              </>
            )}
            <div className="small pcap" style={{ marginTop: 10 }}><div>รองรับ MKV MP4 M4V MOV<br />AVI WebM TS M2TS MPG MPEG VOB และ FLV</div></div>
          </div>

          {/* ② รูปโปสเตอร์ */}
          <div className="card" data-card="poster">
            <h3><span className="step">2</span>รูปโปสเตอร์</h3>
            {poster && choice && !posterErr && over !== "poster" ? (
              <div className="pprev" data-drop="poster">
                <div className="pbigwrap">
                  <img className="pp" src={thumbUrl(choice.render.preview) ?? undefined} alt="รูปโปสเตอร์ที่จะแนบ" data-pp />
                  {bigBtn(thumbUrl(choice.render.preview), poster.name)}
                </div>
                <div className="ppinfo">
                <div className="small" style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ wordBreak: "break-all" }}>{poster.name}</span><br />
                  {poster.attachable ? <><span className="extag ok">.{poster.ext}</span> แนบได้เลย</> : <><span className="extag extcv">.{poster.ext}→.{choice.format}</span> แปลงให้ก่อนแนบ</>}<br />
                  <span className="nw">{choice.render.width} × {choice.render.height} px</span> ขนาด <span className="nw">{fmtSize(choice.render.bytes)}</span><br />
                  <span className="ppmode">{choice.geo.aspect === "wide" ? "ครอปเป็นปกนอน 16 : 9 แล้ว" : poster.twoThree ? "สัดส่วน 2 : 3 พอดีปก" : choice.geo.mode === "pad" ? "เติมขอบให้เต็มปก" : choice.geo.mode === "original" ? "ใช้ตามรูปเดิม ไม่ตัด" : "ครอปให้พอดีปกแล้ว"}<br /></span>
                  {/* กติกาเดียวกับ poster.rs กว้างมากกว่าสูงเป็นปกนอน นอกนั้นปกตั้ง · MP4 ไม่มีชื่อไฟล์แนบ ฝังเป็นรูปปกของไฟล์ */}
                  <span data-attach-name><b style={{ color: "var(--txt)" }}>{choice.render.width > choice.render.height ? "ปกนอน" : "ปกตั้ง"}</b> {output === "mp4" ? "ฝังเป็นรูปปกของ MP4" : <>แนบเป็น <span className="nw">{choice.render.width > choice.render.height ? "cover_land" : "cover"}.{choice.format}</span></>}</span>
                </div>
                <span className="ppbtns">
                  {/* สามปุ่มชุดเดียวกับช่องปกของหน้าเสียงและซับ (BUGS ข้อ 59 พี่กันสั่ง 12 พ.ย. 2569 "เอาสามอัน เปลี่ยนรูป ครอบ/แปลงภาพ เเละ เอาออก เเละใส่ icon ด้วย" · ข้อ 59 ต่อ "เราเอาคำเดียว จะเอารูป หรือ ภาพ" ใช้ รูป) */}
                  <Btn off={working && BUSY} onClick={() => setListOpen(true)}><IcPoster size={15} />เปลี่ยนรูป</Btn>
                  <Btn off={working && BUSY} onClick={() => setCropOpen(true)}><IbCrop size={15} />ครอป/แปลงรูป</Btn>
                  <Btn off={working && BUSY} onClick={() => { setPoster(null); setChoice(null); setPosterErr(null); setUserCrop(false); posterApi.clear().catch(() => {}); }}><IcClose size={15} />เอารูปออก</Btn>
                </span>
                </div>
              </div>
            ) : (
              <>
                <div className={"drop" + (over === "poster" ? " over" : posterErr ? " bad" : "")} data-drop="poster" onClick={dropClick(async () => { if (working) return; const f = await pickFile("image"); if (f) loadPoster(f); })}>
                  {over === "poster" ? <b>ปล่อยเมาส์เพื่อใส่รูปนี้</b>
                    : posterErr ? <><b>{posterErr.split(/ · |  /)[0]}</b><div><Phr>รับรูป JPG PNG WebP BMP TIFF และ HEIC</Phr></div></>
                    : loading === "poster" ? "กำลังอ่านรูป…" : <>{movie && !poster && <b data-moviefirst>ไฟล์หนังใส่ให้แล้ว เหลือรูปโปสเตอร์</b>}ลากรูปโปสเตอร์มาวางตรงนี้<br />JPG PNG WebP BMP TIFF และ HEIC</>}
                  {/* ใส่หนังแล้วมีสองปุ่ม ปุ่มแรกใช้คำสั้น ระยะขอบในปุ่ม 6 จุด (app.css) ให้อยู่แถวเดียวที่หน้าต่าง 1280 */}
                  <span style={{ display: "flex", gap: 6, justifyContent: "center", flexWrap: "wrap" }} data-pickrow>
                    <Btn off={working && BUSY} onClick={async () => { const f = await pickFile("image"); if (f) loadPoster(f); }}><IcPoster size={15} />{moviePath ? "เลือกจากเครื่อง" : "เลือกรูปจากเครื่อง"}</Btn>
                    {moviePath && <Btn off={working && BUSY} onClick={() => setListOpen(true)}><IcFolder size={15} />รูปในโฟลเดอร์หนัง</Btn>}
                  </span>
                </div>
              </>
            )}
            {/* รูปไม่ใช่ 2:3 เลือกแบบปกบนการ์ดได้เลย (สเปกข้อ 7 · เดิมบอกแค่แบบที่เลือกไว้ ต้องเปิดหน้าต่างครอปถึงเปลี่ยนได้ ผู้ช่วยตรวจสเปกเจอ) · ตามรูปเดิม พี่กันสั่งเพิ่ม */}
            {/* ปกนอน 16 : 9 ที่ส่งมาจากปกจับคู่ ครอปไว้แล้วเหมือนครอปเอง ไม่ขึ้นการ์ดเลือกแบบ · เดิมกดตัดพอดีหรือเติมขอบแล้วรูปบีบหรือกลายเป็นปกตั้ง (AUDIT 12 พ.ย. 2569 ข้อ 8) */}
            {poster && !poster.twoThree && choice && !userCrop && choice.geo.aspect !== "wide" && (
              <div className="stat warn" style={{ marginTop: 12, flexWrap: "wrap" }} data-not23><CardIcon kind="warn" /><div style={{ flex: 1, minWidth: 0 }}><b>รูปนี้เป็น{poster.aspect.replace(/^รูป/, "")}</b></div>
                <div className="not23seg">
                  <Seg small label="แบบปก" value={choice.geo.mode} onChange={(v) => { if (!working && !rendering) rechoose({ mode: v }); }} disabledReason={working ? "รอให้งานที่ทำอยู่เสร็จก่อน" : undefined}
                    options={[{ value: "crop", label: <><IbCrop size={14} />ตัดพอดี</> }, { value: "pad", label: <><IcPoster size={14} />เติมขอบ</> }, { value: "original", label: <><IcFile size={14} />ตามรูปเดิม</> }]} />
                </div></div>
            )}
            {/* รูปที่แนบใน MKV ตรง ๆ ไม่ได้ (สเปกข้อ 7 ส่วนแปลงชนิดรูป) · แจ้งสั้น ๆ ชื่อรูปกับนามสกุลที่จะได้ เหตุผลกับปุ่มเลือก JPG PNG อยู่ในหน้าครอปที่เลือกไปแล้ว
                เดิมมีปุ่มเลือกซ้ำในการ์ดนี้ (BUGS ข้อ 55 พี่กันสั่ง 12 พ.ย. 2569 "เราเลือกการแปลงเเเล้วเราจะมาให้กดอีกรอบทำไม" · "ถ้าจะเเจ้งที่หน้าหลัก ก็สั้นๆ") */}
            {poster && !poster.attachable && choice && (
              <div className="stat warn" style={{ marginTop: 12 }} data-convert><CardIcon kind="warn" /><div style={{ minWidth: 0 }}><b style={{ wordBreak: "break-all" }}>{poster.name} ต้องแปลงก่อนแนบ</b>
                <div>นามสกุลเดิม <span className="extag extcv">.{poster.ext} → .{choice.format}</span></div></div></div>
            )}
            <div className="small pcap" style={{ marginTop: 10 }}><div>JPG และ PNG แนบได้เลย<br />ส่วน WebP BMP TIFF และ HEIC จะแปลงให้ก่อนแนบ</div></div>
          </div>

          {/* ③ หน้าตาที่จะได้ */}
          <div className="card" data-card="result">
            <h3><span className="step">3</span>หน้าตาที่จะได้</h3>
            <div className="resbox">
              <div className={"resmain" + (mode === "cover" && inLib?.thumb && choice ? " two" : "")} style={{ "--sum": 2 / 3 + newAr } as React.CSSProperties}>
              {mode === "cover" && inLib?.thumb && choice && (
                <div style={{ textAlign: "center" }}><img className="mc" src={thumbUrl(inLib.thumb) ?? undefined} alt="ปกเดิม" /><div className="small" style={{ marginTop: 6 }}>ปกเดิม</div></div>
              )}
              <div style={{ textAlign: "center" }}>
                {choice ? <span className="pbigwrap res"><img className="mc" style={{ "--ar": newAr } as React.CSSProperties} src={thumbUrl(choice.render.preview) ?? undefined} alt="ปกใหม่" data-newcover />{bigBtn(thumbUrl(choice.render.preview), "หน้าตาที่จะได้")}</span> : <div className="mc none" />}
                {mode === "cover" && inLib?.thumb && choice && <div className="small" style={{ marginTop: 6 }}>ปกใหม่</div>}
              </div>
              </div>
              <div className="small rescap pcap" style={{ minWidth: 0 }}><div>
                ตัวอย่างหน้าตาบนชั้นวางของโปรแกรมนี้<br />
                {movie ? (mode === "cover" ? <>ไฟล์เดิม<br /><b style={{ color: "var(--txt)", wordBreak: "break-word" }}><Phr>{newName}</Phr></b><br /><b style={{ color: "var(--txt)" }}><Phr>ไฟล์เป็น MKV อยู่แล้ว เปลี่ยนแค่รูปแนบ ไม่ต้องครอบใหม่</Phr></b></>
                  : <>ไฟล์ใหม่ ตั้งชื่อได้
                    <div data-newname><ThaiInput value={newStem} onChange={setTyped} label={"ชื่อไฟล์ใหม่ ไม่รวมนามสกุล " + newExt} suffix={newExt} err={!!nameProblem} readOnly={working} describedBy="newname-hint" /></div>
                    {nameProblem
                      ? <div id="newname-hint" className="pnerr" role="alert" data-newname-err><Phr>{nameProblem.title}</Phr></div>
                      : <div id="newname-hint">ขนาดราว <span className="nw">{fmtSize(movie.size + (choice?.render.bytes ?? 0))}</span> เท่าเดิม</div>}</>)
                  : choice ? "ใส่ไฟล์หนังก่อนจึงจะเห็นตัวอย่าง" : "ใส่ไฟล์หนังกับรูปโปสเตอร์ก่อนจึงจะเห็นตัวอย่าง"}
              </div></div>
            </div>
          </div>
        </div>
    </>
  );
}
