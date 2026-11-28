/* หน้ากราฟเสียงแบบที่ยังไม่เห็นกราฟ เทียบสองไฟล์ แปลงเสียง และยังไม่เลือกไฟล์
   แยกจาก GraphPage.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 4) เนื้อโค้ดยกมาทั้งก้อน */
import { AUDIO_EXT, thumbUrl } from "../../lib/api";
import ConvertPane from "./ConvertPane";
import { RecentMenu } from "./graphMenus";
import { addFiles } from "../../lib/convertJob";
import { chText, dropClick } from "../../components/ui";
import { IcFile } from "../../components/icons";
import { tfmt } from "./common";
import { CompareView } from "./CompareView";
import type { B1 } from "./graphCtx";

export function cmpView({ pg }: { pg: B1 }) {
  const { openSingle, setCmp, setCmpBack, setMode, tagDlg } = pg;
  const cmp = pg.cmp!;
    return (<>
      <CompareView key={JSON.stringify(cmp.tracks ?? {})} files={cmp.files} tracks={cmp.tracks} note={cmp.note} free={cmp.free} onFiles={(files, freed) => setCmp(freed ? { files, free: true, tracks: cmp.tracks } : { ...cmp, files })} onSingle={(p) => { setCmpBack(cmp); setCmp(null); setMode("graph"); openSingle(p, cmp.tracks?.[p] ?? 0); }} onBack={() => { const a = cmp.files[0], free = cmp.free; setCmp(null); if (free) { setMode("graph"); openSingle(a, cmp.tracks?.[a] ?? 0); } else setMode("convert"); }} onClose={() => { const a = cmp.files[0]; setCmp(null); setMode("graph"); openSingle(a, cmp.tracks?.[a] ?? 0); }} />
      {tagDlg}
    </>);
}


export function convertView({ pg }: { pg: B1 }) {
  const { modeSeg, setCmp, setTagFor, tagDlg, setMode, setPath } = pg;
    return (
      <div className="ag" data-graph data-graphmode="convert">
        <div className="gmodebar">{modeSeg}<span className="small">แปลงไฟล์เสียงอย่างเดียว ไม่รวมเข้าหนัง และไฟล์เดิมไม่ถูกแก้</span></div>
        <ConvertPane onCompare={(a, b, note, tr) => setCmp({ files: [a, b], note, tracks: tr ? { [a]: tr } : undefined })} onTags={setTagFor} onOpen={(path) => { setMode("graph"); setPath(path); }} />
        {tagDlg}
      </div>
    );
}


