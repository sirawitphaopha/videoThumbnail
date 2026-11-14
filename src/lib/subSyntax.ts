/* สีอักษรในช่องพิมพ์ของหน้าแก้ซับแบบ Aegisub (BUGS ข้อ 112)
   แปลจากซอร์ส Aegisub ทีละฟังก์ชัน
   - libaegisub/common/parser.cpp dialogue_tokens กติกาแยกส่วนข้อความ 5 สถานะ INITIAL OVR ARG TAGSTART TAGNAME (TokenizeDialogueBody)
   - libaegisub/ass/dialogue_parser.cpp MarkDrawings (ภาพวาด \p กับ \clip แบบเวกเตอร์ กลุ่มแท็กที่ไม่ปิดเป็นข้อความ)
     SplitDrawing (คำสั่งกับพิกัด x y ของภาพวาด) SyntaxHighlighter (ชนิดส่วนเป็นชนิดสี)
   - src/subs_edit_ctrl.cpp UpdateStyle (บรรทัดแม่แบบคาราโอเกะ คือบรรทัดความเห็นที่เอฟเฟกต์ขึ้นต้นด้วย template)
   ไม่ได้แปล WordSplitter ส่วนแยกคำสำหรับตัวตรวจคำผิด (โปรแกรมนี้ยังไม่มีตัวตรวจคำผิด คำปกติกับข้อความสีเดียวกันอยู่แล้ว)
   ช่องพิมพ์ของโปรแกรมนี้แสดง \N เป็นขึ้นบรรทัดจริง ตัวขึ้นบรรทัดนอกกลุ่มแท็กจึงนับเป็นชนิดขึ้นบรรทัด ในกลุ่มแท็กนับเป็นช่องว่างแบบ \s

   Copyright (c) 2012, Thomas Goyne <plorkyeran@aegisub.org>

   Permission to use, copy, modify, and distribute this software for any
   purpose with or without fee is hereby granted, provided that the above
   copyright notice and this permission notice appear in all copies.

   THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
   WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
   MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
   ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
   WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
   ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
   OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.

   Aegisub Project http://www.aegisub.org/ */

/** ชนิดส่วนของข้อความ (DialogueTokenType) */
export type Tok =
  | "TEXT" | "WORD" | "LINE_BREAK" | "OVR_BEGIN" | "OVR_END" | "TAG_START" | "TAG_NAME" | "OPEN_PAREN" | "CLOSE_PAREN" | "ARG_SEP" | "ARG"
  | "ERROR" | "COMMENT" | "WHITESPACE" | "DRAWING_FULL" | "DRAWING_CMD" | "DRAWING_X" | "DRAWING_Y" | "DRAWING_ENDPOINT_X" | "DRAWING_ENDPOINT_Y"
  | "KARAOKE_TEMPLATE" | "KARAOKE_VARIABLE";
export type Token = { type: Tok; length: number };

/** ชนิดสี (SyntaxStyle) ชื่อตรงกับคีย์สีของ Aegisub ใน default_config.json Colour/Subtitle/Syntax */
export type Sty = "normal" | "comment" | "dcmd" | "dx" | "dy" | "dex" | "dey" | "brackets" | "slashes" | "tags" | "error" | "params" | "lb" | "ktemplate" | "kvar";

type State = "INITIAL" | "OVR" | "ARG" | "TAGSTART" | "TAGNAME";
const isWs = (c: string) => c === " " || c === "\t" || c === "\n" || c === "\r" || c === "\f" || c === "\v";
const wsLen = (s: string, i: number) => { let j = i; while (j < s.length && isWs(s[j])) j++; return j - i; };

