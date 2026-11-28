/* เล่นเสียงจากกราฟ (BUGS ข้อ 163.4 · ROADMAP ข้อ 35) แถบเล่น ขีดตำแหน่งเล่น แถบวัดระดับเสียง และตัวผูกกับหน้ากราฟ
   ตัวเล่นอยู่ src/lib/graphPlay.ts · ปุ่มเปิดเล่นเดิม (เปิดโปรแกรมเล่นข้างนอก) คงไว้ตามที่พี่กันเคาะ
   ขีดกับตัวเลขเวลาขยับด้วย requestAnimationFrame เขียนลงชิ้นตรง ๆ ไม่วาดหน้ากราฟใหม่ทุกเฟรม */
import { useEffect, useRef } from "react";
import InfoTip from "../../components/InfoTip";
import type { Tip } from "../../lib/codecAdv";
import { IbPlay, IbStop } from "../../components/icons";
import { hk, keysText } from "../../lib/keymap";
import { useHotkeys } from "../../lib/hotkeys";
import { usePageActiveRef } from "../../lib/pageActive";
import { gLevels, gNow, gPlay, gSetMuted, gSetVol, gStop, getGPlay, useGPlay } from "../../lib/graphPlay";
import { tfmtD } from "./common";
import { Keep } from "../../components/ui";

/** คำบนปุ่มเล่น · ปุ่มกว้างเท่าคำที่ยาวที่สุดเสมอ ไม่หดขยายตอนสลับ */
const PLAY_LBL = ["เล่นในหน้านี้", "หยุด"];

/** ความสูงแถบเล่นรวมช่องห่างของแถบบน · หักออกจากความสูงกราฟ หน้าไม่ล้น */
export const PLAYBAR_H = 42;

/** วนเฟรมเฉพาะตอนเล่น · fn ได้เวลาที่เล่น (null = ไม่ได้เล่น) */
function useFrames(fn: (now: number | null) => void, playing: boolean) {
  const f = useRef(fn); f.current = fn;
  useEffect(() => {
    f.current(gNow());
    if (!playing) return;
    let id = 0;
    const tick = () => { f.current(gNow()); id = requestAnimationFrame(tick); };
    id = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(id); f.current(null); };
  }, [playing]);
}

/** ขีดตำแหน่งเล่นบนกราฟ · วางในกล่องที่มี position relative ขอบซ้ายขวาเท่ากับขอบของกราฟ */
export function PlayHead({ t0, t1, left, right, top = 0, bottom = 0 }: { t0: number; t1: number; left: number; right: number; top?: number; bottom?: number }) {
  const { playing } = useGPlay();
  const ref = useRef<HTMLDivElement>(null);
  const span = useRef({ t0, t1, left, right }); span.current = { t0, t1, left, right };
  useFrames((now) => {
    const el = ref.current; if (!el) return;
    const s = span.current, box = el.parentElement;
    if (now == null || !box || now < s.t0 || now > s.t1) { el.style.display = "none"; return; }
    const W = box.clientWidth - s.left - s.right;
    el.style.display = "block";
    el.style.left = `${s.left + (now - s.t0) / (s.t1 - s.t0 || 1) * W}px`;
  }, playing);
  return <div className="gp-head" ref={ref} style={{ display: "none", top, bottom }} aria-hidden="true" data-playhead />;
}

/** แถบวัดระดับเสียงแนวตั้งของช่อง ch · เขียว เหลือง แดง ขีดค้างที่ดังสุดราว 1.5 วินาที เกิน 0 dB แดงค้างจนกดล้าง
    ช่องที่ปิดลำโพงแถบหยุดนิ่ง · สีเป็นสีของแถบวัด ไม่เปลี่ยนตามโทน (data-keepcolor) */
