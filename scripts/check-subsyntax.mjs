// ตัวตรวจ BUGS ข้อ 112 สีอักษรในช่องพิมพ์ของหน้าแก้ซับแบบ Aegisub (subSyntax.ts · SubEditBox.tsx)
// ① ตรรกะแยกส่วน เทียบผลที่คิดมือจากกติกาของ Aegisub (parser.cpp dialogue_tokens · dialogue_parser.cpp MarkDrawings SplitDrawing SyntaxHighlighter)
// ② หน้าจอ ชั้นสีอยู่ใต้ช่องพิมพ์ ข้อความตรงกัน กว้าง สูง ตำแหน่ง ตัวหนา เท่ากันทุกค่า ข้อความยาวตัดบรรทัดเหมือนกัน เลื่อนตามกัน
//    สีตามค่าตั้งต้นของ Aegisub ในโทนโรสควอตซ์ · โทนกลางคืนทุกสีอ่านได้ (ความต่างความสว่างกับพื้นอย่างน้อย 3 เท่า) · ไฟล์ SRT ไม่มีชั้นสี
// แก้ข้อความผ่าน window.__subEdit แล้วเลิกทำกลับ ไม่เขียนไฟล์ · คืนโทนเดิมตอนจบ
import { connect, sleep } from "./lib/cdp-client.mjs";

