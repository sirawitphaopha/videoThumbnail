# เปิดโปรแกรมชั้นหนังแบบทดสอบ (tauri dev) พร้อมเปิดช่องดีบักของ WebView2 ที่พอร์ต 9222
# ใช้คู่กับ scripts/cdp.mjs ถ่ายภาพและกดปุ่มในหน้าต่างจริง
. (Join-Path (Split-Path -Parent $PSScriptRoot) 'dev.ps1')
# ล้างตัวแปรช่องดีบักทุกครั้งที่จบ ไม่ให้ค้างในหน้าต่างคำสั่ง (ผลตรวจขั้น 0 ข้อ 7)
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = '--remote-debugging-port=9222'
try { npm run tauri dev } finally { Remove-Item Env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS -ErrorAction SilentlyContinue }