export function LevelMeter({ ch, frozen }: { ch: number; frozen?: boolean }) {
  const { playing } = useGPlay();
  const bar = useRef<HTMLElement>(null), hold = useRef<HTMLElement>(null), clip = useRef<HTMLButtonElement>(null);
  const st = useRef({ v: 0, peak: 0, at: 0 });
  useFrames((now) => {
    if (frozen) return;
    const s = st.current, t = performance.now();
    const lv = now == null ? 0 : gLevels()[ch] ?? 0;
    // ตกลงช้า ๆ แบบเข็มวัด ขึ้นทันที
    s.v = lv > s.v ? lv : s.v * 0.86;
    if (lv >= s.peak || t - s.at > 1500) { s.peak = lv >= s.peak ? lv : Math.max(lv, s.peak * 0.9); if (lv >= s.peak) s.at = t; }
    // สเกล −60 ถึง 0 dB · แถบสีอยู่ที่พื้นของกล่อง ชิ้น i เป็นฝาเทาปิดจากบนลงมาส่วนที่ยังไม่ถึง
    const pct = (x: number) => Math.max(0, Math.min(1, (20 * Math.log10(Math.max(x, 1e-6)) + 60) / 60)) * 100;
    if (bar.current) bar.current.style.height = `${100 - pct(s.v)}%`;
    if (hold.current) { hold.current.style.bottom = `${pct(s.peak)}%`; hold.current.style.opacity = s.peak > 0.001 ? "1" : "0"; }
    // ตัวอย่างเสียง s16 เต็มที่คือ 32767/32768 ถือว่าแตะเพดาน
    if (lv >= 0.999 && clip.current) clip.current.dataset.on = "";
  }, playing);
  if (!playing) return null;
  return (
    <span className="gp-meter" data-keepcolor data-meter={ch} aria-hidden="true">
      <i ref={bar} /><b ref={hold} />
      <button type="button" ref={clip} className="gp-clip" tabIndex={-1} title="เสียงแตะเพดาน 0 dB กดเพื่อล้าง" onClick={(e) => { delete e.currentTarget.dataset.on; }} />
    </span>
  );
}

const PLAY_TIP: Tip = {
  w: "เล่นเสียงของไฟล์ในหน้านี้เลย โดยมีขีดตำแหน่งเล่นวิ่งไปบนกราฟ\nจึงเห็นว่าเสียงที่ได้ยินอยู่ตรงไหนของกราฟ",
  o: [
    ["กดบนกราฟ", "ระหว่างเล่น กดตรงไหนก็กระโดดไปเล่นตรงนั้น\nส่วนตอนหยุด จุดที่กดจะเป็นจุดเริ่มเล่นครั้งถัดไป", "", ""],
    ["ปุ่มลำโพง", "ช่องที่ปิดลำโพงจะเงียบทันทีระหว่างเล่น\nและแถบวัดระดับของช่องนั้นหยุดนิ่ง", "", ""],
    ["ความดัง", "ปรับเฉพาะเสียงที่ออกลำโพง ไม่แก้ไฟล์\nส่วนแถบวัดระดับข้างชื่อช่องบอกระดับของไฟล์จริงเสมอ", "", ""],
    ["แถบวัดระดับ", "เขียวคือระดับปกติ เหลืองคือดังใกล้เพดาน\nและแดงคือแตะ 0 dB ซึ่งจุดแดงค้างไว้จนกดล้าง", "", ""],
  ],
};

/** แถบเล่นใต้แถวปุ่มมุมมอง · ปุ่มเล่นหรือหยุด เวลาที่เล่น ความดังลำโพง */
export function PlayBar({ onToggle, dur, at }: { onToggle: () => void; dur: number; at: number }) {
  const { playing, err, vol } = useGPlay();
  const time = useRef<HTMLSpanElement>(null);
  const digits = 3;
  useFrames((now) => { if (time.current) time.current.textContent = tfmtD(now ?? at, digits); }, playing);
  useEffect(() => { if (!playing && time.current) time.current.textContent = tfmtD(at, digits); }, [at, playing]);
  const keyTxt = keysText("graph.play");
  return (
    <div className="gp-bar" data-playbar>
      <button type="button" className={"btn btn-sm " + (playing ? "btn-main" : "btn-ghost")} onClick={onToggle} aria-pressed={playing}
        title={`${playing ? "หยุดเล่น" : "เล่นเสียงจากจุดที่เลือกบนกราฟ"} (${keyTxt})`} data-gplay>
        {playing ? <IbStop size={15} /> : <IbPlay size={15} />}<Keep all={PLAY_LBL}>{playing ? PLAY_LBL[1] : PLAY_LBL[0]}</Keep></button>
      <span className="gp-time" data-gptime><span ref={time} style={{ display: "inline-block", minWidth: `${tfmtD(dur, digits).length}ch` }}>{tfmtD(at, digits)}</span><em> จาก {tfmtD(dur, 0)}</em></span>
      <label className="gp-vol" title={`ความดังลำโพง ${Math.round(vol * 100)}%`}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M11 5 6 9H3v6h3l5 4z" fill="currentColor" fillOpacity=".15" />{vol > 0 ? <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" /> : <path d="m16 9 5 6M21 9l-5 6" />}</svg>
        <input type="range" min={0} max={100} step={1} value={Math.round(vol * 100)} onChange={(e) => gSetVol(Number(e.target.value) / 100)} aria-label="ความดังลำโพง" data-gpvol />
        <span className="gp-volv">{Math.round(vol * 100)}%</span>
      </label>
      <InfoTip title="เล่นเสียงจากกราฟ" tip={PLAY_TIP} />
      {err && <span className="gp-err" role="alert" data-gperr>เล่นไม่ได้ {err}</span>}
    </div>
  );
}

