/* มอคอัปหน้าบิตเรตแบบใหม่ · หน้าจอจริงของโปรแกรมทั้งหน้า (แถบชื่อ เมนูซ้าย เลขรุ่น ทุกหน้า) ยกจาก src/App.tsx
   ต่างจากของจริงที่เดียว หน้าบิตเรตสลับได้ แบบใหม่ (BitrateNew) กับแบบเดิม (src/pages/BitratePage.tsx)
   หน้าเลือกแบบข้างนอก (bitrate-redesign.html) เรียก window.__setVariant ข้ามกรอบ */
import "@fontsource/sarabun/thai-400.css";
import "@fontsource/sarabun/thai-500.css";
import "@fontsource/sarabun/thai-600.css";
import "@fontsource/sarabun/thai-700.css";
import "@fontsource/sarabun/latin-400.css";
import "@fontsource/sarabun/latin-500.css";
import "@fontsource/sarabun/latin-600.css";
import "@fontsource/sarabun/latin-700.css";
import "../../styles/app.css";
import { StrictMode, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import TitleBar from "../../components/TitleBar";
import Sidebar, { type Page } from "../../components/Sidebar";
import { ToastHost } from "../../components/Toasts";
import OverlayScrollbar from "../../components/OverlayScrollbar";
import { SettingsHost, useSettings } from "../../lib/settings";
import { LibraryHost, useLibrary } from "../../lib/library";
import { CheckHost } from "../../lib/check";
import { kindOf } from "../../lib/status";
import { fmtSize } from "../../lib/format";
import { applySavedTone, applyTone } from "../../lib/tones";
import { useLinkJob } from "../../lib/linkJob";
import ShelfPage from "../../pages/ShelfPage";
import PosterPage from "../../pages/PosterPage";
import LinkPage from "../../pages/LinkPage";
import AvPage from "../../pages/AvPage";
import CheckPage from "../../pages/CheckPage";
import GraphPage, { GraphBoundary } from "../../pages/GraphPage";
import SettingsPage from "../../pages/SettingsPage";
import BitratePage from "../../pages/BitratePage";

applySavedTone();

function Frame() {
  const { settings, update } = useSettings();
  useEffect(() => { if (settings?.tone) applyTone(settings.tone); }, [settings?.tone]);
  const { movies } = useLibrary();
  const linkWaiting = useLinkJob().reply.waiting;
  const [page, setPage] = useState<Page>("bitrate");
  const [variant, setVariant] = useState<"new" | "old">(() => (new URLSearchParams(location.search).get("v") === "old" ? "old" : "new"));
  useEffect(() => {
    const w = window as unknown as { __setVariant: (v: "new" | "old") => void; __setPage: (p: Page) => void };
    w.__setVariant = (v) => { setVariant(v); setPage("bitrate"); setTimeout(() => (window as unknown as { __bitrateView?: (x: string) => void }).__bitrateView?.(v === "old" ? "classic" : "new"), 0); };
    w.__setPage = setPage;
  }, []);
  useEffect(() => { window.parent?.postMessage({ variant }, "*"); }, [variant]);
  const [collapsed, setCollapsed] = useState(false);
  const [brPath, setBrPath] = useState<string | null>(null);
  const [shelfSel, setShelfSel] = useState<string | null>(null);
  const reminder = settings?.recheckReminderDays ?? 30;
  const checkCount = useMemo(() => movies.filter((m) => { const k = kindOf(m, reminder); return k === "warn" || k === "bad"; }).length, [movies, reminder]);
  const totalSize = useMemo(() => movies.filter((m) => !m.missing).reduce((s, m) => s + m.size, 0), [movies]);
  return (
    <div className="app">
      <TitleBar />
      {settings && (
        <div className="body">
          <Sidebar page={page} onPage={setPage} collapsed={collapsed} onToggle={() => { setCollapsed(!collapsed); void update({ sidebarCollapsed: !collapsed }); }}
            shelfCount={movies.length} checkCount={checkCount} linkCount={linkWaiting}
            foot={settings.folders.length ? { folders: settings.folders.length, totalSize: fmtSize(totalSize) } : null} />
          <main className="main">
            {page === "shelf" && <ShelfPage onPage={setPage} onPoster={() => setPage("poster")} onMerge={() => setPage("poster")} onInfo={() => {}} onCheck={() => setPage("check")} onGraph={() => setPage("graph")} onBitrate={(p) => { setBrPath(p); setPage("bitrate"); }} onAv={() => setPage("av")} sel={shelfSel} setSel={setShelfSel} />}
            {page === "poster" && <PosterPage initialPath={null} initialImage={null} onPage={setPage} onConsumed={() => {}} />}
            {page === "link" && <LinkPage />}
            {page === "av" && <AvPage initialPath={null} onConsumed={() => {}} onPage={setPage} onGraph={() => setPage("graph")} />}
            {page === "check" && <CheckPage req={null} onConsumed={() => {}} onGraph={() => setPage("graph")} onPage={setPage} />}
            {page === "graph" && <div className="pagewrap"><GraphBoundary><GraphPage req={null} onConsumed={() => {}} onBitrate={(p) => { setBrPath(p); setPage("bitrate"); }} /></GraphBoundary></div>}
            {/* หน้าบิตเรตตัวจริงของโปรแกรม (ลงโปรแกรมแล้ว) สลับแบบในหน้าเอง */}
            {page === "bitrate" && <BitratePage initialPath={brPath} onConsumed={() => setBrPath(null)} />}
            {page === "settings" && <div className="pagewrap"><SettingsPage /></div>}
          </main>
        </div>
      )}
      <OverlayScrollbar />
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ToastHost><SettingsHost><LibraryHost><CheckHost><Frame /></CheckHost></LibraryHost></SettingsHost></ToastHost>
  </StrictMode>,
);