/** แยกส่วนข้อความตามกติกาของ Aegisub · กติกาที่ยาวกว่าชนะ ยาวเท่ากันกติกาที่เขียนก่อนชนะ (lexertl) · ส่วนชนิดเดียวกันที่ติดกันรวมเป็นส่วนเดียว */
export function tokenize(str: string, karaoke = false): Token[] {
  const out: Token[] = [];
  let state: State = "INITIAL", depth = 0, i = 0;
  const push = (type: Tok, length: number) => {
    const last = out.at(-1);
    if (last && last.type === type) last.length += length;
    else out.push({ type, length });
    i += length;
  };
  while (i < str.length) {
    const c = str[i];
    // กติกาแม่แบบคาราโอเกะใช้ได้ทุกสถานะ (kara_templater) · เขียนท้ายในทุกสถานะ แต่ยาวกว่าจึงชนะกติกาตัวเดียว
    if (karaoke) {
      if (c === "!") { const j = str.indexOf("!", i + 1); if (j > i) { push("KARAOKE_TEMPLATE", j - i + 1); continue; } }
      if (c === "$") { const m = /^\$[A-Za-z_]+/.exec(str.slice(i)); if (m) { push("KARAOKE_VARIABLE", m[0].length); continue; } }
    }
    if (state === "INITIAL") {
      if (c === "\\" && /[nNh]/.test(str[i + 1] ?? "")) push("LINE_BREAK", 2);
      else if (c === "{") { depth = 0; push("OVR_BEGIN", 1); state = "OVR"; }
      else if (c === "\n") push("LINE_BREAK", 1);
      else push("TEXT", 1);
    } else if (state === "OVR") {
      if (c === "{") push("ERROR", 1);
      else if (c === "}") { push("OVR_END", 1); state = "INITIAL"; }
      else if (c === "\\") { push("TAG_START", 1); state = "TAGSTART"; }
      else if (isWs(c)) push("WHITESPACE", wsLen(str, i));
      else push("COMMENT", 1);
    } else if (state === "ARG") {
      if (c === "{") push("ERROR", 1);
      else if (c === "}") { push("OVR_END", 1); state = "INITIAL"; }
      else if (c === "(") { depth++; push("OPEN_PAREN", 1); }
      else if (c === ")") { depth--; push("CLOSE_PAREN", 1); if (depth === 0) state = "OVR"; }
      else if (c === "\\") { push("TAG_START", 1); state = "TAGSTART"; }
      else if (c === ",") push("ARG_SEP", 1);
      else if (isWs(c)) push("WHITESPACE", wsLen(str, i));
      else push("ARG", 1);
    } else if (state === "TAGSTART") {
      if (isWs(c)) push("WHITESPACE", wsLen(str, i));
      else if (c === "f" && str[i + 1] === "n") { push("TAG_NAME", 2); state = "ARG"; }
      else if (c === "r") { push("TAG_NAME", 1); state = "ARG"; }
      else if (c === "\\") push("TAG_START", 1);
      else if (c === "}") { push("OVR_END", 1); state = "INITIAL"; }
      else if (/[a-z0-9]/.test(c)) { push("TAG_NAME", 1); state = "TAGNAME"; }
      else { push("COMMENT", 1); state = "OVR"; }
    } else {
      const m = /^[a-z]+/.exec(str.slice(i, i + 64));
      if (m) { push("TAG_NAME", m[0].length); state = "ARG"; }
      else if (c === "(") { depth++; push("OPEN_PAREN", 1); state = "ARG"; }
      else if (c === ")") { depth--; push("CLOSE_PAREN", 1); if (depth === 0) state = "OVR"; }
      else if (c === "}") { push("OVR_END", 1); state = "INITIAL"; }
      else if (c === "\\") { push("TAG_START", 1); state = "TAGSTART"; }
      else { push("ARG", 1); state = "ARG"; }
    }
  }
  return out;
}

/** ภาพวาดกับกลุ่มแท็กที่ไม่ปิด (MarkDrawings) · ข้อความหลัง \p ที่ค่ามากกว่า 0 เป็นภาพวาด · \clip \iclip ที่มีค่าเดียวเป็นภาพวาด
    ส่วนหลังกลุ่มแท็กที่ปิดตัวสุดท้ายเป็นข้อความหรือภาพวาดทั้งหมด เพราะ VSFilter ถือกลุ่มที่ไม่ปิดเป็นข้อความ */
