# Task Plan: Candle Garden Estimator Updates

## Task Overview
Update confidence threshold in frontend and improve the AI prompt in the Lambda backend.

## Changes Required

### A. Frontend Change (EstimatorScreen.js)
- **File**: `candle-garden-estimator/candle-garden-mobile/screens/EstimatorScreen.js`
- **Line ~141**: Change confidence threshold from `0.5` to `0.35`
- **Current**: `if (!detectData.success || !detectData.container_detected || detectData.confidence < 0.5)`
- **New**: `if (!detectData.success || !detectData.container_detected || detectData.confidence < 0.35)`

### B. Backend Change (lambda_function_updated.py)
- **File**: `candle-garden-estimator/lambda_function_updated.py`
- **Function**: `analyze_image_with_nova`
- **Change**: Replace the prompt with improved version that:
  - Identifies the 12 oz soda can as scale reference
  - Identifies ALL candle vessels (mugs, jars, bowls, glasses)
  - Ignores the soda can
  - Estimates volume for EACH vessel
  - Returns TOTAL volume with structured JSON output
  - Higher confidence through better prompt engineering

## Implementation Steps

1. Edit EstimatorScreen.js - Lower confidence threshold to 0.35
2. Edit lambda_function_updated.py - Update analyze_image_with_nova prompt
3. Files ready for Lambda redeployment

## Status
- [x] Edit EstimatorScreen.js (Step 1) - Changed confidence threshold from 0.5 to 0.35
- [x] Edit lambda_function_updated.py (Step 2) - Updated prompt and response parsing
