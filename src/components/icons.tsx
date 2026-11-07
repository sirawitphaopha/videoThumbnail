/* ไอคอนทุกตัวของโปรแกรม วาดเป็น SVG ในไฟล์ ไม่ใช้ตัวอักษรพิเศษ (web-craft 6 · form-input ⑤)
   เส้นทั้งหมดยกจากหน้าตาต้นแบบ docs/mockups/poster-shelf.html
   ไอคอนเป็นของประดับ ใส่ aria-hidden เสมอ ชื่อปุ่มอยู่ที่ตัวปุ่ม */
type P = { size?: number; stroke?: string; width?: number };
const svg = (size: number, w: number, stroke: string, children: React.ReactNode) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={w} aria-hidden="true" focusable="false">
    {children}
  </svg>
);

export const IcBrand = ({ size = 24 }: P) =>
  svg(size, 2, "#e07a9f", <><rect x="3" y="3" width="5" height="18" rx="1" /><rect x="10" y="3" width="5" height="18" rx="1" /><path d="M17.5 4.5l3.5 1-4 15.5-3.4-1" /></>);
export const IcShelf = ({ size = 18, stroke = "currentColor" }: P) =>
  svg(size, 2, stroke, <path d="M3 20h18M5 20V6h4v14M11 20V4h4v16M17 20l2-12 3 .6-2 11.4" />);
export const IcPoster = ({ size = 18, stroke = "currentColor" }: P) =>
  svg(size, 2, stroke, <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 15l3-3 2 2 3-3 2 2" /><circle cx="9" cy="8" r="1.5" /></>);
export const IcCheck = ({ size = 18, stroke = "currentColor" }: P) =>
  svg(size, 2, stroke, <><path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z" /><path d="M8.5 12l2.5 2.5 4.5-5" /></>);
/** กราฟเสียง (มอคอัป docs/mockups/audio-graph.html) */
export const IcGraph = ({ size = 18, stroke = "currentColor" }: P) =>
  svg(size, 2, stroke, <path d="M3 12h2M7 7v10M11 4v16M15 8v8M19 10v4" />);
export const IcSettings = ({ size = 18, stroke = "currentColor" }: P) =>
  svg(size, 2, stroke, <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" /></>);
export const IcCollapse = ({ size = 18, stroke = "currentColor" }: P) =>
  svg(size, 2.2, stroke, <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /><path d="M15.5 9.5L13 12l2.5 2.5" /></>);
export const IcFolder = ({ size = 18, stroke = "currentColor" }: P) =>
  svg(size, 2, stroke, <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />);
export const IcSearch = ({ size = 16, stroke = "currentColor", width = 2.5 }: P) =>
  svg(size, width, stroke, <><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></>);
export const IcChevronDown = ({ size = 16, stroke = "#b07a90" }: P) =>
  svg(size, 2.5, stroke, <path d="M6 9l6 6 6-6" />);
export const IcRefresh = ({ size = 16, stroke = "currentColor" }: P) =>
  svg(size, 2.5, stroke, <><path d="M4 4v6h6M20 20v-6h-6" /><path d="M20 10a8 8 0 00-14-4L4 10M4 14a8 8 0 0014 4l2-4" /></>);
export const IcClose = ({ size = 14, stroke = "currentColor" }: P) =>
  svg(size, 2.4, stroke, <path d="M6 6l12 12M18 6L6 18" />);

/* ปุ่มของแถบชื่อ ขนาด 10 ตามต้นแบบ · เส้นใช้สีของปุ่ม จะได้เปลี่ยนตามตอนชี้ */
export const TbMin = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M0 5h10" stroke="currentColor" strokeWidth="1.2" /></svg>
);
export const TbMax = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><rect x=".6" y=".6" width="8.8" height="8.8" fill="none" stroke="currentColor" strokeWidth="1.2" /></svg>
);
export const TbRestore = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
    <rect x=".6" y="2.6" width="6.8" height="6.8" fill="none" stroke="currentColor" strokeWidth="1.2" />
    <path d="M2.6 2.6V.6h6.8v6.8H7.4" fill="none" stroke="currentColor" strokeWidth="1.2" />
  </svg>
);
export const TbClose = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M0 0l10 10M10 0L0 10" stroke="currentColor" strokeWidth="1.2" /></svg>
);
