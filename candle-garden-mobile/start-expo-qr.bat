@echo off
echo Starting Expo with QR code generation...
echo.

cd /d "%~dp0"

echo Starting Metro Bundler...
start "Metro Bundler" cmd /k "npx expo start --clear --lan"

echo Waiting for Metro to start...
timeout /t 10 /nobreak >nul

echo Getting Metro URL...
for /f "tokens=4" %%a in ('netstat -ano ^| findstr ":8081" ^| findstr "LISTENING"') do set METRO_PORT=%%a

echo Metro is running, generating QR code...
node generate-qr.js exp://192.168.1.217:8081

echo.
echo QR code generated: qr-code.png
start qr-code.png

echo Done! Scan the QR code with Expo Go.
pause