const MOVIE = "D:/movie-shelf/test-media/สร้าง/แก้ซับ/ฉากตัด (2025).mkv";
const SRT = "D:/movie-shelf/test-media/สร้าง/แก้ซับ/ฉากตัด (2025).th.srt";
const c = await connect();
const q = (js) => c.evaluate(`(async () => { ${js} })()`);
const results = [];
const check = (name, ok, note = "") => { results.push(!!ok); console.log(`${ok ? "✅" : "❌"} ${name}${note !== "" ? " · " + note : ""}`); };
const waitFor = async (js, ms = 10000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await q(js)) return true; await sleep(120); } return false; };
const S = "window.__subEdit";
await c.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
const tone = await q("const s = await window.__TAURI_INTERNALS__.invoke('get_settings'); return s.settings.tone;");
try {
  await q("location.reload(); return 1;").catch(() => {});
  await sleep(2500);

  // ① ตรรกะ · ผลเป็น ชนิดสี:ข้อความ คั่นด้วย | ช่วงชนิดเดียวกันที่ติดกันรวมกันแบบ SetStyling
  const H = (text, tpl = false) => q(`return window.__subSyntaxLib.highlight(${JSON.stringify(text)}, ${tpl}).map((r) => r.s + ':' + r.t).join('|');`);
  const cases = [
    ["ภาพตัวอย่างของพี่กัน \\pos กับ \\frz", "{\\pos(960,1070)\\frz0.7541}", "brackets:{|slashes:\\|tags:pos|slashes:(|params:960|slashes:,|params:1070|slashes:)\\|tags:frz|params:0.7541|brackets:}"],
    ["\\N ในข้อความเป็นขึ้นบรรทัด", "ก\\Nข\\hค", "normal:ก|lb:\\N|normal:ข|lb:\\h|normal:ค"],
    ["ขึ้นบรรทัดจริงในช่องพิมพ์เป็นขึ้นบรรทัด", "ก\nข", "normal:ก|lb:\n|normal:ข"],
    ["กลุ่ม {} ที่ไม่มีแท็กเป็นความเห็น", "{note}ก", "brackets:{|comment:note|brackets:}|normal:ก"],
    ["{ ในกลุ่มแท็กเป็นข้อผิด", "{\\b1{x}", "brackets:{|slashes:\\|tags:b|params:1|error:{|params:x|brackets:}"],
    ["กลุ่มแท็กที่ไม่ปิดเป็นข้อความทั้งหมด", "ก{\\i1", "normal:ก{\\i1"],
    ["\\r ตามด้วยชื่อสไตล์เป็นค่า", "{\\rSong}", "brackets:{|slashes:\\|tags:r|params:Song|brackets:}"],
    ["\\fn ชื่อฟอนต์มีช่องว่างเป็นค่าทั้งก้อน", "{\\fnLeelawadee UI\\fs60}", "brackets:{|slashes:\\|tags:fn|params:Leelawadee UI|slashes:\\|tags:fs|params:60|brackets:}"],
    ["\\1c ตัวเลขนำหน้าชื่อแท็ก", "{\\1c&H00FF00&}", "brackets:{|slashes:\\|tags:1c|params:&H00FF00&|brackets:}"],
    ["\\t ซ้อนแท็กในวงเล็บ", "{\\t(0,100,\\fs20)}", "brackets:{|slashes:\\|tags:t|slashes:(|params:0|slashes:,|params:100|slashes:,\\|tags:fs|params:20|slashes:)|brackets:}"],
    ["ชื่อแท็กตัวพิมพ์ใหญ่ไม่ใช่แท็ก เป็นความเห็น", "{\\Pos(1,2)}", "brackets:{|slashes:\\|comment:Pos(1,2)|brackets:}"],
    ["ภาพวาด \\p1 คำสั่งกับพิกัด x y", "{\\p1}m 0 0 l 100 0{\\p0}", "brackets:{|slashes:\\|tags:p|params:1|brackets:}|dcmd:m|normal: |dx:0|normal: |dy:0|normal: |dcmd:l|normal: |dx:100|normal: |dy:0|brackets:{|slashes:\\|tags:p|params:0|brackets:}"],
    ["เส้นโค้ง b พิกัดคู่ที่สามเป็นปลายเส้น ขีดเส้นใต้ต่อกัน", "{\\p1}m 0 0 b 1 1 2 2 3 3{\\p0}", "brackets:{|slashes:\\|tags:p|params:1|brackets:}|dcmd:m|normal: |dx:0|normal: |dy:0|normal: |dcmd:b|normal: |dx:1|normal: |dy:1|normal: |dx:2|normal: |dy:2|normal: |dex:3 |dey:3|brackets:{|slashes:\\|tags:p|params:0|brackets:}"],
    ["ภาพวาดที่ไม่ขึ้นต้นด้วย m เป็นข้อผิด", "{\\p1}l 0 0{\\p0}", "brackets:{|slashes:\\|tags:p|params:1|brackets:}|error:l|normal: |error:0|normal: |error:0|brackets:{|slashes:\\|tags:p|params:0|brackets:}"],
    ["\\clip แบบเวกเตอร์เป็นภาพวาด", "{\\clip(m 0 0 l 10 0)}", "brackets:{|slashes:\\|tags:clip|slashes:(|dcmd:m|normal: |dx:0|normal: |dy:0|normal: |dcmd:l|normal: |dx:10|normal: |dy:0|slashes:)|brackets:}"],
    ["\\clip สี่เหลี่ยมเป็นค่าปกติ", "{\\clip(1,2,3,4)}", "brackets:{|slashes:\\|tags:clip|slashes:(|params:1|slashes:,|params:2|slashes:,|params:3|slashes:,|params:4|slashes:)|brackets:}"],
    ["\\iclip มีค่าขนาดนำหน้าภาพวาด", "{\\iclip(2,m 0 0)}", "brackets:{|slashes:\\|tags:iclip|slashes:(|params:2|slashes:,|dcmd:m|normal: |dx:0|normal: |dy:0|slashes:)|brackets:}"],
    ["ข้อความไทยกับแท็กหลายกลุ่ม", "ร้องเพลง{\\u1}ขีด{\\u0}", "normal:ร้องเพลง|brackets:{|slashes:\\|tags:u|params:1|brackets:}|normal:ขีด|brackets:{|slashes:\\|tags:u|params:0|brackets:}"],
  ];
  for (const [name, text, want] of cases) { const got = await H(text); check(`ตรรกะ ${name}`, got === want, got === want ? "" : got); }
  const kt = await H("!retime('line')! $start{\\k10}", true);
  check("ตรรกะ บรรทัดแม่แบบคาราโอเกะ !…! กับ $ตัวแปร", kt === "ktemplate:!retime('line')!|normal: |kvar:$start|brackets:{|slashes:\\|tags:k|params:10|brackets:}", kt);
  const kn = await H("!x! $y", false);
  check("ตรรกะ บรรทัดปกติ ! กับ $ เป็นข้อความ", kn === "normal:!x! $y", kn);
  const tl = await q("const f = window.__subSyntaxLib.isTemplateLine; return [f(true, 'Template line'), f(false, 'template'), f(true, 'code line')].join(',');");
  check("บรรทัดแม่แบบคือบรรทัดความเห็นที่เอฟเฟกต์ขึ้นต้นด้วย template ไม่สนตัวพิมพ์", tl === "true,false,false", tl);

  // ② หน้าจอ
  await q("[...document.querySelectorAll('.side .nav')].find((b) => b.innerText.trim().startsWith('ซับไตเติล'))?.click(); return 1;");
  await sleep(300);
  await q(`window.__subClear(); window.__subOpen(${JSON.stringify(MOVIE)}); return 1;`);
  check("เปิดหนังทดสอบ ซับ ASS ในหนัง", await waitFor("return !!document.querySelector('[data-se-text]')", 20000));
  const sel = async (find) => { const id = await q(`return ${S}.get().doc.events.find((e) => e.text.includes(${JSON.stringify(find)}))?.id;`); await q(`${S}.select([${id}], ${id}); return 1;`); await sleep(250); return id; };
  const id = await sel("\\fs60");
  const geo = await q(`const t = document.querySelector('[data-se-text]'), h = document.querySelector('[data-se-texthl]');
    if (!h) return null;
    const rt = t.getBoundingClientRect(), rh = h.getBoundingClientRect(), st = getComputedStyle(t), sh = getComputedStyle(h);
    return { same: h.textContent === t.value + '\\n', l: rt.left - rh.left, tp: rt.top - rh.top, w: rt.width - rh.width, cw: t.clientWidth - h.clientWidth, sh: t.scrollHeight - h.scrollHeight,
      fw: [st.fontWeight, sh.fontWeight], ff: st.fontFamily === sh.fontFamily, fs: st.fontSize === sh.fontSize, lh: st.lineHeight === sh.lineHeight, pad: st.padding === sh.padding,
      tc: st.color, caret: st.caretColor, txt: getComputedStyle(document.documentElement).getPropertyValue('--txt').trim() };`);
  check("ชั้นสีขึ้นใต้ช่องพิมพ์ ข้อความตรงกันทุกตัว", !!geo && geo.same, JSON.stringify(geo?.same));
  check("ชั้นสีกับช่องพิมพ์ ตำแหน่ง กว้าง ความกว้างด้านใน สูง เท่ากัน", !!geo && geo.l === 0 && geo.tp === 0 && geo.w === 0 && geo.cw === 0 && geo.sh === 0, JSON.stringify(geo && { l: geo.l, t: geo.tp, w: geo.w, cw: geo.cw, sh: geo.sh }));
  check("ฟอนต์ ขนาด ความสูงบรรทัด ระยะใน เท่ากัน ตัวอักษรไม่หนา (ไม่ชนคลาส hl ของทั้งโปรแกรม)", !!geo && geo.ff && geo.fs && geo.lh && geo.pad && geo.fw[0] === "400" && geo.fw[1] === "400", JSON.stringify(geo?.fw));
  check("ตัวอักษรของช่องพิมพ์โปร่งใส เคอร์เซอร์ยังเห็น", !!geo && geo.tc === "rgba(0, 0, 0, 0)" && geo.caret !== "rgba(0, 0, 0, 0)", `${geo?.tc} ${geo?.caret}`);
  const col = (cls) => q(`return getComputedStyle(document.querySelector('[data-se-texthl] .sx-${cls}')).color;`);
  const cs = { brackets: await col("brackets"), slashes: await col("slashes"), tags: await col("tags"), params: await col("params"), normal: await col("normal") };
  check("สีตามค่าตั้งต้นของ Aegisub (Colour/Subtitle/Syntax) ในโทนโรสควอตซ์", tone !== "quartz" || (cs.brackets === "rgb(20, 50, 255)" && (cs.slashes === "color(srgb 1 0 0.78)" || /^rgb\(255, 0, 19[89]\)$/.test(cs.slashes)) && cs.tags === "rgb(90, 90, 90)" && cs.params === "rgb(40, 90, 40)"), JSON.stringify(cs));
  const bold = await q("const s = getComputedStyle(document.querySelector('[data-se-texthl] .sx-tags')); return s.textShadow + ' ' + s.fontWeight;");
  check("ชื่อแท็กหนาด้วยเงาตัวอักษร ความกว้างตัวอักษรไม่เปลี่ยน", /rgb\(90, 90, 90\)/.test(bold) && bold.endsWith(" 400"), bold);

  // ข้อความไทยยาวตัดหลายบรรทัด ชั้นสีตัดตรงกัน เลื่อนตามกัน
  const long = "{\\fnLeelawadee UI\\fs60}" + "ข้อความภาษาไทยยาวมากสำหรับทดสอบการตัดบรรทัดของช่องพิมพ์กับชั้นสีว่าตรงกัน {\\i1}ตัวเอียง{\\i0} ".repeat(8);
  const u0 = await q(`return ${S}.get().undo.length;`);
  await q(`${S}.updateEvent(${id}, { text: ${JSON.stringify(long)} }, 'ทดสอบ'); return 1;`);
  await sleep(300);
  const wrap = await q(`const t = document.querySelector('[data-se-text]'), h = document.querySelector('[data-se-texthl]'); return { th: t.scrollHeight, hh: h.scrollHeight, ch: t.clientHeight };`);
  check("ข้อความยาว ชั้นสีตัดบรรทัดเท่าช่องพิมพ์ (ความสูงเนื้อหาเท่ากัน)", wrap.th === wrap.hh && wrap.th > wrap.ch, JSON.stringify(wrap));
  await q("const t = document.querySelector('[data-se-text]'); t.scrollTop = 48; t.dispatchEvent(new Event('scroll')); return 1;");
  await sleep(150);
  const sc = await q("const t = document.querySelector('[data-se-text]'), h = document.querySelector('[data-se-texthl]'); return [t.scrollTop, h.scrollTop];");
  check("เลื่อนช่องพิมพ์ ชั้นสีเลื่อนตาม", sc[0] > 0 && sc[0] === sc[1], JSON.stringify(sc));
  // ทุกตัวอักษรอยู่บรรทัดเดียวกันทั้งสองชั้น เทียบตำแหน่งตัวอักษรท้ายของชั้นสีกับความสูงทั้งหมด
  await q(`${S}.undo(); return 1;`);
  await sleep(200);
  check("เลิกทำ ข้อความกลับ ประวัติเท่าเดิม", (await q(`return ${S}.get().undo.length;`)) === u0 && (await q(`return ${S}.get().doc.events.find((e) => e.id === ${id}).text.includes('\\\\fs60');`)));

  // บรรทัดแม่แบบคาราโอเกะในหน้าจอ
  await q(`${S}.updateEvent(${id}, { comment: true, effect: 'template line', text: '!retime(\\'line\\')!{\\\\k10}ก' }, 'ทดสอบ'); return 1;`);
  await sleep(250);
  check("บรรทัดความเห็นเอฟเฟกต์ template ขึ้นสีแม่แบบคาราโอเกะ", await q("return !!document.querySelector('[data-se-texthl] .sx-ktemplate');"));
  await q(`${S}.undo(); return 1;`);
  await sleep(200);

  // โทนกลางคืน ทุกสีต่างจากพื้นอย่างน้อย 3 เท่า (WCAG ความต่างสำหรับตัวหนังสือใหญ่และส่วนประกอบ)
  await q("window.__applyTone('night'); return 1;");
  await sleep(400);
  // สีจาก color-mix รายงานเป็น color(srgb 1 0 0.78) ค่า 0 ถึง 1 · สีอื่นเป็น rgb ค่า 0 ถึง 255
  const night = await q(`const lum = (s) => { const k = s.startsWith('color(') ? 1 : 255; const m = s.match(/\\d+(\\.\\d+)?/g).slice(0, 3).map(Number).map((v) => { v /= k; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]; };
    const bg = getComputedStyle(document.querySelector('[data-se-textwrap]')).backgroundColor;
    const out = {};
    for (const k of ['brackets', 'slashes', 'tags', 'params', 'normal']) { const el = document.querySelector('[data-se-texthl] .sx-' + k); if (!el) continue; const a = lum(getComputedStyle(el).color), b = lum(bg); out[k] = Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 10) / 10; }
    return { bg, out };`);
  check("โทนกลางคืน ทุกสีอ่านได้บนพื้นของช่องพิมพ์", Object.values(night.out).every((v) => v >= 3) && Object.keys(night.out).length === 5, JSON.stringify(night));
  await c.shot("docs/report-2026-11-14/สีอักษรช่องพิมพ์/2-โทนกลางคืน.png", "[data-se-textwrap]", 6).catch(() => {});
  await q(`window.__applyTone(${JSON.stringify(tone)}); return 1;`);
  await sleep(400);
  await c.shot("docs/report-2026-11-14/สีอักษรช่องพิมพ์/1-โรสควอตซ์.png", "[data-se-textwrap]", 6).catch(() => {});

  // ไฟล์ SRT ไม่มีชั้นสี ช่องพิมพ์ตัวอักษรปกติ
  await q(`window.__subClear(); window.__subOpen(${JSON.stringify(SRT)}); return 1;`);
  await waitFor("return !!document.querySelector('[data-se-text]')", 15000);
  const srt = await q("return { hl: !!document.querySelector('[data-se-texthl]'), color: getComputedStyle(document.querySelector('[data-se-text]')).color };");
  check("ไฟล์ SRT ไม่มีชั้นสี ตัวอักษรของช่องพิมพ์เห็นปกติ", !srt.hl && srt.color !== "rgba(0, 0, 0, 0)", JSON.stringify(srt));
} finally {
  await q(`window.__applyTone(${JSON.stringify(tone)}); window.__subClear(); return 1;`).catch(() => {});
  await c.send("Emulation.clearDeviceMetricsOverride").catch(() => {});
  c.close();
}
const pass = results.filter(Boolean).length;
console.log(`\nผ่าน ${pass} จาก ${results.length}`);
process.exit(pass === results.length ? 0 : 1);
