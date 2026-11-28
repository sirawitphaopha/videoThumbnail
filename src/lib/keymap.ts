/* ทะเบียนคีย์ลัดกลางของทั้งโปรแกรม (BUGS ข้อ 162.3 · docs/PLAN-2026-11-28-คีย์ลัด.md)
   พี่กันสั่ง 28 พ.ย. 2569 "หน้าตั้งค่าที่เขียนคีย์ลัดทั้งหมด ในทุกฟังชั่น และสามารถปรับได้ มีปุ่มแก้ไข เหมือนโปรแกรมทั่วไป ทำตามเขา"
   คำสั่งทุกตัวมีรหัส กลุ่ม ชื่อ และคีย์ตั้งต้น · คีย์ที่ตั้งเองมาจากค่าตั้ง hotkeys (store.rs กรองค่าแล้ว) ไม่มีใช้คีย์ตั้งต้น
   คีย์เขียนเป็นตัวกด Ctrl Shift Alt ตามลำดับ แล้วตามด้วยตำแหน่งปุ่ม (KeyboardEvent.code) เช่น Ctrl+Shift+KeyS
   จับจากตำแหน่งปุ่ม ไม่ใช่ตัวอักษร พี่กันใช้แป้นไทยแล้วคีย์ลัดยังทำงาน (hotkeys.ts) */

export type Combo = { code: string; ctrl: boolean; shift: boolean; alt: boolean };
export type KeyAction = {
  id: string;
  /** กลุ่มในหน้าตั้งค่า (KEY_GROUPS) */
  group: string;
  label: string;
  /** คีย์ตั้งต้น ว่างได้ */
  keys: string[];
  /** ใช้ได้ตอนเคอร์เซอร์อยู่ในช่องพิมพ์ */
  field?: boolean;
  /** ข้ามตอนโฟกัสอยู่ที่ปุ่ม (Enter Space กดปุ่มนั้นตามปกติ) */
  noButton?: boolean;
};

/** กลุ่มของคำสั่ง · scope เดียวกันห้ามใช้คีย์ซ้ำ (หน้าตั้งค่าเตือนว่าชน) */
export const KEY_GROUPS: { id: string; title: string; scope: string; note?: string }[] = [
  { id: "sub", title: "หน้าแก้ซับ ทั่วไป", scope: "sub" },
  { id: "subvid", title: "หน้าแก้ซับ กรอบวิดีโอ", scope: "sub" },
  { id: "subaud", title: "หน้าแก้ซับ คลื่นเสียง", scope: "sub", note: "ใช้ตอนไม่ได้พิมพ์ในช่อง" },
  { id: "medusa", title: "หน้าแก้ซับ แป้นตัวเลข (Medusa)", scope: "sub", note: "ใช้ได้เมื่อเปิดปุ่มแป้นตัวเลขเท่านั้น" },
  { id: "subtool", title: "หน้าแก้ซับ เครื่องมือบนภาพ", scope: "subtool", note: "ใช้ตอนคลิกที่ภาพไว้" },
  { id: "translate", title: "หน้าต่างตัวช่วยแปล", scope: "translate" },
  { id: "ocr", title: "หน้า OCR ซับรูป", scope: "ocr" },
  { id: "viewer", title: "ตัวดูรูปเต็มจอ", scope: "viewer" },
  { id: "subimg", title: "ตัวดูซับรูป", scope: "subimg" },
  { id: "graph", title: "หน้ากราฟเสียง", scope: "graph" },
];

