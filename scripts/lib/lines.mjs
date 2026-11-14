// อ่านว่าข้อความในกล่องบนจอตัดบรรทัดตรงไหน ใช้ร่วมระหว่าง text-lines.mjs กับตัวตรวจ (กฎตัดบรรทัดตามความหมายใน CLAUDE.md)
// ไล่ตัวอักษรทีละตัวด้วย Range ดูตำแหน่งแนวตั้ง · ผล หนึ่งย่อหน้าต่อหนึ่งข้อความ ⏎ คือจุดที่บรรทัดตัด · ไม่เจอกล่องได้ null
// q คือตัวเรียก evaluate แบบ async ของ cdp-client ที่ห่อ (async () => { … })()
export const linesOf = (q, sel) => q(`
  const box = document.querySelector(${JSON.stringify(sel)});
  if (!box) return null;
  const blocks = [...box.querySelectorAll('p, li, div, td, span.small')].concat([box]).filter((b) => [...b.childNodes].some((n) => (n.nodeType === 3 && n.data.trim()) || (n.nodeType === 1 && getComputedStyle(n).display.startsWith('inline'))));
  const seen = new Set(), out = [];
  for (const b of blocks) {
    const tw = document.createTreeWalker(b, NodeFilter.SHOW_TEXT);
    let cur = '', top = null; const res = [];
    for (let n = tw.nextNode(); n; n = tw.nextNode()) {
      if (seen.has(n)) continue; seen.add(n);
      for (let i = 0; i < n.data.length; i++) {
        const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + 1);
        const rc = r.getClientRects()[0];
        if (!rc) { cur += n.data[i]; continue; }
        if (top != null && rc.top > top + 4) { res.push(cur); cur = ''; }
        if (top == null || rc.top > top + 4) top = rc.top;
        cur += n.data[i];
      }
    }
    if (cur.trim()) res.push(cur);
    if (res.length) out.push(res.map((s) => s.trim()).join(' ⏎ '));
  }
  return out;`);
