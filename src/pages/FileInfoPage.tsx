/* หน้าข้อมูลไฟล์ (สเปกข้อ 6 · ต้นแบบบรรทัด 606–722 · แผนขั้น 5) เปิดจากปุ่ม ข้อมูลไฟล์ ในแผงขวาของชั้นวาง
   ข้อความ MediaInfo ภาษาอังกฤษ ตัวอักษรความกว้างคงที่ สามคอลัมน์ ดูข้อมูลอย่างเดียว · ค่า hash 5 แบบ อ่านไฟล์รอบเดียว หยุดได้ เทียบค่าที่วาง บันทึก .sha256
   แยกแทร็กออกจากหนังย้ายไปหน้าเสียงและซับแล้ว ที่เดียวกับงานรวม (BUGS ข้อ 35 พี่กันเคาะ 10 พ.ย. 2569 "ปุ่มเเยก กับรวม เอาที่เดียวกันในหน้นี้เลย") */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { api, infoApi, inApp, pickSave, thumbUrl, type HashCompare, type Hashes, type MiSection, type Movie } from "../lib/api";
import { CardIcon, Keep, Phr, Skel } from "../components/ui";
import { useSettings } from "../lib/settings";
import ThaiInput from "../components/ThaiInput";
import { useToast } from "../components/Toasts";
import { fmtDateTime, fmtSize } from "../lib/format";
import { kb } from "../lib/popup";
import { IcCopy, IcPaste, IcClose } from "../components/icons";
import { IbBack, IbStop, IcRefresh, IcMix, IcFolder, IbSave, IbTick, IcSideHide, IcSideShow } from "../components/icons";
import { useElsewhere } from "../lib/elsewhere";
import { glideBox } from "../lib/glide";

const ALGOS: [string, string][] = [["md5", "MD5"], ["sha1", "SHA-1"], ["sha256", "SHA-256"], ["crc32", "CRC32"], ["sha512", "SHA-512"]];

/** คัดลอกไม่สำเร็จ ต้องบอก ไม่เงียบ · ที่เจอบ่อยคือหน้าต่างไม่ได้โฟกัส ระบบไม่ให้คัดลอก บอกเป็นภาษาไทยเต็มประโยค ไม่ตัดกลางคำ */
const copyFail = (e: unknown) => {
  const name = (e as { name?: string })?.name;
  return name === "NotAllowedError"
    ? "ระบบไม่ให้คัดลอกตอนหน้าต่างโปรแกรมไม่ได้โฟกัสอยู่ ให้คลิกที่หน้าต่างโปรแกรมแล้วกดคัดลอกอีกครั้ง"
    : `${(e as { message?: string })?.message ?? String(e)} ให้ลองกดคัดลอกอีกครั้ง`;
};

/** backLabel ปุ่มกลับ · มาจากชั้นวางเป็น กลับไปชั้นวาง · มาจากเมนู MediaInfo เป็น เลือกไฟล์อื่น (BUGS ข้อ 54)
    cover ปกที่ฝังในไฟล์ (เพลง MP4) ใช้เมื่อไม่มีปกจากคลัง เป็นรูปตามสัดส่วนจริง ไม่ตัดเป็นกรอบ 2:3 (BUGS ข้อ 54 ต่อ) */
