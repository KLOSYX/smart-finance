@echo off
setlocal
set "SCRIPT_DIR=%~dp0"
set "PWSH_EXE=pwsh.exe"
"%SystemRoot%\System32\where.exe" pwsh.exe >nul 2>&1
if errorlevel 1 if exist "%USERPROFILE%\scoop\shims\pwsh.exe" (
    set "PWSH_EXE=%USERPROFILE%\scoop\shims\pwsh.exe"
)
"%PWSH_EXE%" -NoProfile -Command "exit 0" >nul 2>&1
if errorlevel 1 (
    echo PowerShell 7 was not found. Install it before starting Smart Finance.
    exit /b 1
)
"%PWSH_EXE%" -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%start.ps1" %*
exit /b %ERRORLEVEL%
