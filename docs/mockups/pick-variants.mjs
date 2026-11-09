/* แบบให้พี่กันเลือก 9 พ.ย. 2569 · ใส่ทับหน้าจอจริงของโปรแกรมด้วยสไตล์อย่างเดียว ปุ่มทุกปุ่มยังเป็นของจริง
   ใช้ร่วมกันสองที่ หน้าเลือกแบบ pick-ui.html กับสคริปต์ถ่ายภาพจากโปรแกรมจริง
   "จุดลากไฟล์เธอว่าให้เด่นเพิ่มได้มั้ย เพราะตอนนี้ มันขาวไปหมด" · "ปุ่มเลือกสี มันกินที่จัง เอามาไว้การ์ดสีดำ บนขวาดีมะ" */
const arrow = (c) => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='${c}' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'><path d='M12 16V5M7.5 9.5L12 5l4.5 4.5M4 15v3a2 2 0 002 2h12a2 2 0 002-2v-3'/></svg>`)}")`;
const text = (c, c2) => `.drop, .drop b, .drop span, .drop .small { color: ${c} !important; } .drop b { font-size: 15px; font-weight: 700; } .drop span, .drop .small { color: ${c2} !important; }`;
const circle = (bg, ink, size = 58) => `.drop > svg { display: none; } .drop::before { content: ""; flex: none; width: ${size}px; height: ${size}px; border-radius: 50%; margin-bottom: 8px; background: ${bg} ${arrow(ink)} center / ${Math.round(size * 0.5)}px no-repeat; }`;
/* ตอนลากไฟล์มาค้างต้องเด่นกว่าตอนรอ */
const over = (s) => `.drop.over, html[data-sim-over] .drop { ${s} }`;

export const DROP = [
  { id: "now", name: "ที่ลงโปรแกรมแล้ว", note: "สีเดียว พื้นไล่โทนจาง แบบที่พี่กันเลือก", css: "" },
  { id: "a", name: "ก พื้นอ่อน เส้นเข้ม", note: "เปลี่ยนน้อยสุด เห็นเป็นช่องทันที ไม่มีของเพิ่ม",
    css: `.drop { background: color-mix(in srgb, var(--accent-soft) 35%, var(--win)); border: 2px dashed var(--accent); } ${text("var(--accent-ink)", "var(--txt2)")} ${over("background: #f6d3df; border-style: solid;")}` },
  { id: "b", name: "ข พื้นอ่อน เส้นเข้ม วงลูกศร", rec: true, note: "แนะนำ อ่านรู้ทันทีว่าให้วางของลงตรงนี้ เห็นแม้มองผ่าน ๆ สีเข้มอยู่แค่วงเล็ก ไม่แย่งโปสเตอร์",
    css: `.drop { background: color-mix(in srgb, var(--accent-soft) 35%, var(--win)); border: 2px dashed var(--accent); } ${text("var(--accent-ink)", "var(--txt2)")} ${circle("var(--accent)", "#ffffff")} ${over("background: #f6d3df; border-style: solid;")}` },
  { id: "e", name: "จ พื้นจาง เส้นเข้ม วงลูกศรอ่อน", note: "ตามที่พี่กันสั่งลอง พื้นจาง วงกลมชมพูอ่อน ลูกศรสีเข้ม",
    css: `.drop { background: color-mix(in srgb, var(--accent-soft) 35%, var(--win)); border: 2px dashed var(--accent); } ${text("var(--accent-ink)", "var(--txt2)")} ${circle("var(--accent-soft)", "#a8436a")} ${over("background: #f6d3df; border-style: solid;")}` },
  { id: "c", name: "ค พื้นขาว เส้นทึบ วงลูกศร", note: "ยังขาวเหมือนเดิม แต่กรอบคม เหมาะถ้าไม่อยากให้มีพื้นสี",
    css: `.drop { background: #fff; border: 2px solid var(--accent); box-shadow: inset 0 0 0 5px var(--accent-soft); } ${text("var(--accent-ink)", "var(--txt2)")} ${circle("var(--accent-soft)", "#a8436a")} ${over("background: var(--accent-soft);")}` },
  { id: "d", name: "ง พื้นเข้มทั้งช่อง", note: "เด่นสุด แต่ช่องใหญ่ทั้งหน้า สีหนัก เสี่ยงแบบที่พี่กันเคยบอกว่าชมพูหนาเกินไป",
    css: `.drop { background: var(--accent); border: 2px dashed rgba(255,255,255,.75); } ${text("#fff", "rgba(255,255,255,.88)")} ${circle("rgba(255,255,255,.18)", "#ffffff")} ${over("background: var(--accent-d); border-style: solid;")}` },
];

