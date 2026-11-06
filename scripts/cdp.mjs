// คุมหน้าต่างโปรแกรมชั้นหนังที่กำลังรันอยู่ ผ่านพอร์ตดีบัก (debug port) ของ WebView2 (TECH-REVIEW ข้อ 18)
// พอร์ตดีบัก = ทางที่โปรแกรมเปิดไว้ในเครื่องตัวเอง ให้สคริปต์ต่อเข้าไปสั่งถ่ายภาพ กด พิมพ์ (สกิล testing-proof ข้อ 11.6)
// โปรแกรมต้องเปิดด้วยตัวแปร WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222
// (scripts/dev-app.ps1 ตั้งให้แล้ว)
//
// ใช้:
//   node scripts/cdp.mjs shot <ไฟล์.png> [ตัวเลือก CSS ของส่วนที่จะครอป]   ถ่ายภาพหน้าโปรแกรม (คมเท่าจอจริง)
//   node scripts/cdp.mjs eval "<โค้ด JS>"                                 รันโค้ดในหน้าโปรแกรม พิมพ์ผลกลับมา
//   node scripts/cdp.mjs click "<ตัวเลือก CSS>"                             กดปุ่มด้วยเมาส์จำลองที่กลางปุ่ม
//   node scripts/cdp.mjs hover "<ตัวเลือก CSS>"                             เลื่อนเมาส์ไปชี้
//   node scripts/cdp.mjs key "<ปุ่ม>"                                       กดแป้น เช่น Enter Escape
//   node scripts/cdp.mjs type "<ข้อความ>"                                   พิมพ์ข้อความลงช่องที่โฟกัสอยู่
import { writeFileSync } from "node:fs";

const PORT = process.env.CDP_PORT ?? "9222";

async function connect() {
  let list;
  try {
    list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
  } catch {
    console.error(`ต่อพอร์ตดีบัก ${PORT} ไม่ได้ · เปิดโปรแกรมด้วย scripts/dev-app.ps1 ก่อน`);
    process.exit(2);
  }
  // เลือกเฉพาะหน้าของชั้นหนัง ห้ามหยิบหน้าแรกที่เจอ พอร์ต 9222 อาจเป็นของโปรแกรมอื่น (ผลตรวจขั้น 0 โค้ดข้อ 7)
  const ours = (t) => t.type === "page" && (t.title === "ชั้นหนัง" ||
    /^http:\/\/(localhost:1420|tauri\.localhost)\//.test(t.url));
  const page = list.find(ours);
  if (!page) {
    console.error(`ไม่เจอหน้าต่างชั้นหนังในพอร์ต ${PORT} · เจอ: ${list.map((t) => `${t.title} (${t.url})`).join(" · ") || "ไม่มีหน้าไหนเลย"}`);
    process.exit(2);
  }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((ok, bad) => { ws.onopen = ok; ws.onerror = bad; });
  let id = 0;
  const waiting = new Map();
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && waiting.has(msg.id)) {
      const { ok, bad } = waiting.get(msg.id);
      waiting.delete(msg.id);
      msg.error ? bad(new Error(msg.error.message)) : ok(msg.result);
    }
  };
  const send = (method, params = {}) => new Promise((ok, bad) => {
    const n = ++id;
    waiting.set(n, { ok, bad });
    ws.send(JSON.stringify({ id: n, method, params }));
  });
  return { send, close: () => ws.close() };
}

async function evaluate(send, expression) {
  const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result.value;
}

async function centerOf(send, selector) {
  const box = await evaluate(send, `(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return null;
    el.scrollIntoView({ block: "nearest", inline: "nearest" });
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, left: r.left, top: r.top };
  })()`);
  if (!box) throw new Error(`ไม่เจอ ${selector}`);
  return box;
}

const [cmd, ...args] = process.argv.slice(2);
const { send, close } = await connect();
try {
  if (cmd === "shot") {
    const [out, selector] = args;
    await evaluate(send, "document.fonts.ready.then(() => true)");
    const params = { format: "png", captureBeyondViewport: false };
    if (selector) {
      const b = await centerOf(send, selector);
      const pad = 8;
      params.clip = { x: Math.max(0, b.left - pad), y: Math.max(0, b.top - pad), width: b.w + pad * 2, height: b.h + pad * 2, scale: 1 };
    }
    const r = await send("Page.captureScreenshot", params);
    writeFileSync(out, Buffer.from(r.data, "base64"));
    console.log(`บันทึกภาพ ${out}`);
  } else if (cmd === "eval") {
    const v = await evaluate(send, args[0]);
    console.log(typeof v === "string" ? v : JSON.stringify(v, null, 2));
  } else if (cmd === "click" || cmd === "hover") {
    const b = await centerOf(send, args[0]);
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: b.x, y: b.y });
    if (cmd === "click") {
      await send("Input.dispatchMouseEvent", { type: "mousePressed", x: b.x, y: b.y, button: "left", clickCount: 1 });
      await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: b.x, y: b.y, button: "left", clickCount: 1 });
    }
    console.log(`${cmd === "click" ? "กด" : "ชี้"} ${args[0]}`);
  } else if (cmd === "key") {
    // Enter กับ Space ต้องส่งตัวอักษรไปด้วย ไม่งั้นเกิดแค่ keydown ปุ่มที่โฟกัสอยู่ไม่ถูกกด (ผลตรวจขั้น 0 โค้ดข้อ 8)
    const keys = {
      Enter: { code: "Enter", vk: 13, text: "\r" }, Space: { key: " ", code: "Space", vk: 32, text: " " },
      Escape: { code: "Escape", vk: 27 }, Tab: { code: "Tab", vk: 9 }, Backspace: { code: "Backspace", vk: 8 },
      Delete: { code: "Delete", vk: 46 }, Home: { code: "Home", vk: 36 }, End: { code: "End", vk: 35 },
      ArrowDown: { code: "ArrowDown", vk: 40 }, ArrowUp: { code: "ArrowUp", vk: 38 },
      ArrowLeft: { code: "ArrowLeft", vk: 37 }, ArrowRight: { code: "ArrowRight", vk: 39 },
      F2: { code: "F2", vk: 113 },
    };
    const name = args[0];
    const k = keys[name] ?? { code: name, vk: 0 };
    const key = k.key ?? name;
    await send("Input.dispatchKeyEvent", { type: k.text ? "keyDown" : "rawKeyDown", key, code: k.code, windowsVirtualKeyCode: k.vk, ...(k.text ? { text: k.text, unmodifiedText: k.text } : {}) });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key, code: k.code, windowsVirtualKeyCode: k.vk });
    console.log(`กดแป้น ${name}`);
  } else if (cmd === "type") {
    await send("Input.insertText", { text: args[0] });
    console.log(`พิมพ์ ${args[0]}`);
  } else {
    console.error("คำสั่งที่ใช้ได้ shot eval click hover key type");
    process.exitCode = 1;
  }
} catch (e) {
  console.error(`ผิดพลาด: ${e.message}`);
  process.exitCode = 1;
} finally {
  close();
}
