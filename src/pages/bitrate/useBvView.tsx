/* ค่าที่แสดงบนหน้า ชนิดไฟล์ ป้ายแกน แถวเมนู
   แยกจาก BitrateClassic.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 7) เนื้อโค้ดยกมาทั้งก้อน */
import { C, DESC, MODES, mi } from "./classicParts";
import type { V3 } from "./bvCtx";

export function useBvView(c: V3) {
  const { auto, box, gradHead, info, maxV, mode, path, r, setDesc, setMenu, span, totalSec, vis, yOf, zoom } = c;
  const cutEnd = r && isFinite(r.tmin) ? r.readTo - r.tmin : 0;
  const cutAt = r?.done && info && info.duration > 0 && (r.partial || cutEnd < info.duration - Math.max(2, info.duration * 0.02)) ? cutEnd : null;
  const readPct = info && info.duration > 0 && r ? Math.min(100, Math.round(((r.readTo - (isFinite(r.tmin) ? r.tmin : 0)) / info.duration) * 100)) : 0;
  const codec = info ? (info.codec === "h264" ? "H.264" : info.codec === "hevc" ? "HEVC" : info.codec === "mpeg2video" ? "MPEG2" : info.codec === "mpeg1video" ? "MPEG1" : info.codec === "eac3" ? "E-AC3" : info.codec.startsWith("pcm") ? "PCM" : info.codec.toUpperCase()) : "";
  const fmt = info ? ({ matroska: "MKV", mov: "MP4", mpegts: "TS", mpeg: "PS", avi: "AVI", mpegvideo: "ES", webm: "WEBM" } as Record<string, string>)[info.format] ?? info.format.toUpperCase() : "";
  const md = MODES.find((m) => m.id === mode)!;
  const name = path ? path.split(/[\\/]/).pop() : "";
  const lab = (y: number): React.CSSProperties => ({ position: "absolute", right: 6, top: y, transform: "translateY(-50%)", whiteSpace: "nowrap" });
  const head: React.CSSProperties = { background: gradHead ? `linear-gradient(90deg, ${C.head1}, ${C.head2})` : C.head1, color: "rgb(255,255,255)", fontWeight: 700, textAlign: "center", padding: "2px 0" };
  const zoomPct = (span / totalSec) * 100;
  // ป้ายชนิดไฟล์กับจำนวนแทร็กวางในช่องว่างระหว่างป้ายตัวเลข ไม่ทับกัน · สเกลเปลี่ยนตามวิธีคิด ตำแหน่งตายตัวชนได้
  const axisFit = (() => {
    const ymx = yOf(maxV);
    const busy: [number, number][] = [[-999, 4], [box.h - 9, 9999]];
    if (ymx > 18) busy.push([ymx - 25, ymx + 25]);
    busy.push(auto ? [2, 18] : [yOf(maxV / 2) - 9, yOf(maxV / 2) + 9]);
    const place = (need: number) => {
      busy.sort((a, b) => a[0] - b[0]);
      let best: [number, number] | null = null;
      for (let i = 0; i + 1 < busy.length; i++) { const a = busy[i][1], b = busy[i + 1][0]; if (b - a >= need + 6 && (!best || b - a > best[1] - best[0])) best = [a, b]; }
      if (!best) return null;
      const mid = (best[0] + best[1]) / 2; busy.push([mid - need / 2 - 3, mid + need / 2 + 3]); return mid;
    };
    const a = place(54), b = place(36);
    // ป้ายชนิดไฟล์อยู่เหนือป้ายจำนวนแทร็กเสมอ แบบตัวจริง
    return a != null && b != null && a > b ? { info: b, tracks: a } : { info: a, tracks: b };
  })();
  const visCount = vis.length;

  /** แถวเมนู · d คือชื่อคำอธิบายใน DESC · off คือเหตุผลที่กดไม่ได้ (ชี้แล้วขึ้นในแถบคำอธิบาย) · ใช้ aria-disabled เพราะปุ่ม disabled ไม่รับเมาส์ ชี้แล้วอ่านเหตุผลไม่ได้ */
  const item = (label: string, key: string, onClick: () => void, opt: { d: string; on?: boolean; off?: string | false; k?: string }) => {
    const off = !!opt.off;
    // แถวที่กดไม่ได้ขึ้นเหตุผลคู่สองประโยคแรกของคำอธิบาย กล่องสูงสี่บรรทัดพอเสมอ
    const d = DESC[opt.d] ?? opt.d;
    const show = () => setDesc(off ? { d: d.split("  ").slice(0, 2).join("  "), why: opt.off as string } : { d });
    return (
      <button key={opt.k ?? label} type="button" role="menuitem" aria-disabled={off || undefined} onClick={() => { if (off) return; setMenu(false); onClick(); }} onMouseEnter={show} onFocus={show}
        className="bv-mi" style={mi(off)} data-bv-item={label}>
        <span style={{ width: 16, flex: "none" }}>{opt.on ? "✓" : ""}</span><span style={{ flex: 1, textAlign: "left" }}>{label}</span><span style={{ color: off ? "rgb(170,170,170)" : "rgb(90,90,90)" }}>{key}</span>
      </button>
    );
  };
  const noZoom = !zoom.length && "กดไม่ได้เพราะยังไม่ได้ซูม";
  return { cutEnd, cutAt, readPct, codec, fmt, md, name, lab, head, zoomPct, axisFit, visCount, item, noZoom };
}
