/* ชั้นวาง มุมมองชั้นไม้ (ShelfGrid) · แถวละกี่เรื่อง ความกว้างปก ปกตัวอย่าง ป้ายใต้ปก ดาว ชั้นจางตอนโหลด
   แยกจาก ShelfPage.tsx ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 · แผนแบ่งไฟล์ขั้น 4.3) ย้ายมาทั้งก้อน เนื้อโค้ดไม่เปลี่ยน */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Badge, Skel, chText } from "../../components/ui";
import { useToast } from "../../components/Toasts";
import { useMovieFrame } from "../../lib/frames";
import { api, thumbUrl, type Movie } from "../../lib/api";
import { kindOf, SHELF_LABEL } from "../../lib/status";
import { kb } from "../../lib/popup";
import { useLongName } from "../../lib/longName";
import { Hl, LinkMark, SIZES, tracks } from "./common";

/* ---------- ชั้นไม้ ---------- */
function usePerRow(size: keyof typeof SIZES) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(700);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // หน้าถูกซ่อน (เปลี่ยนเมนู) กว้าง 0 ข้ามไป จำผังเดิมไว้ · เดิมจำ 0 ผังตอนซ่อนเป็นแถวละเรื่อง กลับมาหน้าชั้นวางเฟรมแรกการ์ดกว้าง 100 ตารางสูง 4,471
    // แล้วจัดใหม่เป็นการ์ด 104 สูง 505 ในเฟรมเดียว ขึ้นข้อความเตือน ResizeObserver loop ทุกครั้งที่เข้าหน้าชั้นวาง (เจอใน check-look ชุด BUGS ข้อ 113 ถึง 121)
    const take = () => { if (el.clientWidth) setW(el.clientWidth); };
    const ro = new ResizeObserver(take);
    ro.observe(el);
    take();
    return () => ro.disconnect();
  }, []);
  const { w: bw, gap } = SIZES[size];
  return { ref, w, perRow: Math.max(1, Math.floor((w + gap) / (bw + gap))) };
}

/** ปกที่ชั้นวางใช้ตามที่เลือก ปกตั้งหรือปกนอน · เรื่องที่มีแบบเดียวขึ้นแบบนั้นเสมอ
    ภาพปก ตาราง แผงขวา ใช้ thumb กับ coverAspect ของเรื่องที่ผ่านตรงนี้แล้ว จึงสลับพร้อมกันทุกที่
    (พี่กัน 7 พ.ย. 2569 *"ทำระบบที่ดูรูปแบบเเนวตั้ง หรือเเนวนอนได้ ยกเว้นเรื่องนั้นๆมีเเค่เเนวเดียวมันจะเเสดงเเค่เเนวนั้น"*) */
export function withCover(m: Movie, orient: "tall" | "wide"): Movie {
  const fileCover = !!m.thumb;
  // ปกจับคู่แสดงแบบเดียวกับปกในไฟล์ สลับปกตั้งปกนอนตาม · เรื่องที่มีทั้งสองปก เลือกได้ทีละเรื่อง ค่าตั้งต้นปกจับคู่ (แคลร์ตั้ง · พี่กันตอบ *"เลือกได้"*)
  const linked = m.linked ?? [];
  if (linked.length && (!fileCover || m.coverPick !== "file")) {
    const c = linked.find((x) => x.orient === orient) ?? linked[0];
    return { ...m, fileCover, shownLink: c, thumb: c.thumb, coverAspect: c.aspect };
  }
  if (!m.thumb2) return { ...m, fileCover, shownLink: null };
  const want = (a: number) => (orient === "wide" ? a >= 1 : a < 1);
  const a1 = m.coverAspect ?? 0, a2 = m.cover2Aspect ?? 0;
  return want(a1) || !want(a2) ? { ...m, fileCover, shownLink: null } : { ...m, fileCover, shownLink: null, thumb: m.thumb2, coverAspect: a2 };
}

/** กว้างของเล่มบนชั้น · ปกแนวนอน (กว้างหารสูงตั้งแต่ 1) สูงเท่าเล่มอื่น กว้างตามสัดส่วนไม่เกิน 16:9 · ปกตั้งกับเล่มที่ยังไม่มีปกกว้างเท่าเดิม
    (พี่กัน 7 พ.ย. 2569 *"ถ้าเราเอาโปสเตอร์แบบเเนวนอนมา มันก็จะเเสดงเป็เเเนวนอนด้วยนะ"*) */
function bookWidth(m: Movie | null, bw: number) {
  const a = m?.thumb ? m.coverAspect ?? 0 : 0;
  return a >= 1 ? bw * 1.5 * Math.min(a, 16 / 9) : bw;
}

