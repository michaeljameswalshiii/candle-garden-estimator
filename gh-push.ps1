Set-Location "C:\Users\micha\Downloads\Candle Garden - Estimator"

# Initialize git if not already
if (!(Test-Path .git)) {
    git init
}

# Add all files
git add .

# Commit
git commit -m "Initial commit of Candle Garden Estimator"

# Set the token
$env:GITHUB_TOKEN = "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"

# Create the repo and push
& "C:\Program Files\GitHub CLI\gh.exe" repo create candle-garden-estimator --private --source=. --push

pause
