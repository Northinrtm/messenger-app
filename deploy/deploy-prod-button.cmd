@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy-prod-button.ps1" %*
exit /b %errorlevel%