export default function FileInfoPage({ m, onBack, onAv, backLabel = "กลับไปชั้นวาง", cover = null }: { m: Movie; onBack: () => void; onAv?: (path: string) => void; backLabel?: string; cover?: string | null }) {
  const pic = m.thumb ? { url: thumbUrl(m.thumb) ?? undefined, free: false } : cover ? { url: cover, free: true } : null;
  const toast = useToast();
  const [info, setInfo] = useState<{ text: string; sections: MiSection[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const dir = m.path.replace(/[\\/][^\\/]+$/, "");
  /* แผงสรุปด้านขวา (BUGS ข้อ 29 · พี่กันเลือก 12 พ.ย. 2569 จอเล็กแบบ 2.1 จอขยายแบบ 3.2 ย่อแผงแล้วเหลือรายชื่อหมวด เป็นแบบ 1.1 กับ 1.2)
     ข้อความแบ่งสองคอลัมน์เองเมื่อช่องข้อความกว้างพอ (container query ใน app.css) · จำว่าย่อหรือกางไว้ในเครื่อง */
  const [side, setSide] = useState(() => { try { return localStorage.getItem("mi-side") !== "off"; } catch { return true; } });
  const toggleSide = () => setSide((v) => { try { localStorage.setItem("mi-side", v ? "off" : "on"); } catch { /* เก็บไม่ได้ก็ใช้ค่าในหน้าไป */ } return !v; });
  const pageRef = useRef<HTMLDivElement>(null);
  const secRefs = useRef<(HTMLDivElement | null)[]>([]);
  /* แถบหัวหน้า (ชื่อไฟล์กับปุ่ม) ตรึงอยู่บนสุดตอนเลื่อน สูงไม่คงที่ตามความยาวชื่อไฟล์ · วัดจริงแล้วส่งให้แผงสรุปตรึงใต้แถบ
     ไม่ให้แถบบังรูปปก และสูงไม่เกินที่เหลือบนจอ · ตัวกระโดดไปหมวดก็หักความสูงนี้ หัวหมวดจะได้ไม่มุดใต้แถบ (BUGS ข้อ 29 พี่กันทัก 12 พ.ย. 2569) */
  const headH = () => pageRef.current?.querySelector<HTMLElement>(".wrapin > :first-child")?.offsetHeight ?? 0;
  useLayoutEffect(() => {
    const pg = pageRef.current, hd = pg?.querySelector<HTMLElement>(".wrapin > :first-child");
    if (!pg || !hd) return;
    const fit = () => {
      pg.style.setProperty("--mi-top", `${hd.offsetHeight + 12}px`);
      pg.style.setProperty("--mi-max", `${Math.max(200, pg.clientHeight - hd.offsetHeight - 24)}px`);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(hd); ro.observe(pg);
    return () => ro.disconnect();
  }, []);
  /* เส้นแบ่งแนวนอนระหว่างหมวด · หมวดที่ขึ้นต้นคอลัมน์ขวาซ่อนเส้น (ทำสีใส ความสูงเท่าเดิม แบ่งคอลัมน์ไม่ขยับ) ไม่ให้มีเส้นลอยบนสุดคอลัมน์
     พี่กันสั่ง 12 พ.ย. 2569 "ขอเส้นแบ่งให้เราที" "แบ่งแนวนอนด้วย" */
  const miRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const mi = miRef.current;
    if (!mi) return;
    const mark = () => {
      let prev = -1;
      for (const d of Array.from(mi.children) as HTMLElement[]) {
        const l = Math.round(d.getBoundingClientRect().left);
        if (prev >= 0 && l > prev + 20) d.setAttribute("data-colstart", ""); else d.removeAttribute("data-colstart");
        prev = l;
      }
    };
    mark();
    const ro = new ResizeObserver(mark);
    ro.observe(mi);
    return () => ro.disconnect();
  }, [info]);
  const goSec = (i: number) => {
    const sc = pageRef.current, el = secRefs.current[i];
    if (!sc || !el) return;
    /* ถึงแล้วหมวดนั้นสว่างวาบหนึ่งครั้ง ตาจะได้รู้ว่าหมวดที่กดอยู่ตรงไหน (พี่กันสั่ง 12 พ.ย. 2569 "กดไปแล้ว จุดนั้นจะสว่างวาบแวบนึงที") */
    const flash = () => {
      el.removeAttribute("data-flash");
      void el.offsetWidth;
      el.setAttribute("data-flash", "");
      el.addEventListener("animationend", () => el.removeAttribute("data-flash"), { once: true });
    };
    glideBox(sc, el.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop - headH() - 12, flash);
  };

  useEffect(() => {
    let live = true;
    infoApi.mediaInfo(m.path).then((r) => { if (live) setInfo(r); }).catch((e) => { if (live) setErr(String(e)); });
    return () => { live = false; };
  }, [m.path]);

  const copyAll = async () => {
    if (!info) return;
    // คัดลอกไม่สำเร็จต้องบอก ไม่เงียบ (Windows ไม่ให้คัดลอกถ้าหน้าต่างไม่ได้โฟกัสอยู่)
    try {
      await navigator.clipboard.writeText(info.text);
      toast({ kind: "ok", title: "คัดลอกข้อมูลไฟล์แล้ว", detail: "วางในแชทหรือโน้ตได้เลย และแถบนี้จะหายเองใน 3 วินาที" });
    } catch (e) {
      toast({ kind: "bad", title: "คัดลอกไม่สำเร็จ", detail: copyFail(e) });
    }
  };

  return (
    <div className="pagewrap" data-info-page ref={pageRef}>
      <div className="wrapin">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onBack}><IbBack size={15} />{backLabel}</button>
          {/* ไปหน้าเสียงและซับของเรื่องนี้ (ต้นแบบเสียงและซับ หน้าข้อมูลไฟล์มีปุ่มนี้ด้วย · ผู้ช่วยตรวจขั้น 10 ข้อ 25) */}
          {onAv && !m.missing && <button type="button" className="btn btn-ghost btn-sm" onClick={() => onAv(m.path)} data-info-av><IcMix size={15} />เสียงและซับ</button>}
          <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
            {pic ? <img className="mc" src={pic.url} alt="" style={pic.free ? { height: 51, width: "auto", maxWidth: 76, objectFit: "contain" } : { width: 34, height: 51 }} data-mi-headcover={pic.free ? "file" : "shelf"} /> : <div className="mc none" style={{ width: 34, height: 51 }} />}
            <div style={{ minWidth: 0 }}><div style={{ fontWeight: 700, fontSize: 17 }}><Phr tail={<span className="ext">.{m.ext}</span>}>{m.name}</Phr></div><div className="small" style={{ wordBreak: "break-all" }}>{dir}</div></div>
          </div>
          <button type="button" className={"btn btn-sm " + (info ? "btn-ghost" : "btn-wait")} aria-disabled={!info || undefined} title={info ? undefined : "รออ่านข้อมูลไฟล์ก่อน"} onClick={copyAll}><IcCopy size={14} />คัดลอกข้อมูลเป็นข้อความ</button>
        </div>

        {err ? <div className="stat bad"><CardIcon kind="bad" /><div><b>อ่านข้อมูลไฟล์ไม่ได้</b><Phr>{err}</Phr></div></div> : !info ? (
          <div className="mi" aria-busy="true">{Array.from({ length: 12 }, (_, i) => <Skel key={i} w={`${40 + ((i * 37) % 50)}%`} h={12} style={{ margin: "8px 0" }} />)}</div>
        ) : (
          <div className={"miwrap" + (side ? "" : " side-off")} data-mi-wrap={side ? "open" : "closed"}>
          <div className="micol">
          <div className="mi" data-mi ref={miRef}>
            {info.sections.map((s, i) => (
              <div key={i} ref={(el) => { secRefs.current[i] = el; }}>
                <div className="mih"><span>{s.title}</span></div>
                {s.rows.map(([k, v], j) => <div key={j} className="mir"><span>{k}</span><span>:</span><span>{v}</span></div>)}
              </div>
            ))}
          </div>
          </div>
          <MiSide cov={pic} sections={info.sections} open={side} onToggle={toggleSide} onGo={goSec} />
          </div>
        )}

        <HashCard m={m} />
        <Kinds />
      </div>
    </div>
  );
}

