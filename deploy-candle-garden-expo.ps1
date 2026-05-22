# Deploy Candle Garden to Expo
# This script starts the Expo dev server and generates a QR code with local IP

Write-Host "======================================" -ForegroundColor Cyan
Write-Host "Deploy Candle Garden to Expo" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Get local IP address
Write-Host "[1/4] Getting local IP address..." -ForegroundColor Yellow
$ipOutput = ipconfig | Select-String "IPv4"
$localIP = ($ipOutput -split ":")[-1].Trim()
Write-Host "Local IP: $localIP" -ForegroundColor Green

# Step 2: Check if Expo is already running on port 8081
Write-Host ""
Write-Host "[2/4] Checking for existing Expo server..." -ForegroundColor Yellow
$portCheck = netstat -ano | Select-String ":8081.*LISTENING"

if ($portCheck) {
    Write-Host "Expo server already running on port 8081" -ForegroundColor Green
} else {
    Write-Host "Starting Expo server..." -ForegroundColor Yellow
    Write-Host "Please run: start-dev.bat" -ForegroundColor Red
    Write-Host "Then re-run this script" -ForegroundColor Red
}

# Step 3: Generate QR code with local IP
Write-Host ""
Write-Host "[3/4] Generating QR code with local IP..." -ForegroundColor Yellow

# Install required packages if needed
python -c "import qrcode" 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Installing qrcode package..." -ForegroundColor Yellow
    python -m pip install qrcode pillow -q
}

# Generate and display QR code
$qrUrl = "exp://$localIP`:8081"
python -c "import qrcode; qr = qrcode.make('$qrUrl'); qr.show()"

Write-Host "QR Code URL: $qrUrl" -ForegroundColor Green

# Step 4: Show instructions
Write-Host ""
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "[4/4] Ready to connect!" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "To access the app:" -ForegroundColor White
Write-Host "1. Open Expo Go on your phone" -ForegroundColor White
Write-Host "2. Tap 'Scan QR Code'" -ForegroundColor White
Write-Host "3. Scan the QR code above" -ForegroundColor White
Write-Host ""
Write-Host "Or manually enter: exp://$localIP`:8081" -ForegroundColor White
Write-Host ""
Write-Host "Make sure your phone is on the same WiFi network!" -ForegroundColor Yellow
