@echo off
cd /d C:\Users\micha\Desktop\candle-garden-estimator\candle-garden-mobile
echo Installing dependencies...
call npm install
echo Starting Expo...
call npx expo start --tunnel
pause
