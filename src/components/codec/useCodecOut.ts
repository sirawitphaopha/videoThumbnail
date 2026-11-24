/* ไฟล์ที่จะได้ คำสั่งที่จะรัน ขนาดที่คาดจากการลองแปลงจริง ตารางเทียบต้นฉบับ คำเตือน และปุ่มใช้ค่านี้
   แยกจาก CodecPanel.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 9) เนื้อโค้ดยกมาทั้งก้อน */
import { useEffect, useState } from "react";
import { convertApi, encodeApi, inApp } from "../../lib/api";
import { advSize, type SizeCtx, type Vals } from "../../lib/codecAdv";
import { ftName, isLossless } from "../../lib/ftypes";
import { fmtSize } from "../../lib/format";
import { baseName, saveLast, outFormat } from "./codecCalc";
import type { Cp0 } from "./codecCtx";

export function useCodecOut(cx: Cp0) {
  const { blocked, c, eng, engUse, live, p, pair, setPlan, setPlanErr, spec, speed, srcCh, t, tab, vals } = cx;
  useEffect(() => {
    let alive = true;
    setPlanErr(null);
    encodeApi.preview(spec, baseName(t.src), t.ff ?? t.tid, t.channels, t.bits, t.rate).then((r) => { if (alive) setPlan(r); }, (e) => { if (alive) { setPlan(null); setPlanErr(String(e)); } });
    return () => { alive = false; };
  }, [spec, t.src, t.ff, t.tid, t.channels, t.bits, t.rate]);

  // ขนาดที่คาด · ความยาวหลังเปลี่ยนความเร็ว ช่องกับอัตราสุ่มของไฟล์ใหม่ ความลึกบิตที่ตัวแปลงได้รับ
  const ctxOf = (v: Vals): SizeCtx | null => {
    if (!t.duration) return null;
    const sp = speed ? speed.split(">").map(Number) : null;
    let ch = v.channels && v.channels !== "src" ? Number(v.channels) : srcCh ?? 2;
    if (c.id === "mp3") ch = v.stereo === "Mono" ? 1 : Math.min(2, ch);
    if (c.id === "ac3") ch = Math.min(6, ch);
    const bits = v.bits && v.bits !== "src" ? Number(v.bits) : t.bits && t.bits <= 16 ? 16 : 24;
    return { secs: t.duration * (sp ? sp[0] / sp[1] : 1), ch, rate: v.rate && v.rate !== "src" ? Number(v.rate) : t.rate ?? 48000, bits };
  };
  const ctx = ctxOf(live);
  const formulaBytes = ctx ? advSize(c.id, engUse, live, ctx) : null;
  // ขนาดที่คาดจากการลองแปลงจริง 4 ช่วง ช่วงละ 10 วินาที แล้วคูณขยาย (BUGS ข้อ 120 · เดิมสูตรเสียงดิบคูณเปอร์เซ็นต์ตายตัวคลาดได้ 19 จุด)
  // รอครึ่งวินาทีหลังเปลี่ยนค่า กดเปลี่ยนรัว ๆ ไม่ลองแปลงทุกครั้ง · ลองแปลงไม่ได้ (ไม่มีตัวแปลง) ใช้ตัวเลขจากสูตรต่อ
  const probeKey = JSON.stringify([t.src, t.ff ?? t.tid, spec]);
  const [probe, setProbe] = useState<{ key: string; bytes: number; cover: number } | null>(null);
  useEffect(() => {
    if (!inApp || !t.duration || !t.src) return;
    let alive = true;
    const tm = setTimeout(() => {
      convertApi.sizeProbe(t.src, t.ff ?? t.tid, spec, t.channels, t.bits, t.rate, t.duration!, !!p.convertPage)
        .then((r) => { if (alive) setProbe({ key: probeKey, bytes: r.bytes, cover: r.cover }); }, () => {});
    }, 500);
    return () => { alive = false; clearTimeout(tm); };
  }, [probeKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const probed = probe && probe.key === probeKey ? probe : null;
  // ระหว่างรอ ต้นทางกับปลายทางไม่เสียคุณภาพทั้งคู่และรูปแบบเสียงเท่าเดิม คิดจากขนาดเสียงของต้นทางจริงคูณสัดส่วนระดับ (สูตร ① ผลเทสใน ROADMAP)
  const srcAudio = t.bitrate && t.duration ? (t.bitrate * t.duration) / 8 : t.bytes ?? null;
  const sameFmt = !!ctx && ctx.ch === (srcCh ?? 2) && ctx.rate === (t.rate ?? ctx.rate) && (!t.bits || ctx.bits === (t.bits <= 16 ? 16 : 24)) && !speed;
  const rawBytes = ctx ? (ctx.secs * ctx.rate * ctx.bits * ctx.ch) / 8 : 0;
  const est1 = srcAudio && formulaBytes && rawBytes && c.lossless && isLossless(ftName("audio", t.codec, t.profile)) && sameFmt ? (srcAudio * formulaBytes) / (rawBytes * 0.55) : null;
  const headAudio = probed ? probed.bytes : est1 ?? formulaBytes;
  const headBytes = headAudio != null ? headAudio + (probed && p.convertPage ? probed.cover : 0) : null;
  // การ์ดชุดค่ากับการ์ดขั้นสูงคูณอัตราส่วนของผลลองแปลงจริงต่อสูตร การ์ดของค่าที่เลือกขึ้นเท่าหัวแผง ไม่ขึ้นสองตัวเลขสำหรับค่าตั้งเดียวกัน
  // ชุดอื่นใช้อัตราส่วนเดียวกัน เพราะบีบยากหรือง่ายมาจากเนื้อเสียงของไฟล์ (เจอตอนประเมินภาพชุด BUGS ข้อ 113 ถึง 121 หัวแผง 3.79 MB การ์ดเล็กสุด 4.01 MB)
  const sizeFix = headAudio && formulaBytes ? headAudio / formulaBytes : 1;

  const srcFt = ftName("audio", t.codec, t.profile);
  const srcLossless = isLossless(srcFt);
  // ไฟล์ใหญ่ขึ้นกี่เท่า บอกในคำเตือนแปลงจากแบบเสียคุณภาพเป็นแบบไม่เสียคุณภาพ (BUGS ข้อ 120 เพื่อนแคลร์เสนอ "ไฟล์จะใหญ่ขึ้นราว 6 เท่า แต่เสียงไม่ดีขึ้น")
  // ตัวเลขมีตั้งแต่เปิดแผง (จากสูตร) ผลลองแปลงมาแทนทีหลัง ความยาวข้อความเท่าเดิม กล่องเตือนไม่สูงขึ้น
  const upTimes = t.bytes && headBytes && headBytes / t.bytes >= 1.5 ? Math.round(headBytes / t.bytes) : null;
  const warn = !t.codec ? null : !srcLossless && !c.lossless ? `ต้นทาง ${srcFt} เป็นแบบเสียคุณภาพ การแปลงเป็น ${c.name} เป็นการเสียคุณภาพซ้อน เสียงจะต่างจากต้นฉบับมากขึ้น`
    : !srcLossless && c.lossless ? `ต้นทาง ${srcFt} เป็นแบบเสียคุณภาพ การแปลงเป็น ${c.name} ทำให้ไฟล์ใหญ่ขึ้น${upTimes ? `ราว ${upTimes} เท่า` : ""} แต่คุณภาพเสียงไม่ดีขึ้น` : null;
  const name = `${t.name || ""} ${c.name}`.trim();
  // การ์ดเทียบต้นฉบับกับไฟล์ที่จะได้ แถวที่เปลี่ยนเน้นสี (พี่กันสั่ง 11 พ.ย. 2569 "อยากให้มันเป้นการ์ด … เทียบต้นฉบับกับตัวที่กำลังจะแปลง ว่าอะไรเปลี่ยน")
  const { ch: outCh, rate: outRate, bits: outBits } = outFormat(c.id, engUse, live, { ch: srcCh ?? 2, rate: t.rate ?? null, bits: t.bits ?? null });
  const outSecs = t.duration ? t.duration * (speed ? Number(speed.split(">")[0]) / Number(speed.split(">")[1]) : 1) : null;
  const outKbps = headAudio && outSecs ? headAudio * 8 / outSecs / 1000 : null;
  const chTxt = (n: number | null | undefined) => (n ? (n === 1 ? "โมโน" : n === 2 ? "2.0 ch" : n === 6 ? "5.1 ch" : n === 8 ? "7.1 ch" : `${n} ช่อง`) : "—");
  const khz = (r: number | null | undefined) => (r ? `${+(r / 1000).toFixed(1)} kHz` : "—");
  const kbps = (k: number | null | undefined) => (k ? `${Math.round(k).toLocaleString("en-US")} kbps` : "—");
  const mins = (x: number | null | undefined) => (x ? `${Math.floor(x / 60)}:${String(Math.round(x % 60)).padStart(2, "0")}` : "—");
  const cols: { k: string; a: string; b: string; approx?: boolean }[] = [
    { k: "ชนิด", a: srcFt || "—", b: c.name },
    { k: "ช่อง", a: chTxt(srcCh), b: chTxt(outCh) },
    { k: "อัตราสุ่ม", a: khz(t.rate), b: khz(outRate) },
    { k: "บิต", a: srcLossless && t.bits ? `${t.bits}-bit` : "—", b: outBits ? `${outBits}-bit` : "—" },
    { k: "บิตเรต", a: kbps(t.bitrate ? t.bitrate / 1000 : null), b: kbps(outKbps), approx: true },
    { k: "ขนาด", a: t.bytes ? fmtSize(t.bytes) : "—", b: headBytes ? fmtSize(headBytes) : "—", approx: true },
    { k: "ความยาว", a: mins(t.duration), b: mins(outSecs) },
  ];
  const sizePct = t.bytes && headBytes ? Math.round((headBytes / t.bytes - 1) * 100) : null;

  const apply = () => {
    if (blocked) return;
    saveLast(c.id, { eng, vals, tab });
    p.onApply(spec, pair, pair && t.inMovie ? name : "");
  };
  return { ctxOf, ctx, formulaBytes, probeKey, probe, setProbe, probed, srcAudio, sameFmt, rawBytes, est1, headAudio, headBytes, sizeFix, srcFt, srcLossless, upTimes, warn, name, outCh, outRate, outBits, outSecs, outKbps, chTxt, khz, kbps, mins, cols, sizePct, apply };
}
