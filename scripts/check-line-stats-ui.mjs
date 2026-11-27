// ข้อตรวจหน้าจอของหัวข้อบรรทัดโค้ดในหน้าตั้งค่า (BUGS ข้อ 160) เรียกจาก node scripts/check-line-stats.mjs --ui
// เปิดหน้าจอจริงในระบบจำลองหน้าโปรแกรมบนเว็บ (docs/mockups/theme-live-app.html) ด้วย Playwright ไม่ต้องเปิดโปรแกรม ไม่ขึ้นจอ
// ใช้เซิร์ฟเวอร์ 1420 ที่เปิดอยู่ ไม่มีก็เปิด vite เองแล้วปิดตอนจบ · คืนตัวกรองที่จำในเครื่องเป็นค่าตั้งต้นตอนจบ
import { spawn } from "child_process";
import { createRequire } from "module";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

if (process.platform === "win32") process.env.PLAYWRIGHT_BROWSERS_PATH ??= "0";
const BASE = "http://127.0.0.1:1420", URL = `${BASE}/docs/mockups/theme-live-app.html`;
const up = async () => { try { return (await fetch(URL)).ok; } catch { return false; } };
const n = (s) => Number(String(s).replace(/[^\d−-]/g, "").replace("−", "-"));
const DARK = ["#338ced", "#e76624", "#00a888", "#8c8c8c", "#d28e05", "#e24d8b", "#0aac23", "#9887ef", "#eb6263"];

