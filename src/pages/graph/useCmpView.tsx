/* จับลาก PSD ของทุกไฟล์ บันทึกรูป เล่น หัวหน้า แถบตัวเลือก และแผงซ้าย
   แยกจาก CompareView.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 7) เนื้อโค้ดยกมาทั้งก้อน */
import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { GRAPH_IMG_DEFAULT, checkApi, graphApi, type GInfo, type GPsd, type GTrack, type GWindow } from "../../lib/api";
import { CardIcon, Phr, chText } from "../../components/ui";
import { fmtSize } from "../../lib/format";
import { type DiffResult } from "../../lib/graphDiff";
import { IcExpand, IcPlus, IcClose } from "../../components/icons";
import { CMP_VIEWS, VIEW_ICON, memPut, tfmt } from "./common";
import { alphaOf, imgName, imgTarget, screenK, waitPaint, withHeader } from "./draw";
import { Speakers, useGrab } from "./parts";
import { PSD_HZ_MAX, PSM } from "./PsdView";
import { FILE_C, FILE_INK, Fragment3, FragmentInfo, MAX_FILES, TH_A, TH_FILE, composeAll, khz } from "./compareParts";
import { LABELS, CONV, Who } from "./cmpLabels";
import type { K0 } from "./cmpCtx";