export const ACTIONS: KeyAction[] = [
  // หน้าแก้ซับ ทั่วไป (คีย์ตั้งต้นตาม default_hotkey.json ของ Aegisub)
  { id: "sub.undo", group: "sub", label: "เลิกทำ", keys: ["Ctrl+KeyZ"], field: true },
  { id: "sub.redo", group: "sub", label: "ทำซ้ำ", keys: ["Ctrl+KeyY", "Ctrl+Shift+KeyZ"], field: true },
  { id: "sub.save", group: "sub", label: "บันทึก", keys: ["Ctrl+KeyS"], field: true },
  { id: "sub.save-as", group: "sub", label: "บันทึกเป็นไฟล์ใหม่", keys: ["Ctrl+Shift+KeyS"], field: true },
  { id: "sub.select-all", group: "sub", label: "เลือกทุกบรรทัด", keys: ["Ctrl+KeyA"] },
  { id: "sub.find", group: "sub", label: "ค้นหา", keys: ["Ctrl+KeyF"], field: true },
  { id: "sub.replace", group: "sub", label: "ค้นหาและแทนที่", keys: ["Ctrl+KeyH"], field: true },
  { id: "sub.find-next", group: "sub", label: "ค้นต่อไป", keys: ["F3"], field: true },
  { id: "sub.shift", group: "sub", label: "เลื่อนเวลาทั้งไฟล์", keys: ["Ctrl+KeyI"] },
  { id: "sub.copy", group: "sub", label: "คัดลอกบรรทัด", keys: ["Ctrl+KeyC"] },
  { id: "sub.cut", group: "sub", label: "ตัดบรรทัด", keys: ["Ctrl+KeyX"] },
  { id: "sub.paste", group: "sub", label: "วางบรรทัด", keys: ["Ctrl+KeyV"] },
  { id: "sub.paste-over", group: "sub", label: "วางทับ", keys: ["Ctrl+Shift+KeyV"] },
  { id: "sub.delete", group: "sub", label: "ลบบรรทัด", keys: ["Ctrl+Delete"] },
  { id: "sub.split-before", group: "sub", label: "แยกก่อนเฟรมที่แสดง", keys: ["Ctrl+KeyD"], field: true },
  { id: "sub.split-after", group: "sub", label: "แยกหลังเฟรมที่แสดง", keys: ["Ctrl+Shift+KeyD"], field: true },
  { id: "sub.move-up", group: "sub", label: "ย้ายบรรทัดขึ้น", keys: ["Alt+ArrowUp"] },
  { id: "sub.move-down", group: "sub", label: "ย้ายบรรทัดลง", keys: ["Alt+ArrowDown"] },
  { id: "sub.snap-start", group: "sub", label: "สอดเวลาเริ่มกับภาพ", keys: ["Ctrl+Digit3"], field: true },
  { id: "sub.snap-end", group: "sub", label: "สอดเวลาจบกับภาพ", keys: ["Ctrl+Digit4"], field: true },
  { id: "sub.snap-scene", group: "sub", label: "สอดเวลาไปยังฉาก", keys: ["Ctrl+Digit5"], field: true },
  { id: "sub.to-frame", group: "sub", label: "เลื่อนไปยังเฟรมปัจจุบัน", keys: ["Ctrl+Digit6"], field: true },
  // หน้าแก้ซับ กรอบวิดีโอ
  { id: "vid.play", group: "subvid", label: "เล่นหรือหยุดหนัง", keys: ["Ctrl+KeyP"], field: true },
  { id: "vid.next-frame", group: "subvid", label: "เฟรมถัดไป", keys: ["Ctrl+Numpad6"], field: true },
  { id: "vid.prev-frame", group: "subvid", label: "เฟรมก่อนหน้า", keys: ["Ctrl+Numpad4"], field: true },
  { id: "vid.to-start", group: "subvid", label: "ไปเวลาเริ่มของบรรทัด", keys: ["Ctrl+Digit1"], field: true },
  { id: "vid.to-end", group: "subvid", label: "ไปเวลาจบของบรรทัด", keys: ["Ctrl+Digit2"], field: true },
  { id: "vid.jump", group: "subvid", label: "ไปเวลาหรือเฟรมที่ต้องการ", keys: ["Ctrl+KeyG"], field: true },
  { id: "vid.zoom-in", group: "subvid", label: "ขยายภาพ", keys: ["Ctrl+NumpadAdd"], field: true },
  { id: "vid.zoom-out", group: "subvid", label: "ย่อภาพ", keys: ["Ctrl+NumpadSubtract"], field: true },
  // หน้าแก้ซับ คลื่นเสียง
  { id: "aud.commit", group: "subaud", label: "ยืนยันเวลาแล้วไปบรรทัดถัดไป", keys: ["Enter", "KeyG"], noButton: true },
  { id: "aud.play-sel", group: "subaud", label: "เล่นช่วงที่เลือก", keys: ["Space", "KeyS"], noButton: true },
  { id: "aud.play-line", group: "subaud", label: "เล่นทั้งบรรทัด", keys: ["KeyR"] },
  { id: "aud.before", group: "subaud", label: "เล่นครึ่งวินาทีก่อนเวลาเริ่ม", keys: ["KeyQ"] },
  { id: "aud.after", group: "subaud", label: "เล่นครึ่งวินาทีหลังเวลาจบ", keys: ["KeyW"] },
  { id: "aud.begin", group: "subaud", label: "เล่นครึ่งวินาทีแรกของช่วง", keys: ["KeyE"] },
  { id: "aud.end", group: "subaud", label: "เล่นครึ่งวินาทีท้ายช่วง", keys: ["KeyD"] },
  { id: "aud.to-end", group: "subaud", label: "เล่นจากเวลาเริ่มไปจนจบไฟล์", keys: ["KeyT"] },
  { id: "aud.stop", group: "subaud", label: "หยุดเล่น", keys: ["KeyH"] },
  { id: "aud.scroll-left", group: "subaud", label: "เลื่อนคลื่นเสียงไปทางซ้าย", keys: ["KeyA"] },
  { id: "aud.scroll-right", group: "subaud", label: "เลื่อนคลื่นเสียงไปทางขวา", keys: ["KeyF"] },
  { id: "aud.prev", group: "subaud", label: "บรรทัดก่อนหน้า", keys: ["KeyZ"] },
  { id: "aud.next", group: "subaud", label: "บรรทัดถัดไป", keys: ["KeyX"] },
  { id: "aud.lead-in", group: "subaud", label: "เผื่อหน้า เวลาเริ่มเร็วขึ้น 100 ms", keys: ["KeyC"] },
  { id: "aud.lead-out", group: "subaud", label: "เผื่อท้าย เวลาจบช้าลง 350 ms", keys: ["KeyV"] },
  { id: "aud.len-up", group: "subaud", label: "ยืดเวลาจบ 10 ms", keys: ["NumpadAdd", "Shift+NumpadAdd"] },
  { id: "aud.len-down", group: "subaud", label: "หดเวลาจบ 10 ms", keys: ["NumpadSubtract", "Shift+NumpadSubtract"] },
  // แป้นตัวเลข Medusa
  { id: "medusa.prev", group: "medusa", label: "บรรทัดก่อนหน้า", keys: ["Numpad0"], field: true },
  { id: "medusa.next", group: "medusa", label: "บรรทัดถัดไป", keys: ["Numpad2"], field: true },
  { id: "medusa.play-sel", group: "medusa", label: "เล่นช่วงที่เลือก", keys: ["Numpad5"], field: true },
  { id: "medusa.before", group: "medusa", label: "เล่นครึ่งวินาทีก่อนเวลาเริ่ม", keys: ["Numpad1"], field: true },
  { id: "medusa.after", group: "medusa", label: "เล่นครึ่งวินาทีหลังเวลาจบ", keys: ["Numpad3"], field: true },
  { id: "medusa.stop", group: "medusa", label: "หยุดเล่น", keys: ["Numpad8"], field: true },
  { id: "medusa.start-down", group: "medusa", label: "เลื่อนเวลาเริ่มเร็วขึ้น", keys: ["Numpad4"], field: true },
  { id: "medusa.start-up", group: "medusa", label: "เลื่อนเวลาเริ่มช้าลง", keys: ["Numpad6"], field: true },
  { id: "medusa.len-down", group: "medusa", label: "หดเวลาจบ", keys: ["Numpad7"], field: true },
  { id: "medusa.len-up", group: "medusa", label: "ยืดเวลาจบ", keys: ["Numpad9"], field: true },
  { id: "medusa.commit", group: "medusa", label: "ยืนยันเวลาแล้วไปบรรทัดถัดไป", keys: ["NumpadEnter"], field: true },
  // เครื่องมือบนภาพ
  { id: "tool.cross", group: "subtool", label: "เครื่องมือกากบาท", keys: ["KeyA"] },
  { id: "tool.drag", group: "subtool", label: "เครื่องมือลากจัดตำแหน่ง", keys: ["KeyS"] },
  // ตัวช่วยแปล
  { id: "tr.commit-next", group: "translate", label: "ยืนยันคำแปลแล้วไปท่อนถัดไป", keys: ["Enter"], field: true },
  { id: "tr.commit", group: "translate", label: "ยืนยันคำแปลแล้วอยู่ท่อนเดิม", keys: ["F8"], field: true },
  { id: "tr.next", group: "translate", label: "ท่อนถัดไป", keys: ["PageDown"], field: true },
  { id: "tr.prev", group: "translate", label: "ท่อนก่อนหน้า", keys: ["PageUp"], field: true },
  { id: "tr.insert", group: "translate", label: "แทรกต้นฉบับ", keys: ["Insert"], field: true },
  { id: "tr.play", group: "translate", label: "เล่นเสียงของบรรทัด", keys: ["End"], field: true },
  // หน้า OCR
  { id: "ocr.delete", group: "ocr", label: "ลบบรรทัดที่เลือก", keys: ["Delete"] },
  { id: "ocr.fill", group: "ocr", label: "ใส่ข้อความจากคลิปบอร์ดทีละบรรทัด", keys: ["Ctrl+Shift+KeyV"] },
  { id: "ocr.inspect", group: "ocr", label: "ดูการอ่านทีละตัว", keys: ["Ctrl+Shift+KeyI"] },
  { id: "ocr.down", group: "ocr", label: "บรรทัดถัดไป", keys: ["ArrowDown"], noButton: true },
  { id: "ocr.up", group: "ocr", label: "บรรทัดก่อนหน้า", keys: ["ArrowUp"], noButton: true },
  // ตัวดูรูปเต็มจอ
  { id: "viewer.zoom-in", group: "viewer", label: "ขยาย", keys: ["Equal", "Shift+Equal", "NumpadAdd"] },
  { id: "viewer.zoom-out", group: "viewer", label: "ย่อ", keys: ["Minus", "Shift+Minus", "NumpadSubtract"] },
  { id: "viewer.fit", group: "viewer", label: "พอดีจอ", keys: ["Digit0", "Numpad0"] },
  { id: "viewer.prev", group: "viewer", label: "รูปก่อนหน้า", keys: ["ArrowLeft"] },
  { id: "viewer.next", group: "viewer", label: "รูปถัดไป", keys: ["ArrowRight"] },
  // ตัวดูซับรูป
  { id: "subimg.prev", group: "subimg", label: "ภาพก่อนหน้า", keys: ["ArrowLeft"] },
  { id: "subimg.next", group: "subimg", label: "ภาพถัดไป", keys: ["ArrowRight"] },
  // หน้ากราฟเสียง (BUGS ข้อ 163.4 เล่นเสียงจากกราฟ · พี่กันเคาะ "เว้นวรรคเล่นหรือหยุด")
  { id: "graph.play", group: "graph", label: "เล่นหรือหยุดชั่วคราว", keys: ["Space"], noButton: true },
  // ปุ่มควบคุมแบบ Audacity (BUGS ข้อ 163.5) ไม่มีคีย์ตั้งต้น ไม่ให้ชนกับ Home End ที่ใช้เลื่อนในรายการ ตั้งเองได้ในหน้าตั้งค่า
  { id: "graph.stop", group: "graph", label: "หยุด แล้วกลับไปจุดที่เริ่มเล่น", keys: [] },
  { id: "graph.home", group: "graph", label: "ไปต้นไฟล์", keys: [] },
  { id: "graph.end", group: "graph", label: "ไปท้ายไฟล์", keys: [] },
  { id: "graph.loop", group: "graph", label: "เปิดปิดเล่นวน", keys: [] },
];

