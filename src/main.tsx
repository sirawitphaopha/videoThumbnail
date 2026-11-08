// ฟอนต์ Sarabun ฝังในโปรแกรม ไม่โหลดจากเน็ต (น้ำหนักตามต้นแบบ 400 500 600 700)
import "@fontsource/sarabun/thai-400.css";
import "@fontsource/sarabun/thai-500.css";
import "@fontsource/sarabun/thai-600.css";
import "@fontsource/sarabun/thai-700.css";
import "@fontsource/sarabun/latin-400.css";
import "@fontsource/sarabun/latin-500.css";
import "@fontsource/sarabun/latin-600.css";
import "@fontsource/sarabun/latin-700.css";
import "./styles/app.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { applySavedTone } from "./lib/tones";

applySavedTone();
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
