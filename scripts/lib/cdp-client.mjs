// ตัวกลางต่อพอร์ตดีบัก (debug port) ของหน้าต่างชั้นหนัง · ใช้ร่วมกันโดย scripts/cdp.mjs และตัวเทสหน้าจอทุกตัว
// พอร์ตดีบัก = ทางที่โปรแกรมเปิดไว้ในเครื่องตัวเอง ให้สคริปต์ต่อเข้าไปสั่งถ่ายภาพ กด พิมพ์ (สกิล testing-proof ข้อ 11.6)
// โปรแกรมต้องเปิดผ่าน scripts/dev-app.ps1 (ตั้ง WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222)
import { writeFileSync } from "node:fs";
/** เขียนภาพ ลองซ้ำเมื่อไฟล์ถูกโปรแกรมอื่นเปิดค้างชั่วครู่ (เจอ UNKNOWN -4094 กับภาพรายงานที่ git ติดตาม 11 พ.ย. 2569) */
const saveShot = (out, buf) => {
  for (let i = 0; ; i++) {
    try { writeFileSync(out, buf); return; } catch (e) {
      if (i >= 8 || !["UNKNOWN", "EBUSY", "EPERM"].includes(e.code)) throw e;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 400);
    }
  }
};

export const PORT = process.env.CDP_PORT ?? "9222";
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function connect() {
  let list;
  try {
    list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
  } catch {
    throw new Error(`ต่อพอร์ตดีบัก ${PORT} ไม่ได้ · เปิดโปรแกรมด้วย scripts/dev-app.ps1 ก่อน`);
  }
  // เลือกเฉพาะหน้าของชั้นหนัง ห้ามหยิบหน้าแรกที่เจอ พอร์ต 9222 อาจเป็นของโปรแกรมอื่น (ผลตรวจขั้น 0 โค้ดข้อ 7)
  const ours = (t) => t.type === "page" && (t.title === "ชั้นหนัง" ||
    /^http:\/\/(localhost:1420|tauri\.localhost)\//.test(t.url));
  const page = list.find(ours);
  if (!page) throw new Error(`ไม่เจอหน้าต่างชั้นหนังในพอร์ต ${PORT} · เจอ: ${list.map((t) => `${t.title} (${t.url})`).join(" · ") || "ไม่มีหน้าไหนเลย"}`);
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

  const evaluate = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  };

  const box = async (selector) => {
    const b = await evaluate(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return null;
      el.scrollIntoView({ block: "nearest", inline: "nearest" });
      // ปุ่มที่อยู่ใต้แถบตรึงกดไม่โดน เลื่อนมากลางกล่องก่อน เหมือนคนใช้จริง
      const c0 = el.getBoundingClientRect(), hit = document.elementFromPoint(c0.left + c0.width / 2, c0.top + c0.height / 2);
      if (hit && !(el === hit || el.contains(hit) || hit.contains(el))) el.scrollIntoView({ block: "center", inline: "nearest" });
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    })()`);
    if (!b) throw new Error(`ไม่เจอ ${selector}`);
    return b;
  };

  const move = (x, y) => send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  const hover = async (selector) => { const b = await box(selector); await move(b.x, b.y); return b; };
  const click = async (selector) => {
    const b = await hover(selector);
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x: b.x, y: b.y, button: "left", clickCount: 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: b.x, y: b.y, button: "left", clickCount: 1 });
    return b;
  };

  /** ลากเมาส์จริงจาก (x0, y0) ไป (x1, y1) ทีละ steps ขั้น · button left right middle · modifiers Alt 1 Ctrl 2 Shift 8 (หน้าแก้ซับ ขั้น 5) */
  const drag = async (x0, y0, x1, y1, { button = "left", modifiers = 0, steps = 8 } = {}) => {
    const buttons = button === "left" ? 1 : button === "right" ? 2 : 4;
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: x0, y: y0, modifiers });
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x: x0, y: y0, button, buttons, clickCount: 1, modifiers });
    for (let i = 1; i <= steps; i++) {
      await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: x0 + ((x1 - x0) * i) / steps, y: y0 + ((y1 - y0) * i) / steps, button, buttons, modifiers });
    }
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: x1, y: y1, button, buttons: 0, clickCount: 1, modifiers });
  };

  /** เลือกเรื่องบนชั้นวาง กดปกที่เลือกอยู่แล้วแผงจะปิด จึงกดเฉพาะตอนยังไม่ได้เลือก */
  const book = async (name) => {
    const sel = `.book[data-movie="${name}"]`;
    if (await evaluate(`!!document.querySelector(${JSON.stringify(sel + ".sel")}) && !!document.querySelector('[data-detail]')`)) return;
    return click(sel);
  };
  /** หน้าตั้งค่าแบ่งเป็นหัวข้อ หัวข้ออื่นซ่อนอยู่ กดไม่ได้จนกว่าจะเลือกหัวข้อนั้น */
  const setNav = async (id) => { await click(`[data-setnav="${id}"]`); await sleep(150); };

  // Enter กับ Space ต้องส่งตัวอักษรไปด้วย ไม่งั้นเกิดแค่ keydown ปุ่มที่โฟกัสอยู่ไม่ถูกกด (ผลตรวจขั้น 0 โค้ดข้อ 8)
  const KEYS = {
    Enter: { code: "Enter", vk: 13, text: "\r" }, Space: { key: " ", code: "Space", vk: 32, text: " " },
    Escape: { code: "Escape", vk: 27 }, Tab: { code: "Tab", vk: 9 }, Backspace: { code: "Backspace", vk: 8 },
    Delete: { code: "Delete", vk: 46 }, Home: { code: "Home", vk: 36 }, End: { code: "End", vk: 35 },
    ArrowDown: { code: "ArrowDown", vk: 40 }, ArrowUp: { code: "ArrowUp", vk: 38 },
    ArrowLeft: { code: "ArrowLeft", vk: 37 }, ArrowRight: { code: "ArrowRight", vk: 39 },
    F2: { code: "F2", vk: 113 },
  };
  const key = async (name) => {
    const k = KEYS[name] ?? { code: name, vk: 0 };
    const kk = k.key ?? name;
    await send("Input.dispatchKeyEvent", { type: k.text ? "keyDown" : "rawKeyDown", key: kk, code: k.code, windowsVirtualKeyCode: k.vk, ...(k.text ? { text: k.text, unmodifiedText: k.text } : {}) });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: kk, code: k.code, windowsVirtualKeyCode: k.vk });
  };
  const type = (text) => send("Input.insertText", { text });

  /** ถ่ายภาพหน้าโปรแกรม คมเท่าจอจริง · ส่งตัวเลือก CSS = ครอปเฉพาะชิ้นนั้นพร้อมขอบ pad */
  const shot = async (out, selector, pad = 8) => {
    await evaluate("document.fonts.ready.then(() => true)");
    const params = { format: "png", captureBeyondViewport: false };
    if (selector) {
      const b = await box(selector);
      params.clip = { x: Math.max(0, b.left - pad), y: Math.max(0, b.top - pad), width: b.w + pad * 2, height: b.h + pad * 2, scale: 1 };
    }
    const r = await send("Page.captureScreenshot", params);
    saveShot(out, Buffer.from(r.data, "base64"));
    return out;
  };
  /** ถ่ายภาพตามพิกัด */
  const shotRect = async (out, x, y, width, height) => {
    await evaluate("document.fonts.ready.then(() => true)");
    const r = await send("Page.captureScreenshot", { format: "png", clip: { x, y, width, height, scale: 1 } });
    saveShot(out, Buffer.from(r.data, "base64"));
    return out;
  };

  return { send, evaluate, box, move, hover, click, drag, book, setNav, key, type, shot, shotRect, close: () => ws.close() };
}
