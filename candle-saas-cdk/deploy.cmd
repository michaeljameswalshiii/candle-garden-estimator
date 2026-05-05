@echo off
REM Candle SaaS CDK - Quick Deploy Script for Windows
REM Usage: deploy.cmd [dev|staging|prod]

setlocal enabledelayedexpansion

set ENVIRONMENT=%1
if "%ENVIRONMENT%"=="" set ENVIRONMENT=dev

echo Deploying Candle SaaS CDK - %ENVIRONMENT% environment

if "%ENVIRONMENT%"=="dev" (
    set ACCOUNT_ID=123456789012
    set REGION=us-east-1
) else if "%ENVIRONMENT%"=="staging" (
    set ACCOUNT_ID=234567890123
    set REGION=us-east-1
) else if "%ENVIRONMENT%"=="prod" (
    set ACCOUNT_ID=345678901234
    set REGION=us-east-1
) else (
    echo Usage: deploy.cmd [dev^|staging^|prod]
    exit /b 1
)

echo AWS Account: %ACCOUNT_ID%
echo AWS Region: %REGION%

echo.
echo Bootstrapping CDK...
call cdk bootstrap aws://%ACCOUNT_ID%/%REGION%

echo.
echo CDK Diff:
call cdk diff -c account=%ACCOUNT_ID% -c region=%REGION%

echo.
echo Starting deployment...
call cdk deploy ^
  -c account=%ACCOUNT_ID% ^
  -c region=%REGION% ^
  --require-approval=never

echo.
echo Deployment complete!
echo.
echo Next steps:
echo 1. Retrieve RDS endpoint
echo 2. Get database credentials from Secrets Manager
echo 3. Initialize database schema: python -m candle_saas.db.init_schema
echo 4. Test API endpoints

endlocal
