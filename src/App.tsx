/* กรอบหน้าต่างโปรแกรมชั้นหนัง (ต้นแบบ docs/mockups/poster-shelf.html · สเปกข้อ 1 กรอบหน้าต่าง และข้อ 3 เมนูซ้าย)
   แถบชื่อทำเอง · เมนูซ้ายกาง 200 ย่อ 64 จำค่าไว้ · 4 หน้า · แถบแจ้งผล · หน้าต่างถามตอนปิดขณะมีงาน · แถบเลื่อนลอย */
import { useEffect, useState } from "react";
import TitleBar from "./components/TitleBar";
import Sidebar, { type Page } from "./components/Sidebar";
import { ToastHost } from "./components/Toasts";
import CloseGuard from "./components/CloseGuard";
import OverlayScrollbar from "./components/OverlayScrollbar";
import { SettingsHost, useSettings } from "./lib/settings";
import Placeholder from "./pages/Placeholder";
import DevParts from "./pages/DevParts";

export default function App() {
  return (
    <ToastHost>
      <SettingsHost>
        <Frame />
      </SettingsHost>
    </ToastHost>
  );
}

function Frame() {
  const { settings, update } = useSettings();
  const [page, setPage] = useState<Page>("shelf");
  const [hash, setHash] = useState(location.hash);

  useEffect(() => {
    const f = () => setHash(location.hash);
    window.addEventListener("hashchange", f);
    return () => window.removeEventListener("hashchange", f);
  }, []);

  const parts = import.meta.env.DEV && hash === "#parts";
  const collapsed = settings?.sidebarCollapsed ?? false;

  return (
    <div className="app">
      <TitleBar />
      {/* รอการตั้งค่าก่อนวาดเมนู ไม่งั้นเมนูกางแวบแล้วค่อยย่อ */}
      {settings && (
        <div className="body">
          <Sidebar
            page={page}
            onPage={(p) => { setPage(p); if (parts) location.hash = ""; }}
            collapsed={collapsed}
            onToggle={() => update({ sidebarCollapsed: !collapsed })}
          />
          <main className="main">
            {parts ? <DevParts /> : (
              <>
                {page === "shelf" && <Placeholder title="ชั้นวางหนัง" stage={2} />}
                {page === "poster" && <Placeholder title="ใส่โปสเตอร์" stage={4} />}
                {page === "check" && <Placeholder title="ตรวจไฟล์" stage={6} />}
                {page === "settings" && <Placeholder title="ตั้งค่า" stage={7} />}
              </>
            )}
          </main>
        </div>
      )}
      <CloseGuard />
      <OverlayScrollbar />
    </div>
  );
}
