@echo off
REM GestEffect - Setup and Verification Script for Windows
REM Run this script to verify your GestEffect installation

cls
echo.
echo ============================================================
echo           GestEffect - Setup ^& Verification Script
echo ============================================================
echo.

setlocal enabledelayedexpansion

set CHECKS=0
set PASSED=0
set FAILED=0

REM Color codes (using simple indicators for Windows CMD)
echo Checking system requirements...
echo.

REM Check Python version
echo [1] Python 3.8+ ... 
python --version >nul 2>&1
if !errorlevel! equ 0 (
    for /f "tokens=2" %%i in ('python --version 2^>^&1') do (
        echo   Found Python %%i
        set /a CHECKS+=1
        set /a PASSED+=1
    )
) else (
    echo   [ERROR] Python not found
    set /a CHECKS+=1
    set /a FAILED+=1
)
echo.

REM Check required files
echo Checking required files...
set /a CHECKS+=1
if exist app.py (
    echo [2] app.py ... OK
    set /a PASSED+=1
) else (
    echo [2] app.py ... MISSING
    set /a FAILED+=1
)

set /a CHECKS+=1
if exist requirements.txt (
    echo [3] requirements.txt ... OK
    set /a PASSED+=1
) else (
    echo [3] requirements.txt ... MISSING
    set /a FAILED+=1
)

set /a CHECKS+=1
if exist templates\index.html (
    echo [4] templates\index.html ... OK
    set /a PASSED+=1
) else (
    echo [4] templates\index.html ... MISSING
    set /a FAILED+=1
)

set /a CHECKS+=1
if exist static\style.css (
    echo [5] static\style.css ... OK
    set /a PASSED+=1
) else (
    echo [5] static\style.css ... MISSING
    set /a FAILED+=1
)

set /a CHECKS+=1
if exist README.md (
    echo [6] README.md ... OK
    set /a PASSED+=1
) else (
    echo [6] README.md ... MISSING
    set /a FAILED+=1
)

echo.
echo Checking Python dependencies...

REM Check Python imports
python -c "import cv2" >nul 2>&1
set /a CHECKS+=1
if !errorlevel! equ 0 (
    echo [7] OpenCV (cv2) ... OK
    set /a PASSED+=1
) else (
    echo [7] OpenCV (cv2) ... MISSING (install: pip install -r requirements.txt^)
    set /a FAILED+=1
)

python -c "import mediapipe" >nul 2>&1
set /a CHECKS+=1
if !errorlevel! equ 0 (
    echo [8] MediaPipe ... OK
    set /a PASSED+=1
) else (
    echo [8] MediaPipe ... MISSING (install: pip install -r requirements.txt^)
    set /a FAILED+=1
)

python -c "import flask" >nul 2>&1
set /a CHECKS+=1
if !errorlevel! equ 0 (
    echo [9] Flask ... OK
    set /a PASSED+=1
) else (
    echo [9] Flask ... MISSING (install: pip install -r requirements.txt^)
    set /a FAILED+=1
)

python -c "import numpy" >nul 2>&1
set /a CHECKS+=1
if !errorlevel! equ 0 (
    echo [10] NumPy ... OK
    set /a PASSED+=1
) else (
    echo [10] NumPy ... MISSING (install: pip install -r requirements.txt^)
    set /a FAILED+=1
)

echo.
echo Checking Python syntax...

python -m py_compile app.py >nul 2>&1
set /a CHECKS+=1
if !errorlevel! equ 0 (
    echo [11] app.py syntax ... OK
    set /a PASSED+=1
) else (
    echo [11] app.py syntax ... ERROR
    set /a FAILED+=1
)

echo.
echo ============================================================
echo                       SUMMARY
echo ============================================================
echo Total Checks: !CHECKS!
echo Passed:       !PASSED!
echo Failed:       !FAILED!
echo.

if !FAILED! equ 0 (
    echo.
    echo All checks passed! Ready to run.
    echo.
    echo Next steps:
    echo   1. Run: python app.py
    echo   2. Open: http://localhost:5000
    echo   3. Allow webcam access when prompted
    echo.
    pause
    exit /b 0
) else (
    echo.
    echo Some checks failed. See above for details.
    echo.
    echo To fix:
    echo   1. Install Python 3.8+: https://python.org
    echo   2. Install dependencies: pip install -r requirements.txt
    echo   3. Check webcam connection
    echo   4. Run setup again: setup.bat
    echo.
    pause
    exit /b 1
)
