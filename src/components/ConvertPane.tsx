/* โหมดแปลงเสียงของหน้ากราฟเสียง (แผนเสียงและซับ ขั้น 8 · มอคอัปหัวข้อ 7 หน้าแปลงเสียง)
   แปลงไฟล์เสียงอย่างเดียว ไม่รวมเข้าหนัง · ลากหลายไฟล์ได้ ตั้งทีเดียวทั้งคิวหรือทีละไฟล์ด้วยแผงตั้งค่าเสียงเดียวกับหน้าเสียงและซับ
   Monkey's Audio กับ TAK มีเฉพาะที่นี่ · ไฟล์ใหม่ข้างไฟล์เดิมหรือโฟลเดอร์ที่เลือก ชื่อชนต่อท้าย (2) ไม่เขียนทับ · ข้อมูลเพลงกับรูปปกติดไป
   แปลงเสร็จกดเทียบความถี่ เปิดหน้ากราฟเสียงแบบเทียบสองไฟล์ · กดชื่อไฟล์ดูข้อมูลเพลงกับรูปปก (ดูอย่างเดียว) */
import { useState } from "react";
import "../styles/av.css";
import CodecPanel from "./CodecPanel";
import { CardIcon, Phr, Seg, Skel } from "./ui";
import { encodeApi, pickAudioFiles, pickFolder, type AudioFile, type EncodeSpec, type EncoderInfo, type MergeTrack } from "../lib/api";
import { addFiles, clearDone, removeItem, retry, setAll, setItemSpec, setOutDir, startQueue, stopQueue, useConvQueue, type QItem } from "../lib/convertJob";
import { codecOf } from "../lib/codecs";
import { ftName } from "../lib/ftypes";
import { fmtSize } from "../lib/format";
import { useToast } from "./Toasts";

const baseName = (p: string) => p.split(/[\\/]/).pop() ?? p;
const dirOf = (p: string) => p.replace(/[\\/][^\\/]*$/, "");

/** ไฟล์ในคิวในรูปแทร็กให้แผงตั้งค่าเสียงใช้ (ขนาดที่คาด ช่อง อัตราสุ่ม ความยาว) */
export function asTrack(f: AudioFile | null, spec: EncodeSpec | null): MergeTrack {
  return {
    src: f?.path ?? "ไฟล์เสียง", tid: 0, ff: f?.stream ?? 0, kind: "audio", codec: f?.codec ?? "", profile: f?.profile || null, lang: "", name: "", default: false, forced: false,
    channels: f?.channels ?? null, layout: f?.layout ?? null, rate: f?.rate ?? null, bits: f?.bits ?? null, bitrate: f?.bitrate ?? null,
    width: null, height: null, fps: null, duration: f?.duration ?? null, bytes: f?.size ?? null, frames: null,
    mp4: "ok", why: null, charset: null, delay: 0, keep: true, inMovie: false, convert: spec, pair: true,
  };
}

/** ป้ายปลายทางในแถว เช่น Opus 160 kbps · FLAC Level 8 · Monkey's Audio High */
export function specLabel(s: EncodeSpec): string {
  const c = codecOf(s.codec), p = s.p;
  const ch = s.channels ? ` · ${s.channels === 1 ? "ช่องเดียว" : s.channels === 2 ? "2.0" : s.channels === 6 ? "5.1" : s.channels + " ช่อง"}` : "";
  const v = c.id === "opus" ? `${p.bitrate ?? 160} kbps`
    : c.id === "aac" ? (s.encoder === "qaac" && (p.mode ?? "TVBR") === "TVBR" ? `TVBR ${p.tvbr ?? 91}` : s.encoder === "fdkaac" && (p.mode ?? "VBR") === "VBR" ? `VBR ${p.vbr ?? 5}` : `${p.bitrate ?? 256} kbps`)
    : c.id === "mp3" ? ((p.mode ?? "VBR") === "VBR" ? `V${p.vbrq ?? 2}` : `${p.mode} ${p.bitrate ?? 192} kbps`)
    : c.id === "ac3" ? `${p.bitrate ?? 640} kbps`
    : c.id === "flac" ? `Level ${p.level ?? 5}` : c.id === "wv" ? String(p.mode ?? "Normal") : c.id === "ape" ? String(p.level ?? "Normal")
    : c.id === "tak" ? `-p${p.preset ?? 2}${p.eval === "Max" ? "m" : p.eval === "Extra" ? "e" : ""}` : "";
  return `${c.name} ${v}${ch}`.trim();
}

