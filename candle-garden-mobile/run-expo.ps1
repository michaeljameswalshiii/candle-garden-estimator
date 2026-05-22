# Run Expo Dev Server
Set-Location "C:\Users\micha\Desktop\candle-garden-estimator\candle-garden-mobile"

# Check if node_modules exists
if (-not (Test-Path "node_modules")) {
    Write-Host "Installing dependencies..."
    npm install
}

# Start Expo
Write-Host "Starting Expo..."
npx expo start --clear
