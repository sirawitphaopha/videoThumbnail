/* กรอบหน้าต่างโปรแกรมชั้นหนัง (ต้นแบบ docs/mockups/poster-shelf.html · สเปกข้อ 1 กรอบหน้าต่าง และข้อ 3 เมนูซ้าย)
   แถบชื่อทำเอง · เมนูซ้ายกาง 200 ย่อ 64 จำค่าไว้ · 5 หน้า (กราฟเสียงเพิ่ม 7 พ.ย. 2569) · แถบแจ้งผล · หน้าต่างถามตอนปิดขณะมีงาน · แถบเลื่อนลอย
   ยังไม่ได้เลือกโฟลเดอร์ = ชั้นว่าง ไม่มีเมนู (สเปกข้อ 10) */
import { useEffect, useMemo, useState } from "react";
import TitleBar from "./components/TitleBar";
import Sidebar, { type Page } from "./components/Sidebar";
import { ToastHost } from "./components/Toasts";
import CloseGuard from "./components/CloseGuard";
import OverlayScrollbar from "./components/OverlayScrollbar";
import { SettingsHost, useSettings } from "./lib/settings";
import { LibraryHost, useLibrary } from "./lib/library";
import { kindOf } from "./lib/status";
import { fmtSize } from "./lib/format";
import SettingsPage from "./pages/SettingsPage";
import BitratePage from "./pages/BitratePage";
import DevParts from "./pages/DevParts";
import ShelfPage from "./pages/ShelfPage";
import PosterPage, { type PosterStart } from "./pages/PosterPage";
import LinkPage from "./pages/LinkPage";
import { setLinkJob, useLinkJob } from "./lib/linkJob";
import AvPage from "./pages/AvPage";
import FileInfoPage from "./pages/FileInfoPage";
import MediaInfoPage from "./pages/MediaInfoPage";
import SubtitlePage from "./pages/SubtitlePage";
import FirstRun from "./pages/FirstRun";
import CheckPage, { type CheckReq } from "./pages/CheckPage";
import GraphPage, { GraphBoundary, type GraphReq } from "./pages/GraphPage";
import { CheckHost } from "./lib/check";
import { applyTone } from "./lib/tones";
import { requestSettingsSec } from "./lib/drives";
import { PageActiveCtx } from "./lib/pageActive";

export default function App() {
  return (
    <ToastHost>
      <SettingsHost>
        <LibraryHost>
          <CheckHost>
            <Frame />
          </CheckHost>
        </LibraryHost>
      </SettingsHost>
    </ToastHost>
  );
}