/** แบ่งแถวตามความกว้างจริงของแต่ละเล่ม (เดิมแบ่งจำนวนเท่ากันทุกแถว เพราะทุกเล่มกว้างเท่ากัน) */
function packRows(items: (Movie | null)[], avail: number, bw: number, gap: number) {
  const rows: (Movie | null)[][] = [];
  let cur: (Movie | null)[] = [], used = 0;
  for (const it of items) {
    const w = bookWidth(it, bw), need = cur.length ? used + gap + w : w;
    if (cur.length && need > avail) { rows.push(cur); cur = [it]; used = w; } else { cur.push(it); used = need; }
  }
  if (cur.length) rows.push(cur);
  return rows;
}

/** pending = เรื่องที่เจอในโฟลเดอร์แต่ยังอ่านไม่เสร็จ · ขึ้นเป็นโครงจางต่อท้ายชั้น เต็มแถวที่ค้างกับอีกหนึ่งแถว (ไม่วาดครบทุกเรื่อง ชั้น 500 เรื่องจะหนัก) */
export function ShelfGrid(p: { list: Movie[]; size: "s" | "m" | "l"; selId: string | null; onSel: (id: string) => void; used: string; reminder: number; showNames: boolean; showDots: boolean; showFrames: boolean; pending: number }) {
  const { ref, w, perRow } = usePerRow(p.size);
  const { w: base, gap } = SIZES[p.size];
  const skel = Math.min(p.pending, ((perRow - (p.list.length % perRow)) % perRow) + perRow);
  const items: (Movie | null)[] = skel ? [...p.list, ...Array<null>(skel).fill(null)] : p.list;
  // ขยายปกให้เต็มแถว ไม่เหลือที่ว่างขวา · ปกตั้งได้ความกว้างพอดีจำนวนต่อแถว · ปกนอนขยายตามแถวแรกอีกชั้น
  // ทุกแถวระยะห่างเท่ากัน ชิดซ้ายตรงคอลัมน์ · แถวที่ปกนอนตกไปแถวถัดไปเหลือที่ว่างท้ายแถว (เดิมกระจายปกที่เหลือเต็มแถว ระยะห่าง 18 กลายเป็น 100 จุดที่จอ 1366 เจอ 11 พ.ย. 2569 พี่กันสั่งแก้ 12 พ.ย.)
  let bw = Math.max(base, (w - (perRow - 1) * gap) / perRow);
  let rows = packRows(items, w, bw, gap);
  if (rows.length > 1) {
    const room = w - (rows[0].length - 1) * gap, used = rows[0].reduce((n, m) => n + bookWidth(m, bw), 0);
    if (used > 0 && room / used > 1.002) { bw = bw * (room / used); rows = packRows(items, w, bw, gap); }
  }
  return (
    <div ref={ref} className={"size-" + p.size} data-shelf style={{ "--bw": `${bw}px` } as React.CSSProperties}>
      {rows.map((row, i) => (
        <div key={i} className="shelf">
          {row.map((m, j) => m
            ? <Book key={m.id} m={m} width={bookWidth(m, bw)} sel={m.id === p.selId} onSel={p.onSel} used={p.used} reminder={p.reminder} showNames={p.showNames} showDots={p.showDots} showFrames={p.showFrames} />
            : <SkelBook key={"skel" + j} size={p.size} i={j} />)}
        </div>
      ))}
    </div>
  );
}

function SkelBook({ size, i }: { size: "s" | "m" | "l"; i: number }) {
  const { w } = SIZES[size];
  return (
    <div className="book" style={{ cursor: "default" }} aria-hidden="true" data-skel>
      <Skel w={w} h={w * 1.5} r={6} />
      <Skel w={w * (0.5 + ((i * 37) % 40) / 100)} h={10} style={{ marginTop: 22 }} />
    </div>
  );
}

/** ป้ายใต้ปก ไฟล์ เสียง ซับ · สูงสุด 2 บรรทัด ล้นตัดแชนแนลเฉพาะเรื่องนี้ ยังล้นซ่อนป้ายท้ายขึ้น +จำนวน
    (พี่กันสั่ง 9 พ.ย. 2569 "เเต่มันจะเป็นตัวหนาเหมือน tag" · "เสียง ใส่เเชเเนลที" · "ทำให้มันเหลือสูสุดเเค่ 2 บรรทัดได้มั้ย เช่น ถ้าแบบนี้ เฉพาะจุดนี้ เอาเเชเเนลออก" · ข้อ +จำนวนแคลร์ตั้ง) */
