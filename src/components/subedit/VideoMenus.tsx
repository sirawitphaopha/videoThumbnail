/* หน้าแก้ซับ เมนูของกรอบวิดีโอ (VideoMenu) กับเมนูคลิกขวาบนภาพ (FrameMenu) และคำอธิบาย ⓘ ที่ใช้ในเมนู
   แยกจาก SubVideo.tsx ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 · แผนแบ่งไฟล์ขั้น 7.4) ย้ายมาทั้งก้อน เนื้อโค้ดไม่เปลี่ยน */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { pickKeyframes, pickSave, vidApi, type SnapReq } from "../../lib/api";
import type { Tip } from "../../lib/codecAdv";
import { dropStyle, sideStyle, useDropPlacement, useSideFit, visibleTop } from "../../lib/popupFit";
import { useClickOutside, useEscClose } from "../../lib/popup";
import { closeVideo, findScenes, reopenVideo, setHideKeys, setKeys, setZoom, stopScenes, useVid, vidKeys, vidRate, vidRetry, vidSrc } from "../../lib/vidFrames";
import { vStr, type V2 } from "../../lib/subVisual";
import Dropdown from "../Dropdown";
import InfoTip from "../InfoTip";
import { Switch } from "../ui";
import { IbFilm, IbJump } from "../icons";
import { KEY_TIP } from "./VideoDialogs";
import type { Props } from "./SubVideo";

/** ขนาดภาพ 24 ขั้น ขั้นละ 12.5% ตั้งแต่ 12.5% ถึง 300% (video_box.cpp) กับพอดีกรอบ */
const ZOOMS = Array.from({ length: 24 }, (_, i) => (i + 1) * 12.5);
// กล่อง ⓘ แยกเป็นหัวข้อละเรื่อง เนื้อความสั้นเป็นประโยคมีคำเชื่อม ไม่ขึ้นบรรทัดเอง (พี่กันตีตก 14 พ.ย. 2569 ที่แตกเป็นบรรทัดละวลีจนเป็นก้อนยาว)
const VIDEO_TIP: Tip = {
  w: "แถบใต้ภาพมีปุ่มถอยหรือเดินทีละเฟรม\nส่วนช่องกลางบอกเวลากับเลขเฟรม และเป็นสีเข้มเมื่อเป็น keyframe",
  o: [
    ["ตัวเลขมุมขวาบน", "คือระยะห่างจากเวลาเริ่มและเวลาจบของบรรทัดนี้\nถ้าเป็น +0ms แปลว่าภาพอยู่ตรงเวลาเริ่มพอดี", "", ""],
    ["เดินทีละเฟรม", "คลิกภาพแล้วกดลูกศรซ้ายขวา\nกด Shift ด้วยจะไป keyframe กด Ctrl ด้วยจะไปขอบบรรทัด\nและกด Alt ด้วยจะเดินทีละ 10 เฟรม", "", ""],
    ["คีย์ลัด", "กด Ctrl+1 เพื่อไปเวลาเริ่ม กด Ctrl+2 เพื่อไปเวลาจบ\nและกด Ctrl+G เพื่อข้ามไปเฟรมหรือเวลาที่พิมพ์", "", ""],
    ["ล้อเมาส์", "หมุนบนภาพเพื่อปรับขนาด กด Ctrl ด้วยจะขยายเนื้อภาพ\nส่วนกด Shift ด้วยหรือกดล้อค้างแล้วลากจะเลื่อนภาพ", "", ""],
    ["AUTO", "เลือกบรรทัดแล้วภาพไปเวลาเริ่มของบรรทัดนั้นเอง", "ไล่ดูบรรทัดได้เร็ว", "ภาพที่ดูค้างไว้จะกระโดดไปเมื่อเลือกบรรทัดใหม่"],
  ],
  r: "เปิด AUTO ไว้ ตอนจะดูภาพนานค่อยปิด",
};
const COORD_TIP: Tip = { w: "เป็นตัวเลขชุดเดียวกับที่ใส่ใน \\pos ของซับ คัดลอกแล้ววางได้เลย" };
/* ---------------------------------------------------------------- เมนูวิดีโอ */

