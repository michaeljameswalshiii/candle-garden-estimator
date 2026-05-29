# Candle Garden Estimator - Project Goals

## Vision
A polished consumer mobile app (iOS + Android) available on the Apple App Store and Google Play.

Customers can:
- Photograph their own used candle vessels **at home**
- Receive a **reliable** refill volume + cost estimate
- Purchase the refill service (and optionally bundle goods)
- Browse and book classes

The app will be **free to download** with in-app purchases via Square.

## Core Objectives (MVP)

1. **Reliable Refill Estimator** ← **#1 Priority Right Now**
   - Handle real-world photos: multiple vessels, wide/irregular bowls, poor lighting, no soda can
   - Dramatically improve accuracy/consistency
   - Strong fallback logic when confidence is low
   - Explore Grok vision (or multi-model fallback)

2. **Seamless Purchase Flow**
   - Instant quote → pricing → “Purchase Refill” button
   - Square integration (refills + goods + bundles)

3. **Class Scheduling**
   - Browse & book classes
   - Sync with existing Squarespace site

4. **Product Shop**
   - Browse and purchase goods (standalone or bundled)

## Success Metrics
- Refill estimator first-try success rate **> 85%** on typical user photos
- End-to-end purchase flow completes with < 3 taps after quote
- App live on both App Store and Google Play
- Positive user reviews specifically mentioning estimator reliability

## Current Priorities (May/June 2026)
1. **Refill Estimator** — Multi-vessel robustness + Grok vision integration or strong fallback
2. Square purchase integration (production ready)
3. Squarespace class sync
4. Polish + testing → App Store submission

## AI Development Workflow & Operating Parameters

We use **MiniMax M2.7** (via Blackbox AI, Claude Code Extension, or MiniMax VS Code Assistant) as the **primary development agent**.

### Core Operating Principles (for optimal speed + quality)

- **Primary Model**: `MiniMax-M2.7` (or `MiniMax-M2.7-highspeed` when speed is critical)
- **Default Mode**: Builder / Agentic mode (not just chat)
- **Multi-Agent Usage**:
  - Use `/multi-agent` or the parallel agent checkbox for complex features (vision prompt engineering, Lambda refactoring, purchase flow, etc.).
  - Always run at least **2–3 agents in parallel + Chairman review** for critical code (especially vision logic and pricing flows).
  - Leverage native Agent Teams when available.

- **Project Context**:
  - Always keep `PROJECT_GOALS.MD`, `TODO.md`, and relevant files in context.
  - Use `@filename` for relevant files.
  - Maintain `.blackbox/skills/` or `agent.md` files with recurring patterns (vision prompt schemas, Bedrock Lambda structure, strict JSON output, etc.).

- **Quality Guardrails**:
  - Temperature: **0.0–0.2** for vision prompts and code generation (highly deterministic).
  - Require clean TypeScript, proper error handling, and strong fallback logic on every change.
  - Mandatory: Add/update test cases or clear manual verification steps for the estimator.
  - All new features must reference relevant sections from `PROJECT_GOALS.MD`.

- **Workflow Commands (Blackbox / MiniMax)**:
  - `/multi-agent` → for parallel execution + Chairman merge.
  - Plan → Build → Review cycle for every non-trivial task.
  - Use MCP tools where available for testing Bedrock calls, image analysis, etc.

- **Branching Rule**:
  - All agent-generated code goes into feature branches prefixed with `m2.7/` or `blackbox/`.
  - Human review + manual testing (especially with real candle photos) before merging to main.

### Success Metrics for AI-Assisted Development
- Average feature implementation time **< 4 hours** for medium complexity tasks.
- **< 10% rework rate** after PR review.
- Consistent high accuracy on vision tasks and reliable fallback behavior.

This setup maximizes both **velocity** and **reliability** while maintaining the high standards required for a consumer-facing vision AI feature.
