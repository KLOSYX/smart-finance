$ErrorActionPreference = "Stop"
$projectRoot = $PSScriptRoot
$backendPort = 8008
$frontendPort = 5173
$backendProcess = $null
$frontendProcess = $null

function Get-RequiredCommand {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Name,

        [Parameter(Mandatory = $true)]
        [string]$InstallHint
    )

    $command = Get-Command $Name -ErrorAction SilentlyContinue
    if ($null -eq $command) {
        throw "$Name was not found. $InstallHint"
    }

    return $command.Source
}

function Assert-PortAvailable {
    param(
        [Parameter(Mandatory = $true)]
        [int]$Port,

        [Parameter(Mandatory = $true)]
        [string]$Label
    )

    $listener = [System.Net.Sockets.TcpListener]::new(
        [System.Net.IPAddress]::Loopback,
        $Port
    )
    $listener.Server.ExclusiveAddressUse = $true
    try {
        $listener.Start()
    }
    catch {
        throw "$Label port $Port is already in use. Smart Finance may already be running; close the existing start window or stop that process before starting again."
    }
    finally {
        $listener.Stop()
    }
}

function Install-NodeDependencies {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Directory,

        [Parameter(Mandatory = $true)]
        [string]$Label,

        [Parameter(Mandatory = $true)]
        [string]$RequiredExecutable,

        [Parameter(Mandatory = $true)]
        [string]$NpmCommand
    )

    $requiredPath = Join-Path $Directory "node_modules\.bin\$RequiredExecutable"
    if (Test-Path -LiteralPath $requiredPath) {
        return
    }

    Write-Host "Installing $Label dependencies..."
    Push-Location $Directory
    try {
        $npmAction = if (Test-Path -LiteralPath (Join-Path $Directory "package-lock.json")) {
            "ci"
        }
        else {
            "install"
        }
        & $NpmCommand $npmAction
        if ($LASTEXITCODE -ne 0) {
            throw "npm $npmAction failed for $Label with exit code $LASTEXITCODE."
        }
    }
    finally {
        Pop-Location
    }
}

function Stop-ProcessTree {
    param([System.Diagnostics.Process]$Process)

    if ($null -eq $Process -or $Process.HasExited) {
        return
    }

    # cmd handles taskkill's output so a process that exits during cleanup does
    # not become a terminating PowerShell error.
    & "$env:SystemRoot\System32\cmd.exe" /d /c "taskkill /PID $($Process.Id) /T /F >nul 2>&1"
}

function Start-ChildProcess {
    param(
        [Parameter(Mandatory = $true)]
        [string]$FilePath,

        [Parameter(Mandatory = $true)]
        [string]$Arguments,

        [Parameter(Mandatory = $true)]
        [string]$WorkingDirectory
    )

    # ProcessStartInfo keeps child-process startup consistent across PowerShell
    # versions and inherited environment layouts.
    $startInfo = New-Object System.Diagnostics.ProcessStartInfo
    $startInfo.FileName = $FilePath
    $startInfo.Arguments = $Arguments
    $startInfo.WorkingDirectory = $WorkingDirectory
    $startInfo.UseShellExecute = $false

    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $startInfo
    if (-not $process.Start()) {
        throw "Failed to start $FilePath."
    }

    return $process
}

try {
    $uvCommand = Get-RequiredCommand "uv.exe" "Install uv from https://docs.astral.sh/uv/."
    $null = Get-RequiredCommand "node.exe" "Install Node.js 22.19 or newer."
    # Use npm.cmd explicitly so PowerShell does not resolve npm.ps1 instead.
    $npmCommand = Get-RequiredCommand "npm.cmd" "Install Node.js 22.19 or newer."

    Assert-PortAvailable -Port $backendPort -Label "Backend"
    Assert-PortAvailable -Port $frontendPort -Label "Frontend"

    Install-NodeDependencies `
        -Directory (Join-Path $projectRoot "frontend") `
        -Label "Frontend" `
        -RequiredExecutable "vite.cmd" `
        -NpmCommand $npmCommand
    Install-NodeDependencies `
        -Directory (Join-Path $projectRoot "agent") `
        -Label "Agent" `
        -RequiredExecutable "tsx.cmd" `
        -NpmCommand $npmCommand

    Write-Host "Starting Backend (FastAPI)..."
    Push-Location (Join-Path $projectRoot "backend")
    try {
        & $uvCommand "run" "python" "-c" "from app.core.database import ensure_database; ensure_database()"
        if ($LASTEXITCODE -ne 0) {
            throw "Database migration failed with exit code $LASTEXITCODE."
        }
    }
    finally {
        Pop-Location
    }
    $backendProcess = Start-ChildProcess `
        -FilePath $uvCommand `
        -Arguments "run uvicorn app.main:app --port $backendPort" `
        -WorkingDirectory (Join-Path $projectRoot "backend")

    Write-Host "Starting Frontend (Vite)..."
    $frontendProcess = Start-ChildProcess `
        -FilePath $npmCommand `
        -Arguments "run dev -- --port $frontendPort --strictPort" `
        -WorkingDirectory (Join-Path $projectRoot "frontend")

    Write-Host ""
    Write-Host "Servers are running."
    Write-Host "Backend: http://localhost:$backendPort"
    Write-Host "Frontend: http://localhost:$frontendPort"
    Write-Host "Press Ctrl+C to stop."

    while ($true) {
        if ($backendProcess.HasExited) {
            throw "Backend exited unexpectedly with code $($backendProcess.ExitCode)."
        }
        if ($frontendProcess.HasExited) {
            throw "Frontend exited unexpectedly with code $($frontendProcess.ExitCode)."
        }
        Start-Sleep -Milliseconds 500
    }
}
finally {
    if ($null -ne $backendProcess -or $null -ne $frontendProcess) {
        Write-Host ""
        Write-Host "Stopping servers..."
    }
    Stop-ProcessTree $frontendProcess
    Stop-ProcessTree $backendProcess
}