/** คีย์พื้นฐานของช่อง รายการ และหน้าต่าง ปรับไม่ได้ แบบโปรแกรมทั่วไป · แสดงในหน้าตั้งค่าให้รู้ว่ามี */
export const FIXED_KEYS: { keys: string; label: string }[] = [
  { keys: "Esc", label: "ปิดหน้าต่างซ้อน เมนู หรือกล่องคำอธิบายชั้นบนสุด และออกจากเต็มจอ" },
  { keys: "Enter", label: "ยืนยันในช่องหรือหน้าต่าง และกดปุ่มที่โฟกัสอยู่" },
  { keys: "Tab / Shift+Tab", label: "ย้ายไปช่องหรือปุ่มถัดไปและก่อนหน้า" },
  { keys: "↑ ↓ Page Up Page Down Home End", label: "เลื่อนในรายการ ตาราง ดรอปดาวน์ และตัวเลื่อนค่า" },
  { keys: "← →", label: "ปรับค่าตัวเลื่อน และเลื่อนช่วงกราฟที่โฟกัสอยู่" },
  { keys: "Shift+Enter", label: "ขึ้นบรรทัดใหม่ในซับเดียวกัน (ช่องพิมพ์หน้าแก้ซับ)" },
  { keys: "↑ ↓ ← → + -", label: "เลื่อนกรอบและซูมในหน้าครอปรูป" },
  { keys: "F5 Ctrl+R Ctrl+P", label: "ปิดไว้ไม่ให้หน้าโปรแกรมรีเฟรชหรือสั่งพิมพ์เหมือนหน้าเว็บ" },
];

