/* ตัวดูรูปเต็มจอ ซูม ลาก หมุน มินิแมป แผงข้อมูลรูป (พี่กันสั่ง 8 พ.ย. 2569 "เเล้วปุ่มขยายดูแบบเต็มจอล่ะ")
   ยกจากของกลาง สกิล image-viewer · ต้นฉบับ TB Dashboard AvatarLightbox ผ่านตัวที่ปรับแล้วของ HCV Tracker · ตรรกะซูมกับลากไม่แก้
   ปรับเข้าโปรแกรมนี้ 4 อย่าง ไอคอนวาดในไฟล์ · สีใช้ตัวแปรของโปรแกรม · เอาส่วนที่คุยกับเซิร์ฟเวอร์ออก รูปอยู่ในเครื่อง · Esc ผ่าน useEscClose ปิดเฉพาะชั้นบนสุด */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useEscClose } from "../lib/popup";
import { Keep } from "./ui";

type IconProps = { size?: number; style?: React.CSSProperties };
const mk = (body: React.ReactNode) => ({ size = 16, style }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" style={style}>{body}</svg>
);
const FRAME = <rect width="18" height="18" x="3" y="3" rx="2" />;
const ChevronLeft = mk(<path d="m15 18-6-6 6-6" />);
const ChevronRight = mk(<path d="m9 18 6-6-6-6" />);
const ChevronDown = mk(<path d="m6 9 6 6 6-6" />);
const Info = mk(<><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></>);
const MoreVertical = mk(<><circle cx="12" cy="12" r="1" /><circle cx="12" cy="5" r="1" /><circle cx="12" cy="19" r="1" /></>);
const HelpCircle = mk(<><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><path d="M12 17h.01" /></>);
const X = mk(<><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>);
const Keyboard = mk(<><path d="M10 8h.01" /><path d="M12 12h.01" /><path d="M14 8h.01" /><path d="M16 12h.01" /><path d="M18 8h.01" /><path d="M6 8h.01" /><path d="M7 16h10" /><path d="M8 12h.01" /><rect width="20" height="16" x="2" y="4" rx="2" /></>);
const RotateCcw = mk(<><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /></>);
const RotateCw = mk(<><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /></>);
const Maximize = mk(<><path d="M8 3H5a2 2 0 0 0-2 2v3" /><path d="M21 8V5a2 2 0 0 0-2-2h-3" /><path d="M3 16v3a2 2 0 0 0 2 2h3" /><path d="M16 21h3a2 2 0 0 0 2-2v-3" /></>);
const ZoomIn = mk(<><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /><path d="M11 8v6" /><path d="M8 11h6" /></>);
const ZoomOut = mk(<><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /><path d="M8 11h6" /></>);
const Sparkles = mk(<><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" /><path d="M20 3v4" /><path d="M22 5h-4" /><path d="M4 17v2" /><path d="M5 18H3" /></>);
const Grid3x3 = mk(<>{FRAME}<path d="M3 9h18" /><path d="M3 15h18" /><path d="M9 3v18" /><path d="M15 3v18" /></>);
const List = mk(<><path d="M8 6h13" /><path d="M8 12h13" /><path d="M8 18h13" /><path d="M3 6h.01" /><path d="M3 12h.01" /><path d="M3 18h.01" /></>);
const Move = mk(<><path d="M12 2v20" /><path d="m15 19-3 3-3-3" /><path d="m19 9 3 3-3 3" /><path d="M2 12h20" /><path d="m5 9-3 3 3 3" /><path d="m9 5 3-3 3 3" /></>);
const PanelTop = mk(<>{FRAME}<path d="M3 9h18" /></>);
const PanelBottom = mk(<>{FRAME}<path d="M3 15h18" /></>);
const PanelLeft = mk(<>{FRAME}<path d="M9 3v18" /></>);
const PanelRight = mk(<>{FRAME}<path d="M15 3v18" /></>);

/* สีจากตัวแปรของโปรแกรม เปลี่ยนตามโทน · ตัวหนังสือเน้นบนพื้นดำเป็นสีอ่อนตายตัว ไม่งั้นโทนมืดอ่านไม่ออก */
const C = {
  main: "var(--accent)",
  soft: "#f7d3df",
  bar: "var(--accent)",
  deep: "var(--txt)",
  panel: "rgba(36,18,26,0.92)",
};

export interface ImageInfo {
  name?: string;
  updatedAt?: string;
  sizeBytes?: number;
  format?: string;
  origText?: string;
  origDimText?: string;
  reducePct?: number;
  device?: string;
  uploader?: string;
  note?: string;
  storage?: string;
  hashes?: Record<string, string | undefined>;
  noteEditable?: boolean;
  onSaveNote?: (v: string) => Promise<void> | void;
}

export interface MenuAction {
  icon?: React.ReactNode;
  label: string;
  onClick?: () => void;
  danger?: boolean;
}

interface Props {
  src: string;
  thumb?: string;
  originRect?: DOMRect | null;
  info?: ImageInfo | null;
  onClose: () => void;
  hasPrev?: boolean;
  hasNext?: boolean;
  onPrev?: () => void;
  onNext?: () => void;
  menuActions?: MenuAction[];
  infoAction?: () => void;
}

export default function ImageViewer({
  src, thumb, originRect, info, onClose,
  hasPrev, hasNext, onPrev, onNext, menuActions, infoAction,
}: Props) {
  const [open, setOpen] = useState(false);
  const [settled, setSettled] = useState(false);   // เปิดเสร็จแล้ว → สลับ transition ซูมให้ไว
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const [rot, setRot] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [zoomMenu, setZoomMenu] = useState(false);
  const [renderMenu, setRenderMenu] = useState(false);
  const [actionMenu, setActionMenu] = useState(false);
  const [imgRendering, setImgRendering] = useState<'auto' | 'pixelated'>('auto');
  const [showHelp, setShowHelp] = useState(false);
  const [hintVisible, setHintVisible] = useState(true);
  const [noteEditing, setNoteEditing] = useState(false);
  const [noteVal, setNoteVal] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);
  const [dim, setDim] = useState<{ w: number; h: number } | null>(null);
  const [bytes, setBytes] = useState<number | null>(info?.sizeBytes ?? null);
  const [curSrc, setCurSrc] = useState(src);
  const [fullLoaded, setFullLoaded] = useState(false);
  // 🆕 ต่างจากต้นฉบับ — ฟังการย่อ/ขยายหน้าต่าง ไม่งั้นขอบเขตลากเพี้ยนหลังย่อจอ
  const [view, setView] = useState({ w: 1280, h: 800 });
  // ย้ายแถบควบคุมได้ 4 ด้าน รูปบางรูปมีเนื้อหาสำคัญอยู่ล่าง แถบที่อยู่ล่างจะบังพอดี · จำไว้ในเครื่อง
  const [barPos, setBarPos] = useState<'bottom' | 'top' | 'left' | 'right'>('bottom');
  const [barMenu, setBarMenu] = useState(false);
  // ชี้แถบอยู่หรือเปล่า — ไม่ได้ใช้ก็จางลงให้เห็นรูปข้างหลังชัด (พี่กันสั่ง 29 ส.ค. 2569)
  const [barHover, setBarHover] = useState(false);

  const drag = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const touch = useRef<{ mode: 'pinch' | 'pan'; d?: number; s?: number; x?: number; y?: number; tx?: number; ty?: number } | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  // เลื่อนรูป (ลูกศร) → รีเซ็ตซูม/หมุน + โหลดรูปใหม่ (ไม่ remount → สลับลื่น)
  useEffect(() => {
    setScale(1); setTx(0); setTy(0); setRot(0); setFullLoaded(false);
    setCurSrc(src); setBytes(info?.sizeBytes ?? null); setNoteEditing(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  useEffect(() => {
    try {
      const v = localStorage.getItem('ms.viewerBar');
      if (v === 'top' || v === 'left' || v === 'right' || v === 'bottom') setBarPos(v);
    } catch { /* เบราว์เซอร์บางเครื่องปิดที่เก็บข้อมูล ใช้ค่าเริ่มต้นไป */ }
  }, []);

  const moveBar = (pos: typeof barPos) => {
    setBarPos(pos);
    setBarMenu(false);
    try { localStorage.setItem('ms.viewerBar', pos); } catch { /* ไม่จำก็ไม่เป็นไร */ }
  };

  useEffect(() => {
    const read = () => setView({ w: window.innerWidth, h: window.innerHeight });
    read();
    window.addEventListener('resize', read);
    return () => window.removeEventListener('resize', read);
  }, []);

  const doClose = () => { setOpen(false); setTimeout(onClose, 320); };
  useEscClose(true, doClose);
  const vw = view.w;
  const vh = view.h;
  const stop = (e?: { stopPropagation: () => void }) => e && e.stopPropagation();
  /** คลิกที่รูป = ปิด popup ทั้งหมด */
  const closeMenus = () => { setShowHelp(false); setRenderMenu(false); setZoomMenu(false); setActionMenu(false); setShowInfo(false); };
  /** กดฟังก์ชันอื่น = ปิดเมนูที่ค้าง (ไม่แตะแผงข้อมูล) */
  const dismissPopups = () => { setShowHelp(false); setRenderMenu(false); setZoomMenu(false); setActionMenu(false); };
  const toggleMenu = (which: 'help' | 'zoom' | 'render' | 'action') => {
    setShowHelp(which === 'help' ? (v) => !v : false);
    setZoomMenu(which === 'zoom' ? (v) => !v : false);
    setRenderMenu(which === 'render' ? (v) => !v : false);
    setActionMenu(which === 'action' ? (v) => !v : false);
  };

  // เปิดแผงข้อมูล → ดันพื้นที่รูปไปทางซ้าย (ไม่ทับรูป)
  const panelW = 320;
  const availW = showInfo ? Math.max(360, vw - panelW) : vw;
  // 🚨 ต่างจากต้นฉบับ TB — กันพื้นที่ล่างไว้ให้แถบควบคุม (พี่กันทัก 29 ส.ค. 2569 ว่าแถบบังรูป)
  //    ต้นฉบับกางรูป 84% ของความสูงจอโดยไม่รู้ว่ามีแถบลอยอยู่ ขอบล่างรูปเลยมุดใต้แถบ
  //    ตรงนี้หักพื้นที่แถบออกก่อน แล้วให้รูปอยู่กึ่งกลางเฉพาะส่วนที่เหลือ
  const vertical = barPos === 'left' || barPos === 'right';
  const BAR_SPACE = 82;                       // แถบแนวนอน: สูง 56 + ห่างขอบ 22 + เผื่อ
  const BAR_WIDE = 74;                        // แถบแนวตั้ง: กว้าง 52 + ห่างขอบ 22
  // หักพื้นที่เฉพาะด้านที่แถบอยู่จริง ด้านอื่นได้พื้นที่เต็ม
  const usableW = Math.max(260, availW - (vertical ? BAR_WIDE : 0));
  const availH = Math.max(240, vh - (vertical ? 0 : BAR_SPACE));
  // จุดกึ่งกลางเลื่อนหนีด้านที่แถบอยู่ ไม่งั้นรูปยังทับแถบเหมือนเดิม
  const cx = barPos === 'left' ? BAR_WIDE + usableW / 2 : usableW / 2;
  const cy = barPos === 'top' ? BAR_SPACE + availH / 2 : availH / 2;
  const maxW = usableW * 0.92;
  const maxH = availH * 0.94;
  const fitRatio = (dim && dim.w && dim.h) ? Math.min(maxW / dim.w, maxH / dim.h, 1) : 1;
  // ซูม: ล้อ/นิ้ว ลึกได้ถึง ~8000% (เห็นพิกเซล) · ปุ่ม/แถบเลือก สูงสุด 4000%
  const clamp = (s: number) => Math.max(0.1 / fitRatio, Math.min(80 / fitRatio, s));

  // ── ขอบเขตการลาก (กันรูปหลุดออกนอกจอ) ──
  const baseSize = () => {
    const el = imgRef.current;   // ขนาดที่เรนเดอร์จริง — ถูกต้องทุกชนิดรูป รวม SVG ที่ naturalWidth ไม่ตรงขนาดจริง
    if (el && el.offsetWidth && el.offsetHeight) return { w: el.offsetWidth, h: el.offsetHeight };
    if (!dim || !dim.w || !dim.h) return { w: maxW, h: maxH };
    const r = Math.min(maxW / dim.w, maxH / dim.h, 1);
    return { w: dim.w * r, h: dim.h * r };
  };
  const clampPan = (x: number, y: number, s: number): [number, number] => {
    const b = baseSize();
    const limX = Math.max(0, (b.w * s) / 2 - usableW / 2);
    const limY = Math.max(0, (b.h * s) / 2 - availH / 2);
    return [Math.max(-limX, Math.min(limX, x)), Math.max(-limY, Math.min(limY, y))];
  };

  // ── ซูมโดยยึด "จุด" (เมาส์/ดับเบิลคลิก) ให้อยู่กับที่ + ไม่ลอยตอนสุดสเกล ──
  const zoomAt = (clientX: number, clientY: number, ns: number) => {
    const k = ns / scale;
    const mx = clientX - cx, my = clientY - cy;
    let nx: number, ny: number;
    if (ns <= 1.0001) { nx = 0; ny = 0; }                                  // ย่อจนพอดี → กึ่งกลางเป๊ะ
    else { nx = tx * k + mx * (1 - k); ny = ty * k + my * (1 - k); }       // k=1 (สุดสเกล) → ไม่ขยับ = ไม่ลอย
    [nx, ny] = clampPan(nx, ny, ns);
    setScale(ns); setTx(nx); setTy(ny);
  };
  const onWheel = (e: React.WheelEvent) => { zoomAt(e.clientX, e.clientY, clamp(scale * (e.deltaY < 0 ? 1.12 : 0.89))); };
  /** ดับเบิลคลิก → ซูมเข้า (อย่างน้อย 200% หรือ 100% พิกเซลจริง) ↔ พอดีจอ */
  const onDblClick = (e: React.MouseEvent) => { stop(e); if (scale > 1.05) fit(); else zoomAt(e.clientX, e.clientY, clamp(Math.max(2, 1 / fitRatio))); };
  const onMouseDown = (e: React.MouseEvent) => { e.preventDefault(); closeMenus(); drag.current = { x: e.clientX, y: e.clientY, tx, ty }; setDragging(true); };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!drag.current) return;
    const [nx, ny] = clampPan(drag.current.tx + (e.clientX - drag.current.x), drag.current.ty + (e.clientY - drag.current.y), scale);
    setTx(nx); setTy(ny);
  };
  const endDrag = () => { drag.current = null; setDragging(false); };
  const fit = (e?: React.MouseEvent) => { stop(e); dismissPopups(); setScale(1); setTx(0); setTy(0); setRot(0); };
  const zoomTo = (s: number) => { const ns = clamp(s); const [nx, ny] = clampPan(0, 0, ns); setScale(ns); setTx(nx); setTy(ny); };
  /** % จริง: scale=1 คือ "พอดีจอ" (รูปใหญ่อาจ ~30%) · 100% คือ 1:1 พิกเซลจริง */
  const zoomToPct = (p: number) => { const ns = clamp((p / 100) / fitRatio); const [nx, ny] = clampPan(0, 0, ns); setScale(ns); setTx(nx); setTy(ny); };
  const pct = Math.round(scale * fitRatio * 100);

  // ── สัมผัส (มือถือ/แท็บเล็ต): สองนิ้ว = จีบซูม · นิ้วเดียว = เลื่อน ──
  const dist2 = (t: React.TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  const mid2 = (t: React.TouchList) => ({ x: (t[0].clientX + t[1].clientX) / 2, y: (t[0].clientY + t[1].clientY) / 2 });
  const onTouchStart = (e: React.TouchEvent) => {
    closeMenus();
    if (e.touches.length === 2) touch.current = { mode: 'pinch', d: dist2(e.touches), s: scale };
    else if (e.touches.length === 1) touch.current = { mode: 'pan', x: e.touches[0].clientX, y: e.touches[0].clientY, tx, ty };
  };
  const onTouchMove = (e: React.TouchEvent) => {
    const t = touch.current;
    if (!t) return;
    if (t.mode === 'pinch' && e.touches.length === 2) {
      e.preventDefault();
      const m = mid2(e.touches);
      zoomAt(m.x, m.y, clamp((t.s ?? 1) * (dist2(e.touches) / (t.d || 1))));
    } else if (t.mode === 'pan' && e.touches.length === 1) {
      e.preventDefault();
      const [nx, ny] = clampPan((t.tx ?? 0) + (e.touches[0].clientX - (t.x ?? 0)), (t.ty ?? 0) + (e.touches[0].clientY - (t.y ?? 0)), scale);
      setTx(nx); setTy(ny);
    }
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (e.touches.length === 0) touch.current = null;
    else if (e.touches.length === 1) touch.current = { mode: 'pan', x: e.touches[0].clientX, y: e.touches[0].clientY, tx, ty };
  };

  const RENDER_MODES = [
    { v: 'auto' as const, Icon: Sparkles, label: 'ภาพเนียน (Smooth)', desc: 'เกลี่ยสีให้นุ่ม (ค่าเริ่มต้น) เหมาะดูรูปทั่วไป' },
    { v: 'pixelated' as const, Icon: Grid3x3, label: 'พิกเซลดิบ (Pixelated)', desc: 'ไม่เกลี่ยสี เห็นบล็อกพิกเซลจริง เหมาะส่องรายละเอียด' },
  ];
  const curRender = RENDER_MODES.find((m) => m.v === imgRendering) || RENDER_MODES[0];

  // ── เปิด (จังหวะขยาย) + วัดขนาดไฟล์ ──
  useEffect(() => {
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setOpen(true)));
    const t = setTimeout(() => setSettled(true), 450);
    return () => { cancelAnimationFrame(id); clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── คีย์ลัด (ผูกใหม่เมื่อ scale เปลี่ยน เพื่อใช้ค่าล่าสุด) ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '+' || e.key === '=') zoomTo(scale * 1.25);
      else if (e.key === '-' || e.key === '_') zoomTo(scale * 0.8);
      else if (e.key === '0') fit();
      else if (e.key === 'ArrowLeft' && hasPrev && onPrev) onPrev();
      else if (e.key === 'ArrowRight' && hasNext && onNext) onNext();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scale, hasPrev, hasNext]);

  // ป้ายบอกวิธีใช้ → จางหายเองใน 4 วินาที
  useEffect(() => { const t = setTimeout(() => setHintVisible(false), 4000); return () => clearTimeout(t); }, []);

  // เปิด: ขยายจากตำแหน่งรูปย่อที่กด
  let sx = 0, sy = 0, ss = 0.2;
  if (originRect) {
    sx = (originRect.left + originRect.width / 2) - cx;
    sy = (originRect.top + originRect.height / 2) - cy;
    ss = Math.max(0.12, Math.min(0.5, originRect.width / 520));
  }
  const startT = `translate(-50%,-50%) translate(${sx}px,${sy}px) scale(${ss}) rotate(0deg)`;
  const liveT = `translate(-50%,-50%) translate(${tx}px,${ty}px) scale(${scale}) rotate(${rot}deg)`;
  const imgTrans = (dragging
    ? 'opacity 0.3s ease'
    : (settled ? 'transform 0.18s ease-out, opacity 0.3s ease' : 'transform 0.42s cubic-bezier(0.16,1,0.3,1), opacity 0.35s ease'))
    + ', left 0.34s cubic-bezier(0.16,1,0.3,1)';
  const imgBase: React.CSSProperties = {
    position: 'absolute', top: cy + 'px', left: cx + 'px', maxWidth: maxW + 'px', maxHeight: maxH + 'px',
    objectFit: 'contain', userSelect: 'none', boxShadow: '0 25px 80px rgba(0,0,0,0.6)',
  };
  const bar: React.CSSProperties = {
    width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(255,255,255,0.12)',
    color: '#fff', border: 'none', cursor: 'pointer', fontSize: '15px',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  };
  // ตำแหน่งแถบควบคุมตามด้านที่ผู้ใช้เลือก
  const BAR_POSITIONS = [
    { v: 'top' as const, Icon: PanelTop, label: 'ด้านบน' },
    { v: 'bottom' as const, Icon: PanelBottom, label: 'ด้านล่าง' },
    { v: 'left' as const, Icon: PanelLeft, label: 'ด้านซ้าย' },
    { v: 'right' as const, Icon: PanelRight, label: 'ด้านขวา' },
  ];
  const barStyle: React.CSSProperties = {
    position: 'fixed',
    display: 'flex',
    flexDirection: vertical ? 'column' : 'row',
    alignItems: 'center',
    gap: '7px',
    background: C.panel,
    backdropFilter: 'blur(8px)',
    border: '1px solid rgba(255,214,226,0.18)',
    borderRadius: '14px',
    padding: vertical ? '12px 8px' : '8px 12px',
    // จางลงเมื่อไม่ได้ใช้ ชี้เมื่อไรก็ชัดเต็ม · เมนูเปิดค้างอยู่ก็ต้องชัดด้วย
    opacity: open ? (barHover || barMenu || zoomMenu || renderMenu ? 1 : 0.45) : 0,
    transition: 'opacity 0.25s ease',
    boxShadow: '0 10px 30px rgba(0,0,0,0.4)',
    zIndex: 8,
    ...(barPos === 'bottom' ? { bottom: '22px', left: '50%', transform: 'translateX(-50%)' }
      : barPos === 'top' ? { top: '22px', left: '50%', transform: 'translateX(-50%)' }
      : barPos === 'left' ? { left: '18px', top: '50%', transform: 'translateY(-50%)' }
      : { right: '18px', top: '50%', transform: 'translateY(-50%)' }),
  };
  // เส้นคั่นต้องหมุนตามทิศของแถบ ไม่งั้นแนวตั้งจะได้เส้นตั้งซ้อนกัน
  const divider: React.CSSProperties = vertical
    ? { height: '1px', width: '24px', background: 'rgba(255,255,255,0.15)' }
    : { width: '1px', height: '24px', background: 'rgba(255,255,255,0.15)' };
  // เมนูเลือกด้าน ต้องเด้งไปทางที่มีที่ว่าง ไม่งั้นโผล่นอกจอ
  const menuAnchor: React.CSSProperties = vertical
    ? (barPos === 'left' ? { left: '48px', top: 0 } : { right: '48px', top: 0 })
    : (barPos === 'top' ? { top: '48px', right: 0 } : { bottom: '48px', right: 0 });

  const fmtBytes = (b: number | null) => b == null ? '—'
    : (b < 1024 ? b + ' B' : b < 1048576 ? (b / 1024).toFixed(1) + ' KB' : (b / 1048576).toFixed(2) + ' MB');

  // เคอร์เซอร์มือ (ขอบดำ ไส้ขาว → เห็นชัดทั้งพื้นขาวและพื้นดำ)
  const handCur = `url("data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='32'%20height='32'%20viewBox='0%200%2024%2024'%20fill='white'%20stroke='black'%20stroke-width='1'%20stroke-linejoin='round'%3E%3Cpath%20d='M23%205.5V20c0%202.2-1.8%204-4%204h-7.3c-1.08%200-2.1-.43-2.85-1.19L1%2014.83s1.26-1.23%201.3-1.25c.22-.19.49-.29.79-.29.22%200%20.42.06.6.16.04.01%204.31%202.46%204.31%202.46V4c0-.83.67-1.5%201.5-1.5S11%203.17%2011%204v7h1V1.5c0-.83.67-1.5%201.5-1.5S15%20.67%2015%201.5V11h1V2.5c0-.83.67-1.5%201.5-1.5s1.5.67%201.5%201.5V11h1V5.5c0-.83.67-1.5%201.5-1.5s1.5.67%201.5%201.5z'/%3E%3C/svg%3E") 13 13, grab`;
  const fistCur = `url("data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='32'%20height='32'%20viewBox='0%200%2024%2024'%20fill='white'%20stroke='black'%20stroke-width='1'%20stroke-linejoin='round'%3E%3Cpath%20d='M7%209.5C7%208%208%207%209.5%207h4C16%207%2017%208.5%2017%2010v5c0%203-2%205.5-5.5%205.5h-1C8%2020.5%207%2019%206%2017.5l-2-3c-.6-.9-.3-2%20.6-2.4.7-.3%201.5-.1%202%20.5l.4.5V9.5z'/%3E%3C/svg%3E") 13 13, grabbing`;

  // ── มินิแมป: รูปย่อมุมจอ + กรอบบอกว่ากำลังส่องส่วนไหน (โผล่เมื่อรูปใหญ่เกินพื้นที่) ──
  const _b = baseSize();
  const dispW = _b.w * scale, dispH = _b.h * scale;
  const showMap = !!dim && (dispW > usableW + 4 || dispH > availH + 4);
  let mmW = 130, mmH = 130;
  if (dim) { const ar = dim.w / dim.h; if (ar >= 1) mmH = Math.round(130 / ar); else mmW = Math.round(130 * ar); }
  const fracW = Math.min(1, usableW / dispW), fracH = Math.min(1, availH / dispH);
  const rectW = mmW * fracW, rectH = mmH * fracH;
  const rectL = Math.max(0, Math.min(mmW - rectW, mmW / 2 + (-tx / dispW) * mmW - rectW / 2));
  const rectT = Math.max(0, Math.min(mmH - rectH, mmH / 2 + (-ty / dispH) * mmH - rectH / 2));

  const rows: Array<[string, React.ReactNode]> = [
    ['ชื่อไฟล์', info?.name || '—'],
    ['ขนาดภาพ', dim ? `${dim.w} × ${dim.h} px` : '—'],
    ...(info?.origDimText ? [['ขนาดภาพต้นฉบับ', info.origDimText] as [string, React.ReactNode]] : []),
    ...(info?.origText ? [['ไฟล์ต้นฉบับ', info.origText] as [string, React.ReactNode]] : []),
    ['ขนาดไฟล์', fmtBytes(bytes)],
    ...(info?.reducePct != null ? [['บีบลดลง', info.reducePct + '%'] as [string, React.ReactNode]] : []),
    ['ฟอร์แมต', info?.format || '—'],
    ['ซูมปัจจุบัน', pct + '%'],
    ['หมุน', (rot % 360) + '°'],
    ...(info?.uploader ? [['อัปโหลดโดย', info.uploader] as [string, React.ReactNode]] : []),
    ...(info?.device ? [['อัปโหลดจากอุปกรณ์', info.device] as [string, React.ReactNode]] : []),
    ...(info?.updatedAt ? [['อัปเดตล่าสุด', new Date(info.updatedAt).toLocaleString('th-TH')] as [string, React.ReactNode]] : []),
    ...(info?.storage ? [['โฟลเดอร์', info.storage] as [string, React.ReactNode]] : []),
    ...(info?.hashes
      ? Object.entries(info.hashes).map(([k, v]) => [k, v || '—'] as [string, React.ReactNode])
      : []),
  ];

  return createPortal(
    <div onMouseMove={onMouseMove} onMouseUp={endDrag} onMouseLeave={endDrag}
      style={{ position: 'fixed', inset: 0, zIndex: "var(--z-viewer)", background: `rgba(10,8,10,${open ? 0.95 : 0})`, transition: 'background 0.32s ease', overflow: 'hidden' }}>

      {/* คลิกพื้นหลัง = ปิด */}
      <div onClick={doClose} style={{ position: 'absolute', inset: 0, cursor: 'zoom-out' }} />

      {/* แถบโหลดด้านบน ระหว่างรอรูปเต็ม */}
      {!fullLoaded && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: '3px', background: 'rgba(255,255,255,0.08)', overflow: 'hidden', zIndex: 6 }}>
          <div className="ivw-bar" style={{ height: '100%', background: `linear-gradient(90deg,${C.main},${C.soft})` }} />
        </div>
      )}

      {/* รูปย่อ (เบลอ) เป็นตัวแทนระหว่างรอรูปเต็ม → กดแล้วเห็นภาพทันที */}
      {thumb && !fullLoaded && (
        <img src={thumb} alt="" draggable={false}
          style={{ ...imgBase, transform: open ? liveT : startT, opacity: open ? 1 : 0, transition: 'transform 0.42s cubic-bezier(0.16,1,0.3,1), opacity 0.35s ease', filter: 'blur(8px)', pointerEvents: 'none' }} />
      )}

      {/* รูปเต็ม */}
      <img ref={imgRef} src={curSrc || undefined} alt="" draggable={false}
        onLoad={(e) => {
          const t = e.currentTarget;
          const nw = t.naturalWidth || t.offsetWidth || 0, nh = t.naturalHeight || t.offsetHeight || 0;
          setDim(nw > 0 && nh > 0 ? { w: nw, h: nh } : null);
          setFullLoaded(true);
        }}
        onWheel={onWheel} onMouseDown={onMouseDown} onClick={(e) => stop(e)} onDoubleClick={onDblClick}
        onContextMenu={(e) => e.preventDefault()}
        onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
        style={{
          ...imgBase, transform: open ? liveT : startT,
          opacity: (open && (fullLoaded || !thumb)) ? 1 : 0, transition: imgTrans,
          imageRendering: imgRendering, touchAction: 'none',
          cursor: dragging ? fistCur : handCur,
        }} />

      {/* มินิแมป */}
      {showMap && (
        <div style={{ position: 'fixed', top: '78px', right: (showInfo ? (panelW + 18) : 18) + 'px', width: mmW + 'px', height: mmH + 'px', borderRadius: '6px', overflow: 'hidden', boxShadow: '0 6px 20px rgba(0,0,0,0.5)', border: '2px solid rgba(255,255,255,0.5)', opacity: open ? 1 : 0, transition: 'opacity 0.3s, right 0.34s cubic-bezier(0.16,1,0.3,1)', zIndex: 8, background: '#0b0f19', pointerEvents: 'none' }}>
          <img src={thumb || curSrc} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.85 }} />
          <div style={{ position: 'absolute', left: rectL + 'px', top: rectT + 'px', width: rectW + 'px', height: rectH + 'px', border: `2px solid ${C.bar}`, background: 'rgba(224,122,159,0.22)', boxSizing: 'border-box' }} />
        </div>
      )}

      {/* ลูกศรเลื่อนรูป */}
      {hasPrev && (
        <button onClick={(e) => { stop(e); onPrev?.(); }} title="ก่อนหน้า (ปุ่มลูกศรซ้าย)"
          style={{ position: 'fixed', top: '50%', left: '16px', transform: 'translateY(-50%)', width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(17,24,39,0.7)', color: '#fff', border: 'none', cursor: 'pointer', opacity: open ? 1 : 0, transition: 'opacity 0.3s', zIndex: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <ChevronLeft size={20} />
        </button>
      )}
      {hasNext && (
        <button onClick={(e) => { stop(e); onNext?.(); }} title="ถัดไป (ปุ่มลูกศรขวา)"
          style={{ position: 'fixed', top: '50%', right: '16px', transform: 'translateY(-50%)', width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(17,24,39,0.7)', color: '#fff', border: 'none', cursor: 'pointer', opacity: open ? 1 : 0, transition: 'opacity 0.3s', zIndex: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <ChevronRight size={20} />
        </button>
      )}

      {/* ป้ายบอกวิธีใช้ (จางหายเองใน 4 วินาที) */}
      <div style={{ position: 'fixed', top: '18px', left: '50%', transform: 'translateX(-50%)', background: 'rgba(17,24,39,0.82)', color: '#e5e7eb', fontSize: '12px', padding: '7px 14px', borderRadius: '999px', opacity: (open && hintVisible) ? 1 : 0, transition: 'opacity 0.4s', pointerEvents: 'none', zIndex: 8, whiteSpace: 'nowrap', maxWidth: '92vw', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', gap: '6px' }}>
        <Info size={14} style={{ color: C.soft }} />
        เลื่อนล้อเมาส์เพื่อซูม ดับเบิลคลิกเพื่อซูมเข้าออก ลากเพื่อเลื่อนรูป และกดปุ่มเครื่องหมายคำถามเพื่อดูวิธีใช้ทั้งหมด
      </div>

      {/* มุมขวาบน */}
      <div style={{ position: 'fixed', top: '18px', right: '18px', display: 'flex', gap: '6px', opacity: open ? 1 : 0, transition: 'opacity 0.3s', zIndex: 8, background: 'rgba(17,24,39,0.6)', backdropFilter: 'blur(6px)', borderRadius: '14px', padding: '5px', boxShadow: '0 6px 20px rgba(0,0,0,0.35)' }}>
        {menuActions && menuActions.length > 0 && (
          <div style={{ position: 'relative' }}>
            <button onClick={(e) => { stop(e); toggleMenu('action'); }} title="เพิ่มเติม" className="ivw-btn"
              style={{ ...bar, background: actionMenu ? C.main : 'rgba(255,255,255,0.12)' }}><MoreVertical size={16} /></button>
            {actionMenu && (
              <div onClick={(e) => stop(e)} style={{ position: 'absolute', top: '48px', right: 0, background: C.panel, borderRadius: '12px', padding: '6px', boxShadow: '0 12px 30px rgba(0,0,0,0.5)', minWidth: '190px', display: 'flex', flexDirection: 'column' }}>
                {menuActions.map((a, i) => (
                  <button key={i} onClick={(e) => { stop(e); setActionMenu(false); a.onClick?.(); }}
                    style={{ background: 'transparent', color: a.danger ? '#fca5a5' : '#e5e7eb', border: 'none', padding: '9px 12px', borderRadius: '7px', cursor: 'pointer', fontSize: '13px', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '10px' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                    {a.icon}{a.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <button onClick={(e) => { stop(e); toggleMenu('help'); }} title="วิธีใช้และคีย์ลัด" className="ivw-btn"
          style={{ ...bar, background: showHelp ? C.main : 'rgba(255,255,255,0.12)' }}><HelpCircle size={16} /></button>
        <button onClick={(e) => { stop(e); dismissPopups(); setShowInfo((v) => !v); }} title="ข้อมูลรูป" className="ivw-btn"
          style={{ ...bar, background: showInfo ? C.main : 'rgba(255,255,255,0.12)' }}><Info size={16} /></button>
        <button onClick={doClose} title="ปิด (Esc)" className="ivw-btn" style={bar}><X size={16} /></button>
      </div>

      {/* แผงวิธีใช้ / คีย์ลัด */}
      {showHelp && (
        <div onClick={(e) => stop(e)} style={{ position: 'fixed', top: '70px', right: '18px', width: '264px', background: 'rgba(17,24,39,0.97)', borderRadius: '14px', padding: '14px 16px', boxShadow: '0 16px 40px rgba(0,0,0,0.5)', zIndex: 9, color: '#e5e7eb' }}>
          <p style={{ margin: '0 0 8px', fontWeight: 700, fontSize: '13px', color: '#fff', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Keyboard size={14} style={{ color: C.soft }} />วิธีใช้ / คีย์ลัด
          </p>
          {([['เลื่อนล้อเมาส์', 'ซูมเข้าออกตามจุดเมาส์'], ['ดับเบิลคลิก', 'ซูมเข้าออกที่จุดนั้น'], ['ลากเมาส์', 'เลื่อนรูป'], ['สองนิ้ว', 'ซูม (จอสัมผัส)'], ['+ −', 'ซูมเข้าหรือออก'], ['0', 'พอดีหน้าจอ'], ['← →', 'รูปก่อนหน้าหรือถัดไป'], ['Esc', 'ปิด']] as const).map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', padding: '4px 0', fontSize: '12px' }}>
              <span style={{ color: C.soft, fontWeight: 700, flexShrink: 0 }}>{k}</span>
              <span style={{ color: '#cbd5e1', textAlign: 'right' }}>{v}</span>
            </div>
          ))}
        </div>
      )}

      {/* แผงข้อมูลรูป — สไลด์เข้าจากขวา (อยู่ตลอด เพื่อให้ขยับได้ทั้งเข้าและออก) */}
      <div onClick={(e) => stop(e)} style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: '312px', background: 'var(--win)', boxShadow: '-12px 0 40px rgba(0,0,0,0.35)', overflowY: 'auto', display: 'flex', flexDirection: 'column', zIndex: 9, transform: showInfo ? 'translateX(0)' : 'translateX(106%)', transition: 'transform 0.34s cubic-bezier(0.16,1,0.3,1)', pointerEvents: showInfo ? 'auto' : 'none' }}>
        <div style={{ background: C.main, padding: '18px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <p style={{ fontSize: '15px', fontWeight: 700, margin: 0, color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Info size={16} />ข้อมูลรูป
          </p>
          <button onClick={(e) => { stop(e); setShowInfo(false); }} title="ปิด"
            style={{ width: '30px', height: '30px', borderRadius: '8px', background: 'rgba(255,255,255,0.22)', color: '#fff', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={16} /></button>
        </div>
        <div style={{ padding: '6px 20px 20px' }}>
          {/* คำอธิบาย — คลิกพิมพ์ได้เลย */}
          {info && (info.noteEditable || info.note) && (
            <div style={{ padding: '11px 0', borderBottom: '1px solid var(--line)' }}>
              <p style={{ fontSize: '10px', color: 'var(--txt3)', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>คำอธิบาย</p>
              {noteEditing ? (
                <div>
                  <textarea value={noteVal} onChange={(e) => setNoteVal(e.target.value)} autoFocus rows={3}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: `1px solid ${C.soft}`, fontSize: '13px', color: C.deep, boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit', outline: 'none' }} />
                  <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                    <button disabled={noteSaving} onClick={async () => { setNoteSaving(true); try { await info.onSaveNote?.(noteVal); setNoteEditing(false); } catch { /* แผงข้อมูลในโปรแกรมนี้ไม่ได้เปิดแก้คำอธิบาย */ } setNoteSaving(false); }}
                      style={{ flex: 1, padding: '7px', borderRadius: '8px', background: C.main, color: '#fff', border: 'none', fontWeight: 700, fontSize: '12px', cursor: 'pointer' }}>{noteSaving ? 'กำลังบันทึก...' : 'บันทึก'}</button>
                    <button disabled={noteSaving} onClick={() => setNoteEditing(false)}
                      style={{ flex: 1, padding: '7px', borderRadius: '8px', background: '#f3f4f6', color: '#4b5563', border: 'none', fontWeight: 700, fontSize: '12px', cursor: 'pointer' }}>ยกเลิก</button>
                  </div>
                </div>
              ) : (
                <p onClick={() => { if (info.noteEditable) { setNoteVal(info.note || ''); setNoteEditing(true); } }}
                  style={{ fontSize: '13px', fontWeight: 600, margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: info.note ? C.deep : '#9ca3af', cursor: info.noteEditable ? 'text' : 'default' }}>
                  {info.note || (info.noteEditable ? 'คลิกเพื่อเพิ่มคำอธิบาย' : '—')}
                </p>
              )}
            </div>
          )}
          {rows.map(([k, v]) => (
            <div key={k} style={{ padding: '11px 0', borderBottom: '1px solid var(--line)' }}>
              <p style={{ fontSize: '10px', color: 'var(--txt3)', margin: '0 0 3px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{k}</p>
              <p style={{ fontSize: '13px', color: C.deep, fontWeight: 600, margin: 0, wordBreak: 'break-all' }}>{v}</p>
            </div>
          ))}
          {infoAction && (
            <button onClick={(e) => { stop(e); infoAction(); }}
              style={{ width: '100%', marginTop: '16px', padding: '11px', borderRadius: '10px', background: C.main, color: '#fff', border: 'none', fontWeight: 700, fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px' }}>
              <List size={16} />ดูรายละเอียดเต็ม
            </button>
          )}
        </div>
      </div>

      {/* แถบควบคุม — ย้ายได้ 4 ด้าน · จางลงเมื่อไม่ได้ใช้ */}
      <div
        onClick={(e) => stop(e)}
        onMouseEnter={() => setBarHover(true)}
        onMouseLeave={() => setBarHover(false)}
        style={barStyle}
      >
        <button onClick={(e) => { stop(e); dismissPopups(); setRot((r) => r - 90); }} title="หมุนซ้าย" className="ivw-btn" style={bar}><RotateCcw size={16} /></button>
        <button onClick={(e) => { stop(e); dismissPopups(); setRot((r) => r + 90); }} title="หมุนขวา" className="ivw-btn" style={bar}><RotateCw size={16} /></button>
        <button onClick={fit} title="พอดีจอ (กด 0)" className="ivw-btn" style={bar}><Maximize size={16} /></button>
        <button onClick={(e) => { stop(e); dismissPopups(); zoomToPct(100); }} title="ขนาดจริง 1:1" className="ivw-btn" style={{ ...bar, width: 'auto', padding: '0 10px', fontSize: '12px', fontWeight: 800 }}>1:1</button>
        <div style={divider} />
        <button onClick={(e) => { stop(e); dismissPopups(); zoomTo(scale * 0.8); }} title="ย่อ (−)" className="ivw-btn" style={bar}><ZoomOut size={16} /></button>
        {/* แถบตั้งไม่มีที่ให้สไลเดอร์ ใช้ปุ่มขยายย่อกับเมนูเลือก % แทน */}
        {!vertical && (
          <input type="range" min={10} max={4000} step={1} value={Math.min(4000, Math.max(10, pct))}
            onChange={(e) => { stop(e); dismissPopups(); zoomToPct(Number(e.target.value)); }}
            onMouseDown={(e) => stop(e)} title="เลื่อนปรับขนาด"
            style={{ width: '130px', accentColor: C.bar, cursor: 'pointer' }} />
        )}
        <button onClick={(e) => { stop(e); dismissPopups(); zoomTo(scale * 1.25); }} title="ขยาย (+)" className="ivw-btn" style={bar}><ZoomIn size={16} /></button>
        <div style={divider} />
        <div style={{ position: 'relative' }}>
          {/* แถบตั้ง: บีบให้เท่าปุ่มอื่น ไม่งั้นปุ่มนี้โดดออกมาปุ่มเดียว (พี่กันทัก 29 ส.ค. 2569) */}
          <button onClick={(e) => { stop(e); toggleMenu('zoom'); }} title={`เลือกขนาด (ตอนนี้ ${pct}%)`} className="ivw-btn"
            style={vertical
              ? { ...bar, fontSize: '11px', fontWeight: 800, letterSpacing: '-0.3px' }
              : { ...bar, width: 'auto', padding: '0 12px', fontSize: '13px', fontWeight: 700, gap: '6px' }}>
            {vertical ? <Keep all={["000%"]}>{pct}%</Keep> : <><Keep all={["000%"]}>{pct}%</Keep> <ChevronDown size={12} /></>}
          </button>
          {zoomMenu && (
            <div style={{ position: 'absolute', ...menuAnchor, background: C.panel, borderRadius: '10px', padding: '6px', boxShadow: '0 10px 30px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column', minWidth: '92px' }}>
              {[4000, 2000, 1000, 400, 200, 100, 50, 25, 10].map((p) => (
                <button key={p} onClick={(e) => { stop(e); zoomToPct(p); setZoomMenu(false); }}
                  style={{ background: pct === p ? C.main : 'transparent', color: '#fff', border: 'none', padding: '7px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', textAlign: 'center' }}>{p}%</button>
              ))}
            </div>
          )}
        </div>
        <div style={divider} />
        {/* โหมดลบรอยหยัก */}
        <div style={{ position: 'relative' }}>
          <button onClick={(e) => { stop(e); toggleMenu('render'); }} title={'การแสดงผลตอนซูมแบบ' + curRender.label + ' ' + curRender.desc} className="ivw-btn"
            style={{ ...bar, background: imgRendering !== 'auto' ? C.main : 'rgba(255,255,255,0.12)' }}>
            <curRender.Icon size={16} />
          </button>
          {renderMenu && (
            <div style={{ position: 'absolute', ...menuAnchor, background: C.panel, borderRadius: '10px', padding: '6px', boxShadow: '0 10px 30px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column', minWidth: '190px' }}>
              <p style={{ fontSize: '10px', color: '#94a3b8', margin: '4px 8px 6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>โหมดลบรอยหยัก</p>
              {RENDER_MODES.map((m) => (
                <button key={m.v} onClick={(e) => { stop(e); setImgRendering(m.v); setRenderMenu(false); }} title={m.desc}
                  style={{ background: imgRendering === m.v ? C.main : 'transparent', color: '#fff', border: 'none', padding: '8px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '9px' }}>
                  <m.Icon size={16} style={{ color: C.soft }} />{m.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <div style={divider} />
        {/* ย้ายแถบไปด้านอื่น — รูปบางรูปมีเนื้อหาสำคัญตรงที่แถบบังพอดี */}
        <div style={{ position: 'relative' }}>
          <button onClick={(e) => { stop(e); dismissPopups(); setBarMenu((v) => !v); }}
            title="ย้ายแถบควบคุมไปด้านอื่น" className="ivw-btn"
            style={{ ...bar, background: barMenu ? C.main : 'rgba(255,255,255,0.12)' }}>
            <Move size={16} />
          </button>
          {barMenu && (
            <div style={{ position: 'absolute', ...menuAnchor, background: C.panel, borderRadius: '10px', padding: '6px', boxShadow: '0 10px 30px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column', minWidth: '150px' }}>
              <p style={{ fontSize: '10px', color: '#94a3b8', margin: '4px 8px 6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>ย้ายแถบไป</p>
              {BAR_POSITIONS.map((b2) => (
                <button key={b2.v} onClick={(e) => { stop(e); moveBar(b2.v); }}
                  style={{ background: barPos === b2.v ? C.main : 'transparent', color: '#fff', border: 'none', padding: '8px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '9px' }}>
                  <b2.Icon size={16} style={{ color: C.soft }} />{b2.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
