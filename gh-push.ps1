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
