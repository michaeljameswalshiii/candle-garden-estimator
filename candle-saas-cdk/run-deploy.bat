@echo off
cd /d C:\Users\micha\Desktop\candle-garden-estimator\candle-saas-cdk
cdk deploy --all -c account=635449373837 -c region=us-east-1 --require-approval=never
pause