export function VideoMenu(p: Props & { fitPct: number }) {
  const st = useVid();
  const src = vidSrc(st);
  const keys = vidKeys(st);
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const place = useDropPlacement(open, wrap, panel);
  const side = useSideFit(open, wrap, panel, "right");
  useEscClose(open, () => setOpen(false));
  useClickOutside(open, wrap, () => setOpen(false));
  const movie = src.kind === "movie" ? src.path : "";
  const sc = st.scene;
  const pct = sc.dur > 0 ? Math.min(99, Math.round((sc.t / sc.dur) * 100)) : 0;
  const keyText = src.kind === "dummy" ? "วิดีโอจำลองไม่มี keyframe" : !movie ? "ยังไม่มีวิดีโอ"
    : `${keys.src === "scenes" ? "จุดเปลี่ยนฉากที่หาเอง" : keys.src === "file" ? `จากไฟล์ ${(keys.file ?? "").split(/[\\/]/).pop()}` : "keyframe ของหนัง"} ${keys.list.length.toLocaleString("en-US")} จุด`;
  const noMovie = movie ? undefined : src.kind === "dummy" ? "วิดีโอจำลองไม่มี keyframe" : "ยังไม่มีวิดีโอ";
  const loadFile = async () => {
    const w = window as unknown as { __vidKeysOpen?: string };
    const f = import.meta.env.DEV && w.__vidKeysOpen ? w.__vidKeysOpen : await pickKeyframes();
    if (!f) return;
    vidApi.keysLoad(f).then((list) => { setKeys(list, "file", f); setMsg(`เปิดไฟล์ keyframe แล้ว ${list.length.toLocaleString("en-US")} จุด`); }, (e) => setMsg(String(e)));
  };
  const saveFile = async () => {
    const w = window as unknown as { __vidKeysSave?: string };
    const base = movie.replace(/\.[^.\\/]+$/, "") + "_keyframes.txt";
    const f = import.meta.env.DEV && w.__vidKeysSave ? w.__vidKeysSave : await pickSave(base, "txt", "ไฟล์ keyframe");
    if (!f) return;
    vidApi.keysSave(f, keys.list).then((r) => setMsg(`บันทึกแล้ว ${r.split(/[\\/]/).pop()}`), (e) => setMsg(String(e)));
  };
  const item = (label: string, run: () => void, why?: string, data?: string, icon?: React.ReactNode) => (
    <button type="button" className={"se-vmi" + (why ? " off" : "")} aria-disabled={!!why || undefined} title={why} onClick={() => { if (!why) { run(); } }} data-vmi={data}>{icon}{label}</button>
  );
  const zoomVal = st.zoom ? String(st.zoom) : "0";
  return (
    <div ref={wrap} className="se-vmenuwrap">
      <button type="button" className={"btn btn-ghost btn-sm se-vstep" + (open ? " pressed" : "")} aria-haspopup="true" aria-expanded={open} title="เมนูวิดีโอ ขนาดภาพ keyframe วิดีโอจำลอง" aria-label="เมนูวิดีโอ" onClick={() => { setOpen((o) => !o); setMsg(null); }} data-vmenu>
        <IbFilm size={15} />{sc.busy && <span className="se-vbadge">{pct}%</span>}
      </button>
      {open && (
        <div ref={panel} className="menu pop-in se-vmenu" role="dialog" aria-label="เมนูวิดีโอ" style={{ position: "absolute", ...sideStyle(side, "right"), width: 330, zIndex: "var(--z-menu)" as unknown as number, ...dropStyle(place) }} data-vmenupanel>
          <div className="se-vmrow"><span className="se-vmh">ขนาดภาพ</span>
            <Dropdown label="ขนาดภาพ" value={ZOOMS.includes(st.zoom) || st.zoom === 0 ? zoomVal : "own"} display={() => (st.zoom ? `${st.zoom}%` : `พอดีกรอบ ${p.fitPct}%`)} sizes={["พอดีกรอบ 100.0%", "1000%"]}
              options={[{ value: "0", label: "พอดีกรอบ" }, ...ZOOMS.map((v) => ({ value: String(v), label: `${v}%` })), ...(st.zoom && !ZOOMS.includes(st.zoom) ? [{ value: "own", label: `${st.zoom}%` }] : [])]}
              onChange={(v) => { if (v !== "own") { setZoom(Number(v)); setOpen(false); } }} />
            <InfoTip title="กรอบวิดีโอ" tip={VIDEO_TIP} />
          </div>
          <div className="se-vmsec">
            <div className="se-vmrow"><span className="se-vmh">keyframe</span><InfoTip title="keyframe" tip={KEY_TIP} /><span className="small se-vmkeys" data-vkeysrc>{keyText}</span></div>
            {sc.busy ? (
              <div className="se-vmrow" data-vscenes-busy>
                <div className="se-vprog"><div style={{ width: `${pct}%` }} /></div>
                <span className="small">{`หาจุดเปลี่ยนฉาก ${pct}%`}</span>
                <button type="button" className="btn btn-ghost btn-sm" onClick={stopScenes} data-vscenes-stop>หยุด</button>
              </div>
            ) : item("หาจุดเปลี่ยนฉากจริง (ถอดภาพทั้งเรื่อง)", () => void findScenes(), noMovie, "scenes")}
            {sc.err && <div className="small se-vmerr" role="alert">{sc.err}</div>}
            <div className="se-vmpair">
              {item("เปิดไฟล์ keyframe", () => void loadFile(), noMovie, "keysopen")}
              {item("บันทึกเป็นไฟล์", () => void saveFile(), noMovie ?? (keys.list.length ? undefined : "ยังไม่มี keyframe ให้บันทึก"), "keyssave")}
            </div>
            {movie && keys.src !== "movie" && item("กลับไปใช้ keyframe ของหนัง", () => setKeys(null), undefined, "keysmovie")}
            <div className="se-vmrow se-vmsw"><span>ซ่อนเส้น keyframe บนคลื่นเสียง</span><Switch on={st.hideKeys} onChange={setHideKeys} label="ซ่อนเส้น keyframe บนคลื่นเสียง" /></div>
          </div>
          <div className="se-vmsec">
            {item("ข้ามไปยังเฟรมหรือเวลา (Ctrl+G)", () => { setOpen(false); p.onJump(); }, vidRate(st) ? undefined : "ยังไม่มีวิดีโอ หรือยังอ่านเวลาเฟรมไม่เสร็จ", "jump", <IbJump size={15} />)}
            {item("รายละเอียดวิดีโอ", () => { setOpen(false); p.onDetails(); }, src.kind === "none" ? "ยังไม่มีวิดีโอ" : src.kind === "movie" && !st.table ? "ยังอ่านข้อมูลวิดีโอไม่เสร็จ" : undefined, "details")}
            <div className="se-vmpair">
              {item("วิดีโอจำลอง", () => { setOpen(false); p.onDummy(); }, undefined, "dummy")}
              {src.kind !== "none" ? item(src.kind === "dummy" ? "ปิดวิดีโอจำลอง" : "ปิดวิดีโอ", () => { setOpen(false); p.onClose(); closeVideo(); }, undefined, "close")
                : st.closed && st.movie ? item("เปิดวิดีโอของหนัง", () => { setOpen(false); reopenVideo(); }, undefined, "reopen") : null}
            </div>
            {st.load === "err" && movie && item("ลองอ่านเวลาเฟรมใหม่", vidRetry, undefined, "retry")}
          </div>
          {msg && <div className="small se-vmmsg" role="status" data-vmsg>{msg}</div>}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- เมนูคลิกขวาบนภาพ (default_menu.json video_context ของ Aegisub) */

type FrameMenuProps = {
  x: number; y: number; at: V2; pan: boolean;
  /** เหตุผลที่ยังบันทึกหรือคัดลอกภาพไม่ได้ */
  why?: string;
  /** ที่บันทึกภาพ บอกในคำอธิบายของปุ่ม */
  where: string;
  onClose: () => void;
  onSnap: (mode: SnapReq["mode"], dest: SnapReq["dest"]) => void;
  onCoords: (at: V2) => void;
  onPan: () => void;
};

export function FrameMenu(p: FrameMenuProps) {
  const box = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{ left: number; top: number } | null>(null);
  useEscClose(true, p.onClose);
  useClickOutside(true, box, p.onClose);
  // วางที่เมาส์ ขวาไม่พอกางไปซ้าย ล่างไม่พอกางขึ้น ไม่ทับแถบที่ตรึงด้านบน (สกิล popup-fit)
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const W = window.innerWidth, H = window.innerHeight, top0 = visibleTop() + 8;
    const left = p.x + r.width + 8 <= W ? p.x : Math.max(8, p.x - r.width);
    const top = Math.max(top0, Math.min(p.y + r.height + 8 <= H ? p.y : p.y - r.height, H - 8 - r.height));
    setPlace({ left, top });
  }, [p.x, p.y]);
  useEffect(() => {
    const close = () => p.onClose();
    window.addEventListener("resize", close);
    window.addEventListener("blur", close);
    return () => { window.removeEventListener("resize", close); window.removeEventListener("blur", close); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const it = (label: string, run: () => void, tip: string, why: string | undefined, data: string) => (
    <button type="button" role="menuitem" className={"se-vmi" + (why ? " off" : "")} aria-disabled={!!why || undefined} title={why ?? tip} onClick={() => { if (!why) run(); }} data-vctx={data}>{label}</button>
  );
  return (
    <div ref={box} className="menu pop-in se-vctx" role="menu" aria-label="เมนูของภาพ"
      style={{ position: "fixed", left: place?.left ?? p.x, top: place?.top ?? p.y, visibility: place ? "visible" : "hidden", zIndex: "var(--z-menu)" as unknown as number }} data-vctxmenu>
      {it("บันทึกภาพ PNG", () => p.onSnap("subs", "save"), `บันทึกภาพที่เห็นพร้อมซับเป็นไฟล์ PNG ${p.where} ไม่เขียนทับไฟล์เดิม`, p.why, "save")}
      {it("คัดลอกภาพ", () => p.onSnap("subs", "copy"), "คัดลอกภาพที่เห็นพร้อมซับลงคลิปบอร์ด", p.why, "copy")}
      <div className="se-vctxsep" role="separator" />
      {it("บันทึกภาพ PNG ไม่มีซับ", () => p.onSnap("raw", "save"), `บันทึกภาพที่เห็นโดยไม่มีซับเป็นไฟล์ PNG ${p.where}`, p.why, "save-raw")}
      {it("คัดลอกภาพ ไม่มีซับ", () => p.onSnap("raw", "copy"), "คัดลอกภาพที่เห็นโดยไม่มีซับลงคลิปบอร์ด", p.why, "copy-raw")}
      <div className="se-vctxsep" role="separator" />
      {it("บันทึกเฉพาะซับ พื้นโปร่งใส", () => p.onSnap("only", "save"), `บันทึกเฉพาะซับที่ขึ้นบนภาพนี้ พื้นหลังโปร่งใส เป็นไฟล์ PNG ${p.where}`, p.why, "save-only")}
      {it("คัดลอกเฉพาะซับ พื้นโปร่งใส", () => p.onSnap("only", "copy"), "คัดลอกเฉพาะซับที่ขึ้นบนภาพนี้ พื้นหลังโปร่งใส ลงคลิปบอร์ด", p.why, "copy-only")}
      <div className="se-vctxsep" role="separator" />
      <div className="se-vctxrow">
        {it(`คัดลอกพิกัด ${vStr(p.at)}`, () => p.onCoords(p.at), "คัดลอกพิกัดตรงที่คลิกขวาลงคลิปบอร์ด", undefined, "coords")}
        <InfoTip title="พิกัด" tip={COORD_TIP} />
      </div>
      {it("รีเซ็ตการเลื่อนภาพ", p.onPan, "คืนเนื้อภาพที่ขยายด้วย Ctrl กับล้อเมาส์ แล้ววางภาพกลางกรอบ", p.pan ? undefined : "ภาพไม่ได้ขยายหรือเลื่อนอยู่", "pan")}
    </div>
  );
}