/* ตัวดูรูปเต็มจอ ไอคอนเส้นของตัวดูรูป (ยกจากของกลาง สกิล image-viewer เส้นแบบ lucide)
   แยกจาก ImageViewer.tsx ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 · แผนแบ่งไฟล์ขั้น 7.5) ย้ายมาทั้งก้อน เนื้อโค้ดไม่เปลี่ยน */

type IconProps = { size?: number; style?: React.CSSProperties };
const mk = (body: React.ReactNode) => ({ size = 16, style }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" style={style}>{body}</svg>
);
const FRAME = <rect width="18" height="18" x="3" y="3" rx="2" />;
export const ChevronLeft = mk(<path d="m15 18-6-6 6-6" />);
export const ChevronRight = mk(<path d="m9 18 6-6-6-6" />);
export const ChevronDown = mk(<path d="m6 9 6 6 6-6" />);
export const Info = mk(<><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></>);
export const MoreVertical = mk(<><circle cx="12" cy="12" r="1" /><circle cx="12" cy="5" r="1" /><circle cx="12" cy="19" r="1" /></>);
export const HelpCircle = mk(<><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><path d="M12 17h.01" /></>);
export const X = mk(<><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>);
export const Keyboard = mk(<><path d="M10 8h.01" /><path d="M12 12h.01" /><path d="M14 8h.01" /><path d="M16 12h.01" /><path d="M18 8h.01" /><path d="M6 8h.01" /><path d="M7 16h10" /><path d="M8 12h.01" /><rect width="20" height="16" x="2" y="4" rx="2" /></>);
export const RotateCcw = mk(<><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /></>);
export const RotateCw = mk(<><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /></>);
export const Maximize = mk(<><path d="M8 3H5a2 2 0 0 0-2 2v3" /><path d="M21 8V5a2 2 0 0 0-2-2h-3" /><path d="M3 16v3a2 2 0 0 0 2 2h3" /><path d="M16 21h3a2 2 0 0 0 2-2v-3" /></>);
export const ZoomIn = mk(<><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /><path d="M11 8v6" /><path d="M8 11h6" /></>);
export const ZoomOut = mk(<><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /><path d="M8 11h6" /></>);
export const Sparkles = mk(<><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" /><path d="M20 3v4" /><path d="M22 5h-4" /><path d="M4 17v2" /><path d="M5 18H3" /></>);
export const Grid3x3 = mk(<>{FRAME}<path d="M3 9h18" /><path d="M3 15h18" /><path d="M9 3v18" /><path d="M15 3v18" /></>);
export const List = mk(<><path d="M8 6h13" /><path d="M8 12h13" /><path d="M8 18h13" /><path d="M3 6h.01" /><path d="M3 12h.01" /><path d="M3 18h.01" /></>);
export const Move = mk(<><path d="M12 2v20" /><path d="m15 19-3 3-3-3" /><path d="m19 9 3 3-3 3" /><path d="M2 12h20" /><path d="m5 9-3 3 3 3" /><path d="m9 5 3-3 3 3" /></>);
export const PanelTop = mk(<>{FRAME}<path d="M3 9h18" /></>);
export const PanelBottom = mk(<>{FRAME}<path d="M3 15h18" /></>);
export const PanelLeft = mk(<>{FRAME}<path d="M9 3v18" /></>);
export const PanelRight = mk(<>{FRAME}<path d="M15 3v18" /></>);