let downX = NaN;
/** กดบนกราฟ (ไม่ใช่ลาก) ได้เวลาตรงจุดที่กดส่งให้ seek · left right คือขอบซ้ายขวาของพื้นที่กราฟในกล่อง */
export function seekProps(seek: (t: number) => void, t0: number, t1: number, left: number, right: number) {
  return {
    onPointerDownCapture: (e: React.PointerEvent<HTMLElement>) => { downX = e.button === 0 ? e.clientX : NaN; },
    onClick: (e: React.MouseEvent<HTMLElement>) => {
      if (!(Math.abs(e.clientX - downX) < 3) || (e.target as HTMLElement).closest("button,input,a,[role=slider]")) return;
      const r = e.currentTarget.getBoundingClientRect(), W = r.width - left - right, x = e.clientX - r.left - left;
      if (x < 0 || x > W || W <= 0) return;
      seek(t0 + x / W * (t1 - t0));
    },
  };
}

/** ผูกตัวเล่นกับหน้ากราฟ · เว้นวรรคเล่นหรือหยุด หยุดเมื่อเปลี่ยนไฟล์ เปลี่ยนแทร็ก หรือออกจากหน้า เลื่อนกราฟตามตอนขีดเลยขอบขวา */
export function useGraphPlay(o: { path: string | null; track: number; names: string[]; hidden: string[]; tip: number; setTip: (t: number) => void; t0: number; t1: number; zoomAll: boolean; setCenter: (c: number) => void; active: boolean }) {
  const { playing } = useGPlay();
  const now = useRef(o); now.current = o;
  const pageOn = usePageActiveRef();
  const toggle = () => {
    const c = now.current;
    if (!c.path) return;
    if (getGPlay().playing) { const at = gStop(); if (at != null) c.setTip(at); return; }
    gSetMuted(c.hidden);
    void gPlay({ path: c.path, track: c.track, names: c.names }, c.tip, (from) => now.current.setTip(from));
  };
  /** กดบนกราฟ · ระหว่างเล่นกระโดดไปเล่นตรงนั้น ไม่ได้เล่นอยู่ตั้งจุดเริ่มเล่น */
  const seek = (t: number) => {
    const c = now.current;
    c.setTip(t);
    if (getGPlay().playing && c.path) void gPlay({ path: c.path, track: c.track, names: c.names }, t, (from) => now.current.setTip(from));
  };
  useHotkeys([hk("graph.play", (e) => { e.preventDefault(); toggle(); })], pageOn);
  useEffect(() => { gSetMuted(o.hidden); }, [o.hidden]);
  // เปลี่ยนไฟล์ แทร็ก หรือออกจากหน้า หยุดเล่น
  useEffect(() => () => { gStop(); }, [o.path, o.track]);
  useEffect(() => { if (!o.active) gStop(); }, [o.active]);
  // ขีดเลยขอบขวาของช่วงที่ซูมอยู่ เลื่อนกราฟไปหน้าถัดไปให้ขีดอยู่ขอบซ้าย
  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      const c = now.current, t = gNow();
      if (t == null || c.zoomAll) return;
      const span = c.t1 - c.t0;
      if (t > c.t1 || t < c.t0) c.setCenter(t + span * 0.48);
    }, 120);
    return () => clearInterval(id);
  }, [playing]);
  return { playing, toggle, seek };
}
