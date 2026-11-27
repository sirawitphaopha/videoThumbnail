/* หัวข้อบรรทัดโค้ดในหน้าตั้งค่า ไว้ดูเล่นว่าแต่ละรุ่นโค้ดโตขึ้นเท่าไหร่ (BUGS ข้อ 160 · docs/PLAN-2026-11-27-นับบรรทัด.md)
   ตัวเลขสรุป ตัวกรอง กราฟทุก commit และตารางทุกรุ่น · ข้อมูลอยู่ lineData คำนวณอยู่ lineCalc กราฟอยู่ LineChart ตัวกรองอยู่ useLineFilter */
import InfoTip from "../../../components/InfoTip";
import { Seg } from "../../../components/ui";
import type { SetOpen } from "../setCtx";
import LineChart from "./LineChart";
import { thDate } from "./LineChart";
import { KIND_NAMES, STATS, darkBg, groupColor, kindColor, shownVer, type GroupId } from "./lineData";
import { cntOf, filesOf, fmt, kindsOf, signed, totalOf, versionRows } from "./lineCalc";
import { KINDS_TIP, LINES_TIP } from "./lineTips";
import { useLineFilter, type Preset } from "./useLineFilter";

export default function SetLines({ pg }: { pg: SetOpen }) {
  const { sec } = pg;
  const st = STATS?.ok && STATS.points.length ? STATS : null;
  const f = useLineFilter(st?.groups ?? []);
  // data-keepcolor ตัวแปลงโทนไม่เปลี่ยนสีกลุ่มที่เขียนในโค้ด (สีเป็นเนื้อหาของกราฟ มีชุดของพื้นมืดเอง) ส่วนพื้นกับปุ่มยังตามโทนผ่านตัวแปร
  return (
    <div className="setcard" data-setcard="lines" data-keepcolor hidden={sec !== "lines"}>
      <h3>บรรทัดโค้ด <InfoTip title="บรรทัดโค้ดนับอะไรบ้าง" tip={LINES_TIP} /></h3>
      <div className="small" style={{ marginBottom: 12 }}>ทุกบรรทัดของโปรแกรมชั้นหนัง นับเองทุกครั้งที่สร้างโปรแกรม ย้อนไปถึงวันแรกที่เริ่มเขียน</div>
      {!st ? <div className="lst-empty" data-lines-empty>
        <b>ยังไม่มีตัวเลข</b>
        <div className="small">{STATS?.why ? `นับไม่สำเร็จเพราะ${STATS.why}` : "ตัวนับยังไม่ได้รัน ซึ่งจะรันเองตอนเปิดโหมดพัฒนาหรือสร้างโปรแกรม หรือสั่ง npm run stats:lines เอง"}</div>
      </div> : <Body st={st} f={f} />}
    </div>
  );
}