function BookTags({ m }: { m: Movie }) {
  const ref = useRef<HTMLDivElement>(null);
  const audio = [...new Map(m.audio.map((a) => [a.codec + "|" + (a.layout ?? ""), a])).values()];
  const subs = [...new Set(m.subs.map((x) => x.codec).filter(Boolean))];
  const key = audio.map((a) => a.codec + a.layout).join() + "|" + subs.join() + "|" + m.ext;
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let touched = false, lastW = -1;
    const fit = () => {
      const w = el.clientWidth;
      // หน้าถูกซ่อน (เปลี่ยนเมนู) กว้าง 0 ข้ามไป แถบที่จัดไว้คงเดิม · เดิมรีเซ็ตทุกแถบตอนซ่อน กลับมาหน้าชั้นวางต้องจัดใหม่ทุกเรื่องในเฟรมเดียว
      // ความสูงเปลี่ยนซ้ำระหว่างวัด ขึ้นข้อความเตือน ResizeObserver loop ทุกครั้งที่เข้าหน้าชั้นวาง (เจอใน check-look ชุด BUGS ข้อ 113 ถึง 121)
      if (!w || w === lastW) return;
      lastW = w;
      // ป้าย +จำนวน มีคลาส bt ด้วย ต้องตัดออก เดิมลูปซ่อนจากท้ายซ่อนตัวมันเองก่อน ป้ายนี้จึงไม่เคยขึ้น (AUDIT 12 พ.ย. 2569 ข้อ 4)
      const tags = [...el.querySelectorAll<HTMLElement>(":scope > .bt:not(.btmore)")];
      const more = el.querySelector<HTMLElement>(":scope > .btmore");
      if (!more) return;
      if (touched) {
        el.classList.remove("nochan");
        tags.forEach((t) => { t.style.display = ""; });
        more.style.display = "none";
        touched = false;
      }
      const lines = () => new Set([...el.children].filter((x) => (x as HTMLElement).style.display !== "none").map((x) => (x as HTMLElement).offsetTop)).size;
      if (lines() <= 2) return;
      touched = true;
      el.classList.add("nochan");
      // ตัดแชนแนลแล้วชื่อซ้ำ เช่น AAC 2.0 กับ AAC 5.1 เหลือป้ายเดียว
      const seen = new Set<string>();
      tags.forEach((t) => { const b = t.dataset.base; if (b && seen.has(b)) t.style.display = "none"; if (b) seen.add(b); });
      if (lines() <= 2) return;
      more.style.display = "";
      const on = tags.filter((t) => t.style.display !== "none");
      for (let i = on.length - 1; i > 0 && lines() > 2; i--) {
        on[i].style.display = "none";
        more.textContent = "+" + (on.length - i);
      }
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [key]);
  const title = [`ไฟล์ ${m.ext.toUpperCase()}`, audio.length ? "เสียง " + tracks(m.audio, true) : "ไม่มีเสียง", m.subs.length ? "ซับ " + tracks(m.subs, false) : "ไม่มีซับ"].join("\n");
  return (
    <div ref={ref} className="bn3" title={title} data-booktags>
      <span className="bt f">{m.ext.toUpperCase()}</span>
      {audio.map((a) => <span key={a.codec + a.layout} className="bt a" data-base={"a" + a.codec}>{a.codec}{a.layout && <span className="ch"> {chText(a.layout)}</span>}</span>)}
      {subs.map((c) => <span key={c} className="bt s">{c}</span>)}
      <span className="bt btmore" style={{ display: "none" }} />
    </div>
  );
}

/** ดาวห้าดวงให้คะแนน (พี่กันเลือก 9 พ.ย. 2569 "ดวงเเบบนี้" แบบ ช จากมอคอัป) · กดดวงเดิมซ้ำล้างคะแนน (แคลร์ตั้ง) · ไม่เลือกเรื่องตอนกดดาว */
export function Stars({ m }: { m: Movie }) {
  const toast = useToast();
  const [val, setVal] = useState(m.rating ?? 0);
  const [hover, setHover] = useState(0);
  useEffect(() => setVal(m.rating ?? 0), [m.rating]);
  const pick = (e: React.MouseEvent, n: number) => {
    e.stopPropagation();
    const old = val, next = val === n ? 0 : n;
    setVal(next);
    api.setRating(m.id, next).catch((err) => { setVal(old); toast({ kind: "bad", title: "ให้คะแนนไม่สำเร็จ", detail: String(err) }); });
  };
  const show = hover || val;
  return (
    <span className="stars" role="group" aria-label={`คะแนน ${val} จาก 5 ดาว`} data-stars={val} onMouseLeave={() => setHover(0)} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" className={"star" + (n <= show ? " on" : "")} title={val === n ? "กดอีกครั้งเพื่อล้างคะแนน" : `ให้ ${n} ดาว`} aria-label={`ให้ ${n} ดาว`} aria-pressed={val === n} data-star={n} onMouseEnter={() => setHover(n)} onClick={(e) => pick(e, n)}>
          <svg width="12" height="12" viewBox="0 0 24 24" strokeWidth="2" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l2.8 5.8 6.2.9-4.5 4.4 1.1 6.3L12 17.4l-5.6 3 1.1-6.3L3 9.7l6.2-.9z" /></svg>
        </button>
      ))}
    </span>
  );
}

