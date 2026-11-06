# เปิดโปรแกรมชั้นหนังแบบทดสอบ พร้อมเปิดพอร์ตดีบัก (debug port) ของ WebView2 ที่พอร์ต 9222
# ใช้คู่กับ scripts/cdp.mjs ถ่ายภาพและกดปุ่มในหน้าต่างจริง
#   scripts/dev-app.ps1          เปิดแบบ tauri dev แก้โค้ดแล้วสร้างใหม่เอง
#   scripts/dev-app.ps1 -Built   สร้างโปรแกรมจริง (debug ไม่ทำตัวติดตั้ง) แล้วเปิดไฟล์ exe นั้น
#                                ใช้เทสเรื่องรูปและการโหลดของ เพราะ tauri dev ไม่ใช้กติกาความปลอดภัย (CSP) ตัวจริง (TECH-REVIEW ข้อ 5)
#                                ไฟล์ exe เดียวกับ tauri dev ต้องปิดตัว dev ก่อน ไม่งั้นเขียนทับไฟล์ที่เปิดอยู่ไม่ได้
# หน้าต่างเปิดแบบไม่แย่งโฟกัส อยู่หลังหน้าต่างอื่นทั้งหมด ไม่เด้งบังงานของพี่กัน (พี่กันขอ 6 พ.ย. 2569 · lib.rs MOVIE_SHELF_BACKGROUND)
# หน้าต่างที่ถูกบังยังวาดภาพต่อ ปิดตัวหยุดวาดตอนถูกบังของ WebView2 ไม่งั้นถ่ายภาพผ่านพอร์ตดีบักไม่ได้
param([switch]$Built)
$root = Split-Path -Parent $PSScriptRoot
. (Join-Path $root 'dev.ps1')
Set-Location $root
if ($Built) {
  npm run tauri build -- --debug --no-bundle
  if ($LASTEXITCODE -ne 0) { Write-Host 'สร้างโปรแกรมไม่สำเร็จ'; exit 1 }
}
# ล้างตัวแปรทุกครั้งที่จบ ไม่ให้ค้างในหน้าต่างคำสั่ง (ผลตรวจขั้น 0 ข้อ 7)
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = '--remote-debugging-port=9222 --disable-features=CalculateNativeWinOcclusion --disable-backgrounding-occluded-windows --disable-renderer-backgrounding'
$env:MOVIE_SHELF_BACKGROUND = '1'
try {
  if ($Built) {
    Write-Host 'เปิดโปรแกรมที่สร้างจริง src-tauri\target\debug\movie-shelf.exe'
    & (Join-Path $root 'src-tauri\target\debug\movie-shelf.exe')
  } else {
    npm run tauri dev
  }
} finally {
  Remove-Item Env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS -ErrorAction SilentlyContinue
  Remove-Item Env:MOVIE_SHELF_BACKGROUND -ErrorAction SilentlyContinue
}