export function startView({ pg }: { pg: B1 }) {
  const { forget, gone, modeSeg, movies, openOther, recent, setPath, recentMenu, onBitrate, setMode, toast } = pg;
  const rm = recentMenu.at;
    const shelfPicks = movies.filter((m) => !m.missing && m.audio.length).slice(0, 6);
    // ไอคอนแถบฟิล์มของไฟล์หนังที่ไม่มีปก · ป้ายนามสกุลเด่นแบบเดียวกับกล่องไอคอน (พี่กันสั่ง 9 พ.ย. 2569 "ใส่นามสกุลไฟล์หน่อย เป็นการ์ดเด่น ๆ เหมือน icon โน้ตดนตรี" · "ขอ icon ที่บ่งบอกว่าเป็นวิดีโอหน่อย")
    const film = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 3v18M16 3v18M4 8h4M4 12h4M4 16h4M16 8h4M16 12h4M16 16h4" /></svg>;
    const extCard = (p: string) => { const e = p.match(/\.([^.\\/]+)$/)?.[1]; return e ? <span className="rext" data-graphext>{e.toUpperCase()}</span> : null; };
    const music = <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M9 18V5l11-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="17" cy="16" r="3" /></svg>;
    return (
      <div className="ag" data-graph>
        <div className="gmodebar">{modeSeg}<span className="small">ดูกราฟเสียงทีละไฟล์ หรือแปลงเสียงเป็นคิวแล้วเทียบความถี่ก่อนกับหลังแปลง</span></div>
        <div className="drop" style={{ minHeight: 180 }} data-graphdrop onClick={dropClick(openOther)}>
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#e5a3bd" strokeWidth="1.8" aria-hidden="true"><path d="M3 12h2M7 7v10M11 4v16M15 8v8M19 10v4" /></svg>
          <b style={{ color: "var(--txt2)" }}>ลากไฟล์หนังหรือไฟล์เสียงมาวางตรงนี้</b><span>หรือ</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={openOther}><IcFile size={15} />เลือกไฟล์จากเครื่อง</button>
          <span className="small">รับไฟล์หนังทุกชนิดในชั้นวาง และไฟล์เสียง {AUDIO_EXT.map((e) => e.toUpperCase()).join(" ")}</span>
        </div>
        {recent.length > 0 && <><div className="small">เปิดล่าสุด กดเพื่อดูกราฟอีกครั้ง และกดปุ่มกากบาทเพื่อเอาออกจากรายการ ไฟล์ในเครื่องไม่ถูกแตะ</div>
          <div className="graph-recent" data-graphrecent>{recent.map((r) => {
            const mv = movies.find((m) => m.path.toLowerCase() === r.path.toLowerCase());
            const lost = gone.has(r.path);
            return (
              <div key={r.path} className={"recentrow" + (lost ? " lost" : "")} onContextMenu={(e) => recentMenu.open(e, r)} data-recentrow={r.name}>
                <button type="button" className="dd" aria-disabled={lost || undefined} onClick={() => { if (!lost) setPath(r.path); }} data-graphrecentpick={r.name} data-lost={lost || undefined} title={lost ? `หาไฟล์ไม่เจอ ไฟล์อาจถูกย้ายหรือลบ หรือไดรฟ์ถอดออกอยู่\n${r.path}` : r.path}>
                  <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: "1 1 auto", overflow: "hidden" }}>
                    <span className="rtype">{r.audioOnly ? <i className="rnote">{music}</i> : (mv?.thumb ?? mv?.linked?.[0]?.thumb) ? <img src={thumbUrl(mv?.thumb ?? mv?.linked?.[0]?.thumb ?? null) ?? ""} alt="" style={{ width: 18, height: 27, borderRadius: 3, objectFit: "cover" }} /> : <i className="rnote" data-graphfilm>{film}</i>}{extCard(r.name)}</span>
                    <span style={{ whiteSpace: "nowrap", minWidth: 0 }}>{r.name.replace(/\.[^.]+$/, "")}</span></span>
                  {/* ข้อความขวาไม่หด ชื่อยาวตัดเป็นสามจุดแทน (เดิมเวลาโดนตัดเหลือ 5:1 เจอตอนตรวจภาพ) */}
                  {lost
                    ? <span className="small lostmark" style={{ flex: "none" }}>หาไฟล์ไม่เจอ</span>
                    : <span className="small" style={{ flex: "none" }}>{(r.layout ? "เสียง " + chText(r.layout) + " " : "") + "ยาว " + tfmt(r.duration)}</span>}
                </button>
                <button type="button" className="rmx" onClick={() => forget(r.path)} aria-label={`เอา ${r.name} ออกจากรายการเปิดล่าสุด`} title="เอาออกจากรายการ ไฟล์ในเครื่องไม่ถูกแตะ" data-graphforget={r.name}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
                </button>
              </div>
            );
          })}</div></>}
        {rm && <RecentMenu r={rm.v} lost={gone.has(rm.v.path)} x={rm.x} y={rm.y} onClose={recentMenu.close} toast={toast}
          open={() => setPath(rm.v.path)} bitrate={onBitrate ? () => onBitrate(rm.v.path) : undefined}
          convert={() => { addFiles([rm.v.path], true); setMode("convert"); }} forget={() => forget(rm.v.path)} />}
        {shelfPicks.length > 0 && <><div className="small">หรือเลือกจากชั้นวาง</div>
          <div className="graph-recent">{shelfPicks.map((m) => (
            <button key={m.id} type="button" className="dd" onClick={() => setPath(m.path)} data-graphpick={m.name}>
              <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: "1 1 auto", overflow: "hidden" }}><span className="rtype">{(m.thumb ?? m.linked?.[0]?.thumb) ? <img src={thumbUrl(m.thumb ?? m.linked?.[0]?.thumb ?? null) ?? ""} alt="" style={{ width: 18, height: 27, borderRadius: 3, objectFit: "cover" }} /> : <i className="rnote" data-graphfilm>{film}</i>}{extCard(m.path)}</span><span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{m.name.replace(/\.[^.]+$/, "")}</span></span>
              <span className="small">{m.audio.length ? "เสียง " + [...new Set(m.audio.map((a) => chText(a.layout)))].join(", ") : ""}</span>
            </button>))}</div></>}
      </div>
    );
}