function Book(p: { m: Movie; width: number; sel: boolean; onSel: (id: string) => void; used: string; reminder: number; showNames: boolean; showDots: boolean; showFrames: boolean }) {
  const { m } = p;
  const k = kindOf(m, p.reminder);
  // แบบเก็บปีไว้ท้าย แยกชื่อเรื่องกับปีในวงเล็บ ส่วนชื่อจางตรงที่ล้น ปีอยู่ท้ายเสมอ (BUGS ข้อ 51 · lib/longName.ts)
  const ln = useLongName();
  const ym = ln === "year" ? m.name.match(/^(.*?)\s*(\(\d{4}\))$/) : null;
  const src = thumbUrl(m.thumb);
  const full = m.name + (m.ext === "mkv" ? "" : "." + m.ext);
  const wide = src != null && (m.coverAspect ?? 0) >= 1;
  const frame = useMovieFrame(m, p.showFrames && !src);
  return (
    <div
      className={"book" + (wide ? " wide" : "") + (p.sel ? " sel" : "") + (m.missing ? " missing" : "")}
      style={wide ? { width: p.width } : undefined}
      title={[full, m.missing ? "หาไฟล์ไม่เจอ ไดรฟ์อาจถอดออกอยู่" : ""].filter(Boolean).join("\n") || undefined}
      aria-label={full + ", " + SHELF_LABEL[k] + (m.shownLink ? ", ปกจับคู่" : "") + (m.missing ? ", หาไฟล์ไม่เจอ" : "")}
      aria-pressed={p.sel}
      data-movie={m.name}
      {...kb(() => p.onSel(m.id))}
    >
      {(m.pairs?.length ?? 0) > 0 && <span className="pairdot" title="จับคู่เสียงหรือซับไว้" aria-label="จับคู่เสียงหรือซับไว้" data-pairdot />}
      {src ? (
        <div className="cover has-img"><img src={src} alt="" loading="lazy" draggable={false} /></div>
      ) : frame.url ? (
        <div className="cover has-img" title="ภาพจากหนัง ยังไม่ใช่ปก" data-frame><img src={thumbUrl(frame.url) ?? undefined} alt="" draggable={false} /></div>
      ) : (
        <div ref={frame.ref} className="cover none">
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#c99aad" strokeWidth="2" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 15l3-3 2 2 3-3 2 2" /></svg>
          ยังไม่มีโปสเตอร์
        </div>
      )}
      {(p.showNames || p.showDots || m.shownLink) && (
        <div className="bname">
          {/* สามบรรทัด ชื่อ · เครื่องหมาย · ป้าย ตรงแนวกันทุกเรื่อง (พี่กันสั่ง 9 พ.ย. 2569 "ให้มันเป้นระเบีบย" · เลือกแบบ ค จากมอคอัป pick-ui แท็บ 5) · ชื่อยาวตัดท้าย ชี้ดูชื่อเต็ม */}
          {p.showNames && <div className="bn1">{ym ? <><span className="bn1-t"><Hl text={ym[1]} used={p.used} /></span><span className="bn1-y">{ym[2]}</span></> : <Hl text={m.name} used={p.used} />}</div>}
          {(p.showNames || p.showDots || m.shownLink) && <div className="bn2">{p.showDots && <Badge kind={k} title={SHELF_LABEL[k]} />}{m.shownLink && <LinkMark />}{p.showNames && <Stars m={m} />}</div>}
          {p.showNames && <BookTags m={m} />}
        </div>
      )}
    </div>
  );
}

export function SkeletonShelf({ size }: { size: "s" | "m" | "l" }) {
  const { ref, perRow } = usePerRow(size);
  return (
    <div ref={ref} className={"size-" + size} aria-busy="true" aria-label="กำลังอ่านโฟลเดอร์">
      {[0, 1].map((r) => (
        <div key={r} className="shelf">
          {Array.from({ length: perRow }, (_, i) => <SkelBook key={i} size={size} i={i} />)}
        </div>
      ))}
    </div>
  );
}