/* หน้า OCR ตอนกำลังเปิดซับรูป กับตอนเปิดไม่ได้หรือกดยกเลิก (แยกจาก OcrPage.tsx ตอนทำ BUGS ข้อ 162.8)
   หนังยาวต้องรอ ffmpeg หรือ mkvextract อ่านทั้งไฟล์ กดยกเลิกได้ระหว่างรอ แล้วกดเปิดใหม่ได้ (ผู้ช่วยตรวจทาน R23) */
import { CardIcon, Phr, Skel } from "../../components/ui";
import { isImgCancelled, subApi } from "../../lib/api";

export function OcrOpening(p: { percent: number }) {
  return (
    <section className="card ocr-page" data-ocr-page aria-busy="true">
      <Skel w="100%" h={38} /><Skel w="100%" h={240} style={{ marginTop: 8 }} />
      <div className="minirow ocr-opening">
        <span className="small"><Phr>{`${p.percent >= 85 ? "กำลังเก็บภาพซับ" : "กำลังอ่านภาพซับจากไฟล์"} ${p.percent}%`}</Phr></span>
        <button type="button" className="btn btn-ghost btn-sm" title="หยุดอ่านซับรูปจากไฟล์" onClick={() => void subApi.cancelImages()} data-ocr-open-cancel>ยกเลิก</button>
      </div>
    </section>);
}

export function OcrOpenError(p: { error: string; onRetry: () => void }) {
  if (isImgCancelled(p.error)) return (
    <section className="card ocr-page" data-ocr-page><div className="stat info" data-ocr-open-cancelled><CardIcon kind="info" /><div><b>ยกเลิกการเปิดซับรูปแล้ว</b>
      <Phr>{"ภาพที่อ่านไปแล้วไม่ได้เก็บไว้ เปิดใหม่ต้องอ่านจากต้นไฟล์"}</Phr>
      <div className="minirow"><button type="button" className="btn btn-ghost btn-sm" onClick={p.onRetry} data-ocr-open-retry>เปิดใหม่</button></div></div></div></section>);
  return <section className="card ocr-page" data-ocr-page><div className="stat bad"><CardIcon kind="bad" /><div><b>เปิดซับรูปไม่ได้</b><Phr>{p.error}</Phr></div></div></section>;
}
