$root = $PSScriptRoot

Start-Process powershell -ArgumentList "-NoExit","-Command","cd '$root'; npm run dev:server"
Start-Process powershell -ArgumentList "-NoExit","-Command","cd '$root'; npm run dev:client"
Start-Process powershell -ArgumentList "-NoExit","-Command","cd '$root\solver'; .\.venv\Scripts\Activate.ps1; python solver_service.py"

Write-Host "Spawned 3 terminals: server (3000), client (5173), solver (8080)."
