/* ตัวดูซับรูป ภาพทีละหน้า แถบเวลา ความคืบหน้าตอนถอดครั้งแรก (แยกจาก SubViewer.tsx BUGS ข้อ 161 ชุด 6) */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { CardIcon, FixedTime, Keep, Phr, Skel, Switch } from "../ui";
import { listen } from "@tauri-apps/api/event";
import { isImgCancelled, subApi, type SubImg } from "../../lib/api";
import type { AvTrack } from "../../lib/avJob";
import { IbBack, IbNext } from "../icons";
import { IbTable } from "../icons";
import InfoTip from "../InfoTip";
import type { Tip } from "../../lib/codecAdv";
import { PER, short } from "./svShared";
import { isKey } from "../../lib/keymap";

// หมายเหตุของตัวดูซับรูป เดิมเป็นบรรทัดใต้แถวปุ่ม ย้ายเข้า ⓘ ให้แถวปุ่มเป็นแถวล่างสุด (BUGS ข้อ 141 พี่กันทัก 16 พ.ย. 2569 "จะเว้นที่ไว้ด้านล่าทำไม")
const SIMG_TIP: Tip = {
  w: "ซับรูปเก็บเป็นภาพทีละบรรทัด โปรแกรมถอดเป็นภาพให้ดูทีละหน้า",
  o: [
    ["พื้นตารางหมากรุก", "คือส่วนโปร่งใสของรูปซับ ซึ่งไม่บังภาพหนัง", "", ""],
    ["รายการเวลาด้านซ้าย", "กดเวลาแล้วไปหน้าที่มีภาพนั้น\nและกรอบของภาพนั้นจะขึ้นสี", "", ""],
    ["ค้นคำ", "ซับแบบรูปค้นคำไม่ได้ เพราะเก็บเป็นภาพ ไม่ใช่ตัวหนังสือ", "", ""],
  ],
};

// การ์ดภาพซับสูง 116 จุด (กรอบภาพ 74 ระยะใน 16 เวลา 18 ช่องไฟ 6 เส้นขอบ 2) ช่องห่าง 10 · ใช้คิดจำนวนแถวที่พอดีกรอบก่อนวาดการ์ดจริง
const SIMG_H = 116, SIMG_GAP = 10, SIMG_COLS = 3;

/** แถบเวลาของตัวดูซับรูป · ขีดเล็กทุกภาพตามเวลาจริง ช่วงสีคือภาพที่เห็นอยู่ หมุดคือภาพแรกที่เห็น
 *  กดหรือลากบนแถบ ปล่อยแล้วไปภาพที่ขึ้นก่อนหรือตรงเวลานั้น ระหว่างลากขึ้นเวลากับเลขภาพที่จะไป */
function SimgSeek(p: { times: SubImg[] | null; d: number; at: number; upto: number; onSeek: (x: SubImg) => void }) {
  const bar = useRef<HTMLDivElement>(null);
  const [hold, setHold] = useState<SubImg | null>(null);
  const ts = p.times ?? [];
  const last = ts[ts.length - 1];
  const span = last ? Math.max(last.end ?? last.start, last.start) + 1 : 1;
  const pct = (t: number) => `${Math.min(100, Math.max(0, (t / span) * 100))}%`;
  const pickAt = (clientX: number) => {
    const r = bar.current?.getBoundingClientRect();
    if (!r || !ts.length) return null;
    const t = ((clientX - r.left) / r.width) * span;
    let i = ts.findIndex((x) => x.start > t) - 1;
    if (i < -1) i = ts.length - 1; else if (i < 0) i = 0;
    return ts[i];
  };
  const a = ts[p.at - 1], b = ts[p.upto - 1];
  const shown = hold ?? a;
  return (
    <div className="simgseek" data-simg-seek>
      <span className="simgseek-t">{shown ? short(shown.start + p.d) : "0:00.0"}</span>
      <div ref={bar} className={"simgseek-bar" + (hold ? " hold" : "")} title="กดหรือลากเพื่อไปภาพตรงเวลานั้น"
        onPointerDown={(e) => { if (e.button !== 0 || !ts.length) return; e.currentTarget.setPointerCapture(e.pointerId); setHold(pickAt(e.clientX)); }}
        onPointerMove={(e) => { if (hold) setHold(pickAt(e.clientX)); }}
        onPointerUp={(e) => { const x = hold ? pickAt(e.clientX) : null; setHold(null); if (x) p.onSeek(x); }}
        onPointerCancel={() => setHold(null)}>
        <svg className="simgseek-ticks" viewBox="0 0 1000 10" preserveAspectRatio="none" aria-hidden>
          {ts.map((x) => { const v = (x.start / span) * 1000; return <line key={x.n} x1={v} x2={v} y1={0} y2={10} />; })}
        </svg>
        {a && b && <div className="simgseek-on" style={{ left: pct(a.start), width: `max(3px, ${pct((b.end ?? b.start) - a.start)})` }} />}
        {shown && <div className="simgseek-knob" style={{ left: pct(shown.start) }} />}
        {hold && <div className="simgseek-tip" style={{ left: pct(hold.start) }}>ภาพ {hold.n}</div>}
      </div>
      <span className="simgseek-t end">{last ? short((last.end ?? last.start) + p.d) : "0:00.0"}</span>
    </div>
  );
}