/* ไล่โทนวงลูกศร (พี่กันถาม 9 พ.ย. 2569 "มีโทนให้เราเลือกมะ แบบ การไล่โทน") · พื้นจางกับเส้นเข้มเท่ากันทุกแบบ ต่างกันที่สีวง */
const baseDrop = `.drop { background: color-mix(in srgb, var(--accent-soft) 35%, var(--win)); border: 2px dashed var(--accent); } ${text("var(--accent-ink)", "var(--txt2)")} ${over("background: #f6d3df; border-style: solid;")}`;
const gradCircle = (g, size = 58) => `.drop > svg { display: none; } .drop::before { content: ""; flex: none; width: ${size}px; height: ${size}px; border-radius: 50%; margin-bottom: 8px; background: ${arrow("#ffffff")} center / ${Math.round(size * 0.5)}px no-repeat, ${g}; }`;
const gradV = (id, name, note, g, extra = "") => ({ id, name, note, swatch: g, css: `${baseDrop} ${gradCircle(g)} ${extra}` });
export const GRAD = [
  gradV("g0", "สีเดียว", "แบบที่เห็นอยู่ ไม่ไล่โทน", "linear-gradient(135deg, #a8436a, #a8436a)"),
  gradV("g1", "กุหลาบ ไป ไวน์", "สว่างบนซ้าย เข้มล่างขวา โทนเดิม", "linear-gradient(135deg, #d9709a, #8f3558)"),
  gradV("g2", "ชมพูอ่อน ไป กุหลาบ", "สว่างสุด นุ่ม ไม่หนัก", "linear-gradient(135deg, #eeb0c6, #b5527b)"),
  gradV("g3", "แสงจากมุม", "เหมือนลูกแก้ว มีมิติ", "radial-gradient(circle at 30% 25%, #e58db0, #a8436a 70%)"),
  gradV("g4", "พีช ไป กุหลาบ", "อุ่น อมส้ม สดสุด", "linear-gradient(135deg, #f4a98c, #c24f7c)"),
  /* พี่กันสั่ง 9 พ.ย. 2569 "เราหมายถึไล่โทนเเบบอันนี้" ชี้พื้นของการ์ดไล่โทนทั้งวงและพื้น · วงพีช พื้นชมพูจางบนลงขาวล่าง */
  gradV("g7", "พีช พื้นไล่โทนจาง", "วงพีช ไป กุหลาบ พื้นชมพูจางด้านบนลงขาวด้านล่าง", "linear-gradient(135deg, #f4a98c, #c24f7c)",
    ".drop { background: linear-gradient(180deg, color-mix(in srgb, var(--accent-soft) 70%, var(--win)), var(--win)); }"),
  gradV("g8", "สีเดียว พื้นไล่โทนจาง", "วงสีเดียว พื้นชมพูจางด้านบนลงขาวด้านล่าง", "linear-gradient(135deg, #a8436a, #a8436a)",
    ".drop { background: linear-gradient(180deg, color-mix(in srgb, var(--accent-soft) 70%, var(--win)), var(--win)); }"),
  gradV("g5", "กุหลาบ ไป ม่วง", "เย็น หรู ออกนอกโทนนิดหน่อย", "linear-gradient(135deg, #cf6f9f, #70408f)"),
  gradV("g6", "ไล่โทนทั้งวงและพื้น", "พื้นจางจากบนลงล่าง วงกุหลาบ ไป ไวน์", "linear-gradient(135deg, #d9709a, #8f3558)",
    ".drop { background: linear-gradient(180deg, color-mix(in srgb, var(--accent-soft) 70%, var(--win)), var(--win)); }"),
];

