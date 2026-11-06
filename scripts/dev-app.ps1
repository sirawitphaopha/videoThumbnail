# เปิดโปรแกรมชั้นหนังแบบทดสอบ (tauri dev) พร้อมเปิดพอร์ตดีบัก (debug port) ของ WebView2 ที่พอร์ต 9222
# ใช้คู่กับ scripts/cdp.mjs ถ่ายภาพและกดปุ่มในหน้าต่างจริง
# หน้าต่างเปิดแบบไม่แย่งโฟกัส อยู่หลังหน้าต่างอื่นทั้งหมด ไม่เด้งบังงานของพี่กัน (พี่กันขอ 6 พ.ย. 2569 · lib.rs MOVIE_SHELF_BACKGROUND)
# หน้าต่างที่ถูกบังยังวาดภาพต่อ ปิดตัวหยุดวาดตอนถูกบังของ WebView2 ไม่งั้นถ่ายภาพผ่านพอร์ตดีบักไม่ได้
. (Join-Path (Split-Path -Parent $PSScriptRoot) 'dev.ps1')
# ล้างตัวแปรทุกครั้งที่จบ ไม่ให้ค้างในหน้าต่างคำสั่ง (ผลตรวจขั้น 0 ข้อ 7)
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = '--remote-debugging-port=9222 --disable-features=CalculateNativeWinOcclusion --disable-backgrounding-occluded-windows --disable-renderer-backgrounding'
$env:MOVIE_SHELF_BACKGROUND = '1'
try { npm run tauri dev } finally {
  Remove-Item Env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS -ErrorAction SilentlyContinue
  Remove-Item Env:MOVIE_SHELF_BACKGROUND -ErrorAction SilentlyContinue
}