export function markDrawings(str: string, tokens: Token[]) {
  if (!tokens.length) return;
  let lastEnd = 0;
  for (let i = tokens.length; i > 0; --i) if (tokens[i - 1].type === "OVR_END") { lastEnd = i; break; }
  let pos = 0, inDrawing = false;
  for (let i = 0; i < lastEnd; ++i) {
    const len = tokens[i].length;
    const t = tokens[i].type;
    if (t === "TEXT") { if (inDrawing) tokens[i].type = "DRAWING_FULL"; }
    else if (t === "TAG_NAME") {
      let skipClip = false;
      if (i + 3 < tokens.length && (len === 4 || len === 5) && str.slice(pos, pos + len).endsWith("clip")) {
        if (tokens[i + 1].type !== "OPEN_PAREN") skipClip = true;
        let ds = 0, de = 0;
        if (!skipClip) {
          for (let j = i + 2; j < tokens.length; j++) {
            if (tokens[j].type === "ARG_SEP") { if (ds) break; ds = j + 1; }
            else if (tokens[j].type === "CLOSE_PAREN") { de = j; break; }
            else if (tokens[j].type !== "WHITESPACE" && tokens[j].type !== "ARG") break;
          }
          if (!de) skipClip = true;
        }
        if (!skipClip) {
          if (!ds) ds = i + 2;
          if (de !== ds) {
            let tl = 0;
            for (let j = ds; j < de; j++) tl += tokens[j].length;
            tokens[ds] = { type: "DRAWING_FULL", length: tl };
            tokens.splice(ds + 1, de - ds - 1);
            lastEnd -= de - ds - 1;
          }
        }
      }
      // tag_p ของซอร์ส \p ตามด้วยค่า ค่าแรกที่ไม่ใช่ 0 ตัวแรกเป็น 1 ถึง 9 คือเริ่มภาพวาด
      if (len === 1 && i + 1 < tokens.length && str[pos] === "p") {
        inDrawing = false;
        if (!(i + 1 === lastEnd || tokens[i + 1].type !== "ARG")) {
          for (let j = pos + len; j < pos + len + tokens[i + 1].length; ++j) {
            const ch = str[j];
            if (ch >= "1" && ch <= "9") inDrawing = true;
            else if (ch !== "0") break;
          }
        }
      }
    }
    pos += len;
  }
  for (let i = lastEnd; i < tokens.length; ++i) {
    const t = tokens[i].type;
    if (t === "KARAOKE_TEMPLATE" || t === "KARAOKE_VARIABLE" || t === "LINE_BREAK") continue;
    tokens[i].type = inDrawing ? "DRAWING_FULL" : "TEXT";
    if (i > 0 && tokens[i - 1].type === tokens[i].type) { tokens[i - 1].length += tokens[i].length; tokens.splice(i, 1); --i; }
  }
}