/* เส้นแบ่งชั้นวาง · ใส่ทับชั้นวางจริง พี่กันยังไม่เลือก */
const underRow = (line) => `[data-shelf] .shelf:not(:last-child) { padding-bottom: 16px; margin-bottom: 22px; ${line} }`;
/* ชั้นใต้ปก วางตรงขอบล่างปกพอดี ปกเหมือนตั้งอยู่บนชั้น ชื่อเรื่องอยู่ใต้ชั้น */
const plank = (h, bg, shadow = "") => `[data-shelf] .shelf { margin-bottom: 22px; }
[data-shelf] .shelf::before { content: ""; position: absolute; z-index: 0; left: -8px; right: -8px; top: calc(var(--bw, 140px) * 1.5); height: ${h}px; border-radius: 0 0 3px 3px; background: ${bg}; ${shadow} }
[data-shelf] .bname { margin-top: ${h + 8}px; }`;
const barLine = (bg) => `${underRow("")} [data-shelf] .shelf:not(:last-child)::after { content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: 3px; border-radius: 2px; background: ${bg}; }`;
const mix = (n, base) => `color-mix(in srgb, var(--accent) ${n}%, ${base})`;
export const LINE = [
  { id: "now", name: "ไม่มีเส้น", note: "แบบที่เป็นอยู่", sample: "transparent", css: "" },
  { id: "s1", name: "เส้นจาง", note: "เบาสุด ใต้ชื่อเรื่อง แบ่งแถวเงียบ ๆ", sample: "var(--line)", css: barLine("var(--line)") },
  { id: "s2", name: "เส้นสีชัด", note: "เห็นชัดกว่า ใต้ชื่อเรื่อง", sample: mix(45, "white"), css: barLine(mix(45, "var(--win)")) },
  { id: "s3", name: "เส้นจางปลาย", note: "กลางเข้ม ปลายจางหาย นุ่มสุด", sample: `linear-gradient(90deg, transparent, ${mix(50, "white")}, transparent)`, css: barLine(`linear-gradient(90deg, transparent, ${mix(50, "var(--win)")} 15%, ${mix(50, "var(--win)")} 85%, transparent)`) },
  { id: "s4", name: "เส้นประ", note: "เข้าชุดกับจุดลากไฟล์", sample: `repeating-linear-gradient(90deg, ${mix(50, "white")} 0 6px, transparent 6px 11px)`, css: barLine(`repeating-linear-gradient(90deg, ${mix(50, "var(--win)")} 0 6px, transparent 6px 11px)`) },
  { id: "s5", name: "ชั้นบางใต้ปก", note: "ปกตั้งอยู่บนเส้น ชื่อเรื่องอยู่ใต้ชั้น", sample: mix(35, "white"), css: plank(3, mix(35, "var(--win)")) },
  { id: "s6", name: "ชั้นมีเงา", note: "ปกตั้งอยู่บนเส้น มีเงาใต้ชั้น", sample: `linear-gradient(180deg, ${mix(45, "white")}, ${mix(22, "white")})`, css: plank(3, mix(45, "var(--win)"), "box-shadow: 0 5px 8px -3px color-mix(in srgb, black 28%, transparent);") },
];