/** ค่า hash · ติ๊กได้หลายแบบ · อ่านไฟล์รอบเดียว · หยุดได้ · เทียบค่าที่วาง · บันทึก .sha256 */
function HashCard({ m }: { m: Movie }) {
  const toast = useToast();
  const [algos, setAlgos] = useState<string[]>(["md5", "sha256", "crc32"]);
  const [h, setH] = useState<Hashes | null>(null);
  const [at, setAt] = useState<number | null>(null);
  /** ค่า SHA-256 ที่จดไว้ในคลังตอนกดคำนวณ · ไม่ตรงกับที่คิดได้ = ไฟล์ถูกเปลี่ยนหรือเสีย ค่าเดิมไม่ถูกทับ (fileinfo.rs hash_file) */
  const [stored, setStored] = useState<string | null>(null);
  const [prog, setProg] = useState<{ done: number; total: number } | null>(null);
  const [paste, setPaste] = useState("");
  const [cmp, setCmp] = useState<HashCompare | null>(null);
  /** หน้านี้เป็นคนกดคำนวณเอง · ความคืบหน้าของงานที่เริ่มไว้ก่อนเปลี่ยนหน้าไปแสดงในการ์ดเหลืองแทน
      (เดิมรับมาแสดงเป็นงานของหน้านี้ พองานจบหน้านี้ไม่รู้ผล ค้างที่เปอร์เซ็นต์สุดท้าย เจอตอนตรวจภาพ) */
  const mine = useRef(false);
  const [other, setOther] = useState<{ done: number; total: number } | null>(null);
  useEffect(() => {
    if (!inApp) return;
    const off = listen<{ done: number; total: number }>("hash-progress", (e) => (mine.current ? setProg : setOther)(e.payload));
    return () => { off.then((f) => f()); };
  }, []);
  useEffect(() => {
    if (!h || !paste.trim()) { setCmp(null); return; }
    infoApi.compare(paste, h).then(setCmp).catch(() => setCmp(null));
  }, [paste, h]);
  const running = prog !== null && h === null;
  const elsewhere = useElsewhere(infoApi.hashRunning, running);
  // บันทึกไฟล์ .sha256 (BUGS ข้อ 30 พี่กันเคาะ "เปิดหน้าต่างเลือกที่บันทึก ตั้งค่าได้ว่าถามหรือบันทึกข้างไฟล์")
  // เดิมบันทึกข้างไฟล์หนังเงียบ ๆ มีแค่แถบแจ้งแวบเดียว คนกดไม่รู้ว่าเสร็จและอยู่ไหน กดซ้ำได้ไฟล์ (2) เนื้อเหมือนกัน
  // ปุ่มบอกสถานะ บรรทัดใต้ปุ่มบอกที่อยู่พร้อมปุ่มเปิดโฟลเดอร์ ค่าเดียวกันมีอยู่แล้วไม่สร้างซ้ำ ค่าไม่ตรงถามก่อนสร้างชื่อใหม่
  const { settings } = useSettings();
  const [saveSt, setSaveSt] = useState<"idle" | "saving" | "done">("idle");
  const [saved, setSaved] = useState<{ path: string; status: "saved" | "exists" | "conflict"; target: string | null } | null>(null);
  useEffect(() => { setSaveSt("idle"); setSaved(null); }, [h]);
  const saveHash = async (newName = false, again: string | null = null) => {
    if (!h?.sha256 || saveSt === "saving") return;
    let target = again;
    // ตัวตรวจส่งที่อยู่แทนการเปิดหน้าต่างเลือกที่บันทึก (หน้าต่างจะเด้งขึ้นจอ) ถือเป็นแบบถามที่บันทึก
    const dry = (window as unknown as { __hashSaveDry?: string }).__hashSaveDry;
    if (!newName && (dry || settings?.hashSaveAsk !== false)) {
      target = dry ?? (await pickSave(`${m.path}.sha256`, "sha256", "ไฟล์ค่า SHA-256"));
      if (!target) return;
    }
    setSaveSt("saving");
    try {
      const r = await infoApi.saveSha256(m.path, h.sha256, target, newName);
      setSaved({ ...r, target });
      setSaveSt(r.status === "conflict" ? "idle" : "done");
    } catch (e) {
      setSaveSt("idle");
      toast({ kind: "bad", title: "บันทึกไฟล์ .sha256 ไม่สำเร็จ", detail: String(e) });
    }
  };
  const reveal = (p: string) => api.revealMovie(p).catch((e) => toast({ kind: "bad", title: "เปิดโฟลเดอร์ไม่ได้", detail: String(e) }));
  const start = async () => {
    setH(null); setProg({ done: 0, total: m.size }); setStored(m.sha256 ?? null);
    mine.current = true;
    try {
      const r = await infoApi.hash(m.path, algos);
      setProg(null);
      if (r) { setH(r); setAt(Date.now() / 1000); }
    } catch (e) {
      setProg(null);
      toast({ kind: "bad", title: "คำนวณค่า hash ไม่สำเร็จ", detail: String(e) });
    } finally {
      mine.current = false;
    }
  };
  const rows = h ? ALGOS.filter(([k]) => (h as unknown as Record<string, string | null>)[k]) : [];
  const val = (k: string) => (h as unknown as Record<string, string | null>)[k] ?? "";
  /** ชนิดที่ติ๊กไว้แต่ยังไม่มีค่า (ติ๊กเพิ่มหลังคำนวณแล้ว) · ชื่อบนจอ */
  const missing = h ? ALGOS.filter(([k]) => algos.includes(k) && !val(k)).map(([, l]) => l) : [];
  const copy = async (t: string, what: string) => {
    try {
      await navigator.clipboard.writeText(t);
      toast({ kind: "ok", title: `คัดลอก${what}แล้ว`, detail: "แถบนี้หายเองใน 3 วินาที" });
    } catch (e) {
      toast({ kind: "bad", title: "คัดลอกไม่สำเร็จ", detail: copyFail(e) });
    }
  };
  // อ่านไฟล์รอบเดียวคิดทุกแบบพร้อมกัน · บอกชื่อตัวหลัก SHA-256 ถ้าติ๊กไว้ (ต้นแบบ)
  const firstAlgo = algos.includes("sha256") ? "SHA-256" : ALGOS.find(([k]) => algos.includes(k))?.[1] ?? "";
  return (
    <div className="card" style={{ background: "#fff" }} data-hash>
      <h3>ค่า hash ของ {m.name}.{m.ext}</h3>
      <div className="algs" style={{ marginBottom: 12 }}>
        {ALGOS.map(([k, l]) => {
          const on = algos.includes(k);
          return (
            <label key={k} {...kb(() => { if (!running) setAlgos((a) => (on ? a.filter((x) => x !== k) : a.concat(k))); })} role="checkbox" aria-checked={on}>
              <span className={"cbx " + (on ? "on" : "off")}>{on && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>}</span>{l}
            </label>
          );
        })}
      </div>
      {elsewhere && !running && (
        <div className="stat warn" style={{ marginBottom: 12 }} data-hash-elsewhere><CardIcon kind="warn" /><div><b>กำลังคิดค่า hash ที่เริ่มไว้ก่อนเปลี่ยนหน้า</b>
          {other && <div>อ่านไฟล์ไปแล้ว <span className="nw">{fmtSize(other.done)}</span> จาก <span className="nw">{fmtSize(other.total)}</span> หรือ {other.total ? Math.round((other.done / other.total) * 100) : 0}%</div>}
          <Phr>รอให้เสร็จก่อนคำนวณใหม่ หรือกดหยุด ส่วนค่า SHA-256 ที่ได้ยังจดลงคลังตามปกติ</Phr>
          <div className="minirow" style={{ marginTop: 6 }}><button type="button" className="btn btn-bad btn-sm" onClick={() => infoApi.hashCancel()}><IbStop size={15} />หยุดงานนั้น</button></div></div></div>
      )}
      {running ? (
        <div className="workbox">
          <div style={{ fontSize: 14 }}>{firstAlgo} อ่านไฟล์ไปแล้ว <span className="nw">{fmtSize(prog!.done)}</span> จาก <span className="nw">{fmtSize(prog!.total)}</span> หรือ {prog!.total ? Math.round((prog!.done / prog!.total) * 100) : 0}%</div>
          <div className="bar"><i style={{ width: `${prog!.total ? (prog!.done / prog!.total) * 100 : 0}%` }} /></div>
          <button type="button" className="btn btn-bad btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => infoApi.hashCancel()}><IbStop size={15} />หยุด</button>
        </div>
      ) : h ? (
        <>
          {rows.map(([k, l]) => (
            <div key={k} className="hrow"><span className="halg">{l}</span><code className="hval">{val(k)}</code>
              <button type="button" className="icon-btn" aria-label={`คัดลอกค่า ${l}`} title="คัดลอก" onClick={() => copy(val(k), `ค่า ${l}`)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 012-2h10" /></svg>
              </button></div>
          ))}
          <div className="small" style={{ marginTop: 8 }}>คำนวณเมื่อ <span className="nw">{at ? fmtDateTime(at) : ""}</span> ใช้เวลา <span className="nw">{Math.max(1, Math.round(h.seconds))} วินาที</span>{h.sha256 && (!stored || stored.toLowerCase() === h.sha256.toLowerCase()) ? " และค่า SHA-256 ถูกจำไว้ใช้ตอนตรวจแบบเร็วครั้งต่อไป" : ""}</div>
          {h.sha256 && stored && stored.toLowerCase() !== h.sha256.toLowerCase() && (
            <div className="stat warn" style={{ marginTop: 8 }} data-hashchanged><CardIcon kind="warn" /><div><b>ค่า SHA-256 ไม่ตรงกับที่จดไว้ตอนตรวจครั้งก่อน</b><Phr>ไฟล์อาจถูกเปลี่ยนหรือเสียระหว่างย้ายไดรฟ์ ค่าที่จดไว้ไม่ถูกเปลี่ยน แต่ชั้นวางจะขึ้นว่าไฟล์ถูกเปลี่ยน ควรตรวจละเอียด</Phr></div></div>
          )}
          <div className="minirow">
            {/* ติ๊กชนิดที่ยังไม่มีค่าเพิ่ม ปุ่มเป็นปุ่มหลักสีเข้มแบบตอนยังไม่เคยคำนวณ บอกว่าต้องกด (BUGS ข้อ 84 · พี่กันสั่ง 13 พ.ย. 2569 "ตอนเราติ๊กเพิ่ม อยากให้ปุ่ม คำนวณใหม่มันกลายเป้นสีเข้ม") */}
            <button type="button" className={"btn btn-sm " + (missing.length && !elsewhere ? "btn-main" : "btn-ghost")} onClick={start} data-hash-redo={missing.length ? "need" : "done"}
              title={missing.length ? `ติ๊ก ${missing.join(" ")} ไว้แต่ยังไม่ได้คำนวณ กดเพื่อคำนวณ` : undefined}><IcRefresh size={15} />คำนวณใหม่</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => copy(rows.map(([k, l]) => `${l}: ${val(k)}`).join("\n"), "ค่า hash ทั้งหมด")}><IcCopy size={14} />คัดลอกทั้งหมด</button>
            <button type="button" className={"btn btn-sm " + (h.sha256 && saveSt !== "saving" ? "btn-ghost" : "btn-wait")} aria-disabled={!h.sha256 || saveSt === "saving" || undefined}
              title={!h.sha256 ? "ติ๊ก SHA-256 แล้วคำนวณใหม่ก่อน" : saveSt === "saving" ? "กำลังบันทึก รอสักครู่" : settings?.hashSaveAsk !== false ? "เลือกที่บันทึก ตั้งให้บันทึกข้างไฟล์หนังทันทีได้ในหน้าตั้งค่า" : "บันทึกข้างไฟล์หนัง ตั้งให้ถามที่บันทึกได้ในหน้าตั้งค่า"}
              onClick={() => saveHash()} data-hash-save>
              <Keep icon={saveSt === "done" ? <IbTick size={15} /> : <IbSave size={15} />} all={["บันทึกเป็นไฟล์ .sha256", "กำลังบันทึก…", "บันทึกแล้ว"]}>{saveSt === "saving" ? "กำลังบันทึก…" : saveSt === "done" ? "บันทึกแล้ว" : "บันทึกเป็นไฟล์ .sha256"}</Keep></button>
          </div>
          {saved && saved.status !== "conflict" && (
            <div className="small hashsaved" style={{ marginTop: 8 }} data-hash-saved={saved.status}>
              <span className="hs-path">{saved.status === "exists" ? "มีไฟล์ .sha256 ที่ค่าตรงกันอยู่แล้วที่ " : "บันทึกไว้ที่ "}<b>{saved.path}</b>{saved.status === "exists" ? " จึงไม่ได้สร้างไฟล์ซ้ำ" : ""}</span>
              <button type="button" className="btn btn-ghost btn-xs" onClick={() => reveal(saved.path)} data-hash-reveal><IcFolder size={14} />เปิดโฟลเดอร์</button>
            </div>
          )}
          {saved?.status === "conflict" && (
            <div className="stat warn" style={{ marginTop: 8 }} data-hash-conflict><CardIcon kind="warn" /><div><b>มีไฟล์ชื่อนี้อยู่แล้ว แต่ค่าในไฟล์ไม่ตรงกับที่คำนวณได้</b>
              {/* เนื้อความย่อหน้าเดียว ที่อยู่ไฟล์อยู่ในประโยค ไม่แยกบรรทัด (กฎแบ่งบรรทัด CLAUDE.md) */}
              <div>ไฟล์เดิม <span className="hs-file">{saved.path}</span> <Phr>{"ไม่ถูกเขียนทับ  จะบันทึกเป็นชื่อใหม่ต่อท้ายด้วย (2) ก็ได้"}</Phr></div>
              <div className="minirow" style={{ marginTop: 6 }}>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => saveHash(true, saved.target)} data-hash-newname><IbSave size={15} />บันทึกเป็นชื่อใหม่</button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => reveal(saved.path)}><IcFolder size={14} />เปิดโฟลเดอร์</button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSaved(null)}>ยกเลิก</button>
              </div></div></div>
          )}
          <div style={{ marginTop: 12 }}>
            {/* ปุ่มวางจากคลิปบอร์ดในช่อง กดแล้วเทียบทันที · มีข้อความแล้วมีปุ่มล้าง (BUGS ข้อ 31) */}
            <ThaiInput value={paste} onChange={setPaste} label="วางค่า hash ที่ได้มาจากเว็บต้นทาง" err={!!cmp && !cmp.same} placeholder="วางค่า MD5 SHA-1 SHA-256 CRC32 หรือ SHA-512"
              actions={<>
                {paste && <button type="button" className="clr" aria-label="ล้างค่าที่วาง" title="ล้างค่าที่วาง" onClick={() => setPaste("")} data-hash-clear><IcClose size={14} /></button>}
                <button type="button" className="clr" aria-label="วางจากคลิปบอร์ด" title="วางจากคลิปบอร์ด" data-hash-paste
                  onClick={async () => { try { const t = (await infoApi.clipboardText()).trim(); if (t) setPaste(t); else toast({ kind: "warn", title: "คลิปบอร์ดไม่มีข้อความ", detail: "คัดลอกค่า hash จากเว็บต้นทางก่อน แล้วกดวางอีกครั้ง" }); } catch (e) { toast({ kind: "bad", title: "วางไม่ได้", detail: String(e) }); } }}><IcPaste size={16} /></button>
              </>} />
            {!paste && <div className="hint">วางค่า hash ที่เว็บต้นทางให้มา เพื่อเทียบว่าไฟล์ครบและตรงกับต้นฉบับทุกไบต์</div>}
            {cmp && (cmp.same
              ? <div className="stat ok" style={{ marginTop: 8 }}><CardIcon kind="done" /><div><b>ตรงกับ {cmp.algo} ของไฟล์นี้</b>ไฟล์ครบและเหมือนต้นฉบับทุกไบต์</div></div>
              : cmp.algo && cmp.diff
                ? <div className="stat bad" style={{ marginTop: 8 }}><CardIcon kind="bad" /><div><b>ไม่ตรงกับ {cmp.algo} ของไฟล์นี้</b><Phr>{`ค่าที่วาง${cmp.diff}  ไฟล์อาจโหลดมาไม่ครบหรือถูกแก้ไข`}</Phr></div></div>
                : <div className="hint e">{cmp.algo ? `ยังไม่ได้คำนวณ ${cmp.algo} ติ๊กแล้วกดคำนวณใหม่` : "ค่าที่วางไม่ใช่ค่า hash แบบที่รู้จัก"}</div>)}
          </div>
        </>
      ) : (
        <button type="button" className={"btn btn-sm " + (algos.length && !elsewhere ? "btn-main" : "btn-wait")} aria-disabled={!algos.length || elsewhere || undefined}
          title={elsewhere ? "รองานที่เริ่มไว้ก่อนเปลี่ยนหน้าเสร็จก่อน" : algos.length ? undefined : "ติ๊กอย่างน้อย 1 แบบก่อน"} onClick={() => { if (algos.length && !elsewhere) start(); }} data-hash-start><IcRefresh size={15} />คำนวณ</button>
      )}
    </div>
  );
}

