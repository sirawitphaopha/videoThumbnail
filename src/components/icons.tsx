/* ไอคอนทุกตัวของโปรแกรม วาดเป็น SVG ในไฟล์ ไม่ใช้ตัวอักษรพิเศษ (web-craft 6 · form-input ⑤)
   เส้นทั้งหมดยกจากหน้าตาต้นแบบ docs/mockups/poster-shelf.html
   ไอคอนเป็นของประดับ ใส่ aria-hidden เสมอ ชื่อปุ่มอยู่ที่ตัวปุ่ม */
type P = { size?: number; stroke?: string; width?: number };
const svg = (size: number, w: number, stroke: string, children: React.ReactNode) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={w} aria-hidden="true" focusable="false">
    {children}
  </svg>
);

export const IcCopy = ({ size = 14, stroke = "currentColor" }: P) =>
  svg(size, 2, stroke, <><rect width="14" height="14" x="8" y="8" rx="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" /></>);
/** วางจากคลิปบอร์ด (BUGS ข้อ 31) */
export const IcPaste = ({ size = 14, stroke = "currentColor" }: P) =>
  svg(size, 2, stroke, <><rect width="8" height="4" x="8" y="2" rx="1" /><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2" /></>);
export const IcPalette = ({ size = 18, stroke = "currentColor" }: P) =>
  svg(size, 2, stroke, <><circle cx="13.5" cy="6.5" r=".5" /><circle cx="17.5" cy="10.5" r=".5" /><circle cx="8.5" cy="7.5" r=".5" /><circle cx="6.5" cy="12.5" r=".5" /><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" /></>);
export const IbSwap = ({ size = 15, stroke = "currentColor" }: P) =>
  svg(size, 2.2, stroke, <><path d="M8 3 4 7l4 4" /><path d="M4 7h16" /><path d="m16 21 4-4-4-4" /><path d="M20 17H4" /></>);
export const IbTrash = ({ size = 15, stroke = "currentColor" }: P) =>
  svg(size, 2.2, stroke, <><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></>);
export const IbBack = ({ size = 15, stroke = "currentColor" }: P) =>
  svg(size, 2.2, stroke, <><path d="m15 18-6-6 6-6" /></>);
export const IbNext = ({ size = 15, stroke = "currentColor" }: P) =>
  svg(size, 2.2, stroke, <><path d="m9 18 6-6-6-6" /></>);
export const IbStop = ({ size = 15, stroke = "currentColor" }: P) =>
  svg(size, 2.2, stroke, <><rect x="5" y="5" width="14" height="14" rx="2" /></>);
export const IbTick = ({ size = 15, stroke = "currentColor" }: P) =>
  svg(size, 2.2, stroke, <><path d="M5 12.5l4.5 4.5L19 7.5" /></>);
export const IbPencil = ({ size = 15, stroke = "currentColor" }: P) =>
  svg(size, 2.2, stroke, <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></>);
export const IbSave = ({ size = 15, stroke = "currentColor" }: P) =>
  svg(size, 2.2, stroke, <><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></>);
export const IbPlay = ({ size = 15, stroke = "currentColor" }: P) =>
  svg(size, 2.2, stroke, <><path d="M7 4.5v15l12-7.5z" /></>);
export const IbTable = ({ size = 15, stroke = "currentColor" }: P) =>
  svg(size, 2.2, stroke, <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18" /><path d="M9 10v10" /><path d="M15 10v10" /></>);
export const IbEye = ({ size = 15, stroke = "currentColor" }: P) =>
  svg(size, 2.2, stroke, <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></>);
export const IbCrop = ({ size = 15, stroke = "currentColor" }: P) =>
  svg(size, 2.2, stroke, <><path d="M6 2v14a2 2 0 0 0 2 2h14" /><path d="M18 22V8a2 2 0 0 0-2-2H2" /></>);
export const IbRotL = ({ size = 15, stroke = "currentColor" }: P) =>
  svg(size, 2.2, stroke, <><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /></>);
export const IbRotR = ({ size = 15, stroke = "currentColor" }: P) =>
  svg(size, 2.2, stroke, <><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /></>);
export const IbFlip = ({ size = 15, stroke = "currentColor" }: P) =>
  svg(size, 2.2, stroke, <><path d="M12 3v18" /><path d="M8 7 3 17h5z" /><path d="m16 7 5 10h-5z" /></>);
export const IcExpand = ({ size = 14, stroke = "currentColor" }: P) =>
  svg(size, 2.4, stroke, <><path d="M15 3h6v6" /><path d="m21 3-7 7" /><path d="m3 21 7-7" /><path d="M9 21H3v-6" /></>);
export const IcBrand = ({ size = 24 }: P) =>
  svg(size, 2, "#e07a9f", <><rect x="3" y="3" width="5" height="18" rx="1" /><rect x="10" y="3" width="5" height="18" rx="1" /><path d="M17.5 4.5l3.5 1-4 15.5-3.4-1" /></>);
export const IcShelf = ({ size = 18, stroke = "currentColor" }: P) =>
  svg(size, 2, stroke, <path d="M3 20h18M5 20V6h4v14M11 20V4h4v16M17 20l2-12 3 .6-2 11.4" />);
export const IcPoster = ({ size = 18, stroke = "currentColor" }: P) =>
  svg(size, 2, stroke, <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 15l3-3 2 2 3-3 2 2" /><circle cx="9" cy="8" r="1.5" /></>);
export const IcCheck = ({ size = 18, stroke = "currentColor" }: P) =>
  svg(size, 2, stroke, <><path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z" /><path d="M8.5 12l2.5 2.5 4.5-5" /></>);
/** เสียงและซับ (มอคอัป docs/mockups/audio-merge.html ไอคอน mix) */
export const IcMix = ({ size = 18, stroke = "currentColor" }: P) =>
  svg(size, 2, stroke, <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" />);
/** กราฟเสียง (มอคอัป docs/mockups/audio-graph.html) */
export const IcGraph = ({ size = 18, stroke = "currentColor" }: P) =>
  svg(size, 2, stroke, <path d="M3 12h2M7 7v10M11 4v16M15 8v8M19 10v4" />);
/** แท่งบิตเรตกับเส้นค่าเฉลี่ย หน้าบิตเรตวิดีโอ */
export const IcBitrate = ({ size = 18, stroke = "currentColor" }: P) =>
  svg(size, 2, stroke, <><path d="M4 20V13M8 20V9M12 20v-6M16 20V6M20 20v-9" /><path d="M3 11l5-3 4 3 4-5 5 3" strokeWidth={1.4} /></>);
export const IcSettings = ({ size = 18, stroke = "currentColor" }: P) =>
  svg(size, 2, stroke, <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" /></>);
export const IcCollapse = ({ size = 18, stroke = "currentColor" }: P) =>
  svg(size, 2.2, stroke, <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /><path d="M15.5 9.5L13 12l2.5 2.5" /></>);
/** ย่อและกางแผงด้านขวา (แผงสรุปหน้า MediaInfo · BUGS ข้อ 29) กรอบเดียวกับปุ่มย่อเมนูซ้าย เส้นแบ่งอยู่ฝั่งขวา */
export const IcSideHide = ({ size = 16, stroke = "currentColor" }: P) =>
  svg(size, 2.2, stroke, <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M15 4v16" /><path d="M8.5 9.5L11 12l-2.5 2.5" /></>);
export const IcSideShow = ({ size = 16, stroke = "currentColor" }: P) =>
  svg(size, 2.2, stroke, <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M15 4v16" /><path d="M11 9.5L8.5 12l2.5 2.5" /></>);
export const IcLink = ({ size = 18, stroke = "currentColor" }: P) =>
  svg(size, 2, stroke, <><path d="M10 13a5 5 0 007 0l3-3a5 5 0 00-7-7l-1 1" /><path d="M14 11a5 5 0 00-7 0l-3 3a5 5 0 007 7l1-1" /></>);
/* ปุ่มขนาดปกกับทิศปก · กรอบปกโตตามขนาด ตั้งกับนอนตามทิศจริง */
export const IcCoverS = ({ size = 15, stroke = "currentColor" }: P) =>
  svg(size, 2.2, stroke, <rect x="8.5" y="7.5" width="7" height="9.5" rx="1" />);
export const IcCoverM = ({ size = 15, stroke = "currentColor" }: P) =>
  svg(size, 2.2, stroke, <rect x="6.5" y="5" width="11" height="14.5" rx="1.2" />);
export const IcCoverL = ({ size = 15, stroke = "currentColor" }: P) =>
  svg(size, 2.2, stroke, <rect x="4" y="2.5" width="16" height="19.5" rx="1.5" />);
export const IcTall = ({ size = 15, stroke = "currentColor" }: P) =>
  svg(size, 2.2, stroke, <rect x="6.5" y="3" width="11" height="18" rx="1.5" />);
export const IcWide = ({ size = 15, stroke = "currentColor" }: P) =>
  svg(size, 2.2, stroke, <rect x="3" y="6.5" width="18" height="11" rx="1.5" />);
/** เมนู MediaInfo (BUGS ข้อ 54) ตัว i ในวงกลม แบบปุ่มข้อมูลไฟล์ */
export const IcInfo = ({ size = 18, stroke = "currentColor" }: P) =>
  svg(size, 2, stroke, <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.6v.4" /></>);
/** แยกออกจากหนัง (BUGS ข้อ 35) ลูกศรออกจากกล่อง */
export const IcExtract = ({ size = 15, stroke = "currentColor" }: P) =>
  svg(size, 2, stroke, <><path d="M4 14v5a2 2 0 002 2h12a2 2 0 002-2v-5" /><path d="M12 15V3M7 8l5-5 5 5" /></>);
export const IcFile = ({ size = 15, stroke = "currentColor" }: P) =>
  svg(size, 2, stroke, <><path d="M6 3h8l5 5v13H6z" /><path d="M14 3v5h5" /></>);
export const IcPlus = ({ size = 15, stroke = "currentColor", width = 2.4 }: P) =>
  svg(size, width, stroke, <path d="M12 5v14M5 12h14" />);
export const IcFolder = ({ size = 18, stroke = "currentColor" }: P) =>
  svg(size, 2, stroke, <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />);
/** ซับไตเติล จอมีบรรทัดซับสองบรรทัดด้านล่าง เมนูซับไตเติล (BUGS ข้อ 101) */
export const IcSubtitle = ({ size = 18, stroke = "currentColor" }: P) =>
  svg(size, 2, stroke, <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M7 12h4M13 12h4M7 15.5h7M16 15.5h1" /></>);
/** นาฬิกา ปุ่มไว้ทีหลัง (พี่กันสั่ง 13 พ.ย. 2569 "ใส่ icon") */
export const IcClock = ({ size = 15, stroke = "currentColor" }: P) =>
  svg(size, 2, stroke, <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>);
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

/* หน้าแก้ซับ (แผนหน้าแก้ซับ ขั้น 3 · BUGS ข้อ 109) · เส้นแบบเดียวกับไอคอนในปุ่มอื่น ไม่ลอกภาพของ Aegisub */
export const IbUndo = ({ size = 15, stroke = "currentColor" }: P) =>
  svg(size, 2.2, stroke, <><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></>);
export const IbRedo = ({ size = 15, stroke = "currentColor" }: P) =>
  svg(size, 2.2, stroke, <><path d="m15 14 5-5-5-5" /><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" /></>);
export const IbBold = ({ size = 15, stroke = "currentColor" }: P) =>
  svg(size, 2.4, stroke, <><path d="M7 5h6a3.5 3.5 0 0 1 0 7H7z" /><path d="M7 12h7a3.5 3.5 0 0 1 0 7H7z" /></>);
export const IbItalic = ({ size = 15, stroke = "currentColor" }: P) =>
  svg(size, 2.2, stroke, <><path d="M10 5h8M6 19h8M14 5l-4 14" /></>);
export const IbUnderline = ({ size = 15, stroke = "currentColor" }: P) =>
  svg(size, 2.2, stroke, <><path d="M7 4v7a5 5 0 0 0 10 0V4" /><path d="M5 20h14" /></>);
export const IbStrike = ({ size = 15, stroke = "currentColor" }: P) =>
  svg(size, 2.2, stroke, <><path d="M4 12h16" /><path d="M16.5 7A4.5 3 0 0 0 12 5C9.5 5 8 6.3 8 8c0 1.2.7 2.2 2 3" /><path d="M8 17a4.5 3 0 0 0 4 2c2.5 0 4-1.3 4-3 0-.7-.2-1.3-.6-1.8" /></>);
/** เลือกฟอนต์กับขนาด (ปุ่ม fn) · ตัว T ใหญ่กับตัว T เล็ก */
export const IbFont = ({ size = 15, stroke = "currentColor" }: P) =>
  svg(size, 2.2, stroke, <><path d="M3 7V5h11v2M8.5 5v14M6.5 19h4" /><path d="M14 13v-1.5h7V13M17.5 11.5V19M16 19h3" /></>);
export const IbDrop = ({ size = 15, stroke = "currentColor" }: P) =>
  svg(size, 2.2, stroke, <><path d="M12 3c-3 4-6 7-6 10.5a6 6 0 0 0 12 0C18 10 15 7 12 3z" /></>);
export const IbSplit = ({ size = 15, stroke = "currentColor" }: P) =>
  svg(size, 2.2, stroke, <><path d="M12 3v18" /><path d="M6 8l-4 4 4 4M18 8l4 4-4 4" /></>);
export const IbMerge = ({ size = 15, stroke = "currentColor" }: P) =>
  svg(size, 2.2, stroke, <><path d="M3 12h18" /><path d="M8 7l4 5-4 5M16 7l-4 5 4 5" /></>);
export const IbRevert = ({ size = 15, stroke = "currentColor" }: P) =>
  svg(size, 2.2, stroke, <><path d="M3 12a9 9 0 1 0 2.6-6.4L3 8" /><path d="M3 3v5h5" /></>);
export const IbEraser = ({ size = 15, stroke = "currentColor" }: P) =>
  svg(size, 2.2, stroke, <><path d="M7 20h13" /><path d="m4.5 15.5 9.5-9.5 5 5-8.5 8.5H8z" /><path d="m9.5 10.5 5 5" /></>);
/** ข้อความเดิมของบรรทัดก่อนแก้ (แสดงต้นฉบับ) */
export const IbOriginal = ({ size = 15, stroke = "currentColor" }: P) =>
  svg(size, 2.2, stroke, <><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6" /><path d="M8 13h8M8 17h5" /></>);
/** ถอยหนึ่งเฟรม (เส้นตั้งกับสามเหลี่ยมชี้ซ้าย) · หน้าแก้ซับ ขั้น 4 */
export const IbFramePrev = ({ size = 15, stroke = "currentColor" }: P) =>
  svg(size, 2.2, stroke, <><path d="M6 5v14" /><path d="M18 5.5v13L9.5 12z" /></>);
/** เดินหนึ่งเฟรม */
export const IbFrameNext = ({ size = 15, stroke = "currentColor" }: P) =>
  svg(size, 2.2, stroke, <><path d="M18 5v14" /><path d="M6 5.5v13l8.5-6.5z" /></>);
/** เมนูวิดีโอ (ฟิล์ม) */
export const IbFilm = ({ size = 15, stroke = "currentColor" }: P) =>
  svg(size, 2.2, stroke, <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4" /></>);
/** ข้ามไปยังเฟรมหรือเวลา */
/** เลื่อนเวลา นาฬิกากับลูกศรไปข้างหน้า (แผนหน้าแก้ซับ ขั้น 6) */
export const IbShiftTime = ({ size = 15, stroke = "currentColor" }: P) =>
  svg(size, 2.2, stroke, <><path d="M15 5.6A7.5 7.5 0 1 0 15 18.4" /><path d="M9.5 8v4l2.5 1.5" /><path d="M16 12h6" /><path d="m19 9 3 3-3 3" /></>);
/** ปรับเวลาทั้งไฟล์ ไม้กายสิทธิ์ */
export const IbWand = ({ size = 15, stroke = "currentColor" }: P) =>
  svg(size, 2.2, stroke, <><path d="M4 20 15 9" /><path d="m13.5 7.5 3 3" /><path d="M19 3v4M17 5h4" /><path d="M9 3v2M8 4h2" /><path d="M20 12v2M19 13h2" /></>);
/** เมนูบรรทัด แถวข้อความ */
export const IbRows = ({ size = 15, stroke = "currentColor" }: P) =>
  svg(size, 2.2, stroke, <><path d="M4 6h16" /><path d="M4 12h16" /><path d="M4 18h10" /></>);
/** เลือกบรรทัด ช่องติ๊กกับแถว */
export const IbSelect = ({ size = 15, stroke = "currentColor" }: P) =>
  svg(size, 2.2, stroke, <><rect x="3" y="4" width="7" height="7" rx="1.5" /><path d="m5 7.5 1.5 1.5L9 6" /><path d="M14 7.5h7" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><path d="M14 17.5h7" /></>);
export const IbJump = ({ size = 15, stroke = "currentColor" }: P) =>
  svg(size, 2.2, stroke, <><path d="M4 12h12" /><path d="m12 7 5 5-5 5" /><path d="M20 5v14" /></>);
