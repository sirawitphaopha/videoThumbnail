// รอให้หน้าต่างโปรแกรมแบบทดสอบพร้อม (หลังเปิดหรือหลังสร้างใหม่) · เรียกคำสั่งที่ระบุได้แปลว่าพร้อม
// ใช้: node scripts/wait-app.mjs [คำสั่ง] [วินาที]
import { connect, sleep } from "./lib/cdp-client.mjs";
const cmd = process.argv[2] ?? "running_jobs";
const limit = Number(process.argv[3] ?? 240) * 1000;
const t0 = Date.now();
while (Date.now() - t0 < limit) {
  try {
    const c = await connect();
    const r = await c.evaluate(`window.__TAURI_INTERNALS__.invoke(${JSON.stringify(cmd)}).then(v => 'ok ' + JSON.stringify(v), e => 'err ' + e)`);
    await c.close?.();
    if (String(r).startsWith("ok")) { console.log(`พร้อมแล้ว ${Math.round((Date.now() - t0) / 1000)} วินาที · ${cmd} ตอบ ${r}`); process.exit(0); }
  } catch { /* ยังไม่พร้อม */ }
  await sleep(2000);
}
console.log("รอเกินเวลา โปรแกรมยังไม่พร้อม");
process.exit(1);
