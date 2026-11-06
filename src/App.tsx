/* กรอบหน้าต่างโปรแกรมชั้นหนัง (ต้นแบบ docs/mockups/poster-shelf.html · สเปกข้อ 1 กรอบหน้าต่าง และข้อ 3 เมนูซ้าย)
   แถบชื่อทำเอง · เมนูซ้ายกาง 200 ย่อ 64 จำค่าไว้ · 4 หน้า · แถบแจ้งผล · หน้าต่างถามตอนปิดขณะมีงาน · แถบเลื่อนลอย
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
import Placeholder from "./pages/Placeholder";
import DevParts from "./pages/DevParts";
import ShelfPage from "./pages/ShelfPage";
import PosterPage from "./pages/PosterPage";
import FirstRun from "./pages/FirstRun";

export default function App() {
  return (
    <ToastHost>
      <SettingsHost>
        <LibraryHost>
          <Frame />
        </LibraryHost>
      </SettingsHost>
    </ToastHost>
  );
}

function Frame() {
  const { settings, update } = useSettings();
  const { movies } = useLibrary();
  const [page, setPage] = useState<Page>("shelf");
  /** มาจากปุ่มเปลี่ยนโปสเตอร์บนชั้นวาง · หน้าใส่โปสเตอร์ใส่ไฟล์หนังให้เลย */
  const [posterPath, setPosterPath] = useState<string | null>(null);
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
            onPage={(p) => { setPage(p); if (parts) location.hash = ""; }}
            collapsed={collapsed}
            onToggle={() => update({ sidebarCollapsed: !collapsed })}
            shelfCount={movies.length}
            checkCount={checkCount}
            foot={settings.folders.length ? { folders: settings.folders.length, totalSize: fmtSize(totalSize) } : null}
          />
          <main className="main">
            {parts ? <DevParts /> : (
              <>
                {page === "shelf" && <ShelfPage onPage={setPage} onPoster={(path) => { setPosterPath(path); setPage("poster"); }} />}
                {page === "poster" && <PosterPage initialPath={posterPath} onPage={setPage} onConsumed={() => setPosterPath(null)} />}
                {page === "check" && <Placeholder title="ตรวจไฟล์" stage={6} />}
                {page === "settings" && <Placeholder title="ตั้งค่า" stage={7} />}
              </>
            )}
          </main>
        </div>
      ))}
      <CloseGuard />
      <OverlayScrollbar />
    </div>
  );
}
