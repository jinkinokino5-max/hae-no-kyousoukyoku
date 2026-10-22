@echo off
chcp 65001 > nul
cd /d "%~dp0"
echo Starting local server: http://localhost:8765/
echo Close this window to stop.
start "" http://localhost:8765/index.html
python -m http.server 8765 || py -m http.server 8765 || (echo Python not found. Please install Python from https://www.python.org/ & pause)
