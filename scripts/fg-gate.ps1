Add-Type @"
using System; using System.Runtime.InteropServices;
public class FG { [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
[DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint p); }
"@
# ด่านก่อนสั่งงานในหน้าต่างชั้นหนัง · หน้าต่างชั้นหนังอยู่หน้าสุดของจอ = มีคนดูหรือใช้อยู่ ออกด้วยรหัส 1 ให้คำสั่งที่ต่อด้วย && ไม่รัน
$h = [FG]::GetForegroundWindow(); $p = 0; [void][FG]::GetWindowThreadProcessId($h, [ref]$p)
$name = (Get-Process -Id $p -ErrorAction SilentlyContinue).ProcessName
if ($name -eq "movie-shelf") { Write-Output "หยุด หน้าต่างชั้นหนังอยู่หน้าสุดของจอ"; exit 1 }
Write-Output "ผ่าน หน้าสุดคือ $name"
exit 0
