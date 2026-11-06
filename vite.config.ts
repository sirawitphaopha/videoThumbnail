import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// หน้าจอของโปรแกรมชั้นหนัง · Tauri เปิดหน้านี้ที่พอร์ต 1420 ตอนทดสอบ
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: "127.0.0.1",
    // ไม่เฝ้าไฟล์ฝั่ง Rust เครื่องมือ ไฟล์ทดสอบ และเอกสาร กันหน้าจอรีโหลดเองตอนสร้างไฟล์ทดสอบ
    watch: { ignored: ["**/src-tauri/**", "**/vendor/**", "**/test-media/**", "**/docs/**"] },
  },
  envPrefix: ["VITE_", "TAURI_ENV_*"],
  build: {
    target: "chrome120",
    // Vite 8 ใช้ตัวบีบไฟล์ของตัวเอง ไม่ใช้ esbuild แล้ว
    minify: !process.env.TAURI_ENV_DEBUG,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
});