/** แผงสรุปด้านขวาของหน้า MediaInfo (BUGS ข้อ 29 · มอคอัป docs/mockups/batch9-pick.html แบบ 2 และ 3)
    กางอยู่ มีปก ค่าหลักจากข้อความ MediaInfo และรายชื่อหมวด · ย่อแล้วเหลือรายชื่อหมวดไว้กดกระโดด · ช่องที่ไม่มีค่าขึ้นขีด */
function MiSide({ cov, sections, open, onToggle, onGo }: { cov: { url: string | undefined; free: boolean } | null; sections: MiSection[]; open: boolean; onToggle: () => void; onGo: (i: number) => void }) {
  const find = (k: string) => sections.find((s) => s.kind === k);
  const val = (s: MiSection | undefined, key: string) => s?.rows.find((r) => r[0] === key)?.[1] ?? "";
  const g = find("general"), v = find("video");
  const px = (x: string) => x.replace(/ pixels?$/, "");
  const pic = v ? [val(v, "Width") && val(v, "Height") ? `${px(val(v, "Width"))} × ${px(val(v, "Height"))}` : "", val(v, "Format")].filter(Boolean).join(" ") : "";
  const audio = sections.filter((s) => s.kind === "audio").map((a) => [val(a, "Format"), val(a, "Channel(s)").replace(/ channels?$/, " ch")].filter(Boolean).join(" ")).join(", ");
  const subs = sections.filter((s) => s.kind === "text").map((t) => val(t, "Format")).filter(Boolean).join(", ");
  const rows: [string, string][] = [["ความยาว", val(g, "Duration")], ["ขนาดไฟล์", val(g, "File size")], ["ชนิดไฟล์", val(g, "Format")], ["ภาพ", pic], ["เสียง", audio], ["ซับ", subs]];
  const tip = open ? "ย่อแผงสรุป ให้เหลือรายชื่อหมวด" : "กางแผงสรุป";
  return (
    <aside className={"miside" + (open ? "" : " off")} data-mi-side={open ? "open" : "closed"}>
      <div className="mis-head">
        <b>{open ? "สรุป" : "หมวด"}</b>
        <button type="button" className="icon-btn" aria-label={tip} title={tip} onClick={onToggle} data-mi-side-toggle>{open ? <IcSideHide /> : <IcSideShow />}</button>
      </div>
      {open && (<>
        {cov ? <img className={"mis-cover" + (cov.free ? " free" : "")} src={cov.url} alt="" data-mi-sidecover={cov.free ? "file" : "shelf"} /> : <div className="mc none mis-cover" />}
        <div className="mis-rows">{rows.map(([k, x]) => <div key={k} className="mis-row"><span>{k}</span><b>{x || "—"}</b></div>)}</div>
        <div className="mis-sub">ไปที่หมวด</div>
      </>)}
      <div className="mis-links">{sections.map((s, i) => <button key={i} type="button" className="mis-link" onClick={() => onGo(i)} data-mi-go={i}>{s.title}</button>)}</div>
    </aside>
  );
}