const etaTxt = (s: number | null) => (s == null ? "" : s < 60 ? `เหลือราว ${Math.max(1, Math.round(s))} วินาที` : `เหลือราว ${Math.round(s / 60)} นาที`);
const NOTE = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M9 18V5l11-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="17" cy="16" r="3" /></svg>;
const X = <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>;
const CHEV = <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>;

export function Cover({ thumb, size = 40 }: { thumb: string | null | undefined; size?: number }) {
  if (thumb === undefined) return <Skel w={size} h={size} r={6} />;
  if (thumb) return <img className="cqcov" src={thumb} alt="" style={{ width: size, height: size }} draggable={false} />;
  return <span className="cqcov none" style={{ width: size, height: size }} aria-hidden="true">{NOTE}</span>;
}

function detailOf(f: AudioFile): string {
  const ft = ftName("audio", f.codec, f.profile);
  const lossless = ["FLAC", "PCM", "ALAC", "WavPack", "TTA", "APE", "TAK", "TrueHD", "DTS-HD MA"].includes(ft);
  const q = lossless && f.bits ? `${f.bits} บิต ${(f.rate / 1000).toLocaleString("en-US", { maximumFractionDigits: 1 })} kHz` : f.bitrate ? `${Math.round(f.bitrate / 1000).toLocaleString("en-US")} kbps` : `${(f.rate / 1000).toLocaleString("en-US", { maximumFractionDigits: 1 })} kHz`;
  return [`${ft === "APE" ? "Monkey's Audio" : ft} ${f.layout}`, q, fmtSize(f.size), f.audioOnly ? "" : "เสียงในไฟล์หนัง"].filter(Boolean).join(" · ");
}

