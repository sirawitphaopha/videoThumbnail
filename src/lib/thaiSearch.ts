/* สมองการค้นหาชื่อหนัง (สกิล search-system ข้อ 2 3 10 13 18)
   ✓ กรองทันทีที่พิมพ์ ค้นจากชื่อไฟล์ · พิมพ์หลายคำ ต้องเจอครบทุกคำ
   ✓ ลืมสลับแป้นพิมพ์ ไทย↔อังกฤษ (แป้นเกษมณี) ค้นด้วยคำที่พิมพ์ก่อน ไม่เจอค่อยแปลงแล้วค้นใหม่
     คืนคำที่ใช้ค้นจริงออกไป ไว้ไฮไลต์และขึ้นป้าย "ค้นว่า ..."
   ✓ คำไทยที่ตาเห็นเหมือนกันแต่เครื่องมองต่างกัน (ำ กับ ํา) ทำให้เป็นแบบเดียวกันก่อนเทียบ */

const TH = "ๆไำพะัีรนยบลฃฟหกดเ้่าสวงผปแอิืทมใฝๅ/-ภถุึคตจขช_๐\"ฎฑธํ๊ณฯญฐ,ฅฤฆฏโฌ็๋ษศซ.()ฉฮฺ์?ฒฬฦ+๑๒๓๔ู฿๕๖๗๘๙%";
const EN = "qwertyuiop[]\\asdfghjkl;'zxcvbnm,./1234567890-=`QWERTYUIOP{}|ASDFGHJKL:\"ZXCVBNM<>?!@#$%^&*()_+~";

const TH2EN = new Map<string, string>();
const EN2TH = new Map<string, string>();
[...TH].forEach((c, i) => { TH2EN.set(c, EN[i]); EN2TH.set(EN[i], c); });

/** ทำข้อความให้เทียบกันได้ · ตัวเล็ก · ำ แบบแยกสองตัวเป็นตัวเดียว · NFC */
export function norm(s: string): string {
  return s.normalize("NFC").replace(/ํา/g, "ำ").toLowerCase();
}

const hasThai = (s: string) => /[฀-๿]/.test(s);
const hasLatin = (s: string) => /[a-z]/i.test(s);

export function thaiToEnglish(s: string): string {
  return [...s].map((c) => TH2EN.get(c) ?? c).join("");
}
export function englishToThai(s: string): string {
  return [...s].map((c) => EN2TH.get(c) ?? c).join("");
}

export type SearchResult<T> = { items: T[]; used: string; swapped: boolean };

/** กรองรายการด้วยคำค้น · ไม่เจอเลยค่อยลองแปลงแป้น */
export function searchByName<T>(items: T[], query: string, nameOf: (t: T) => string): SearchResult<T> {
  const q = query.trim();
  if (!q) return { items, used: "", swapped: false };
  const run = (qq: string) => {
    const words = norm(qq).split(/\s+/).filter(Boolean);
    return items.filter((t) => { const n = norm(nameOf(t)); return words.every((w) => n.includes(w)); });
  };
  const direct = run(q);
  if (direct.length) return { items: direct, used: q, swapped: false };
  const alt = hasThai(q) ? thaiToEnglish(q) : hasLatin(q) ? englishToThai(q) : "";
  if (alt && alt !== q) {
    const r = run(alt);
    if (r.length) return { items: r, used: alt, swapped: true };
  }
  return { items: [], used: q, swapped: false };
}

/** แบ่งชื่อเป็นท่อนที่ตรงกับคำค้นกับท่อนที่ไม่ตรง ไว้ไฮไลต์ · ใช้คำที่ค้นจริง (used) ไม่ใช่คำที่พิมพ์ */
export function highlightParts(name: string, used: string): { text: string; hit: boolean }[] {
  const words = norm(used).split(/\s+/).filter(Boolean);
  if (!words.length) return [{ text: name, hit: false }];
  const n = norm(name);
  const mark = new Array(name.length).fill(false);
  // ความยาวของ norm กับต้นฉบับตรงกันเมื่อไม่มี ํา · มีแล้วไม่ไฮไลต์ดีกว่าไฮไลต์ผิดที่
  if (n.length !== name.length) return [{ text: name, hit: false }];
  for (const w of words) {
    let i = n.indexOf(w);
    while (i >= 0) { for (let k = i; k < i + w.length; k++) mark[k] = true; i = n.indexOf(w, i + w.length); }
  }
  const out: { text: string; hit: boolean }[] = [];
  for (let i = 0; i < name.length; i++) {
    const last = out[out.length - 1];
    if (last && last.hit === mark[i]) last.text += name[i];
    else out.push({ text: name[i], hit: mark[i] });
  }
  return out;
}