/** คีย์ที่ไม่ให้ตั้ง Windows หรือหน้าต่างโปรแกรมใช้อยู่ */
export const RESERVED = new Set(["Escape", "Tab", "Shift+Tab", "Alt+F4", "Ctrl+KeyW", "Alt+Tab", "F5", "Ctrl+KeyR", "F11"]);

const BY_ID = new Map(ACTIONS.map((a) => [a.id, a]));
export const actionOf = (id: string) => BY_ID.get(id);

let user: Record<string, string[]> = {};
const subs = new Set<() => void>();
/** ค่าตั้ง hotkeys ล่าสุด (settings.tsx เรียกทุกครั้งที่ค่าตั้งเปลี่ยน) */
export function setUserKeys(m: Record<string, string[]> | undefined) {
  user = m ?? {};
  subs.forEach((f) => f());
}
export function onKeysChange(f: () => void) { subs.add(f); return () => { subs.delete(f); }; }
/** คีย์ที่ใช้อยู่ของคำสั่ง ตั้งเองก่อน ไม่มีใช้คีย์ตั้งต้น */
export function keysOf(id: string): string[] {
  return user[id] ?? BY_ID.get(id)?.keys ?? [];
}
export const isCustom = (id: string) => id in user;

export function parseCombo(s: string): Combo {
  const parts = s.split("+");
  const code = parts.pop() ?? "";
  return { code, ctrl: parts.includes("Ctrl"), shift: parts.includes("Shift"), alt: parts.includes("Alt") };
}
/** คีย์ที่กดเป็นข้อความแบบเดียวกับที่เก็บ · ปุ่มตัวกดอย่างเดียวได้ null */
export function comboOf(e: Pick<KeyboardEvent, "code" | "ctrlKey" | "metaKey" | "shiftKey" | "altKey">): string | null {
  if (!e.code || /^(Control|Shift|Alt|Meta|OS)/.test(e.code)) return null;
  return [(e.ctrlKey || e.metaKey) && "Ctrl", e.shiftKey && "Shift", e.altKey && "Alt", e.code].filter(Boolean).join("+");
}
const same = (c: Combo, e: Pick<KeyboardEvent, "code" | "ctrlKey" | "metaKey" | "shiftKey" | "altKey">) =>
  c.code === e.code && c.ctrl === (e.ctrlKey || e.metaKey) && c.shift === e.shiftKey && c.alt === e.altKey;