function Status({ it }: { it: QItem }) {
  if (it.state === "work") {
    const pct = Math.round(it.progress?.percent ?? 0);
    return <div data-qwork><div className="bar"><i style={{ width: `${pct}%` }} /></div><div className="small" style={{ marginTop: 3 }}>{`${pct}%`}{it.progress?.eta != null ? ` · ${etaTxt(it.progress.eta)}` : it.progress?.phase ? ` · ${it.progress.phase}` : ""}</div></div>;
  }
  if (it.state === "done" && it.result) {
    const r = it.result, d = r.srcSize ? Math.round((1 - r.size / r.srcSize) * 100) : 0;
    return <div data-qdone><span className="tpill ok">เสร็จ · {fmtSize(r.size)}</span>
      <div className="small" style={{ marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.out}>{baseName(r.out)} · {d >= 0 ? `เล็กลง ${d}%` : `ใหญ่ขึ้น ${-d}%`}</div></div>;
  }
  if (it.state === "fail") return <div data-qfail><span className="tpill off">{it.bad ? "อ่านไฟล์ไม่ได้" : "ไม่สำเร็จ"}</span>{it.bad ? <div className="small" style={{ marginTop: 3 }}>ไม่มีแทร็กเสียง หรือไฟล์เสีย</div> : <div className="small" style={{ marginTop: 3 }}>เหตุอยู่ใต้แถว</div>}</div>;
  if (it.state === "stop") return <div data-qstop><span className="tpill warn">หยุดแล้ว</span><div className="small" style={{ marginTop: 3 }}>ไฟล์ที่ทำค้างถูกลบ</div></div>;
  return <span className="small" data-qwait>{it.file ? "รอคิว" : "กำลังอ่านไฟล์"}</span>;
}

export default function ConvertPane(p: { onCompare: (a: string, b: string, note: string) => void; onTags: (path: string) => void }) {
  const q = useConvQueue();
  const toast = useToast();
  const [encs, setEncs] = useState<EncoderInfo[] | null>(null);
  /** แผงตั้งค่าที่เปิดอยู่ · all = ตั้งทีเดียวทั้งคิว · เลขแถว = ตั้งไฟล์นั้น */
  const [panel, setPanel] = useState<string | null>(null);
  const openPanel = (k: string) => { setPanel(k); if (!encs) encodeApi.status().then(setEncs, () => setEncs([])); };

  const n = q.items.length;
  const done = q.items.filter((x) => x.state === "done").length;
  const work = q.items.filter((x) => x.state === "work").length;
  const wait = q.items.filter((x) => x.state === "wait").length;
  const fail = q.items.filter((x) => x.state === "fail" || x.state === "stop").length;
  // ไฟล์ที่ยังไม่เริ่ม ไม่นับไฟล์ที่อ่านไม่ได้ (แปลงไม่ได้อยู่แล้ว · เดิมหัวแผงนับรวม เจอตอนเทส)
  const pending = q.items.filter((x) => x.state !== "done" && x.state !== "work" && !x.bad);
  const allSame = pending.length > 0 && pending.every((x) => JSON.stringify(x.spec) === JSON.stringify(pending[0].spec));
  const pick = async () => { const f = await pickAudioFiles(); if (f.length) { const s = addFiles(f); if (s) toast({ kind: "info", title: `ข้าม ${s} ไฟล์ที่อยู่ในคิวแล้ว` }); } };
  const pickDir = async () => { const d = await pickFolder("เลือกโฟลเดอร์เก็บไฟล์ใหม่"); if (d) setOutDir(d); };

  const panelItem = panel && panel !== "all" ? q.items.find((x) => x.id === panel) : null;
  const ref = panel === "all" ? (pending.find((x) => x.file) ?? q.items.find((x) => x.file)) : panelItem;

  return (
    <div className="cq" data-convert>
      <div className="cqtop">
        <div className="small" style={{ flex: 1 }}>แปลงไฟล์เสียงอย่างเดียว ไม่รวมเข้าหนัง · ไฟล์เดิมไม่ถูกแก้</div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={pick} data-qadd>เพิ่มไฟล์</button>
      </div>
      <div className="card" style={{ padding: 12 }}>
        <h3><span>คิวแปลง · {n} ไฟล์</span><span className="small" style={{ fontWeight: 400 }} data-qsum>{n ? [`เสร็จ ${done}`, `กำลังทำ ${work}`, `รอ ${wait}`, fail ? `ไม่สำเร็จ ${fail}` : ""].filter(Boolean).join(" · ") + " · ทีละไฟล์ตามลำดับ" : "ยังไม่มีไฟล์"}</span></h3>
        {n > 0 && <div className="cqlist" data-qlist>
          <div className="cqrow head"><span></span><span>ไฟล์</span><span></span><span>แปลงเป็น</span><span>สถานะ</span><span></span></div>
          {q.items.map((it) => {
            const locked = it.state === "work" || it.state === "done" || !!it.bad;
            return (
              <div key={it.id} className={"cqrow " + it.state} data-qrow={baseName(it.path)} data-qstate={it.state}>
                <Cover thumb={it.bad ? null : it.thumb} />
                <div style={{ minWidth: 0 }}>
                  <button type="button" className="nm linklike" onClick={() => p.onTags(it.path)} title={`${it.path}\nกดเพื่อดูข้อมูลเพลงกับรูปปก`} data-qname>{baseName(it.path)}</button>
                  <div className="dt">{it.file ? detailOf(it.file) : it.bad ? it.bad : <Skel w={180} h={12} />}</div>
                </div>
                <span style={{ color: "var(--txt3)" }} aria-hidden="true">→</span>
                <button type="button" className={"dd" + (locked ? " locked" : "")} onClick={() => !locked && openPanel(it.id)} aria-disabled={locked || undefined}
                  title={it.state === "work" ? "กำลังแปลง เปลี่ยนไม่ได้" : it.state === "done" ? "แปลงเสร็จแล้ว" : "กดเพื่อตั้งค่าไฟล์นี้"} data-qto>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{specLabel(it.spec)}</span>{!locked && CHEV}</button>
                <Status it={it} />
                <div className="cqbtns">
                  {it.state === "done" && it.result && <button type="button" className="btn btn-ghost btn-xs" onClick={() => p.onCompare(it.path, it.result!.out, `แปลงด้วย ${it.result!.tool} · ${specLabel(it.spec)}`)} data-qcmp>เทียบความถี่</button>}
                  {(it.state === "fail" || it.state === "stop") && !it.bad && !q.running && <button type="button" className="btn btn-ghost btn-xs" onClick={() => retry(it.id)} data-qretry>ลองใหม่</button>}
                  <button type="button" className="ib bad" onClick={() => it.state !== "work" && removeItem(it.id)} aria-disabled={it.state === "work" || undefined}
                    aria-label={`เอา ${baseName(it.path)} ออกจากคิว`} title={it.state === "work" ? "กำลังแปลง กดหยุดทั้งคิวก่อน" : "เอาออกจากคิว ไฟล์ในเครื่องไม่ถูกแตะ"} data-qremove>{X}</button>
                </div>
                {it.state === "done" && it.result && (
                  <div className="cqmore" data-qresult>
                    <Phr>{`${it.result.tags ? `ข้อมูลเพลง ${it.result.tags} ช่องติดไป` : "ไม่มีข้อมูลเพลง"} · ${it.result.cover ? "รูปปกติดไป" : "ไม่มีรูปปก"} · แปลงด้วย ${it.result.tool} · ใช้เวลา ${it.result.secs < 60 ? `${it.result.secs.toFixed(1)} วินาที` : `${Math.round(it.result.secs / 60)} นาที`}`}</Phr>
                    {it.result.notes.map((x) => <div key={x} className="warnline"><CardIcon kind="warn" /><Phr>{x}</Phr></div>)}
                  </div>
                )}
                {it.state === "fail" && it.problem && <div className="cqmore bad" data-qproblem><b>{it.problem.title}</b> <Phr>{it.problem.detail.join(" · ")}</Phr></div>}
              </div>
            );
          })}
        </div>}
        <div className="drop" style={{ marginTop: n ? 8 : 0, minHeight: n ? 0 : 120 }} data-qdrop>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#e5a3bd" strokeWidth="1.9" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
          <span><b style={{ color: "var(--txt2)" }}>{n ? "ลากไฟล์เสียงมาวางเพิ่ม" : "ลากไฟล์เสียงมาวางตรงนี้ ได้หลายไฟล์"}</b> · <Phr>MP3 FLAC WAV M4A AAC AC3 E-AC3 DTS OGG OPUS WV APE TAK และเสียงในไฟล์หนัง</Phr></span>
        </div>
      </div>
      <div className="cqcards">
        <div className="card"><h3>ตั้งทีเดียวทั้งคิว</h3>
          <div className="optline">
            <button type="button" className="dd" style={{ minWidth: 230 }} onClick={() => openPanel("all")} data-qall>
              <span>{pending.length === 0 ? specLabel(q.all) : allSame ? specLabel(pending[0].spec) : "ตั้งทีละไฟล์ (ตามแถว)"}</span>{CHEV}</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => openPanel("all")}>เปิดแผงตั้งค่าเสียง</button>
          </div>
          <div className="small" style={{ marginTop: 6 }}>ใช้กับทุกไฟล์ที่ยังไม่เริ่ม และไฟล์ที่เพิ่มต่อจากนี้ · ข้อมูลเพลงกับรูปปกติดไปด้วย · Monkey's Audio กับ TAK มีเฉพาะหน้านี้</div></div>
        <div className="card"><h3>ที่เก็บไฟล์ใหม่</h3>
          <div className="optline"><Seg small label="ที่เก็บไฟล์ใหม่" value={q.outDir ? "dir" : "beside"} onChange={(v) => (v === "beside" ? setOutDir(null) : pickDir())}
            options={[{ value: "beside", label: "ข้างไฟล์เดิม" }, { value: "dir", label: "เลือกโฟลเดอร์" }]} /></div>
          <div className="small" style={{ marginTop: 6, overflowWrap: "anywhere" }} data-qdir>{q.outDir ? `เก็บที่ ${q.outDir}` : n ? `เช่น ${dirOf(q.items[0].path)}` : ""}{n || q.outDir ? " · " : ""}ชื่อเดิม นามสกุลใหม่ · ชื่อชนต่อท้าย (2) ไม่เขียนทับ</div></div>
      </div>
      <div className="avfoot">
        {done > 0 && !q.running && <button type="button" className="btn btn-ghost" onClick={clearDone} data-qclear>เอาไฟล์ที่เสร็จออกจากคิว</button>}
        {q.running && <button type="button" className="btn btn-bad" onClick={stopQueue} aria-disabled={q.stopping || undefined} data-qstop>{q.stopping ? "กำลังหยุด…" : "หยุดทั้งคิว"}</button>}
        {q.running
          ? <button type="button" className="btn btn-wait" style={{ height: 44, padding: "0 26px" }} aria-disabled data-qstart>กำลังแปลง {done + 1} จาก {done + work + wait}…</button>
          : <button type="button" className={"btn " + (wait ? "btn-main" : "btn-wait")} style={{ height: 44, padding: "0 26px" }} aria-disabled={!wait || undefined}
              title={wait ? undefined : n ? "ไม่มีไฟล์ที่รอแปลง" : "ลากไฟล์เสียงมาวางก่อน"} onClick={() => wait && startQueue()} data-qstart>{wait ? `แปลง ${wait} ไฟล์` : "แปลง"}</button>}
      </div>
      {panel && (
        <CodecPanel convertPage track={asTrack(ref?.file ?? null, panel === "all" ? (allSame && pending[0] ? pending[0].spec : q.all) : panelItem?.spec ?? q.all)} encoders={encs}
          title={panel === "all" ? `ตั้งทีเดียวทั้งคิว · ${pending.length} ไฟล์ที่ยังไม่เริ่ม` : panelItem ? baseName(panelItem.path) : undefined}
          onClose={() => setPanel(null)}
          onApply={(spec) => { if (spec) { if (panel === "all") setAll(spec); else setItemSpec(panel, spec); } setPanel(null); }} />
      )}
    </div>
  );
}
