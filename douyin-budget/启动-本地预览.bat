@echo off
rem Windows 一键启动本地预览（双击运行）
chcp 65001 >nul
cd /d "%~dp0"
python start_server.py
pause
