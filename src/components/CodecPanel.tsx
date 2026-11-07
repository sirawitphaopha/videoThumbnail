/* แผงตั้งค่าเสียง แบบง่าย (มอคอัปหัวข้อ 2 · แผนเสียงและซับ ขั้น 4)
   เลือกชนิด Lossy (Opus AAC MP3 AC-3) หรือ Lossless (FLAC WavPack) · ตัวแปลง (ตัวต้นฉบับเป็นค่าตั้งต้น ffmpeg เป็นตัวรอง) · ชุดค่า 4 ชุดพร้อมขนาดที่คาด
   แทร็กในหนัง เลือกเพิ่มคู่กับแทร็กเดิม (ค่าตั้งต้นที่พี่กันเคาะ) หรือแทนที่ · คำสั่งที่จะรันจริงจากฝั่ง Rust (encode_preview) พร้อมปุ่มคัดลอก
   ขั้นสูง การ์ดละช่องพร้อม ⓘ ทำต่อในรอบถัดไป */
import { useEffect, useMemo, useState } from "react";
import Dialog from "./Dialog";
import Dropdown from "./Dropdown";
import { CardIcon, Phr, Seg } from "./ui";
import { encodeApi, type EncodePlan, type EncodeSpec, type EncoderInfo, type MergeTrack } from "../lib/api";
import { CODECS, codecOf, presetSize, type Codec } from "../lib/codecs";
import { ftName, isLossless } from "../lib/ftypes";
import { fmtSize } from "../lib/format";

const baseName = (p: string) => p.split(/[\\/]/).pop() ?? p;

function engines(c: Codec, encs: EncoderInfo[] | null): { value: string; label: string; ok: boolean }[] {
  const has = (n: string) => !!encs?.find((e) => e.name === n && e.ok);
  const ver = (n: string) => encs?.find((e) => e.name === n)?.version ?? "";
  const ff = { value: "ffmpeg", label: `ffmpeg ${ver("ffmpeg")}`.trim(), ok: true };
  if (c.id === "aac") return [{ value: "qaac", label: "qaac (Apple)", ok: has("qaac64") }, { value: "fdkaac", label: "fdkaac", ok: has("fdkaac") }, ff];
  if (!c.native) return [ff];
  return [{ value: "native", label: `${c.native} ${ver(c.native)}`.trim(), ok: has(c.native) }, ff];
}