/** ปุ่มที่กดตรงกับคีย์ของคำสั่งนี้ไหม · ตัวดักเฉพาะจุดใช้แทนการเขียนปุ่มตายตัว */
export function isKey(e: Pick<KeyboardEvent, "code" | "ctrlKey" | "metaKey" | "shiftKey" | "altKey">, id: string) {
  return keysOf(id).some((k) => same(parseCombo(k), e));
}

/** คีย์ที่ใช้พิมพ์หรือเลื่อนเคอร์เซอร์ในช่อง (ไม่มี Ctrl หรือ Alt) · คำสั่งที่ใช้ได้ตอนพิมพ์จะข้ามคีย์พวกนี้ตอนอยู่ในช่อง ไม่ให้พิมพ์ตัวอักษรแล้วคำสั่งทำงานแทน */
export function typingKey(s: string) {
  const c = parseCombo(s);
  return !c.ctrl && !c.alt && /^(Key|Digit|Space$|Equal$|Minus$|Bracket|Backslash$|Semicolon$|Quote$|Comma$|Period$|Slash$|Backquote$|Enter$|Backspace$|Delete$|Arrow|Home$|End$)/.test(c.code);
}

const NAMES: Record<string, string> = {
  Space: "Space", Enter: "Enter", NumpadEnter: "Num Enter", NumpadAdd: "Num +", NumpadSubtract: "Num -", NumpadMultiply: "Num *", NumpadDivide: "Num /", NumpadDecimal: "Num .",
  ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→", PageUp: "Page Up", PageDown: "Page Down", Equal: "=", Minus: "-", Backquote: "`",
  BracketLeft: "[", BracketRight: "]", Backslash: "\\", Semicolon: ";", Quote: "'", Comma: ",", Period: ".", Slash: "/", Delete: "Delete", Backspace: "Backspace", Insert: "Insert",
};
/** คีย์สำหรับแสดงบนจอ Ctrl+Shift+KeyS เป็น Ctrl+Shift+S */
export function showCombo(s: string) {
  const c = parseCombo(s);
  const name = NAMES[c.code] ?? c.code.replace(/^Key/, "").replace(/^Digit/, "").replace(/^Numpad(\d)$/, "Num $1");
  return [c.ctrl && "Ctrl", c.shift && "Shift", c.alt && "Alt", name].filter(Boolean).join("+");
}

/** คีย์แรกของคำสั่งสำหรับบอกในเมนูหรือชื่อปุ่ม · ไม่มีคีย์ได้ข้อความว่าง */
export const keyLabel = (id: string) => { const k = keysOf(id)[0]; return k ? showCombo(k) : ""; };

/** ทุกคีย์ของคำสั่งต่อกันด้วยคำว่า หรือ · ไม่มีคีย์ได้คำว่าไม่มีคีย์ลัด */
export const keysText = (id: string) => keysOf(id).map(showCombo).join(" หรือ ") || "ไม่มีคีย์ลัด";

/** คีย์ลัดของหน้าสำหรับ useHotkeys จากรหัสคำสั่ง · ช่องพิมพ์กับปุ่มตามที่ทะเบียนบอก */
export function hk(id: string, run: (e: KeyboardEvent) => void, more: { dialog?: string } = {}) {
  const a = BY_ID.get(id);
  return { id, field: a?.field, noButton: a?.noButton, run, ...more };
}

/** คำสั่งอื่นใน scope เดียวกันที่ใช้คีย์นี้อยู่ (ไม่นับตัวเอง) */
export function clashOf(id: string, key: string): KeyAction | null {
  const scope = KEY_GROUPS.find((g) => g.id === actionOf(id)?.group)?.scope;
  return ACTIONS.find((a) => a.id !== id && KEY_GROUPS.find((g) => g.id === a.group)?.scope === scope && keysOf(a.id).includes(key)) ?? null;
}