/** ภาพวาดแยกเป็นคำสั่งกับพิกัด (WordSplitter::SplitDrawing) · พิกัดคู่ x y คำสั่ง m n l s b p c คำสั่งต้องตามด้วยพิกัดครบคู่ · คำสั่งแรกต้องเป็น m */
export function splitDrawings(str: string, tokens: Token[]) {
  let pos = 0;
  for (let i = 0; i < tokens.length; i++) {
    const len = tokens[i].length;
    if (tokens[i].type === "DRAWING_FULL") {
      // แบ่งตามช่องว่างกับไม่ใช่ช่องว่าง
      const parts: Token[] = [];
      let k = pos;
      while (k < pos + len) {
        const sp = str[k] === " " || str[k] === "\t";
        let e = k;
        while (e < pos + len && (str[e] === " " || str[e] === "\t") === sp) e++;
        parts.push({ type: sp ? "WHITESPACE" : "DRAWING_FULL", length: e - k });
        k = e;
      }
      let dpos = pos, numCoord = 0, lastCmd = " ";
      for (const p of parts) {
        const c = str[dpos];
        if (p.type !== "WHITESPACE") {
          if (lastCmd === " " && c !== "m") p.type = "ERROR";
          else if ("mnlsbpc".includes(c)) {
            p.type = p.length !== 1 || numCoord % 2 !== 0 ? "ERROR" : "DRAWING_CMD";
            lastCmd = c;
            numCoord = 0;
          } else {
            const ok = /^[0-9.+\-eE]+$/.test(str.slice(dpos, dpos + p.length));
            if (!ok) p.type = "ERROR";
            else if (lastCmd === "b" && numCoord % 6 >= 4) p.type = numCoord % 2 === 0 ? "DRAWING_ENDPOINT_X" : "DRAWING_ENDPOINT_Y";
            else p.type = numCoord % 2 === 0 ? "DRAWING_X" : "DRAWING_Y";
            ++numCoord;
          }
        }
        dpos += p.length;
      }
      tokens.splice(i, 1, ...parts);
      i += parts.length - 1;
    }
    pos += len;
  }
}

/** ชนิดส่วนเป็นชนิดสี (SyntaxHighlighter::Highlight) · ช่องว่างหลังค่าของแท็กสีเดียวกับค่า ช่องว่างระหว่างพิกัดปลายเส้นโค้งขีดเส้นใต้ต่อกัน */
export function styles(tokens: Token[]): { s: Sty; length: number }[] {
  const out: { s: Sty; length: number }[] = [];
  const set = (s: Sty, length: number) => { const last = out.at(-1); if (last && last.s === s) last.length += length; else out.push({ s, length }); };
  const MAP: Partial<Record<Tok, Sty>> = {
    KARAOKE_TEMPLATE: "ktemplate", KARAOKE_VARIABLE: "kvar", LINE_BREAK: "lb", ERROR: "error", ARG: "params", COMMENT: "comment",
    DRAWING_CMD: "dcmd", DRAWING_X: "dx", DRAWING_Y: "dy", DRAWING_ENDPOINT_X: "dex", DRAWING_ENDPOINT_Y: "dey", TEXT: "normal", WORD: "normal",
    TAG_NAME: "tags", OPEN_PAREN: "slashes", CLOSE_PAREN: "slashes", ARG_SEP: "slashes", TAG_START: "slashes", OVR_BEGIN: "brackets", OVR_END: "brackets",
    DRAWING_FULL: "normal",
  };
  for (const t of tokens) {
    if (t.type === "WHITESPACE") {
      const prev = out.at(-1)?.s;
      set(prev === "params" ? "params" : prev === "dex" ? "dex" : "normal", t.length);
    } else set(MAP[t.type] ?? "normal", t.length);
  }
  return out;
}

/** ข้อความในช่องพิมพ์เป็นช่วงสี · template คือบรรทัดแม่แบบคาราโอเกะ */
export function highlight(text: string, template = false): { s: Sty; t: string }[] {
  const tokens = tokenize(text, template);
  markDrawings(text, tokens);
  splitDrawings(text, tokens);
  let pos = 0;
  return styles(tokens).map((r) => { const t = text.slice(pos, pos + r.length); pos += r.length; return { s: r.s, t }; });
}

/** บรรทัดแม่แบบคาราโอเกะ บรรทัดความเห็นที่เอฟเฟกต์ขึ้นต้นด้วย template ไม่สนตัวพิมพ์ (UpdateStyle) */
export const isTemplateLine = (comment: boolean, effect: string) => comment && effect.toLowerCase().startsWith("template");

// ทางลัดให้ตัวตรวจ เฉพาะรุ่นทดสอบ
if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__subSyntaxLib = { tokenize, markDrawings, splitDrawings, styles, highlight, isTemplateLine };
