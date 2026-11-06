// คุมหน้าต่างโปรแกรมชั้นหนังที่กำลังรันอยู่ ผ่านพอร์ตดีบัก (debug port) ของ WebView2 (TECH-REVIEW ข้อ 18)
// ตัวต่อพอร์ตอยู่ที่ scripts/lib/cdp-client.mjs ใช้ร่วมกับตัวเทสหน้าจอ
//
// ใช้:
//   node scripts/cdp.mjs shot <ไฟล์.png> [ตัวเลือก CSS ของส่วนที่จะครอป]   ถ่ายภาพหน้าโปรแกรม (คมเท่าจอจริง)
//   node scripts/cdp.mjs eval "<โค้ด JS>"                                 รันโค้ดในหน้าโปรแกรม พิมพ์ผลกลับมา
//   node scripts/cdp.mjs click "<ตัวเลือก CSS>"                             กดปุ่มด้วยเมาส์จำลองที่กลางปุ่ม
//   node scripts/cdp.mjs hover "<ตัวเลือก CSS>"                             เลื่อนเมาส์ไปชี้
//   node scripts/cdp.mjs key "<ปุ่ม>"                                       กดแป้น เช่น Enter Escape Space
//   node scripts/cdp.mjs type "<ข้อความ>"                                   พิมพ์ข้อความลงช่องที่โฟกัสอยู่
import { connect } from "./lib/cdp-client.mjs";

const [cmd, ...args] = process.argv.slice(2);
let c;
try {
  c = await connect();
} catch (e) {
  console.error(e.message);
  process.exit(2);
}
try {
  if (cmd === "shot") {
    console.log(`บันทึกภาพ ${await c.shot(args[0], args[1])}`);
  } else if (cmd === "eval") {
    const v = await c.evaluate(args[0]);
    console.log(typeof v === "string" ? v : JSON.stringify(v, null, 2));
  } else if (cmd === "click") {
    await c.click(args[0]);
    console.log(`กด ${args[0]}`);
  } else if (cmd === "hover") {
    await c.hover(args[0]);
    console.log(`ชี้ ${args[0]}`);
  } else if (cmd === "key") {
    await c.key(args[0]);
    console.log(`กดแป้น ${args[0]}`);
  } else if (cmd === "type") {
    await c.type(args[0]);
    console.log(`พิมพ์ ${args[0]}`);
  } else {
    console.error("คำสั่งที่ใช้ได้ shot eval click hover key type");
    process.exitCode = 1;
  }
} catch (e) {
  console.error(`ผิดพลาด: ${e.message}`);
  process.exitCode = 1;
} finally {
  c.close();
}
