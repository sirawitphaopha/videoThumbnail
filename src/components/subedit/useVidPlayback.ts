/* เล่นหนัง เล่นเฉพาะบรรทัด ส่งซับที่แก้ให้ mpv และดึงภาพตรงเฟรม
   แยกจาก SubVideo.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 10) เนื้อโค้ดยกมาทั้งก้อน */
import { useEffect, useRef } from "react";
import { subApi, subDocApi } from "../../lib/api";
import { useSettings } from "../../lib/settings";
import { cachedFrame, frameImage, prefetch } from "../../lib/vidFrames";
import { getVidPlay, mpvSubUpdate, setPlayToggle, startVidPlay, stopVidPlay, useVidPlay, type PlayOpts } from "../../lib/vidPlay";
import type { Vd0 } from "./vidCtx";

export function useVidPlayback(hk: Vd0) {
  const { d, fr, lastPos, p, reqH, setFail, setImg, src, st, t } = hk;
  const pos = st.pos;
  const movie = src.kind === "movie" ? src.path : "";
  const vp = useVidPlay();
  const playing = vp.playing;
  const { settings } = useSettings();
  // ตัวเล่นตามหน้าตั้งค่า · แบบ mpv ส่งซับที่กำลังแก้ทั้งไฟล์ (ฉบับล่าสุดตอนกด) กับดีเลย์ของซับไปด้วย
  const docRef = useRef(p.doc);
  docRef.current = p.doc;
  const opts = (): PlayOpts => ({ engine: settings?.subPlayer === "aegisub" ? "aegisub" : "mpv", sub: () => subDocApi.render(docRef.current), delayMs: d });
  // เล่นหนัง · แบบ Aegisub ภาพที่ขอสูงไม่เกิน 720 จุด ถอดทันเวลาจริง
  const togglePlay = () => {
    if (getVidPlay().playing) { stopVidPlay(); return; }
    if (!movie || !t || !fr || pos == null) return;
    void startVidPlay(movie, t, fr, pos, p.audio, Math.min(reqH, 720), opts());
  };
  // เล่นเฉพาะบรรทัดที่กำลังแก้ (VideoController::PlayLine) เริ่มที่เฟรมแรกของบรรทัด หยุดก่อนเฟรมถัดจากเฟรมสุดท้ายของบรรทัด เสียงเล่นถึงเวลาจบ
  // เวลาภาพ = เวลาซับ + ดีเลย์ · ภาพที่เห็นไม่ย้ายก่อนเล่น เล่นจบแล้วภาพค้างที่เฟรมสุดท้ายที่เล่น
  const playLine = () => {
    const e = p.ev;
    if (!e || !movie || !t || !fr) return;
    const s = fr.frameAt(e.start + d, "start");
    const endFrame = fr.frameAt(e.end + d, "end") + 1;
    void startVidPlay(movie, t, fr, s, p.audio, Math.min(reqH, 720), { ...opts(), endFrame, endMs: e.end + d });
  };
  const toggleRef = useRef(togglePlay);
  toggleRef.current = togglePlay;
  useEffect(() => { setPlayToggle(() => toggleRef.current()); return () => setPlayToggle(null); }, []);
  // ระหว่างเล่น ภาพย้ายเพราะอย่างอื่น (เลือกบรรทัดตอนเปิด AUTO ข้ามไปยัง) เล่นต่อจากตำแหน่งใหม่
  useEffect(() => { if (getVidPlay().playing && movie && t && fr && pos != null) void startVidPlay(movie, t, fr, pos, p.audio, Math.min(reqH, 720), opts()); }, [pos]); // eslint-disable-line react-hooks/exhaustive-deps
  // แก้ซับระหว่างเล่นแบบ mpv ส่งฉบับใหม่ให้ mpv หลังหยุดพิมพ์ครู่หนึ่ง
  useEffect(() => {
    if (!playing || vp.engine !== "mpv" || !t) return;
    const tm = setTimeout(() => { subDocApi.render(p.doc).then((x) => mpvSubUpdate(x, t, d), () => {}); }, 300);
    return () => clearTimeout(tm);
  }, [p.doc, d]); // eslint-disable-line react-hooks/exhaustive-deps
  // เปลี่ยนหนัง ปิดวิดีโอ ออกจากหน้า หยุดเล่น
  useEffect(() => () => stopVidPlay(), [movie]);
  // ภาพตรงเฟรม · เฟรมที่เก็บไว้แล้วขึ้นทันที ที่เหลือรอนิดหนึ่งก่อนดึง กดเดินเร็ว ๆ ไม่ดึงทุกเฟรม
  useEffect(() => {
    if (!movie) { setImg(null); return; }
    if (t && pos != null) {
      const dir: 1 | -1 = lastPos.current != null && pos < lastPos.current ? -1 : 1;
      lastPos.current = pos;
      const hit = cachedFrame(movie, reqH, pos);
      if (hit) { setImg(hit); setFail(false); prefetch(movie, t, pos, reqH, dir); return; }
      let live = true;
      const tm = setTimeout(() => frameImage(movie, t, pos, reqH, dir).then((u) => { if (live) { setImg(u); setFail(false); prefetch(movie, t, pos, reqH, dir); } }, () => { if (live) setFail(true); }), 60);
      return () => { live = false; clearTimeout(tm); };
    }
    // ยังอ่านเวลาเฟรมไม่เสร็จ ใช้ภาพตามเวลาเริ่มของบรรทัดไปก่อน
    if (!p.ev) return;
    const at = Math.max(0, p.ev.start + d + Math.min(300, (p.ev.end - p.ev.start) / 2));
    let live = true;
    const tm = setTimeout(() => subApi.frame(movie, at / 1000, reqH).then((u) => { if (live) { setImg(u); setFail(false); } }, () => { if (live) setFail(true); }), 120);
    return () => { live = false; clearTimeout(tm); };
  }, [movie, t, pos, reqH, p.ev?.id, p.ev?.start]); // eslint-disable-line react-hooks/exhaustive-deps
  return { pos, movie, vp, playing, settings, docRef, opts, togglePlay, playLine, toggleRef };
}
