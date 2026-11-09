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
import DevParts from "./pages/DevParts";
import ShelfPage from "./pages/ShelfPage";
import PosterPage, { type PosterStart } from "./pages/PosterPage";
import LinkPage from "./pages/LinkPage";
import { setLinkJob, useLinkJob } from "./lib/linkJob";
import AvPage from "./pages/AvPage";
import FileInfoPage from "./pages/FileInfoPage";
import FirstRun from "./pages/FirstRun";
import CheckPage, { type CheckReq } from "./pages/CheckPage";
import GraphPage, { GraphBoundary, type GraphReq } from "./pages/GraphPage";
import { CheckHost } from "./lib/check";
import { applyTone } from "./lib/tones";

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
  const [hash, setHash] = useState(location.hash);

  useEffect(() => {
    const f = () => setHash(location.hash);
    window.addEventListener("hashchange", f);
    return () => window.removeEventListener("hashchange", f);
  }, []);

  const parts = import.meta.env.DEV && hash === "#parts";
  const collapsed = settings?.sidebarCollapsed ?? false;
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
            onToggle={() => update({ sidebarCollapsed: !collapsed })}
            shelfCount={movies.length}
            checkCount={checkCount}
            linkCount={linkWaiting}
            foot={settings.folders.length ? { folders: settings.folders.length, totalSize: fmtSize(totalSize) } : null}
          />
          <main className="main">
            {parts ? <DevParts /> : (
              <>
                {page === "shelf" && (infoMovie ? <FileInfoPage m={infoMovie} onBack={() => setInfoId(null)} onAv={(path) => { setInfoId(null); setAvPath(path); setPage("av"); }} />
                  : <ShelfPage onPage={setPage} onPoster={(path) => { setPosterPath(path); setPosterImage(null); setPage("poster"); }} onMerge={(path, image) => { setPosterPath(path); setPosterImage(image); setPage("poster"); }} onInfo={setInfoId} onCheck={(r) => { setCheckReq(r); setPage("check"); }} onGraph={(path) => openGraph({ path })} onAv={(path) => { setAvPath(path); setPage("av"); }} sel={shelfSel} setSel={setShelfSel} />)}
                {page === "poster" && <PosterPage initialPath={posterPath} initialImage={posterImage} onPage={setPage} onConsumed={() => { setPosterPath(null); setPosterImage(null); }} />}
                {page === "link" && <LinkPage />}
                {page === "av" && <AvPage initialPath={avPath} onConsumed={() => setAvPath(null)} onPage={setPage} onGraph={(path) => openGraph({ path })} />}
                {page === "check" && <CheckPage req={checkReq} onConsumed={() => setCheckReq(null)} onGraph={openGraph} onPage={setPage} />}
                {/* หน้ากราฟอยู่ในกล่องเลื่อน แถบสูงขึ้นหรือลากขยายจนยาวกว่าหน้าต่างแล้วเลื่อนลงไปถึงแถวปุ่มล่างได้ (เดิมแถวปุ่มล่างโดนตัดใต้จอ เจอตอนตรวจภาพ) */}
                {page === "graph" && <div className="pagewrap" data-graphscroll><GraphBoundary><GraphPage req={graphReq} onConsumed={() => setGraphReq(null)} /></GraphBoundary></div>}
                {page === "settings" && <div className="pagewrap" data-settingsscroll><SettingsPage /></div>}
              </>
            )}
          </main>
        </div>
      ))}
      <CloseGuard onGoLink={() => { setLinkJob({ view: "table" }); setInfoId(null); setPage("link"); }} />
      <OverlayScrollbar />
    </div>
  );
}