/** ชื่อชนิดที่เจอบ่อย หมายถึงอะไร (ต้นแบบบรรทัด 670–692) */
const KINDS: [string, [string, string][]][] = [
  ["ภาพ", [["H.264 (AVC)", "ชนิดที่ใช้มากที่สุด เปิดได้แทบทุกเครื่อง"], ["H.265 (HEVC)", "ไฟล์เล็กกว่า H.264 ที่ความคมเท่ากัน เครื่องเก่าบางเครื่องเปิดไม่ได้"], ["AV1", "ชนิดใหม่ ไฟล์เล็กมาก ต้องใช้เครื่องหรือโปรแกรมรุ่นใหม่"], ["HDR", "ภาพสว่างและสีกว้างกว่าปกติ ต้องใช้จอที่รองรับ"]]],
  ["เสียง", [["AAC", "ใช้ทั่วไป ไฟล์เล็ก เปิดได้ทุกเครื่อง"], ["AC-3 และ E-AC-3", "Dolby Digital ใช้กับลำโพงรอบทิศทาง 5.1 ch"], ["DTS และ TrueHD", "เสียงคุณภาพสูงจากแผ่นบลูเรย์ ไฟล์ใหญ่"], ["FLAC และ Opus", "FLAC เสียงไม่ลดคุณภาพ ส่วน Opus ไฟล์เล็กมาก"]]],
  ["ซับไตเติล", [["SRT", "ตัวหนังสือธรรมดา แก้ไขได้ด้วย Notepad"], ["ASS", "แต่งสี ฟอนต์ และตำแหน่งได้ ใช้กับการ์ตูนบ่อย"], ["PGS และ VobSub", "ซับแบบภาพจากแผ่นบลูเรย์และดีวีดี แก้คำไม่ได้"]]],
];
function Kinds() {
  return (
    <div className="card" data-kinds>
      <h3>ชื่อชนิดที่เจอบ่อย หมายถึงอะไร</h3>
      <div className="three">
        {KINDS.map(([cap, rows]) => (
          <div key={cap}>
            <div className="small" style={{ color: "var(--accent-ink)", fontWeight: 600, marginBottom: 6 }}>{cap}</div>
            {/* กริดแทนตาราง · ช่องตารางแคบ ตัวตัดคำตัดกลางคำ (เท่า|กัน · บ|ลูเรย์) · ในกริดวลีขึ้นบรรทัดใหม่ตรงเว้นวรรคได้ */}
            <div className="kinds">{rows.map(([k, v]) => <div key={k} className="kindrow"><b>{k}</b><div><Phr>{v}</Phr></div></div>)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