/** แถบความคืบหน้าตอนถอดซับรูปครั้งแรก แทนที่แถบเวลาในความสูงเดียวกัน ตัวเลขกับเวลาที่เดินกว้างคงที่ไม่ดันแถบ
 *  (BUGS ข้อ 144 พี่กันทัก 16 พ.ย. 2569 "เเต่พอเอาไฟล์นี้เข้าเพื่อดูเเค่ซํบ มันรอนานมากกกกก") */
const PROG_T = ["กำลังอ่านซับรูปจากไฟล์", "กำลังเก็บภาพซับ"];
function SimgProgress(p: { pct: number | null; since: number; onCancel: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(id); }, []);
  const s = Math.max(0, Math.floor((now - p.since) / 1000));
  const t = s >= 3600 ? `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  const pct = p.pct ?? 0;
  return (
    <div className="simgseek simgprog" data-simg-progress role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
      {/* 85% ขึ้นไปคือช่วงเก็บภาพทีละภาพ ซับยาวเป็นพันภาพใช้เวลา จึงบอกว่าทำอะไรอยู่ (BUGS ข้อ 151) */}
      <span className="simgprog-t"><Keep all={PROG_T}>{pct >= 85 ? PROG_T[1] : PROG_T[0]}</Keep> <FixedTime t={`${pct}%`} longest="100%" /></span>
      <div className="simgprog-bar"><i style={{ width: `${pct}%` }} /></div>
      <span className="simgprog-t">ใช้ไป <FixedTime t={t} longest="00:00" /></span>
      {/* หนังยาวต้องรอ ffmpeg หรือ mkvextract อ่านทั้งไฟล์ กดยกเลิกได้ (ผู้ช่วยตรวจทาน R23 · BUGS ข้อ 162.8) */}
      <button type="button" className="btn btn-ghost btn-sm simgprog-x" title="หยุดอ่านซับรูปจากไฟล์" onClick={p.onCancel} data-simg-cancel>ยกเลิก</button>
    </div>
  );
}

export function ImageView(p: { track: AvTrack; path: string; ff: number; movie?: string; onClose?: () => void; onTotal?: (n: number) => void }) {
  const d = p.track.delay / 1000;
  // ภาพแรกของหน้า (นับจาก 0) แทนเลขหน้า เพราะจำนวนภาพต่อหน้าเปลี่ยนตามความสูงหน้าต่าง
  const [first, setFirst] = useState(0);
  // ภาพต่อหน้าเท่าที่วางได้เต็มความสูงกรอบ ไม่เหลือที่ว่างข้างล่าง (BUGS ข้อ 141 พี่กันทัก 15 พ.ย. 2569 "เว้นที่ไว้ข้างล่างทำไมเยอะเเยะ")
  const [per, setPer] = useState(PER);
  const [picH, setPicH] = useState(74);
  const [data, setData] = useState<{ first: number; per: number; total: number; items: SubImg[] } | null>(null);
  const [times, setTimes] = useState<SubImg[] | null>(null);
  const [pick, setPick] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // กดเปิดใหม่หลังยกเลิก ขอภาพหน้าเดิมอีกรอบ (BUGS ข้อ 162.8)
  const [retry, setRetry] = useState(0);
  // ยกเลิกแล้วหยุดจริง ตารางภาพหายแล้วจำนวนภาพต่อหน้าเปลี่ยน ห้ามขอภาพใหม่เองจนกว่าจะกดเปิดใหม่ (เดิมขอใหม่แล้ววิ่งอ่านต่อ เจอตอนตรวจด้วยเมาส์จริง)
  const stopped = useRef(false);
  useEffect(() => { stopped.current = false; }, [p.path, p.ff]);
  const [big, setBig] = useState<SubImg | null>(null);
  const fit = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = fit.current;
    if (!el || big) return;
    const ro = new ResizeObserver(() => {
      const rows = Math.max(1, Math.floor((el.clientHeight + SIMG_GAP) / (SIMG_H + SIMG_GAP)));
      setPer(Math.min(48, rows * SIMG_COLS));
      // ที่เหลือใต้แถวสุดท้ายแบ่งให้กรอบภาพทุกแถวสูงขึ้น ตารางเต็มกรอบพอดี
      setPicH(Math.max(74, Math.floor((el.clientHeight - (rows - 1) * SIMG_GAP) / rows) - (SIMG_H - 74) - 2));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [big]);
  const start = Math.floor(first / per) * per;
  // ความคืบหน้าของการถอดทั้งแทร็กครั้งแรก จากเหตุการณ์ subimg-progress ของไฟล์และแทร็กนี้ · ถอดไว้แล้วหน้าแรกมาเร็ว แถบไม่ทันขึ้น
  const [prog, setProg] = useState<{ pct: number | null; since: number }>(() => ({ pct: null, since: Date.now() }));
  useEffect(() => {
    const un = listen<{ path: string; ff: number; percent: number }>("subimg-progress", (e) => {
      if (e.payload.path !== p.path || e.payload.ff !== p.ff) return;
      // ตัวตรวจ check-av อ่านลำดับเปอร์เซ็นต์ที่ได้ (รุ่นทดสอบเท่านั้น)
      if (import.meta.env.DEV) (((window as unknown as { __simgProg?: number[] }).__simgProg ??= [])).push(e.payload.percent);
      setProg((o) => ({ ...o, pct: e.payload.percent }));
    });
    return () => { void un.then((f) => f()); };
  }, [p.path, p.ff]);
  useEffect(() => {
    if (stopped.current) return;
    let live = true;
    setErr(null);
    // window.__simgHold ให้ตัวตรวจค้างหน้ากำลังอ่านไว้วัดแถบความคืบหน้า (รุ่นทดสอบเท่านั้น)
    const hold = () => import.meta.env.DEV && (window as unknown as { __simgHold?: boolean }).__simgHold;
    subApi.images(p.path, p.ff, start / per, per).then((r) => { if (live && !hold()) setData({ ...r, first: start, per }); }, (e) => { if (isImgCancelled(e)) stopped.current = true; if (live || stopped.current) setErr(String(e)); });
    return () => { live = false; };
  }, [p.path, p.ff, start, per, retry]);
  // รายการเวลาทั้งไฟล์ ขอหลังหน้าแรกมาแล้ว ไม่ให้สองคำสั่งถอดไฟล์เดียวกันพร้อมกันตอนเปิดครั้งแรก
  const ready = data != null;
  useEffect(() => {
    if (!ready) return;
    let live = true;
    subApi.imageTimes(p.path, p.ff).then((r) => { if (live) setTimes(r); }, () => { if (live) setTimes([]); });
    return () => { live = false; };
  }, [ready, p.path, p.ff]);
  // รายการเวลาเลื่อนตามหน้าที่ดูอยู่ แถวแรกของหน้าอยู่ในกรอบเสมอ (เลื่อนเฉพาะกรอบรายการ ไม่ใช้ scrollIntoView ที่เลื่อนหน้าต่างด้วย)
  useEffect(() => {
    const el = list.current;
    const row = el?.querySelector<HTMLElement>(`[data-simg-at="${big?.n ?? start + 1}"]`);
    if (!el || !row) return;
    if (row.offsetTop < el.scrollTop || row.offsetTop + row.offsetHeight > el.scrollTop + el.clientHeight) el.scrollTop = row.offsetTop - 8;
  }, [start, times, big]);
  const total = data?.total ?? 0;
  // บอกจำนวนภาพรวมให้บรรทัดคำอธิบายใต้หัวหน้าต่าง (พี่กันขอ 16 พ.ย. 2569 "หาจุดเขียนจำนวนภาพรวมหน่อย")
  // ภาพจากหนังตรงเวลาของซับ เป็นพื้นหลังของภาพเต็ม ดึงจากไฟล์หนังทีละภาพแล้วจำไว้ ดึงไม่ได้ขึ้นพื้นตารางหมากรุกตามเดิม
  // (BUGS ข้อ 142 พี่กันขอ 16 พ.ย. 2569 "รอระบบ ที่ดึงเฟรมภาพจาดหลังมาได้")
  const frames = useRef(new Map<number, string>());
  const [bg, setBg] = useState<{ n: number; src: string } | null>(null);
  // ปุ่มเปิดปิดภาพจากหนัง จำไว้ในเครื่อง (BUGS ข้อ 142 พี่กันขอ 16 พ.ย. 2569 "ขอปุ่มปิดภาพได้")
  const [frameOn, setFrameOn] = useState(() => { try { return localStorage.getItem("sv-frame") !== "0"; } catch { return true; } });
  const toggleFrame = () => setFrameOn((v) => { try { localStorage.setItem("sv-frame", v ? "0" : "1"); } catch { /* ไม่มีที่เก็บก็ใช้ค่าในหน้า */ } return !v; });
  const movie = p.movie;
  useEffect(() => {
    if (!big || !movie || !frameOn) return;
    const n = big.n;
    const got = frames.current.get(n);
    if (got) { setBg({ n, src: got }); return; }
    let live = true;
    // กลางช่วงที่ซับขึ้น ไม่เกินครึ่งวินาทีจากเวลาเริ่ม (ซับบางภาพไม่มีเวลาจบ)
    const at = big.start + d + Math.min(0.5, big.end != null ? (big.end - big.start) / 2 : 0.2);
    subApi.frame(movie, at, 720).then((src) => { frames.current.set(n, src); if (live) setBg({ n, src }); }, () => {});
    return () => { live = false; };
  }, [big, movie, d, frameOn]);
  const onTotal = p.onTotal;
  useEffect(() => { if (data) onTotal?.(data.total); }, [data, onTotal]);
  // ดึงภาพเดียวตามเลขภาพ (หน้าละ 1 ภาพ) ภาพเดิมค้างไว้จนภาพใหม่มา ไม่กระพริบ · กดรัวได้ ใช้ผลของครั้งล่าสุด
  const want = useRef(0);
  const showBig = async (n: number) => {
    want.current = n;
    try {
      const r = await subApi.images(p.path, p.ff, n - 1, 1);
      if (want.current === n && r.items[0]) setBig(r.items[0]);
    } catch (e) { if (want.current === n) setErr(String(e)); }
  };
  // ไปภาพหรือหน้าถัดไป dir = 1 หรือ -1 · ดูภาพเต็มเปลี่ยนทีละภาพ ดูทีละหน้าเปลี่ยนทีละหน้า
  const step = (dir: number) => {
    if (big) { const n = big.n + dir; if (n >= 1 && n <= total) void showBig(n); return; }
    const f = start + dir * per;
    if (f >= 0 && f < total) { setFirst(f); setPick(null); }
  };
  // ลูกศรซ้ายขวาบนแป้นใช้ได้ทั้งตอนดูทีละหน้าและตอนดูภาพเต็ม (BUGS ข้อ 141 พี่กันขอ 16 พ.ย. 2569 "ให้สามารุใช้ปุ่มลูกศรกดได้")
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      if (document.querySelector(".infotip") || document.querySelectorAll(".dlg").length > 1) return;
      // คีย์มาจากทะเบียนกลาง keymap.ts (BUGS ข้อ 162.3)
      if (isKey(e, "subimg.prev")) { e.preventDefault(); step(-1); }
      else if (isKey(e, "subimg.next")) { e.preventDefault(); step(1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [big, total, start, per]);
  // ล้อเมาส์บนตารางหรือภาพเต็ม หมุนลงไปถัดไป หมุนขึ้นย้อนกลับ ครั้งละหนึ่งก้าว เว้นช่วง 250 ms กันหมุนทีเดียวข้ามหลายหน้า (พี่กันขอ 16 พ.ย. 2569 "สฎคลเมาส์ต้องเลื่อนลงได้")
  const wheelAt = useRef(0);
  const onWheel = (e: React.WheelEvent) => {
    if (Math.abs(e.deltaY) < 4) return;
    const now = performance.now();
    if (now - wheelAt.current < 250) return;
    wheelAt.current = now;
    step(e.deltaY > 0 ? 1 : -1);
  };
  const pages = Math.max(1, Math.ceil(total / per));
  const page = start / per;

  const skel = (n: number) => <div className="subimgs">{Array.from({ length: Math.max(1, n) }, (_, i) => <div key={i} className="simg"><Skel w="100%" h={picH} /><Skel w="60%" h={12} /></div>)}</div>;
  // ปุ่มปิดต่อท้ายแถวปุ่มเปลี่ยนหน้า ไม่มีแถบปุ่มท้ายหน้าต่างอีกชั้น (BUGS ข้อ 141 พี่กันสั่ง 16 พ.ย. 2569 "เอามาส่ตรนี้สิ จะเพิ่มอีกชั้นมาทำไม")
  const close = p.onClose && <><span className="sv-sep" aria-hidden /><button type="button" className="btn btn-ghost btn-sm sv-close" onClick={p.onClose} data-sv-close>ปิด</button></>;
  if (err && isImgCancelled(err)) return (<>
    <div className="stat info" data-simg-cancelled><CardIcon kind="info" /><div><b>ยกเลิกการเปิดซับรูปแล้ว</b><Phr>{"ภาพที่อ่านไปแล้วไม่ได้เก็บไว้ เปิดใหม่ต้องอ่านจากต้นไฟล์"}</Phr>
      <div className="minirow"><button type="button" className="btn btn-ghost btn-sm" onClick={() => { stopped.current = false; setProg({ pct: null, since: Date.now() }); setErr(null); setRetry((n) => n + 1); }} data-simg-retry>เปิดใหม่</button></div></div></div>
    {close && <div className="simgbar" style={{ marginTop: "auto", justifyContent: "flex-end" }}>{close}</div>}
  </>);
  if (err) return (<>
    <div className="stat bad"><CardIcon kind="bad" /><div><b>ถอดซับรูปไม่ได้</b><Phr>{err}</Phr></div></div>
    {close && <div className="simgbar" style={{ marginTop: "auto", justifyContent: "flex-end" }}>{close}</div>}
  </>);
  // ตอนดูภาพเต็ม กดเวลาในรายการแล้วเปลี่ยนภาพเต็มเป็นภาพนั้นเลย ตอนดูทีละหน้าไปหน้าที่มีภาพนั้น
  const go = (x: SubImg) => { if (big) void showBig(x.n); else { setFirst(x.n - 1); setPick(x.n); } };
  // กลับไปดูทีละหน้า ไปหน้าที่มีภาพที่เพิ่งดูเต็ม และกรอบภาพนั้นขึ้นสี
  const back = () => { if (big) { setFirst(big.n - 1); setPick(big.n); } setBig(null); };
  return (
    <div className="simgwrap">
    {/* แถบเวลาแบบแถบเลื่อนวิดีโอ บอกว่าดูอยู่ที่เวลาเท่าไหร่ กดหรือลากไปภาพตรงเวลานั้น (BUGS ข้อ 141 พี่กันขอ 16 พ.ย. 2569 "ใส่บาร์ข้างบนตรงนี้ เพื่อบ่งบอกว่าตอนนี้เวลาเท่าไหร่") */}
    {data ? <SimgSeek times={times} d={d} at={big ? big.n : start + 1} upto={big ? big.n : Math.min(total, start + per)} onSeek={(x) => go(x)} />
      : <SimgProgress pct={prog.pct} since={prog.since} onCancel={() => void subApi.cancelImages()} />}
    <div className="simgview" data-simgview>
      {/* เวลาของทุกภาพ กดแล้วไปหน้าที่มีภาพนั้น (พี่กันขอ 15 พ.ย. 2569 "ขอฝั่งซ้าย มีเวลาให้กดได้") */}
      <div className="simglist" ref={list} data-simg-list>
        {times == null ? Array.from({ length: 12 }, (_, i) => <div key={i} className="simglist-row"><Skel w="90%" h={12} /></div>)
          : times.map((x) => {
            const on = big ? big.n === x.n : x.n > start && x.n <= start + per;
            return (
              <button type="button" key={x.n} className={"simglist-row" + (on ? " on" : "") + (pick === x.n ? " pick" : "")} onClick={() => go(x)} data-simg-at={x.n}>
                <span>ภาพ {x.n}</span><span>{short(x.start + d)}</span>
              </button>);
          })}
      </div>
      <div className="simgmain">
        {big ? (<>
          {/* ภาพเต็มพอดีกรอบทั้งกว้างและสูง ไม่ต้องเลื่อนหน้าต่าง (พี่กันขอ 15 พ.ย. 2569 "ขอแบบไม่ต้องสโควเลื่อนได้ไหม") */}
          <div className="simgfit big" onWheel={onWheel}>
            <div className={"bigsub" + (frameOn && bg?.n === big.n ? " withframe" : "")} style={{ aspectRatio: `${big.canvas[0]} / ${big.canvas[1]}`, width: `min(100cqw, calc(100cqh * ${big.canvas[0]} / ${big.canvas[1]}))` }} data-bigsub>
              {frameOn && bg?.n === big.n && <img className="bigsub-frame" src={bg.src} alt="" data-bigsub-frame />}
              <img src={big.png} alt={`ซับภาพ ${big.n}`} style={{ left: `${(big.at[0] / big.canvas[0]) * 100}%`, top: `${(big.at[1] / big.canvas[1]) * 100}%`, width: `${(big.w / big.canvas[0]) * 100}%` }} />
            </div>
          </div>
          <div className="simgbar">
            <span className="small">{`ภาพที่ ${big.n} เวลา ${short(big.start + d)}${big.end != null ? `–${short(big.end + d)}` : ""} บนจอ ${big.canvas[0]} × ${big.canvas[1]}`}</span>
            <div style={{ display: "flex", gap: 6, flex: "none" }}>
              {/* สวิตช์ภาพหนัง ตัวเลื่อนบอกว่าเปิดหรือปิดอยู่ (พี่กันทัก 16 พ.ย. 2569 "กดเปิดกดปิดก็มีอะไรบอกหน่อยสิ") · ยังไม่มีวิดีโอ กดไม่ได้พร้อมเหตุผล */}
              <label className={"sv-frame" + (movie ? "" : " off")} title={!movie ? "เพิ่มไฟล์วิดีโอก่อน จึงจะมีภาพจากหนัง" : frameOn ? "ปิดเพื่อซ่อนภาพจากหนัง เหลือพื้นตารางหมากรุก" : "เปิดเพื่อแสดงภาพจากหนังข้างหลังซับ"} data-bigsub-frame-toggle>
                <Switch on={!!movie && frameOn} onChange={() => { if (movie) toggleFrame(); }} label="ภาพจากหนังข้างหลังซับ" />
                <span>ภาพหนัง</span>
              </label>
              <button type="button" className="btn btn-ghost btn-sm" onClick={back} data-bigsub-back><IbTable size={15} />กลับไปดูทีละหน้า</button>
              {/* เส้นตั้งแบ่งกลุ่มปุ่มที่ทำงานต่างกัน */}
              <span className="sv-sep" aria-hidden />
              {/* ภาพก่อนและภาพถัดไปตอนดูภาพเต็ม กดลูกศรซ้ายขวาบนแป้นได้ด้วย (BUGS ข้อ 141 พี่กันขอ 16 พ.ย. 2569 "ขอปุ่มกดไปข้างหน้า เเละย้อนกลับด้วย") */}
              <button type="button" className={"btn btn-sm " + (big.n > 1 ? "btn-ghost" : "btn-wait")} aria-disabled={big.n <= 1 || undefined} title={big.n <= 1 ? "นี่คือภาพแรกแล้ว" : "ภาพก่อน (ลูกศรซ้าย)"} onClick={() => step(-1)} data-bigsub-prev><IbBack size={15} />ภาพก่อน</button>
              <button type="button" className={"btn btn-sm " + (big.n < total ? "btn-ghost" : "btn-wait")} aria-disabled={big.n >= total || undefined} title={big.n >= total ? "นี่คือภาพสุดท้ายแล้ว" : "ภาพถัดไป (ลูกศรขวา)"} onClick={() => step(1)} data-bigsub-next><IbNext size={15} />ภาพถัดไป</button>
              {close}
            </div></div>
        </>) : (<>
          <div className="simgfit" ref={fit} onWheel={onWheel} style={{ "--simg-pic": `${picH}px` } as React.CSSProperties}>
            {!data ? skel(per) : total === 0 ? <div className="small">ไม่มีภาพในซับนี้</div> : data.first !== start || data.per !== per ? (
              // ภาพของหน้าใหม่ยังไม่มา ขึ้นโครงจาง ไม่โชว์ภาพของหน้าเก่าค้าง (เดิมป้ายเปลี่ยนก่อนภาพ กดภาพแล้วได้ภาพของหน้าเก่า ตัวตรวจ check-av เจอ)
              skel(Math.min(per, total - start))
            ) : (
              <div className="subimgs" data-subimgs>{data.items.map((x) => (
                <button type="button" key={x.n} className={"simg" + (pick === x.n ? " pick" : "")} onClick={() => setBig(x)} aria-label={`ดูภาพ ${x.n} เต็มจอ`} data-simg>
                  <div className="pic"><img src={x.png} alt={`ซับภาพ ${x.n}`} /></div>
                  <div className="t"><span>ภาพ {x.n}</span><span>{short(x.start + d)}</span></div>
                </button>))}</div>)}
          </div>
          <div className="simgbar">
            <span className="small" data-simg-count>{!data ? <Phr>กำลังถอดซับรูปเป็นภาพ ครั้งแรกต้องอ่านทั้งไฟล์ หนังยาวจึงใช้เวลาสักครู่ แต่ครั้งต่อไปจะเปิดได้ทันที</Phr>
              : total ? <>{`ภาพที่ ${start + 1}–${Math.min(total, start + per)} จาก ${total.toLocaleString("en-US")} ภาพ กดภาพเพื่อดูเต็ม`} <InfoTip title="ดูซับรูป" tip={SIMG_TIP} /></> : ""}</span>
            <div style={{ display: "flex", gap: 6, flex: "none" }}>
              <button type="button" className={"btn btn-sm " + (page > 0 ? "btn-ghost" : "btn-wait")} aria-disabled={page === 0 || undefined} onClick={() => step(-1)}><IbBack size={15} />หน้าก่อน</button>
              <button type="button" className={"btn btn-sm " + (page < pages - 1 ? "btn-ghost" : "btn-wait")} aria-disabled={page >= pages - 1 || undefined} onClick={() => step(1)} data-simg-next><IbNext size={15} />หน้าถัดไป</button>
              {close}
            </div>
          </div>
        </>)}
      </div>
    </div>
    </div>
  );
}