/* กรอบปุ่มเลือกสีลอยในหัวกราฟดำ ซ้ายของคำว่าชั้นหนัง · ตัวปุ่มยังเป็นปุ่มจริง กดแล้วกราฟเปลี่ยนสีจริง */
const onBlack = `[data-plottools]:has([data-scmap]) { margin: 0; }
[data-plottools] .seg:has([data-scmap]) { border-color: #4a4a4a; background: #111; }
[data-plottools] [data-scmap] { height: 26px !important; background: #111; color: #d8d8d8; font-size: 12px; border-color: #4a4a4a !important; }
[data-plottools] [data-scmap]:hover { background: #2a2a2a; color: #fff; }
[data-plottools] [data-scmap].on, [data-plottools] [data-scmap].on:hover { background: #333; color: #fff; }`;
export const PICK = [
  { id: "now", name: "ที่ลงโปรแกรมแล้ว", note: "แถบสีพร้อมชื่อ มุมขวาบนของกราฟ ปุ่มติ๊กพื้นสว่าง", css: "" },
  { id: "a", name: "ก แถบสีล้วน", rec: true, note: "แนะนำ เล็ก เห็นสีจริงเลย ไม่ต้องอ่าน ชี้แล้วขึ้นชื่อสี",
    css: `${onBlack} [data-plottools] .seg [data-scmap] { font-size: 0 !important; padding: 0 6px !important; gap: 0 !important; } [data-plottools] .seg [data-scmap].on { box-shadow: inset 0 0 0 1.5px #fff; } [data-plottools] [data-scmap] .cswatch { width: 30px; height: 12px; }` },
  { id: "b", name: "ข แถบสีพร้อมชื่อ", note: "อ่านชื่อสีได้เลย แต่กินที่หัวกราฟเยอะสุด",
    css: `${onBlack}` },
  { id: "c", name: "ค ปุ่มเดียว กดแล้วกาง", note: "เรียบสุด เห็นแค่สีที่เลือก แต่เปลี่ยนสีต้องกดสองครั้ง",
    css: `${onBlack} [data-plottools] .seg:has([data-scmap]) { flex-direction: column; width: 124px; }
[data-plottools] [data-scmap] { width: 100%; justify-content: flex-start; border-left: 0 !important; }
[data-plottools] .seg:not(.open):has([data-scmap]) [data-scmap]:not(.on) { display: none; }
[data-plottools] .seg:not(.open) [data-scmap].on::after { content: "▾"; margin-left: auto; font-size: 11px; }` },
  { id: "d", name: "ง จุดกลม", note: "หน้าตาเหมือนปุ่มชุดสีด้านบน เล็กเท่าแบบ ก แต่แยกสีความร้อนกับสีตามชุดยากกว่าแถบ",
    css: `${onBlack} [data-plottools] .seg:has([data-scmap]) { border: 0; background: transparent; gap: 7px; overflow: visible; }
.plottools .seg [data-scmap], .plottools .seg [data-scmap]:hover, .plottools .seg [data-scmap].on, .plottools .seg [data-scmap].on:hover { height: 22px !important; font-size: 0 !important; padding: 0 !important; gap: 0 !important; width: 22px; height: 22px; border: 0 !important; border-radius: 50%; background: transparent; overflow: hidden; box-shadow: 0 0 0 1px #666; }
.plottools .seg [data-scmap].on, .plottools .seg [data-scmap].on:hover { box-shadow: 0 0 0 2px #fff; }
.plottools .seg [data-scmap] .cswatch { width: 22px; height: 22px; border-radius: 50%; box-shadow: none; }` },
];

/* แถบใต้ปก (พี่กันสั่ง 9 พ.ย. 2569 "ออกแบบเเถบนี้ที ให้มันเป้นระเบีบย ... มีชื่อ ดาว เครื่องหมายไปบรรทัดสอง บรรทัดสามอยากห้เป็นชนิดไฟล์ เเละเสียง เเละซับ เเต่มันจะเป็นตัวหนาเหมือน tag" · "อันนี้คือ ให้ทำมอคอัปนะ")
   ต่อแถบใหม่เข้าการ์ดหนังจริง ซ่อนแถบเดิมด้วยสไตล์ · ชนิดไฟล์ เสียง ซับ เป็นข้อมูลตัวอย่าง ของจริงอ่านจากไฟล์ */
