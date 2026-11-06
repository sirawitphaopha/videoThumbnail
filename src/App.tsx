// หน้าชั่วคราวของขั้น 0 ไว้ยืนยันว่าหน้าต่างเปิดได้และเรียกเครื่องมือจากฝั่ง Rust ได้
// ขั้น 1 จะแทนด้วยกรอบหน้าต่างจริงตามต้นแบบ
import { useEffect, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";

type ToolCheck = { name: string; ok: boolean; version: string };

export default function App() {
  const [tools, setTools] = useState<ToolCheck[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isTauri()) { setError("เปิดในเบราว์เซอร์ ไม่ได้เปิดในโปรแกรม"); return; }
    invoke<ToolCheck[]>("check_tools").then(setTools).catch((e) => setError(String(e)));
  }, []);

  return (
    <main style={{ fontFamily: "Sarabun, Tahoma, sans-serif", padding: 24, color: "#4a2b38", background: "#fdf2f6", minHeight: "100vh", boxSizing: "border-box" }}>
      <h1 style={{ margin: 0 }}>ชั้นหนัง</h1>
      <p>ขั้น 0 · เช็กเครื่องมือเบื้องหลัง</p>
      {error && <p style={{ color: "#b04545" }}>{error}</p>}
      {!tools && !error && <p>กำลังเช็ก…</p>}
      {tools && (
        <ul>
          {tools.map((t) => (
            <li key={t.name}>
              {t.ok ? "พร้อม" : "ไม่พร้อม"} · {t.name} · {t.version}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
