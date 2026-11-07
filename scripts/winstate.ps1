# สถานะหน้าต่างชั้นหนังจริงจาก Windows · ใช้กับ scripts/check-window.mjs
# ตอบเป็น JSON visible (มองเห็นไหม) zoomed (ขยายเต็มจอ) iconic (ย่อลงแถบงาน) foreground (แย่งโฟกัสไปไหม) noactivate (แบบกดแล้วไม่รับโฟกัส)
# ห้ามดูแค่ความกว้างหน้าเว็บ หน้าต่างที่ถูกซ่อนยังตอบความกว้างได้ (แคลร์เคยสรุปผิดเพราะดูแค่ความกว้าง 7 พ.ย. 2569)
# ส่ง -Restore เพื่อคืนหน้าต่างที่ย่ออยู่ (แทนการกดที่แถบงาน)
param([switch]$Restore)
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public class MsWin {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc f, IntPtr l);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsZoomed(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr h, int i);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
}
"@
$proc = Get-Process movie-shelf -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $proc) { '{"running":false}'; exit }
$script:main = [IntPtr]::Zero
[void][MsWin]::EnumWindows({ param($h, $l)
  $p = 0; [void][MsWin]::GetWindowThreadProcessId($h, [ref]$p)
  $sb = New-Object System.Text.StringBuilder 64; [void][MsWin]::GetWindowText($h, $sb, 64)
  if ($p -eq $proc.Id -and $sb.ToString() -eq 'ชั้นหนัง') { $script:main = $h; return $false }
  return $true
}, [IntPtr]::Zero)
if ($script:main -eq [IntPtr]::Zero) { '{"running":true,"window":false}'; exit }
# คืนแบบไม่แย่งโฟกัส (SW_SHOWNOACTIVATE) ไม่ให้หน้าต่างเทสเด้งขึ้นมาบังงานของพี่กัน
if ($Restore) { [void][MsWin]::ShowWindow($script:main, 4); Start-Sleep -Milliseconds 500 }
$h = $script:main
$ex = [MsWin]::GetWindowLong($h, -20)
$fg = [MsWin]::GetForegroundWindow()
$fp = 0; [void][MsWin]::GetWindowThreadProcessId($fg, [ref]$fp)
@{ running = $true; window = $true; visible = [MsWin]::IsWindowVisible($h); zoomed = [MsWin]::IsZoomed($h); iconic = [MsWin]::IsIconic($h);
   foreground = ($fp -eq $proc.Id); noactivate = (($ex -band 0x08000000) -ne 0) } | ConvertTo-Json -Compress