const barBase = `[data-shelf] .book > .bname { display: none; }
.pkbn { margin-top: 8px; font-size: 12.5px; }
.size-l .pkbn { font-size: 13.5px; } .size-s .pkbn { font-size: 11.5px; }
.pkbn .pn1 { color: var(--txt); font-weight: 600; line-height: 1.6; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pkbn .pn2 { display: flex; align-items: center; gap: 5px; height: 18px; margin-top: 2px; color: var(--txt2); font-size: 12px; white-space: nowrap; overflow: hidden; }
.pkbn .pn2 .badge { position: static; display: inline-flex; flex: none; width: 15px; height: 15px; margin: 0; box-shadow: none; }
.pkbn .pn2 .badge svg { width: 10px; height: 10px; }
.pkbn .pstar { display: inline-flex; gap: 1px; margin-left: auto; color: #e0a526; }
.pkbn .pstar svg { display: block; }
.pkbn .pn3 { display: flex; flex-wrap: wrap; gap: 3px; margin-top: 3px; }
.pkbn .pt.m { padding: 0 3px; color: var(--txt2); }
.pkbn .pt { height: 16px; padding: 0 5px; border-radius: 4px; font-family: Consolas, "Cascadia Mono", monospace; font-size: 10.5px; font-weight: 700; line-height: 16px; white-space: nowrap; }`;
const shades = `.pkbn .pt.f { background: var(--accent); color: white; } .pkbn .pt.a { background: var(--accent-soft); color: var(--accent-ink); } .pkbn .pt.s { background: var(--win2); color: var(--txt2); box-shadow: inset 0 0 0 1px var(--line); }`;
const P = { solid: ["#a8436a", "#fff"], soft: ["#f6dfe7", "#8f2a4f"], pale: ["#fbf3f5", "#6c4a57", "#e2cad1"], green: ["#e3f3ea", "#27704a"], amber: ["#fbf1dc", "#8a5a10"], line: ["#fff", "#6c4a57", "#d8bcc6"] };
const prev = (f, a, s) => [["MKV", ...P[f]], ["AAC 2.0", ...P[a]], ["SRT", ...P[s]]];
export const BNAME = [
  { id: "now", name: "ที่ลงโปรแกรมแล้ว", note: "แบบ ค ที่พี่กันเลือก ข้อมูลเสียงกับซับของมอคอัปนี้มาจากหนังตัวอย่าง", css: "" },
  { id: "b1", name: "ก ป้ายไล่สีเดียว", rec: true, note: "แนะนำ ไฟล์เข้มสุด เสียงกลาง ซับจาง แยกชนิดได้โดยไม่ชนสีเขียวเหลืองแดงที่บอกสภาพไฟล์", line2: "marks", prev: prev("solid", "soft", "pale"), css: barBase + shades },
  { id: "b2", name: "ข ป้ายสีเดียวกัน", note: "เรียบสุด แยกชนิดจากตัวหนังสืออย่างเดียว", line2: "marks", prev: prev("soft", "soft", "soft"), css: `${barBase} .pkbn .pt { background: var(--accent-soft); color: var(--accent-ink); }` },
  { id: "b3", name: "ค ป้ายแยกสี", note: "ใช้สีป้ายที่โปรแกรมมีอยู่แล้ว เขียวกับเหลือง เห็นชนิดชัดสุด แต่สีซ้ำกับเครื่องหมายสภาพไฟล์", line2: "marks", prev: prev("solid", "green", "amber"), css: `${barBase} .pkbn .pt.f { background: var(--accent); color: white; } .pkbn .pt.a { background: var(--ok-soft); color: var(--ok-ink); } .pkbn .pt.s { background: var(--warn-soft); color: var(--warn-ink); }` },
  { id: "b4", name: "ง ป้ายเส้นขอบ", note: "ไม่มีพื้นสี เบาสุด ปกเด่นสุด", line2: "marks", prev: prev("line", "line", "line"), css: `${barBase} .pkbn .pt { background: transparent; color: var(--txt2); box-shadow: inset 0 0 0 1px var(--line); }` },
  { id: "b5", name: "จ เครื่องหมายมีคำ", note: "บรรทัดสองบอกสภาพไฟล์เป็นคำ ไม่ต้องจำสี", line2: "word", prev: prev("solid", "soft", "pale"), css: barBase + shades },
  { id: "b6", name: "ฉ ดาวเดียว", note: "ดาวบรรทัดสอง กดเก็บเรื่องที่ชอบ เป็นของใหม่ ยังไม่มีในโปรแกรม", line2: "star1", prev: prev("solid", "soft", "pale"), css: barBase + shades },
  { id: "b7", name: "ช ดาวห้าดวง", note: "ให้คะแนนบรรทัดสอง เป็นของใหม่ ยังไม่มีในโปรแกรม", line2: "star5", prev: prev("solid", "soft", "pale"), css: barBase + shades },
];
/* เสียงมีแชนแนลด้วย (พี่กันสั่ง 9 พ.ย. 2569 "เสียง ใส่เเชเเนลที") */
const SETS = [["MKV", ["E-AC-3 5.1"], ["SRT"]], ["MKV", ["AAC 2.0", "AC-3 5.1"], ["SRT", "ASS"]], ["TS", ["AC-3 5.1"], []], ["MP4", ["AAC 2.0"], ["MOV_TEXT"]], ["MKV", ["TrueHD 7.1"], ["PGS"]], ["WEBM", ["Opus 2.0"], []], ["MKV", ["FLAC 5.1"], ["ASS"]], ["AVI", ["MP3 2.0"], []], ["MKV", ["TrueHD 7.1", "E-AC-3 5.1", "AC-3 2.0"], ["SRT", "ASS", "PGS"]]];
const star = (on) => `<svg width="12" height="12" viewBox="0 0 24 24" fill="${on ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l2.8 5.8 6.2.9-4.5 4.4 1.1 6.3L12 17.4l-5.6 3 1.1-6.3L3 9.7l6.2-.9z"/></svg>`;
function paintBook(doc, b, v) {
  b.querySelector(":scope > .pkbn")?.remove();
  if (!v?.line2) return;
  const name = b.dataset.movie ?? "";
  const hash = [...name].reduce((n, c) => n + c.codePointAt(0), 0);
  const [file, audio, subs] = SETS[hash % SETS.length];
  const badge = b.querySelector(".bname .badge"), link = b.querySelector(".bname .linkb");
  const box = doc.createElement("div"); box.className = "pkbn";
  const n1 = doc.createElement("div"); n1.className = "pn1"; n1.textContent = name; n1.title = name; box.appendChild(n1);
  const n2 = doc.createElement("div"); n2.className = "pn2";
  if (badge) n2.appendChild(badge.cloneNode(true));
  if (link) n2.appendChild(link.cloneNode(true));
  if (v.line2 === "word" && badge) { const w = doc.createElement("span"); w.textContent = (badge.title || badge.getAttribute("aria-label") || "").split(" (")[0]; n2.appendChild(w); }
  if (v.line2 === "star1") { const w = doc.createElement("span"); w.className = "pstar"; w.innerHTML = star(hash % 3 === 0); n2.appendChild(w); }
  if (v.line2 === "star5") { const w = doc.createElement("span"); w.className = "pstar"; const on = (hash % 5) + 1; w.innerHTML = [1, 2, 3, 4, 5].map((i) => star(i <= on)).join(""); n2.appendChild(w); }
  box.appendChild(n2);
  const n3 = doc.createElement("div"); n3.className = "pn3"; n3.title = `ไฟล์ ${file} · เสียง ${audio.join(" ")}${subs.length ? " · ซับ " + subs.join(" ") : " · ไม่มีซับ"}`;
  const tag = (t, k) => { const e = doc.createElement("span"); e.className = "pt " + k; e.textContent = t; n3.appendChild(e); };
  tag(file, "f"); audio.forEach((t) => tag(t, "a")); subs.forEach((t) => tag(t, "s"));
  box.appendChild(n3);
  b.appendChild(box);
  // สูงสุด 2 บรรทัด · ล้น ตัดแชนแนลเฉพาะเรื่องนี้ · ยังล้น ซ่อนป้ายท้าย ขึ้น +จำนวน
  const lines = () => new Set([...n3.children].filter((x) => x.style.display !== "none").map((x) => Math.round(x.getBoundingClientRect().top))).size;
  if (lines() > 2) n3.querySelectorAll(".pt.a").forEach((e) => { e.textContent = e.textContent.split(" ")[0]; });
  if (lines() > 2) {
    const more = doc.createElement("span"); more.className = "pt m"; n3.appendChild(more);
    const list = [...n3.children].filter((x) => x !== more);
    let hid = 0;
    for (let i = list.length - 1; i > 0 && lines() > 2; i--) { list[i].style.display = "none"; hid += 1; more.textContent = "+" + hid; }
  }
  b.__pkW = b.getBoundingClientRect().width;
  doc.__pkRO?.observe(b);
}
const paintAll = (doc) => doc.querySelectorAll("[data-shelf] .book[data-movie]").forEach((b) => paintBook(doc, b, doc.__pkBar));