function Body({ st, f }: { st: NonNullable<typeof STATS>; f: ReturnType<typeof useLineFilter> }) {
  const { filter } = f;
  const dark = darkBg();
  const rows = versionRows(st);
  const nowRow = rows[0].now ? rows[0] : null;
  const vers = rows.filter((r) => !r.now && !r.first);
  const cur = nowRow ?? rows[0];
  const total = totalOf(cur.n, filter);
  const lastV = vers[0], prevV = vers[1];
  const ks = kindsOf(cur.n, filter.groups);
  const ksum = ks[0] + ks[1] + ks[2] || 1;
  const live = st.groups.filter((g) => g.live).map((g) => g.name).join(" ");
  return (
    <>
      <div className="lst-tiles">
        <div className="lst-tile" data-lines-total><span>ตอนนี้ทั้งหมด</span><b>{fmt(total)}</b><em>บรรทัด ใน {fmt(filesOf(cur.n, filter.groups))} ไฟล์</em></div>
        {lastV && <div className="lst-tile" data-lines-since><span>เพิ่มจากรุ่น {shownVer(lastV.label)}</span><b className={delta(total - totalOf(lastV.n, filter))}>{signed(total - totalOf(lastV.n, filter))}</b><em>งานที่ยังไม่ขึ้นรุ่น</em></div>}
        {lastV && prevV && <div className="lst-tile" data-lines-last><span>รุ่น {shownVer(lastV.label)} เพิ่มจากรุ่น {shownVer(prevV.label)}</span><b className={delta(totalOf(lastV.n, filter) - totalOf(prevV.n, filter))}>{signed(totalOf(lastV.n, filter) - totalOf(prevV.n, filter))}</b><em>ปล่อยเมื่อ {thDate(lastV.date)}</em></div>}
      </div>
      <div className="lst-split" data-lines-split aria-label="สัดส่วนชนิดบรรทัด">
        {([0, 1, 2] as const).map((k) => <i key={k} style={{ width: `${(ks[k] / ksum) * 100}%`, background: kindColor(k, dark) }} />)}
      </div>
      <div className="lst-splitlab small">{([0, 1, 2] as const).map((k) => <span key={k}><i style={{ background: kindColor(k, dark) }} />{KIND_NAMES[k]} {fmt(ks[k])} ({Math.round((ks[k] / ksum) * 100)}%)</span>)}</div>

      <div className="lst-filters">
        <div className="lst-frow">
          <Seg<Preset> label="เลือกกลุ่มที่นับ" small value={f.preset} onChange={f.setPreset} options={[{ value: "all", label: "ทั้งหมด" }, { value: "live", label: "ใช้งานจริง", aria: `ใช้งานจริง ${live}` }, { value: "dev", label: "งานเบื้องหลัง" }, { value: "custom", label: "เลือกเอง", off: "ติ๊กกลุ่มข้างล่างเองแล้วปุ่มนี้ติดเอง" }]} />
          <span className="lst-flab small">กราฟซ้อนตาม</span>
          <Seg label="กราฟซ้อนตาม" small value={f.stack} onChange={f.setStack} options={[{ value: "group", label: "กลุ่ม" }, { value: "kind", label: "ชนิดบรรทัด" }]} />
        </div>
        <div className="lst-chips" role="group" aria-label="กลุ่มที่นับ">
          {st.groups.map((g) => { const on = filter.groups.includes(g.id); return (
            <button key={g.id} type="button" className={"lst-chip" + (on ? " on" : "")} aria-pressed={on} onClick={() => f.toggleGroup(g.id as GroupId)} data-lines-group={g.id}
              title={on && filter.groups.length === 1 ? "ต้องเลือกอย่างน้อยหนึ่งกลุ่ม" : undefined}>
              <i style={{ background: groupColor(g.id, dark) }} />{g.name}<em>{fmt(cntOf(cur.n[g.id], { ...filter, groups: [g.id] }))}</em>
            </button>); })}
        </div>
        <div className="lst-chips" role="group" aria-label="ชนิดบรรทัดที่นับ">
          {([0, 1, 2] as const).map((k) => { const on = filter.kinds[k]; return (
            <button key={k} type="button" className={"lst-chip" + (on ? " on" : "")} aria-pressed={on} onClick={() => f.toggleKind(k)} data-lines-kind={k}
              title={on && filter.kinds.filter(Boolean).length === 1 ? "ต้องเลือกอย่างน้อยหนึ่งชนิด" : undefined}>
              <i style={{ background: kindColor(k, dark) }} />{KIND_NAMES[k]}
            </button>); })}
          <InfoTip title="ชนิดบรรทัด" tip={KINDS_TIP} />
        </div>
      </div>

      <LineChart points={st.points} now={st.now ? { d: st.now.d, v: st.now.v, vm: 0, s: "", n: st.now.n, now: true } : undefined} groups={st.groups} filter={filter} stack={f.stack} dark={dark} />

      <h4 className="imghead">ทุกรุ่น</h4>
      <div className="lst-tablewrap">
        <table className="lst-table" data-lines-table>
          <thead><tr><th>รุ่น</th><th>วันที่</th><th className="num">บรรทัด</th><th className="num">เพิ่มจากรุ่นก่อน</th>
            {([0, 1, 2] as const).filter((k) => filter.kinds[k]).map((k) => <th key={k} className="num">{KIND_NAMES[k]}</th>)}<th className="num">ไฟล์</th></tr></thead>
          <tbody>{rows.map((r, i) => { const older = rows[i + 1]; const t = totalOf(r.n, filter); const ks2 = kindsOf(r.n, filter.groups); return (
            <tr key={r.key} className={r.now ? "now" : ""} data-lines-row={r.now ? "now" : r.first ? "first" : shownVer(r.label)}>
              <td>{r.now ? <><b>ตอนนี้</b> <span className="small">ยังไม่ขึ้นรุ่น</span></> : r.first ? <>{shownVer(r.label)} <span className="small">เริ่มโปรเจกต์</span></> : <b>{shownVer(r.label)}</b>}</td>
              <td>{thDate(r.date)}</td><td className="num">{fmt(t)}</td>
              <td className={"num " + (older ? delta(t - totalOf(older.n, filter)) : "")}>{older ? signed(t - totalOf(older.n, filter)) : "–"}</td>
              {([0, 1, 2] as const).filter((k) => filter.kinds[k]).map((k) => <td key={k} className="num">{fmt(ks2[k])}</td>)}
              <td className="num">{fmt(filesOf(r.n, filter.groups))}</td>
            </tr>); })}</tbody>
        </table>
      </div>
    </>
  );
}

/** สีของตัวเลขเพิ่มลด เพิ่มเป็นสีเขียว ลดเป็นสีแดง ไม่เปลี่ยนเป็นสีเทา */
const delta = (n: number) => (n > 0 ? "lst-up" : n < 0 ? "lst-down" : "lst-zero");
