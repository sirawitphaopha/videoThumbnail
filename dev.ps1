# ตั้งค่าเครื่องมือสร้างโปรแกรมชั้นหนัง
# ใช้ด้วยการเรียก  . D:\movie-shelf\dev.ps1  ก่อนคำสั่งสร้างโปรแกรมทุกครั้ง
# เหตุผล
#   - Rust ลงไว้ที่ไดรฟ์ D แต่โปรแกรมที่เปิดก่อนลง Rust ยังมองไม่เห็นที่อยู่ใหม่ จนกว่าจะออกจากระบบ Windows แล้วเข้าใหม่
#   - ไดรฟ์ C เหลือที่น้อย จึงย้ายที่เก็บชั่วคราวของ npm และโฟลเดอร์ชั่วคราวไปไดรฟ์ D

$env:RUSTUP_HOME = 'D:\dev\rustup'
$env:CARGO_HOME  = 'D:\dev\cargo'
if (-not ($env:Path -split ';' | Where-Object { $_ -ieq 'D:\dev\cargo\bin' })) {
  $env:Path = 'D:\dev\cargo\bin;' + $env:Path
}

$env:npm_config_cache = 'D:\dev\npm-cache'
New-Item -ItemType Directory -Force 'D:\dev\tmp' | Out-Null
$env:TEMP = 'D:\dev\tmp'
$env:TMP  = 'D:\dev\tmp'

# เครื่องนี้แรม 8 GB มี SSD ลูกเดียว C กับ D ใช้ร่วมกัน · พี่กันบอก 8 พ.ย. 2569 "เธอรันเเล้วคอมเรากระตุก"
# งานสร้างโปรแกรมใช้ไม่เกิน 6 จาก 12 เธรด และยอมให้โปรแกรมที่คนกำลังใช้ก่อน · โปรแกรมลูกทุกตัวรับค่าความสำคัญนี้ต่อ
$env:CARGO_BUILD_JOBS = '6'
# เทส Rust เปิด ffmpeg กับตัวแปลงเสียงพร้อมกัน ค่าตั้งต้น 12 ตัว CPU พุ่ง 98% แรมเหลือ 0.2 GB (วัด 8 พ.ย. 2569)
$env:RUST_TEST_THREADS = '4'
try { [System.Diagnostics.Process]::GetCurrentProcess().PriorityClass = 'BelowNormal' } catch { }

Set-Location 'D:\movie-shelf'