function Frame() {
  const { settings, update } = useSettings();
  useEffect(() => { if (settings?.tone) applyTone(settings.tone); }, [settings?.tone]);
  const { movies } = useLibrary();
  const linkWaiting = useLinkJob().reply.waiting;
  const [page, setPage] = useState<Page>("shelf");
  /** มาจากปุ่มเปลี่ยนโปสเตอร์บนชั้นวาง · หน้าใส่โปสเตอร์ใส่ไฟล์หนังให้เลย */
  const [posterPath, setPosterPath] = useState<string | null>(null);
  /** มาจากปุ่มรวมเข้าไฟล์บนชั้นวาง · ใส่รูปกับค่าครอปของปกจับคู่ให้ด้วย */
  const [posterImage, setPosterImage] = useState<PosterStart | null>(null);
  /** มาจากปุ่มเสียงและซับบนชั้นวาง · หน้าเสียงและซับใส่ไฟล์หนังให้เลย */
  const [avPath, setAvPath] = useState<string | null>(null);
  /** หน้าข้อมูลไฟล์ เปิดจากปุ่มข้อมูลไฟล์ในแผงขวาของชั้นวาง */
  const [infoId, setInfoId] = useState<string | null>(null);
  const infoMovie = infoId ? movies.find((m) => m.id === infoId) ?? null : null;
  /** เรื่องที่เลือกบนชั้นวาง เก็บไว้ตรงนี้ ไปหน้าอื่นแล้วกลับมาต้องยังเลือกเรื่องเดิม */
  const [shelfSel, setShelfSel] = useState<string | null>(null);
  /** มาจากปุ่มบนการ์ดสถานะของชั้นวาง · หน้าตรวจไฟล์ตรวจเรื่องนั้นเลย หรือเปิดผลตรวจ */
  const [checkReq, setCheckReq] = useState<CheckReq | null>(null);
  /** มาจากปุ่มกราฟเสียงในแผงขวาของชั้นวาง หรือปุ่มดูกราฟเสียงช่วงนี้ในหน้าต่างผลตรวจ */
  const [graphReq, setGraphReq] = useState<GraphReq | null>(null);
  const openGraph = (r: GraphReq) => { setGraphReq(r); setPage("graph"); };
  /** มาจากปุ่มบิตเรตวิดีโอในแผงขวาของชั้นวาง · หน้าบิตเรตเปิดไฟล์นี้ให้เลย */
  const [bitratePath, setBitratePath] = useState<string | null>(null);
  /** แทร็กที่ส่งมาด้วย (หน้ากราฟเสียงส่งแทร็กเสียงที่ดูอยู่) · ไม่ส่ง หน้าบิตเรตถามเองถ้ามีหลายแทร็ก */
  const [bitrateTrack, setBitrateTrack] = useState<string | null>(null);
  const [hash, setHash] = useState(location.hash);
  // หน้าที่เคยเปิดแล้วเก็บไว้ ซ่อนตอนไปเมนูอื่น ไฟล์ รูป ค่าที่ปรับ งานที่ค้าง อยู่ครบเมื่อกลับมา (BUGS ข้อ 9 · lib/pageActive.ts)
  // ซ่อนด้วย display none แทนการถอดหน้าออก · ตอนเปิดใช้ display contents กรอบหน้าเหมือนเดิมทุกจุด
  const [visited, setVisited] = useState<Set<Page>>(() => new Set<Page>(["shelf"]));
  useEffect(() => { setVisited((v) => (v.has(page) ? v : new Set(v).add(page))); }, [page]);
  const slot = (id: Page, node: React.ReactNode) => (visited.has(id) || page === id) ? (
    <PageActiveCtx.Provider key={id} value={page === id}>
      <div style={{ display: page === id ? "contents" : "none" }} data-pageslot={id}>{node}</div>
    </PageActiveCtx.Provider>
  ) : null;

  useEffect(() => {
    const f = () => setHash(location.hash);
    window.addEventListener("hashchange", f);
    return () => window.removeEventListener("hashchange", f);
  }, []);

  const parts = import.meta.env.DEV && hash === "#parts";
  // กดแล้วเมนูขยับทันที ไม่รอบันทึกลงไฟล์ · บันทึกไม่สำเร็จ แถบแจ้งขึ้นแล้วกลับค่าเดิม
  const [navNow, setNavNow] = useState<boolean | null>(null);
  const collapsed = navNow ?? settings?.sidebarCollapsed ?? false;
  const reminder = settings?.recheckReminderDays ?? 30;
  const checkCount = useMemo(() => movies.filter((m) => { const k = kindOf(m, reminder); return k === "warn" || k === "bad"; }).length, [movies, reminder]);
  const totalSize = useMemo(() => movies.filter((m) => !m.missing).reduce((s, m) => s + m.size, 0), [movies]);
  const firstRun = !!settings && settings.folders.length === 0 && !parts;

  return (
    <div className="app">
      <TitleBar />
      {/* รอการตั้งค่าก่อนวาดเมนู ไม่งั้นเมนูกางแวบแล้วค่อยย่อ */}
      {settings && (firstRun ? <FirstRun /> : (
        <div className="body">
          <Sidebar
            page={page}
            onPage={(p) => { setPage(p); if (p === "shelf") setInfoId(null); if (parts) location.hash = ""; }}
            collapsed={collapsed}
            onToggle={() => { const next = !collapsed; setNavNow(next); void update({ sidebarCollapsed: next }).finally(() => setNavNow(null)); }}
            shelfCount={movies.length}
            checkCount={checkCount}
            linkCount={linkWaiting}
            foot={settings.folders.length ? { folders: settings.folders.length, totalSize: fmtSize(totalSize) } : null}
          />
          <main className="main">
            {parts ? <DevParts /> : (
              <>
                {slot("shelf", infoMovie ? <FileInfoPage m={infoMovie} onBack={() => setInfoId(null)} onAv={(path) => { setInfoId(null); setAvPath(path); setPage("av"); }} />
                  : <ShelfPage onPage={setPage} onPoster={(path) => { setPosterPath(path); setPosterImage(null); setPage("poster"); }} onMerge={(path, image) => { setPosterPath(path); setPosterImage(image); setPage("poster"); }} onInfo={setInfoId} onCheck={(r) => { setCheckReq(r); setPage("check"); }} onGraph={(path) => openGraph({ path })} onBitrate={(path) => { setBitratePath(path); setBitrateTrack(null); setPage("bitrate"); }} onAv={(path) => { setAvPath(path); setPage("av"); }} sel={shelfSel} setSel={setShelfSel} />)}
                {slot("poster", <PosterPage initialPath={posterPath} initialImage={posterImage} onPage={setPage} onConsumed={() => { setPosterPath(null); setPosterImage(null); }} />)}
                {slot("link", <LinkPage />)}
                {slot("av", <AvPage initialPath={avPath} onConsumed={() => setAvPath(null)} onPage={setPage} onGraph={(path) => openGraph({ path })} />)}
                {slot("check", <CheckPage req={checkReq} onConsumed={() => setCheckReq(null)} onGraph={openGraph} onPage={setPage} />)}
                {/* หน้ากราฟอยู่ในกล่องเลื่อน แถบสูงขึ้นหรือลากขยายจนยาวกว่าหน้าต่างแล้วเลื่อนลงไปถึงแถวปุ่มล่างได้ (เดิมแถวปุ่มล่างโดนตัดใต้จอ เจอตอนตรวจภาพ) */}
                {slot("graph", <div className="pagewrap" data-graphscroll><GraphBoundary><GraphPage req={graphReq} onConsumed={() => setGraphReq(null)} onBitrate={(path, track) => { setBitratePath(path); setBitrateTrack(track ?? null); setPage("bitrate"); }} /></GraphBoundary></div>)}
                {slot("bitrate", <BitratePage initialPath={bitratePath} initialTrack={bitrateTrack} onConsumed={() => { setBitratePath(null); setBitrateTrack(null); }} onGraph={(path, track) => openGraph({ path, track })} />)}
                {slot("subtitle", <SubtitlePage onAv={() => setPage("av")} onSettings={() => { requestSettingsSec("av"); setPage("settings"); }} />)}
                {slot("mediainfo", <MediaInfoPage onAv={(path) => { setAvPath(path); setPage("av"); }} onShelf={() => setPage("shelf")} />)}
                {slot("settings", <div className="pagewrap" data-settingsscroll><SettingsPage /></div>)}
              </>
            )}
          </main>
        </div>
      ))}
      <CloseGuard onGoLink={() => { setLinkJob({ view: "table" }); setInfoId(null); setPage("link"); }} onGoSub={() => { setInfoId(null); setPage("subtitle"); }} />
      <OverlayScrollbar />
    </div>
  );
}