export default function CodecPanel(p: {
  track: MergeTrack;
  encoders: EncoderInfo[] | null;
  onApply: (convert: EncodeSpec | null, pair: boolean, convName: string) => void;
  onClose: () => void;
}) {
  const t = p.track;
  const start = t.convert ? codecOf(t.convert.codec) : codecOf("opus");
  const [cid, setCid] = useState<Codec["id"]>(start.id);
  const c = codecOf(cid);
  const engs = engines(c, p.encoders);
  const firstOk = engs.find((e) => e.ok)?.value ?? "ffmpeg";
  /** ตัวแปลงที่กดเลือกเอง · ยังไม่ได้เลือก = ใช้ตัวต้นฉบับถ้ามี ไม่มีใช้ ffmpeg (คิดใหม่ทุกครั้ง รายชื่อตัวแปลงมาทีหลังแผงเปิดได้
      เดิมจำค่าตอนแผงเปิด รายชื่อยังไม่มา ค้างเป็น ffmpeg ทั้งที่มี opusenc ตัวตรวจ check-av จับได้) */
  const [eng, setEng] = useState<string | null>(t.convert?.encoder ?? null);
  const [pi, setPi] = useState<number>(() => {
    if (!t.convert) return start.preset;
    const i = start.presets.findIndex((x) => JSON.stringify(x.p) === JSON.stringify(t.convert!.p));
    return i >= 0 ? i : start.preset;
  });
  const [pair, setPair] = useState(t.pair ?? true);
  const [plan, setPlan] = useState<EncodePlan | null>(null);
  const [planErr, setPlanErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // เปลี่ยนชนิด · ตัวแปลงกับชุดค่ากลับเป็นค่าตั้งต้นของชนิดนั้น
  const pickCodec = (id: Codec["id"]) => {
    const nc = codecOf(id);
    setCid(id);
    setPi(nc.preset);
    setEng(null);
  };
  const engUse = eng && engs.some((e) => e.value === eng && e.ok) ? eng : firstOk;
  const pr = c.presets[pi] ?? c.presets[c.preset];
  /** ใช้กับทุกชนิด (มอคอัป GAIN LOUD กับช่องความเร็วเสียงในการ์ดตั้งค่าแทร็ก) */
  const [gain, setGain] = useState<number>(t.convert?.gain ?? 0);
  const [loud, setLoud] = useState<boolean>(t.convert?.loudnorm ?? false);
  const [speed, setSpeed] = useState<string>(t.convert?.speed ? t.convert.speed.join(">") : "");
  const spec: EncodeSpec = useMemo(() => ({
    codec: c.id, encoder: engUse, p: pr.p,
    channels: pr.channels && (t.channels ?? 2) > pr.channels ? pr.channels : null,
    gain, loudnorm: loud, speed: speed ? (speed.split(">").map(Number) as [number, number]) : null,
  }), [c.id, engUse, pr, t.channels, gain, loud, speed]);

  useEffect(() => {
    let live = true;
    setPlanErr(null);
    encodeApi.preview(spec, baseName(t.src), t.ff ?? t.tid, t.channels).then((r) => { if (live) setPlan(r); }, (e) => { if (live) { setPlan(null); setPlanErr(String(e)); } });
    return () => { live = false; };
  }, [spec, t.src, t.ff, t.tid, t.channels]);

  const srcFt = ftName("audio", t.codec, t.profile);
  const srcLossless = isLossless(srcFt);
  const warn = !srcLossless && !c.lossless ? `แปลงแบบเสียคุณภาพซ้อน ${srcFt} เป็น ${c.name} เสียงต่างจากต้นฉบับมากขึ้นอีกนิด`
    : !srcLossless && c.lossless ? `${srcFt} เป็นแบบเสียคุณภาพอยู่แล้ว แปลงเป็น ${c.name} ไฟล์ใหญ่ขึ้น คุณภาพไม่กลับมา` : null;
  const name = `${t.name || ""} ${c.name}`.trim();

  return (
    <Dialog open onClose={p.onClose} width={780} title={<span>ตั้งค่าแปลงเสียง · <span style={{ overflowWrap: "anywhere" }}>{t.inMovie ? (t.name || "เสียงในหนัง") : baseName(t.src)}</span></span>}
      actions={<>
        {t.convert && <button type="button" className="btn btn-ghost btn-sm" style={{ marginRight: "auto" }} onClick={() => p.onApply(null, pair, "")} data-conv-off>ไม่แปลง</button>}
        <button type="button" className="btn btn-ghost btn-sm" onClick={p.onClose}>ยกเลิก</button>
        <button type="button" className={"btn btn-sm " + (planErr ? "btn-wait" : "btn-main")} aria-disabled={!!planErr || undefined} title={planErr ?? undefined}
          onClick={() => { if (!planErr) p.onApply(spec, pair, pair && t.inMovie ? name : ""); }} data-conv-use>ใช้ค่านี้</button>
      </>}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }} data-codec-panel>
        <div className="small">ต้นทาง <b style={{ color: "var(--txt2)" }}>{srcFt}</b>{t.channels ? ` · ${t.channels} ช่อง` : ""}{t.rate ? ` · ${t.rate / 1000} kHz` : ""}{t.duration ? ` · ${Math.round(t.duration / 60)} นาที` : ""}</div>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div><div className="small" style={{ marginBottom: 4 }}><b style={{ color: "var(--txt2)" }}>Lossy</b> (เสียคุณภาพ ไฟล์เล็ก)</div>
            <Seg small label="ชนิดแบบเสียคุณภาพ" value={c.lossless ? ("" as Codec["id"]) : c.id} onChange={pickCodec} options={CODECS.filter((x) => !x.lossless).map((x) => ({ value: x.id, label: x.name }))} /></div>
          <div><div className="small" style={{ marginBottom: 4 }}><b style={{ color: "var(--txt2)" }}>Lossless</b> (ไม่เสียคุณภาพ)</div>
            <Seg small label="ชนิดแบบไม่เสียคุณภาพ" value={c.lossless ? c.id : ("" as Codec["id"])} onChange={pickCodec} options={CODECS.filter((x) => x.lossless).map((x) => ({ value: x.id, label: x.name }))} /></div>
        </div>
        <div className="small"><b style={{ color: "var(--txt)" }}>{c.name}</b> ({c.full}) · <Phr>{`${c.why} · ${c.ch}${c.mp4 ? "" : " · ใส่ MP4 ไม่ได้"}`}</Phr></div>
        <div><div className="small" style={{ marginBottom: 4 }}><b style={{ color: "var(--txt2)" }}>Encoder</b> (ตัวแปลง)</div>
          <div style={{ display: "flex" }}><Seg small label="ตัวแปลง" value={engUse} onChange={(v) => { if (engs.find((e) => e.value === v)?.ok) setEng(v); }}
            options={engs.map((e) => ({ value: e.value, label: e.ok ? e.label : `${e.label} (ยังไม่ได้ใส่)` }))} /></div></div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }} role="radiogroup" aria-label="ชุดค่า">
          {c.presets.map((x, i) => {
            const sz = presetSize(x, t.duration, x.channels && (t.channels ?? 2) > x.channels ? x.channels : t.channels, t.rate);
            return (
              <button key={x.label} type="button" role="radio" aria-checked={i === pi} onClick={() => setPi(i)} data-preset={i}
                className="btn" style={{ height: "auto", flexDirection: "column", alignItems: "flex-start", gap: 2, padding: "8px 10px", textAlign: "left",
                  border: i === pi ? "1px solid var(--accent)" : "1px solid #efc6d5", background: i === pi ? "#fdeaf1" : "#fff", boxShadow: i === pi ? "0 0 0 3px rgba(233,138,172,.18)" : "none" }}>
                <b style={{ fontSize: 13.5 }}>{x.label}</b>
                <span className="small" style={{ color: "var(--txt2)" }}>{x.detail}</span>
                <span className="small">{sz ? `ทั้งแทร็กราว ${fmtSize(sz)}` : ""}</span>
              </button>
            );
          })}
        </div>
        {t.inMovie && (
          <div><div className="small" style={{ marginBottom: 4 }}><b style={{ color: "var(--txt2)" }}>แทร็กที่อยู่ในหนังแล้ว · แปลงแล้วจะ</b></div>
            <div style={{ display: "flex" }}><Seg small label="แปลงแล้วจะ" value={pair ? "pair" : "replace"} onChange={(v) => setPair(v === "pair")}
              options={[{ value: "pair", label: "เพิ่มคู่กับแทร็กเดิม" }, { value: "replace", label: "แทนที่แทร็กเดิม" }]} /></div>
            <div className="small" style={{ marginTop: 4 }}>{pair ? `แทร็กใหม่ชื่อ ${name} ต่อท้ายแทร็กเดิม แทร็กเดิมอยู่ครบ` : "แทร็กเดิมถูกแทนที่ด้วยแทร็กที่แปลง"}</div></div>
        )}
        <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "flex-start" }} data-extra>
          <div><div className="small" style={{ marginBottom: 4 }}><b style={{ color: "var(--txt2)" }}>ความเร็วเสียง</b> · เสียงที่เหลื่อมเพิ่มขึ้นเรื่อย ๆ</div>
            <Dropdown label="ความเร็วเสียง" value={speed} onChange={setSpeed} options={[
              { value: "", label: "ไม่เปลี่ยน" }, { value: "25>23.976", label: "25 → 23.976 (แผ่นยุโรป PAL)" }, { value: "24>23.976", label: "24 → 23.976" },
              { value: "23.976>25", label: "23.976 → 25" }, { value: "23.976>24", label: "23.976 → 24" }]} /></div>
          <div><div className="small" style={{ marginBottom: 4 }}><b style={{ color: "var(--txt2)" }}>Gain</b> (ปรับความดัง dB)</div>
            <div className="delay"><button type="button" aria-label="ลดความดัง 1 dB" onClick={() => setGain((g) => Math.max(-12, g - 1))}>−</button>
              <span className="avnum" style={{ display: "inline-flex", alignItems: "center", justifyContent: "flex-end", width: 56 }} data-gain>{gain > 0 ? `+${gain}` : gain} dB</span>
              <button type="button" aria-label="เพิ่มความดัง 1 dB" onClick={() => setGain((g) => Math.min(12, g + 1))}>+</button></div></div>
          <div><div className="small" style={{ marginBottom: 4 }}><b style={{ color: "var(--txt2)" }}>Loudness normalize</b> (ความดังมาตรฐาน)</div>
            <div style={{ display: "flex" }}><Seg small label="ความดังมาตรฐาน" value={loud ? "on" : "off"} onChange={(v) => setLoud(v === "on")}
              options={[{ value: "off", label: "Off" }, { value: "on", label: "EBU R128 −23 LUFS" }]} /></div></div>
        </div>
        {speed && <div className="small"><Phr>{`ยืดเสียงด้วย rubberband ระดับเสียงไม่เพี้ยน · ความยาวเปลี่ยนจาก ${t.duration ? Math.round(t.duration) : "?"} เป็นราว ${t.duration ? Math.round(t.duration * Number(speed.split(">")[0]) / Number(speed.split(">")[1])) : "?"} วินาที`}</Phr></div>}
        {warn && <div className="stat warn"><CardIcon kind="warn" /><div><Phr>{warn}</Phr> · <Phr>ไม่ห้าม แค่บอก</Phr></div></div>}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <span className="small"><b style={{ color: "var(--txt2)" }}>คำสั่งที่จะรัน</b> · สร้างจากค่าที่เลือก ชื่อไฟล์ของจริงเป็นที่อยู่เต็มในโฟลเดอร์ชั่วคราว</span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { if (plan) navigator.clipboard?.writeText(plan.text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {}); }} data-copy>{copied ? "คัดลอกแล้ว" : "คัดลอก"}</button>
          </div>
          <pre data-cmd style={{ margin: 0, whiteSpace: "pre-wrap", overflowWrap: "break-word", fontFamily: "var(--mono)", fontSize: 12, lineHeight: 1.55, background: "#fff", border: "1px solid var(--line)", borderRadius: 8, padding: "8px 10px", userSelect: "text", color: "var(--txt)" }}>
            {planErr ?? (plan
              // ตัดบรรทัดเฉพาะตรงเว้นวรรค · เดิมตัดหลังขีด -i กลายเป็นสองบรรทัด อ่านผิดคำสั่ง (เจอตอนตรวจภาพ) · คัดลอกใช้ plan.text ตรงตัว
              ? plan.text.split("\n").map((line, li) => <span key={li}>{li > 0 && <br />}{line.split(" ").map((w, wi) => <span key={wi}>{wi > 0 ? " " : ""}<span style={{ whiteSpace: "nowrap" }}>{w}</span></span>)}</span>)
              : "…")}</pre>
          {plan && <div className="small" style={{ marginTop: 4 }}>{plan.note}</div>}
        </div>
      </div>
    </Dialog>
  );
}