export async function uiChecks(check) {
  let vite = null;
  if (!(await up())) {
    vite = spawn(process.platform === "win32" ? "npx.cmd" : "npx", ["vite", "--port", "1420", "--strictPort"], { stdio: "ignore", shell: process.platform === "win32" });
    for (let i = 0; i < 60 && !(await up()); i++) await new Promise((r) => setTimeout(r, 500));
  }
  const { chromium } = createRequire(import.meta.url)("playwright");
  const b = await chromium.launch();
  try {
    for (const [W, H] of [[1280, 800], [1920, 1032]]) {
      const p = await b.newPage({ viewport: { width: W, height: H } });
      const errs = []; p.on("pageerror", (e) => errs.push(e.message));
      const open = async (tone) => {
        await p.goto(URL); await p.waitForTimeout(2200);
        await p.evaluate(() => { try { localStorage.removeItem("lines-filter"); } catch { /* */ } });
        if (tone) await p.evaluate((t) => window.__applyTone(t), tone);
        await p.evaluate(() => [...document.querySelectorAll("[data-navbar] button")].find((x) => x.querySelector(".navtxt")?.textContent.trim() === "ตั้งค่า").click());
        await p.waitForSelector("[data-setnav=lines]"); await p.click("[data-setnav=lines]"); await p.waitForSelector("[data-lines-chart] svg");
        await p.waitForTimeout(300);
      };
      await open();
      const tag = `${W}×${H}`;
      const st = await p.evaluate(() => {
        const card = document.querySelector("[data-setcard=lines]");
        const now = document.querySelector("[data-lines-row=now]"), cells = now ? [...now.cells].map((c) => c.innerText) : [];
        return {
          inAbout: [...document.querySelectorAll(".setnav-g")].find((g) => g.querySelector("[data-setnav=lines]"))?.querySelector(".setnav-t")?.textContent,
          visible: card && !card.hidden, total: document.querySelector("[data-lines-total] b")?.textContent, since: document.querySelector("[data-lines-since] b")?.textContent,
          rowTotal: cells[2], rowDelta: cells[3], rows: document.querySelectorAll("[data-lines-table] tbody tr").length, marks: document.querySelectorAll("[data-lines-mark]").length,
          areas: document.querySelectorAll("[data-lines-area]").length, overflow: card.scrollWidth - card.clientWidth,
          descLines: Math.round(card.querySelector(":scope > .small").getBoundingClientRect().height / parseFloat(getComputedStyle(card.querySelector(":scope > .small")).lineHeight)),
          tiles: [...document.querySelectorAll(".lst-tile")].map((t) => Math.round(t.getBoundingClientRect().height)),
          dots: (card.innerText.match(/·/g) ?? []).length,
          chips: [...document.querySelectorAll(".lst-chip")].map((c) => { const r = c.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; }),
          labels: [...document.querySelectorAll(".lst-mlab")].map((t) => { const r = t.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; }),
        };
      });
      const hit = (a, c) => a[0] < c[2] - 0.5 && c[0] < a[2] - 0.5 && a[1] < c[3] - 0.5 && c[1] < a[3] - 0.5;
      const pairs = (L) => L.some((a, i) => L.slice(i + 1).some((c) => hit(a, c)));
      check(`${tag} หัวข้อบรรทัดโค้ดอยู่กลุ่มเกี่ยวกับ เปิดแล้วเห็นการ์ด กราฟ ไม่มีข้อผิดพลาดในหน้า`, st.inAbout === "เกี่ยวกับ" && st.visible && st.areas === 9 && !errs.length, errs.join(" | "));
      check(`${tag} ตัวเลขสรุปตรงกับแถว ตอนนี้ ในตาราง`, n(st.total) === n(st.rowTotal) && n(st.since) === n(st.rowDelta) && n(st.total) > 50000, `${st.total} ${st.rowTotal} ${st.since} ${st.rowDelta}`);
      check(`${tag} ตารางมีแถวตอนนี้ ทุกรุ่น และ commit แรก หมุดรุ่นครบในกราฟ`, st.rows >= 15 && st.marks >= 13, `${st.rows} แถว ${st.marks} หมุด`);
      check(`${tag} ไม่ล้นแนวนอน ปุ่มกรองไม่ซ้อนกัน ป้ายรุ่นไม่ซ้อนกัน ตัวเลขสามช่องสูงเท่ากัน`, st.overflow <= 0 && !pairs(st.chips) && !pairs(st.labels) && new Set(st.tiles).size === 1, JSON.stringify({ o: st.overflow, t: st.tiles }));
      check(`${tag} คำอธิบายใต้หัวข้ออยู่บรรทัดเดียว และไม่มีจุดกลางในข้อความ`, st.descLines === 1 && st.dots === 0, `${st.descLines} บรรทัด จุดกลาง ${st.dots}`);

      // ปุ่มลัด ใช้งานจริง เหลือสี่กลุ่ม ยอดรวมเท่าผลรวมของสี่ปุ่ม กราฟเหลือสี่ชั้น
      await p.locator(".seg button", { hasText: "ใช้งานจริง" }).click(); await p.waitForTimeout(150);
      const live = await p.evaluate(() => ({ on: [...document.querySelectorAll(".lst-chip.on[data-lines-group]")].map((c) => [c.dataset.linesGroup, c.querySelector("em").textContent]), total: document.querySelector("[data-lines-total] b").textContent, areas: document.querySelectorAll("[data-lines-area]").length }));
      const liveSum = live.on.reduce((s, [, v]) => s + n(v), 0);
      check(`${tag} ปุ่มใช้งานจริงเลือกหน้าจอ สไตล์ Rust ข้อมูลภาษา ยอดรวมเท่าผลรวมสี่กลุ่ม กราฟสี่ชั้น`, live.on.map((x) => x[0]).join() === "ui,style,rust,langs" && liveSum === n(live.total) && live.areas === 4, JSON.stringify(live));

      // ติ๊กชนิดบรรทัด เอาบรรทัดว่างออก ยอดรวมลดเท่าบรรทัดว่างของสี่กลุ่ม ตารางเหลือสองคอลัมน์ชนิด
      await p.click("[data-lines-kind='2']"); await p.waitForTimeout(150);
      const k = await p.evaluate(() => ({ total: document.querySelector("[data-lines-total] b").textContent, heads: [...document.querySelectorAll("[data-lines-table] th")].map((t) => t.textContent) }));
      check(`${tag} เอาบรรทัดว่างออก ยอดรวมลดลง ตารางไม่มีคอลัมน์บรรทัดว่าง`, n(k.total) < liveSum && !k.heads.includes("บรรทัดว่าง") && k.heads.includes("โค้ดจริง"), JSON.stringify(k));
      await p.click("[data-lines-kind='0']"); await p.click("[data-lines-kind='1']"); await p.waitForTimeout(150);
      const last = await p.evaluate(() => [...document.querySelectorAll(".lst-chip.on[data-lines-kind]")].map((c) => c.dataset.linesKind).join());
      check(`${tag} ชนิดบรรทัดเหลืออย่างน้อยหนึ่งชนิด กดตัวสุดท้ายไม่ปิด`, last === "1", last);
      await p.click("[data-lines-kind='0']"); await p.click("[data-lines-kind='2']"); await p.waitForTimeout(100);

      // กราฟซ้อนตามชนิดบรรทัด สามชั้น · ชี้ที่ปลายขวาสุด กล่องตัวเลขขึ้น รวมเท่ายอดตอนนี้ และอยู่ในกรอบกราฟ
      await p.locator(".seg button", { hasText: "ชนิดบรรทัด" }).click(); await p.waitForTimeout(150);
      const areasK = await p.evaluate(() => [...document.querySelectorAll("[data-lines-area]")].map((a) => a.dataset.linesArea).join());
      const r = await p.locator("[data-lines-hit]").boundingBox();
      await p.mouse.move(r.x + r.width - 1, r.y + r.height / 2); await p.waitForTimeout(200);
      const tip = await p.evaluate(() => { const t = document.querySelector("[data-lines-tip]"); if (!t) return null; const a = t.getBoundingClientRect(), c = document.querySelector("[data-lines-chart]").getBoundingClientRect(); return { sum: t.querySelector(".lst-tip-t b").textContent, head: t.querySelector(".lst-tip-h").textContent, inside: a.left >= c.left - 1 && a.right <= c.right + 1 && a.bottom <= c.bottom + 4, total: document.querySelector("[data-lines-total] b").textContent }; });
      check(`${tag} กราฟซ้อนตามชนิดบรรทัดสามชั้น ชี้ปลายขวาขึ้นตอนนี้ ตัวเลขรวมเท่ายอดสรุป กล่องอยู่ในกรอบกราฟ`, areasK === "k0,k1,k2" && tip && tip.head.startsWith("ตอนนี้") && n(tip.sum) === n(tip.total) && tip.inside, JSON.stringify({ areasK, tip }));
      // ชี้ commit ที่ข้อความมีจุดกลาง (หาจากไฟล์ข้อมูล) กล่องต้องไม่มีจุดกลาง จุดกลางกลายเป็นจุลภาค
      const pts = JSON.parse(readFileSync(join(ROOT, "src/generated/lineStats.json"), "utf8")).points;
      const di = pts.findIndex((q) => q.s.includes("·")), N = pts.length + 1;
      await p.mouse.move(r.x + (di / (N - 1)) * r.width, r.y + 10); await p.waitForTimeout(150);
      const dotTip = await p.evaluate(() => document.querySelector("[data-lines-tip] .lst-tip-s")?.textContent ?? null);
      check(`${tag} ชื่องานในกล่องตัวเลขไม่มีจุดกลาง (commit ${pts[di]?.h} ที่ข้อความมีจุดกลาง)`, di >= 0 && !!dotTip && !dotTip.includes("·") && dotTip.includes(","), dotTip ?? "ไม่มีกล่อง");
      await p.mouse.move(0, 0);

      // จำตัวกรองข้ามการโหลดหน้าใหม่ แล้วคืนค่าตั้งต้น
      await p.goto(URL); await p.waitForTimeout(2200);
      await p.evaluate(() => [...document.querySelectorAll("[data-navbar] button")].find((x) => x.querySelector(".navtxt")?.textContent.trim() === "ตั้งค่า").click());
      await p.click("[data-setnav=lines]"); await p.waitForTimeout(300);
      const kept = await p.evaluate(() => ({ live: document.querySelector(".seg button.on")?.textContent, stack: [...document.querySelectorAll(".seg button.on")].map((b) => b.textContent).join() }));
      check(`${tag} จำตัวกรองกับแบบกราฟไว้ในเครื่องหลังโหลดหน้าใหม่`, kept.stack.includes("ใช้งานจริง") && kept.stack.includes("ชนิดบรรทัด"), JSON.stringify(kept));

      // โทนกลางคืน สีกลุ่มเป็นชุดพื้นมืด ตัวแปลงโทนไม่เปลี่ยนสี (data-keepcolor)
      if (W === 1280) {
        await open("night");
        const fills = await p.evaluate(() => [...document.querySelectorAll("[data-lines-area]")].map((a) => a.getAttribute("fill")));
        check(`${tag} โทนกลางคืน สีกลุ่มในกราฟเป็นชุดพื้นมืด ไม่ถูกตัวแปลงโทนเปลี่ยน`, JSON.stringify(fills) === JSON.stringify(DARK), fills.join(" "));
        await p.evaluate(() => window.__applyTone("quartz"));
      }
      await p.evaluate(() => { try { localStorage.removeItem("lines-filter"); } catch { /* */ } });
      await p.close();
    }
  } finally {
    await b.close();
    vite?.kill();
  }
}
