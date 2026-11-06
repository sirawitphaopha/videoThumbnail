/* หน้าข้อมูลไฟล์ (สเปกข้อ 6 · ต้นแบบบรรทัด 606–722 · แผนขั้น 5) เปิดจากปุ่ม ข้อมูลไฟล์ ในแผงขวาของชั้นวาง
   ข้อความ MediaInfo ภาษาอังกฤษ ตัวอักษรความกว้างคงที่ สามคอลัมน์ · ติ๊กหัวข้อไหน = แยกส่วนนั้นเป็นไฟล์ · ไฟล์หนังเดิมไม่ถูกแตะ
   แถบแยกไฟล์ (ทีละชิ้น หยุดได้ ชื่อชนถามก่อน ไม่เขียนทับ) · ค่า hash 5 แบบ อ่านไฟล์รอบเดียว หยุดได้ เทียบค่าที่วาง บันทึก .sha256 */
import { useEffect, useMemo, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { api, infoApi, inApp, pickFolder, thumbUrl, type ExtractItem, type ExtractResult, type HashCompare, type Hashes, type MiSection, type Movie } from "../lib/api";
import { CardIcon, Phr, Skel } from "../components/ui";
import ThaiInput from "../components/ThaiInput";
import { useToast } from "../components/Toasts";
import { fmtDateTime, fmtSize } from "../lib/format";
import { kb } from "../lib/popup";

const ALGOS: [string, string][] = [["md5", "MD5"], ["sha1", "SHA-1"], ["sha256", "SHA-256"], ["crc32", "CRC32"], ["sha512", "SHA-512"]];

export default function FileInfoPage({ m, onBack }: { m: Movie; onBack: () => void }) {
  const toast = useToast();
  const [info, setInfo] = useState<{ text: string; sections: MiSection[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [picked, setPicked] = useState<number[]>([]);
  const [folder, setFolder] = useState<string>("");
  const [xRun, setXRun] = useState<{ items: ExtractItem[]; labels: string[]; pct: number[]; result: ExtractResult | null; running: boolean } | null>(null);
  const dir = m.path.replace(/[\\/][^\\/]+$/, "");

  useEffect(() => {
    let live = true;
    infoApi.mediaInfo(m.path).then((r) => { if (live) setInfo(r); }).catch((e) => { if (live) setErr(String(e)); });
    infoApi.defaultFolder(m.path).then((f) => { if (live) setFolder(f); }).catch(() => {});
    return () => { live = false; };
  }, [m.path]);

  // นับลำดับในชนิดเดียวกัน (Audio #2 = แทร็กเสียงที่ 2)
  const items = useMemo(() => {
    const seen: Record<string, number> = {};
    return (info?.sections ?? []).map((s) => {
      seen[s.kind] = (seen[s.kind] ?? 0) + 1;
      return { s, nth: seen[s.kind], item: s.ext ? { kind: s.kind, nth: seen[s.kind], ext: s.ext, lang: s.lang, name: s.kind === "attachment" ? s.rows.find((r) => r[0] === "File name")?.[1] ?? null : null } as ExtractItem : null };
    });
  }, [info]);
  const label = (i: number) => items[i].s.kind === "attachment" ? (items[i].item?.name ?? items[i].s.title) : items[i].s.title;
  /** แถวกำลังแยก แบบต้นแบบ Audio #1 .ac3 */
  const rowLabel = (i: number) => items[i].s.kind === "attachment" ? label(i) : `${items[i].s.title} .${items[i].item?.ext ?? ""}`;

  useEffect(() => {
    if (!inApp) return;
    const off = listen<{ index: number; percent: number }>("extract-progress", (e) => setXRun((r) => r ? { ...r, pct: r.pct.map((p, i) => i === e.payload.index ? e.payload.percent : p) } : r));
    return () => { off.then((f) => f()); };
  }, []);

  const runExtract = async (sel: number[], policy: string[]) => {
    const its = sel.map((i) => items[i].item!);
    setXRun({ items: its, labels: sel.map(rowLabel), pct: its.map(() => 0), result: null, running: true });
    try {
      const result = await infoApi.extract(m.path, folder || null, its, policy);
      setXRun((r) => r && { ...r, result, running: false });
    } catch (e) {
      setXRun((r) => r && { ...r, running: false, result: { folder, states: its.map(() => "failed"), files: its.map(() => null), error: String(e) } });
    }
  };
  const conflicts = xRun?.result ? xRun.result.states.map((s, i) => (s === "conflict" ? i : -1)).filter((i) => i >= 0) : [];
  const resolve = (how: "skip" | "number") => {
    if (!xRun) return;
    const sel = conflicts.map((i) => picked[i]);
    runExtract(sel, sel.map(() => how));
  };

  const copyAll = async () => {
    if (!info) return;
    await navigator.clipboard.writeText(info.text);
    toast({ kind: "ok", title: "คัดลอกข้อมูลไฟล์แล้ว", detail: "วางในแชทหรือโน้ตได้เลย · แถบนี้หายเองใน 3 วินาที" });
  };

  const done = xRun?.result ? xRun.result.states.filter((s) => s === "done").length : 0;
  return (
    <div className="pagewrap" data-info-page>
      <div className="wrapin">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onBack}>กลับไปชั้นวาง</button>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
            {m.thumb ? <img className="mc" src={thumbUrl(m.thumb) ?? undefined} alt="" style={{ width: 34, height: 51 }} /> : <div className="mc none" style={{ width: 34, height: 51 }} />}
            <div style={{ minWidth: 0 }}><div style={{ fontWeight: 700, fontSize: 17 }}><Phr tail={<span className="ext">.{m.ext}</span>}>{m.name}</Phr></div><div className="small" style={{ wordBreak: "break-all" }}>{dir}</div></div>
          </div>
          <button type="button" className={"btn btn-sm " + (info ? "btn-ghost" : "btn-wait")} aria-disabled={!info || undefined} title={info ? undefined : "รออ่านข้อมูลไฟล์ก่อน"} onClick={copyAll}>คัดลอกข้อมูลเป็นข้อความ</button>
        </div>

        {err ? <div className="stat bad"><CardIcon kind="bad" /><div><b>อ่านข้อมูลไฟล์ไม่ได้</b><Phr>{err}</Phr></div></div> : !info ? (
          <div className="mi" aria-busy="true">{Array.from({ length: 12 }, (_, i) => <Skel key={i} w={`${40 + ((i * 37) % 50)}%`} h={12} style={{ margin: "8px 0" }} />)}</div>
        ) : (
          <div className="mi" data-mi>
            {items.map(({ s, item }, i) => {
              const on = picked.includes(i);
              const toggle = () => setPicked((p) => (on ? p.filter((x) => x !== i) : p.concat(i)));
              return (
                <div key={i}>
                  {item ? (
                    <div className="mih pick" {...kb(toggle)} role="checkbox" aria-checked={on} aria-label={`เลือก ${s.title} เพื่อแยกไฟล์`}>
                      <span className={"cbx " + (on ? "on" : "off")}>{on && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>}</span>
                      <span>{s.title}</span><span className="miext">แยกเป็น .{s.ext}</span>
                    </div>
                  ) : <div className="mih"><span>{s.title}</span></div>}
                  {s.rows.map(([k, v], j) => <div key={j} className="mir"><span>{k}</span><span>:</span><span>{v}</span></div>)}
                </div>
              );
            })}
          </div>
        )}

        {/* แถบแยกไฟล์ */}
        <div className="card" data-extract>
          {!xRun || (!xRun.running && !xRun.result) ? (
            <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
              <div style={{ fontSize: 14 }}>{picked.length ? <><b>เลือกไว้ {picked.length} อย่าง</b> · {picked.map(label).join(" · ")}</> : "ติ๊กหัวข้อในตารางเพื่อแยกเป็นไฟล์"}</div>
              <div className="small" style={{ flex: 1, minWidth: 260, wordBreak: "break-all" }}>เก็บที่ {folder} · <button type="button" className="btn btn-ghost btn-sm" style={{ height: 28 }} onClick={async () => { const f = await pickFolder("เลือกที่เก็บไฟล์ที่แยก"); if (f) setFolder(f); }}>เปลี่ยนที่เก็บ</button></div>
              {!picked.length && <div className="hint" style={{ color: "#94680f", margin: 0 }}>ยังกดไม่ได้ ติ๊กอย่างน้อย 1 อย่างในตารางก่อน</div>}
              <button type="button" className={"btn " + (picked.length ? "btn-main" : "btn-wait")} aria-disabled={!picked.length || undefined} onClick={() => { if (picked.length) runExtract(picked, picked.map(() => "ask")); }} data-extract-start>แยกไฟล์ที่เลือก</button>
            </div>
          ) : (
            <div className="workbox">
              {xRun.labels.map((l, i) => {
                const st = xRun.result?.states[i] ?? (xRun.pct[i] >= 100 ? "done" : xRun.pct[i] > 0 || i === xRun.pct.findIndex((p) => p < 100) ? "working" : "queued");
                const word = st === "done" ? "เสร็จแล้ว" : st === "working" ? `กำลังทำ ${Math.round(xRun.pct[i])}%` : st === "conflict" ? "มีไฟล์ชื่อเดียวกันอยู่แล้ว" : st === "skipped" ? "ข้ามแล้ว" : st === "failed" ? "ไม่สำเร็จ" : st === "cancelled" ? "หยุดแล้ว" : "รอคิว";
                return <div key={i} className="setrow" style={i === 0 ? { borderTop: 0 } : undefined}><div className="lbl">{l}</div><div className="small">{word}</div></div>;
              })}
              {xRun.running && <button type="button" className="btn btn-bad btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => infoApi.extractCancel()}>หยุด</button>}
              {xRun.result && conflicts.length > 0 && (
                <>
                  <div className="stat warn"><CardIcon kind="warn" /><div><b>มีไฟล์ชื่อเดียวกันอยู่แล้ว</b>โปรแกรมไม่เขียนทับไฟล์เดิม</div></div>
                  <div className="minirow" style={{ marginTop: 0 }}>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => resolve("skip")}>ข้ามไฟล์นี้</button>
                    <button type="button" className="btn btn-main btn-sm" onClick={() => resolve("number")}>ตั้งชื่อใหม่ต่อท้ายเลข 2</button>
                  </div>
                </>
              )}
              {xRun.result?.error && (
                <>
                  <div className="stat bad"><CardIcon kind="bad" /><div>{xRun.result.error.split(" · ").map((l, i) => i === 0 ? <b key={i}>{l}</b> : <div key={i}><Phr>{l}</Phr></div>)}</div></div>
                  <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => runExtract(picked, picked.map(() => "ask"))}>ลองใหม่</button>
                </>
              )}
              {xRun.result && !xRun.result.error && conflicts.length === 0 && (
                <>
                  {done > 0 && <div className="stat ok"><CardIcon kind="done" /><div><b>แยกครบ {done} ไฟล์</b>{xRun.result.files.filter(Boolean).map((f, i) => <div key={i} style={{ wordBreak: "break-all" }}>{f!.split(/[\\/]/).pop()}</div>)}</div></div>}
                  <div className="minirow" style={{ marginTop: 0 }}>
                    {done > 0 && <button type="button" className="btn btn-ok btn-sm" onClick={() => { const f = xRun.result!.files.find(Boolean); if (f) api.revealMovie(f).catch(() => {}); }}>เปิดโฟลเดอร์ที่เก็บ</button>}
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setXRun(null)}>แยกอย่างอื่นต่อ</button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

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
  const [prog, setProg] = useState<{ done: number; total: number } | null>(null);
  const [paste, setPaste] = useState("");
  const [cmp, setCmp] = useState<HashCompare | null>(null);
  useEffect(() => {
    if (!inApp) return;
    const off = listen<{ done: number; total: number }>("hash-progress", (e) => setProg(e.payload));
    return () => { off.then((f) => f()); };
  }, []);
  useEffect(() => {
    if (!h || !paste.trim()) { setCmp(null); return; }
    infoApi.compare(paste, h).then(setCmp).catch(() => setCmp(null));
  }, [paste, h]);
  const running = prog !== null && h === null;
  const start = async () => {
    setH(null); setProg({ done: 0, total: m.size });
    try {
      const r = await infoApi.hash(m.path, algos);
      setProg(null);
      if (r) { setH(r); setAt(Date.now() / 1000); }
    } catch (e) {
      setProg(null);
      toast({ kind: "bad", title: "คำนวณค่า hash ไม่สำเร็จ", detail: String(e) });
    }
  };
  const rows = h ? ALGOS.filter(([k]) => (h as unknown as Record<string, string | null>)[k]) : [];
  const val = (k: string) => (h as unknown as Record<string, string | null>)[k] ?? "";
  const copy = async (t: string, what: string) => { await navigator.clipboard.writeText(t); toast({ kind: "ok", title: `คัดลอก${what}แล้ว`, detail: "แถบนี้หายเองใน 3 วินาที" }); };
  // อ่านไฟล์รอบเดียวคิดทุกแบบพร้อมกัน · บอกชื่อตัวหลัก SHA-256 ถ้าติ๊กไว้ (ต้นแบบ)
  const firstAlgo = algos.includes("sha256") ? "SHA-256" : ALGOS.find(([k]) => algos.includes(k))?.[1] ?? "";
  return (
    <div className="card" style={{ background: "#fff" }} data-hash>
      <h3>ค่า hash · {m.name}.{m.ext}</h3>
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
      {running ? (
        <div className="workbox">
          <div style={{ fontSize: 14 }}>{firstAlgo} · อ่านไฟล์ไปแล้ว <span className="nw">{fmtSize(prog!.done)}</span> จาก <span className="nw">{fmtSize(prog!.total)}</span> · {prog!.total ? Math.round((prog!.done / prog!.total) * 100) : 0}%</div>
          <div className="bar"><i style={{ width: `${prog!.total ? (prog!.done / prog!.total) * 100 : 0}%` }} /></div>
          <button type="button" className="btn btn-bad btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => infoApi.hashCancel()}>หยุด</button>
        </div>
      ) : h ? (
        <>
          {rows.map(([k, l]) => (
            <div key={k} className="hrow"><span className="halg">{l}</span><code className="hval">{val(k)}</code>
              <button type="button" className="icon-btn" aria-label={`คัดลอกค่า ${l}`} title="คัดลอก" onClick={() => copy(val(k), `ค่า ${l}`)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 012-2h10" /></svg>
              </button></div>
          ))}
          <div className="small" style={{ marginTop: 8 }}>คำนวณเมื่อ <span className="nw">{at ? fmtDateTime(at) : ""}</span> · ใช้เวลา <span className="nw">{Math.max(1, Math.round(h.seconds))} วินาที</span>{h.sha256 ? " · ค่า SHA-256 ถูกจำไว้ใช้ตอนตรวจแบบเร็วครั้งต่อไป" : ""}</div>
          <div className="minirow">
            <button type="button" className="btn btn-ghost btn-sm" onClick={start}>คำนวณใหม่</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => copy(rows.map(([k, l]) => `${l}: ${val(k)}`).join("\n"), "ค่า hash ทั้งหมด")}>คัดลอกทั้งหมด</button>
            <button type="button" className={"btn btn-sm " + (h.sha256 ? "btn-ghost" : "btn-wait")} aria-disabled={!h.sha256 || undefined} title={h.sha256 ? undefined : "ติ๊ก SHA-256 แล้วคำนวณใหม่ก่อน"}
              onClick={async () => { if (!h.sha256) return; try { const p = await infoApi.saveSha256(m.path, h.sha256); toast({ kind: "ok", title: "บันทึกไฟล์ .sha256 แล้ว", detail: p.split(/[\\/]/).pop() ?? p }); } catch (e) { toast({ kind: "bad", title: "บันทึกไฟล์ .sha256 ไม่สำเร็จ", detail: String(e) }); } }}>บันทึกเป็นไฟล์ .sha256</button>
          </div>
          <div style={{ marginTop: 12 }}>
            <ThaiInput value={paste} onChange={setPaste} label="วางค่า hash ที่ได้มาจากเว็บต้นทาง" err={!!cmp && !cmp.same} />
            {!paste && <div className="hint">วางค่า hash ที่เว็บต้นทางให้มา เพื่อเทียบว่าไฟล์ครบและตรงกับต้นฉบับทุกไบต์</div>}
            {cmp && (cmp.same
              ? <div className="stat ok" style={{ marginTop: 8 }}><CardIcon kind="done" /><div><b>ตรงกับ {cmp.algo} ของไฟล์นี้</b>ไฟล์ครบและเหมือนต้นฉบับทุกไบต์</div></div>
              : cmp.algo && cmp.diff
                ? <div className="stat bad" style={{ marginTop: 8 }}><CardIcon kind="bad" /><div><b>ไม่ตรงกับ {cmp.algo} ของไฟล์นี้</b><div><Phr>ไฟล์อาจโหลดมาไม่ครบหรือถูกแก้ไข</Phr></div><div>{cmp.diff}</div></div></div>
                : <div className="hint e">{cmp.algo ? `ยังไม่ได้คำนวณ ${cmp.algo} ติ๊กแล้วกดคำนวณใหม่` : "ค่าที่วางไม่ใช่ค่า hash แบบที่รู้จัก"}</div>)}
          </div>
        </>
      ) : (
        <button type="button" className={"btn btn-sm " + (algos.length ? "btn-main" : "btn-wait")} aria-disabled={!algos.length || undefined} title={algos.length ? undefined : "ติ๊กอย่างน้อย 1 แบบก่อน"} onClick={() => { if (algos.length) start(); }} data-hash-start>คำนวณ</button>
      )}
    </div>
  );
}

/** ชื่อชนิดที่เจอบ่อย หมายถึงอะไร (ต้นแบบบรรทัด 670–692) */
const KINDS: [string, [string, string][]][] = [
  ["ภาพ", [["H.264 (AVC)", "ชนิดที่ใช้มากที่สุด เปิดได้แทบทุกเครื่อง"], ["H.265 (HEVC)", "ไฟล์เล็กกว่า H.264 ที่ความคมเท่ากัน เครื่องเก่าบางเครื่องเปิดไม่ได้"], ["AV1", "ชนิดใหม่ ไฟล์เล็กมาก ต้องใช้เครื่อง หรือโปรแกรมรุ่นใหม่"], ["HDR", "ภาพสว่างและสีกว้างกว่าปกติ ต้องใช้จอที่รองรับ"]]],
  ["เสียง", [["AAC", "ใช้ทั่วไป ไฟล์เล็ก เปิดได้ทุกเครื่อง"], ["AC-3 · E-AC-3", "Dolby Digital ใช้กับลำโพงรอบทิศทาง 5.1"], ["DTS · TrueHD", "เสียงคุณภาพสูงจากแผ่นบลูเรย์ ไฟล์ใหญ่"], ["FLAC · Opus", "FLAC เสียงไม่ลดคุณภาพ · Opus ไฟล์เล็กมาก"]]],
  ["ซับไตเติล", [["SRT", "ตัวหนังสือธรรมดา แก้ไขได้ด้วย Notepad"], ["ASS", "แต่งสี ฟอนต์ ตำแหน่งได้ ใช้กับการ์ตูนบ่อย"], ["PGS · VobSub", "ซับแบบภาพจากแผ่นบลูเรย์และดีวีดี แก้คำไม่ได้"]]],
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
            <div className="kinds">{rows.map(([k, v]) => <div key={k} className="kindrow"><b>{k}</b><div>{v.split(" · ").map((x, i) => <div key={i}><Phr>{x}</Phr></div>)}</div></div>)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