/* ชี้แล้วขึ้นชื่อสี ปุ่มกางของแบบ ค · ใส่ครั้งเดียวต่อหน้า */
export function wire(doc) {
  if (doc.__pickWired) return;
  doc.__pickWired = true;
  // กดเล็ก กลาง ใหญ่ หรือย่อหน้าต่าง การ์ดกว้างเปลี่ยน นับบรรทัดป้ายใหม่
  doc.__pkRO = new doc.defaultView.ResizeObserver((es) => { for (const e of es) { const b = e.target; if (doc.__pkBar?.line2 && Math.abs(b.getBoundingClientRect().width - (b.__pkW ?? 0)) > 0.5) paintBook(doc, b, doc.__pkBar); } });
  // การ์ดหนังวาดใหม่ตอนเปลี่ยนหน้าหรือเปลี่ยนขนาดปก เติมแถบให้การ์ดที่ยังไม่มี
  new doc.defaultView.MutationObserver(() => { if (doc.__pkBar?.line2) doc.querySelectorAll("[data-shelf] .book[data-movie]:not(:has(> .pkbn))").forEach((b) => paintBook(doc, b, doc.__pkBar)); }).observe(doc.body, { childList: true, subtree: true });
  doc.addEventListener("mouseover", (e) => { const b = e.target.closest?.("[data-scmap]"); if (b && !b.title) b.title = b.textContent; });
  doc.addEventListener("click", (e) => {
    const b = e.target.closest?.("[data-scmap]");
    if (!b || !doc.querySelector("#pick-style")?.dataset.dropdown) return;
    b.parentElement.classList.toggle("open");
  });
}
/* ใส่แบบลงหน้าจอ */
export function apply(doc, kind, v) {
  let el = doc.getElementById(kind + "-style");
  if (!el) { el = doc.createElement("style"); el.id = kind + "-style"; doc.head.appendChild(el); }
  el.textContent = v.css;
  if (kind === "bname") { doc.__pkBar = v; paintAll(doc); }
  if (kind === "pick") { if (v.id === "c") el.dataset.dropdown = "1"; else delete el.dataset.dropdown; }
}
