@echo off
setlocal
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$project = (Get-Location).Path; $ready = $false; try { $page = Invoke-WebRequest -Uri 'http://localhost:5173/' -TimeoutSec 1 -UseBasicParsing; $ready = $page.Content.Contains('<title>Illustrated Archive — Portfolio Demo</title>') } catch {}; if (-not $ready) { Start-Process -FilePath 'cmd.exe' -ArgumentList @('/d','/c','npm run dev') -WorkingDirectory $project -WindowStyle Normal; for ($i = 0; $i -lt 30 -and -not $ready; $i++) { Start-Sleep -Seconds 1; try { $page = Invoke-WebRequest -Uri 'http://localhost:5173/' -TimeoutSec 1 -UseBasicParsing; $ready = $page.Content.Contains('<title>Illustrated Archive — Portfolio Demo</title>') } catch {} } }; if ($ready) { Start-Process 'http://localhost:5173/' } else { Write-Error 'The gallery server did not start. Check that Node.js dependencies are installed, then run npm install.'; exit 1 }"
endlocal