export function useCmpView(c: K0) {
  const { NM, S, T, addFile, allTxt, common, diffs, dur, files, filesKey, free, hidden, hrPsd, lenDiff, lens, n, nameOf, note, onBack, onClose, onFiles, onSingle, panT, plotRef, psdCh, psdSpan, ready, setPsd, setSpan, setWide, settings, span, switchTab, t0, t1, tab, toast, toggleCh, trOf, union, vrNow, wide } = c;
  const isPsd = tab === "psd", isLanes = tab === "wave" || tab === "spec";
  const cmpGrab = useGrab({
    canX: isPsd ? hrPsd.z > 1 : span < dur - 0.01, canY: !!vrNow && vrNow.z > 1,
    span: isPsd ? 1 / hrPsd.z : span, center: isPsd ? hrPsd.b + 0.5 / hrPsd.z : (t0 + t1) / 2,
    z: vrNow?.z ?? 1, b: vrNow?.b ?? 0,
    left: isLanes ? 96 : tab === "spek" ? 62 : isPsd ? PSM.L : 44, right: isLanes ? 0 : tab === "spek" ? 86 : isPsd ? PSM.R : 4,
    top: tab === "spek" ? 46 : isPsd ? PSM.T : isLanes ? 0 : 12, bottom: tab === "spek" ? 28 : isPsd ? PSM.B : isLanes ? 0 : 12,
    onX: isPsd ? (c) => hrPsd.setB(hrPsd.clampB(c - 0.5 / hrPsd.z, hrPsd.z)) : panT,
    onY: (y) => { if (vrNow) vrNow.setB(vrNow.clampB(y, vrNow.z)); },
  });
  // Ctrl หมุนล้อ ซูมเข้าออกตามแกนนอน
  useEffect(() => {
    const el = plotRef.current; if (!el) return;
    const fn = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      if (isPsd) hrPsd.setZ(Math.max(1, Math.min(PSD_HZ_MAX, hrPsd.z * (e.deltaY < 0 ? 1.5 : 1 / 1.5))));
      else setSpan(span * (e.deltaY < 0 ? 0.5 : 2));
    };
    el.addEventListener("wheel", fn, { passive: false });
    return () => el.removeEventListener("wheel", fn);
  });
  const psdMem = useRef(new Map<string, GPsd>());
  // ความถี่เฉลี่ย ทีละไฟล์ (คำขอใหม่หยุดคำขอเก่าที่ฝั่ง Rust) · จำผลแยกไฟล์ เพิ่มไฟล์แล้วคิดเฉพาะไฟล์ใหม่
  const psdT = psdSpan === "all" ? [0, dur] : [Math.max(0, (t0 + t1) / 2 - psdSpan / 2), Math.min(dur, (t0 + t1) / 2 + psdSpan / 2)];
  const psdKey = `${filesKey}|${psdCh}|${psdT[0].toFixed(2)}|${psdT[1].toFixed(2)}`;
  useEffect(() => {
    if (tab !== "psd" || !ready) return;
    let live = true;
    const series = (names: string[]) => {
      if (psdCh !== "mix" && names.includes(psdCh)) return [[names.indexOf(psdCh)]];
      const base = names.map((_, i) => i).filter((i) => names[i] !== "LFE");
      return [base.length ? base : [0]];
    };
    (async () => {
      try {
        // ช่องความถี่กว้างเท่ากันทุกไฟล์ · เดิมใช้ 4096 ทุกไฟล์ ไฟล์ 96 kHz ช่องกว้าง 23.4 Hz ไฟล์ 48 kHz กว้าง 11.7 Hz
        // ค่าต่อช่องของเสียงรบกวนต่างกัน 3 dB ทั้งเส้น และยอดเสียงแหลมคมไม่เท่ากัน เส้นหลังแปลงต่ำกว่าต้นฉบับทั้งที่เสียงเดียวกัน (เจอตอนตรวจภาพ)
        const top = Math.max(...T.map((t) => t!.rate)), sz = (r: number) => Math.max(1024, 2 ** Math.round(Math.log2(4096 * r / top)));
        const list: GPsd[] = [];
        for (let i = 0; i < n; i++) {
          const end = Math.min(psdT[1], S[i].ov!.duration), size = sz(T[i]!.rate), mem = `${files[i]}|${psdCh}|${psdT[0].toFixed(2)}|${end.toFixed(2)}|${size}`;
          let p = psdMem.current.get(mem) ?? null;
          if (!p) { p = await graphApi.psd(files[i], trOf(files[i]), psdT[0], end, series(NM[i]), size, null); if (!live || !p) return; memPut(psdMem.current, mem, p, 24); }
          list.push(p);
        }
        if (live) setPsd({ key: psdKey, list });
      } catch (e) { if (live) toast({ kind: "bad", title: "คิดความถี่เฉลี่ยไม่ได้", detail: String(e) }); }
    })();
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, ready, psdKey]);

  // อ่านเสียงช่วงที่ดูของทุกไฟล์ที่ความละเอียดของรูปก่อนวาด (แบบเดียวกับหน้าหลัก)
  const [saving, setSaving] = useState(false);
  const [hiC, setHiC] = useState<Record<string, GWindow>>({});
  const saveImage = async () => {
    if (saving) return;
    const o = settings?.graphImg ?? GRAPH_IMG_DEFAULT;
    const base = (p: string) => nameOf(p).replace(/\.[^.]+$/, ""), vName = CMP_VIEWS.find(([k]) => k === tab)?.[1] ?? "กราฟเสียง";
    const where = await imgTarget(files[0], imgName(base(files[0]) + " เทียบ " + base(files[1]) + (n > 2 ? " และอีก " + (n - 2) + " ไฟล์" : ""), vName, o), o); if (!where) return;
    setSaving(true);
    try {
      await waitPaint();
      if (tab !== "loud" && tab !== "psd") {
        const got: Record<string, GWindow> = {}, cols = Math.min(8192, o.width || Math.round((plotRef.current?.clientWidth ?? 1000) * screenK()));
        for (let i = 0; i < n; i++) {
          const end = Math.min(t1, S[i].ov?.duration ?? t1);
          if (end <= t0) continue;
          const w = await graphApi.window(files[i], trOf(files[i]), t0, end, cols, 512, false, true);
          if (!w) throw new Error("การอ่านถูกยกเลิก");
          got[files[i]] = w;
        }
        flushSync(() => setHiC(got));
      }
      let cv = composeAll(plotRef.current, o.width);
      if (!cv) throw new Error("ยังไม่มีกราฟให้บันทึก");
      if (o.title) cv = withHeader(cv, vName + " เทียบ " + n + " ไฟล์", files.map((p, i) => LABELS[i] + " " + nameOf(p)).join("   "), files.map((_, i) => [LABELS[i], FILE_C[i]] as [string, string]));
      await waitPaint();
      const saved = await graphApi.saveImage(where, alphaOf(cv, o).toDataURL("image/png"), o);
      toast({ kind: "ok", title: "บันทึกรูปแล้ว " + saved.width.toLocaleString("en-US") + " × " + saved.height.toLocaleString("en-US") + " ขนาด " + fmtSize(saved.size), detail: saved.path });
    } catch (e) { toast({ kind: "bad", title: "บันทึกรูปไม่ได้", detail: e instanceof Error ? e.message : String(e) }); }
    finally { setHiC({}); setSaving(false); }
  };
  // เปิดเล่นจากต้นช่วงที่ดู ทั้งไฟล์คือ 0:00 ซูมอยู่คือขอบซ้ายของกราฟ (พี่กันสั่ง 9 พ.ย. 2569 "แก้ไป ใครบ้าจะกดฟังกลางเพลง")
  const playFrom = t0;
  const play = async (p: string) => {
    try { const r = await checkApi.playAt(p, playFrom); toast({ kind: r.seeked ? "ok" : "warn", title: r.seeked ? `เปิดด้วย ${r.player} ที่ ${tfmt(playFrom)}` : "เปิดแล้ว แต่เปิดตรงนาทีไม่ได้", detail: r.seeked ? undefined : `เลื่อนไปที่ ${tfmt(playFrom)} เอง` }); }
    catch (e) { toast({ kind: "bad", title: "เปิดเล่นไม่ได้", detail: String(e) }); }
  };

  const chip = (i: number) => {
    const p = files[i], s = S[i], nm = nameOf(p), k = "abcd"[i];
    return (
      <div key={p} className="fchip cmpchip" role="button" tabIndex={0} title="ดูกราฟเดี่ยวของไฟล์นี้" onClick={() => onSingle(p)} onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onSingle(p); } }} style={{ boxShadow: `inset 4px 0 0 ${FILE_C[i]}` }} data-cmpfile={k}>
        <div className="fnote" style={{ background: TH_FILE[i].lane, color: FILE_INK[i], border: `1px solid ${TH_FILE[i].peak}` }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M9 18V5l11-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="17" cy="16" r="3" /></svg></div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="nm"><span className="nmtx">{nm.replace(/\.[^.]+$/, "")}</span>{/\.[^.]+$/.test(nm) && <span className="extcard" style={{ background: FILE_INK[i] }} data-cmpext={k}>{nm.match(/\.([^.]+)$/)?.[1].toUpperCase()}</span>}<Who i={i} /></div>
          <div className="meta">{s.info ? `${s.info.audioOnly ? "ไฟล์เสียง" : "ไฟล์หนัง"} ${fmtSize(s.info.size)} ยาว ${tfmt(s.info.duration)}${i === 1 && note ? " แปลงเมื่อสักครู่" : ""}${s.info.tracks.length > 1 && T[i] ? ` เสียง ${T[i]!.index + 1}${T[i]!.lang ? " " + T[i]!.lang : ""}` : ""}` : s.err ? "อ่านไม่ได้" : "กำลังอ่านข้อมูลไฟล์"}</div>
        </div>
        {n > 2 && <button type="button" className="rmx" aria-label={`เอา ${nm} ออกจากการเทียบ`} title="เอาออกจากการเทียบ ไฟล์ในเครื่องไม่ถูกแตะ" onClick={(e) => { e.stopPropagation(); onFiles(files.filter((x) => x !== p), true); }} data-cmpremove={k}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg></button>}
      </div>
    );
  };
  const head = (
    <div className="agtop">
      <button type="button" className="btn btn-ghost" onClick={() => { if (!ready) void graphApi.cancel(); onBack(); }} data-cmpback><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>{free ? "กลับกราฟ" : "คิวแปลง"}</button>
      {files.map((_, i) => chip(i))}
      {n < MAX_FILES && <button type="button" className="btn btn-ghost" onClick={addFile} title={`เพิ่มไฟล์มาเทียบ ได้สูงสุด ${MAX_FILES} ไฟล์`} data-cmpadd><IcPlus />เพิ่มไฟล์</button>}
      {!free && <button type="button" className="btn btn-ghost" onClick={onClose} title="เปิดต้นฉบับในหน้ากราฟเสียงแบบไฟล์เดียว" data-cmpclose><IcClose size={15} />ปิดการเทียบ</button>}
    </div>
  );
  const fileLg = <>{files.map((p, i) => <span key={p}><span className="ln" style={{ background: FILE_C[i] }} />{LABELS[i]}</span>)}</>;
  const ctl = (
    <div className="agctl">
      <div className="seg agviews">{CMP_VIEWS.map(([k, l]) => <button key={k} type="button" className={tab === k ? "on" : ""} onClick={() => switchTab(k)} data-cmptab={k} disabled={k === "cmp" && !common.length}
        title={k === "cmp" && !common.length ? `${allTxt}ไม่มีช่องเสียงที่ตรงกัน` : undefined}>{VIEW_ICON[k]}{l}</button>)}</div>
      <div className="lg" style={{ marginLeft: "auto" }}>{fileLg}</div>
      <button type="button" className={"btn btn-ghost btn-sm" + (wide ? " pressed" : "")} style={{ width: 32, padding: 0, flex: "none" }} aria-pressed={wide} title={wide ? "แสดงแผงลำโพง" : "ขยายเต็มจอ"} aria-label={wide ? "แสดงแผงลำโพง" : "ขยายเต็มจอ"} onClick={() => setWide(!wide)} data-graphwide><IcExpand size={14} /></button>
    </div>
  );
  const infoRow = (t: GTrack | undefined, info: GInfo | null) => t && info ? [t.codec, chText(t.layout), `${khz(t.rate)} kHz`, t.bits ? `${t.bits}-bit` : "—", t.bitrate ? `${Math.round(t.bitrate / 1000).toLocaleString("en-US")} kb/s` : "—", fmtSize(info.size), tfmt(info.duration)] : null;
  const infos = S.map((s, i) => infoRow(T[i], s.info));
  const diffRows: [string, string, (d: DiffResult) => number, string[]][] = [["wave", "รูปคลื่น", (d) => d.wave, ["wave"]], ["spec", "ความถี่", (d) => d.spec, ["spec", "spek"]], ["loud", "ความดัง", (d) => d.loud, ["loud"]], ["cmp", "ซ้อนเทียบ", (d) => d.cmp, ["cmp"]], ["psd", "ความถี่เฉลี่ย", (d) => d.psd, ["psd"]]];
  const others0 = files.map((_, i) => i).slice(1);
  const sizeTxt = (i: number, long: boolean) => {
    const a = S[0].info?.size ?? 0, b = S[i].info?.size ?? 0;
    if (!a || !b) return "—";
    if (a === b) return "เท่ากัน";
    const pct = Math.abs(b - a) / a * 100, p = pct < 0.1 ? "ไม่ถึง 0.1%" : pct.toFixed(1) + "%";
    return long ? `${b < a ? "เล็กกว่า" : "ใหญ่กว่า"} ${p} หรือ ${fmtSize(Math.abs(b - a))}` : (b < a ? "−" : "+") + p;
  };
  const panel = (
    <div className="apanel">
      <div className="card"><h3><span>ช่องเสียง {chText(T[0]?.layout)}</span><span className="small" style={{ color: "var(--txt3)" }}>{union.length} ช่อง</span></h3>
        {NM[0].length > 0 && <Speakers names={union} th={TH_A} levels={union.map(() => 0.3)} hidden={hidden} onToggle={toggleCh} />}
        <div className="small" style={{ textAlign: "center", marginTop: 4 }}>{union.length > 1 ? <Phr>{`กดลำโพงเพื่อปิดหรือเปิดช่องนั้นของ${n === 2 ? "ทั้งสองไฟล์" : allTxt}พร้อมกัน`}</Phr> : "ไฟล์นี้มีเสียงช่องเดียว"}</div>
        {T.every(Boolean) && NM.some((x) => x.join() !== NM[0].join()) && <div className="small" style={{ marginTop: 4 }}>ช่องเสียงไม่เท่ากัน {T.map((t, i) => `${LABELS[i]} ${t!.layout}`).join(" ")}</div>}</div>
      {diffs && <div className="card gdiff" data-cmpdiff>
        {n === 2
          ? <><h3><span>ต่างกันกี่ %</span><b data-cmpdiffall title="ค่าเฉลี่ยของทุกกราฟ">{diffs[0].overall.toFixed(1)}%</b></h3>
            {diffRows.map(([k, l, get, on]) => { const v = get(diffs[0]); return <div key={k} className={"row" + (on.includes(tab) ? " on" : "")} data-cmpdiffrow={k}><span>{l}</span><i><u style={{ width: Math.max(0, Math.min(100, v)) + "%" }} /></i><em>{v.toFixed(1)}%</em></div>; })}
            <div className="sizerow" data-cmpdiffsize title={`ขนาด${LABELS[1]}เทียบกับ${LABELS[0]} ไม่นับรวมในเปอร์เซ็นต์ด้านบน`}><span>ขนาดไฟล์</span><em><Phr>{sizeTxt(1, true)}</Phr></em></div></>
          : <><h3><span>ต่างจาก{LABELS[0]}กี่ %</span></h3>
            <div className="gdiffgrid" style={{ gridTemplateColumns: `minmax(0, 1fr) repeat(${n - 1}, auto)` }}>
              <span />{diffs.map((_, k) => <span key={k} className="h" style={{ color: FILE_INK[k + 1] }}>{LABELS[k + 1]}</span>)}
              <span className="all">รวม</span>{diffs.map((d, k) => <b key={k} data-cmpdiffall={k}>{d.overall.toFixed(1)}%</b>)}
              {diffRows.map(([k, l, get, on]) => { const cls = on.includes(tab) ? "on" : ""; return <Fragment3 key={k} cls={cls} k={k} l={l} vals={diffs.map((d) => get(d).toFixed(1) + "%")} />; })}
              <Fragment3 cls="" k="size" l="ขนาดไฟล์" vals={others0.map((i) => sizeTxt(i, false))} />
            </div></>}
        <div className="gdiffnote" title={`ผลต่าง 60 dB คิดเป็น 100% และ 0% ไม่ได้แปลว่าเหมือนทุกบิต เพราะคิดจากข้อมูลภาพรวม${diffs.some((d) => d.lenDiff) ? " ไฟล์ยาวไม่เท่ากัน จึงเทียบเท่าช่วงที่มีทั้งคู่" : ""}`}><Phr>{"ผลต่าง 60 dB คิดเป็น 100%\nและ 0% ไม่ได้แปลว่าเหมือนทุกบิต"}</Phr></div></div>}
      <div className="card"><h3>ข้อมูลเสียง</h3>
        <div className="ginfo" style={{ gridTemplateColumns: `auto repeat(${n}, auto)` }} data-cmpinfo><span />{files.map((p, i) => <span key={p} className="h" style={{ color: FILE_INK[i] }}>{LABELS[i]}</span>)}
          {["รหัสเสียง", "ช่องเสียง", "อัตราสุ่ม", "ความละเอียด", "บิตเรต", "ขนาด", "ความยาว"].map((k, r) => <FragmentInfo key={k} k={k} vals={infos.map((x) => x?.[r] ?? "…")} />)}</div>
        {note && <div className="small" style={{ marginTop: 8 }}><Phr>{note}</Phr></div>}</div>
      {lenDiff && <div className="stat warn" data-cmplen><CardIcon kind="warn" /><div><b>{`${allTxt}ยาวไม่เท่ากัน ${lens.map(tfmt).join(" กับ ")}`}</b><Phr>{CONV ? "น่าจะตั้งความเร็วเสียงตอนแปลง จึงเทียบรูปคลื่น ความดัง และซ้อนเทียบตามเวลาตรง ๆ ไม่ได้ ให้ดูความถี่เฉลี่ยกับกราฟความถี่แทน" : "กราฟเรียงจากต้นไฟล์ตามเวลา ไฟล์ที่สั้นกว่าจึงจบก่อน"}</Phr></div></div>}
    </div>
  );

  return { isPsd, isLanes, cmpGrab, psdMem, psdT, psdKey, saving, setSaving, hiC, setHiC, saveImage, playFrom, play, chip, head, fileLg, ctl, infoRow, infos, diffRows, others0, sizeTxt, panel };
}
