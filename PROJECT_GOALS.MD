# Candle Garden Estimator - Project Goals

## Vision
A polished consumer mobile app (iOS + Android) available on the Apple App Store and Google Play.  
Customers can:
- Photograph their own used candle vessels **at home**
- Receive a reliable refill volume + cost estimate
- Purchase the refill service (and optionally bundle goods)
- Browse and book classes

The app will be **free to download** with in-app purchases via Square.

## Core Objectives (MVP - Minimum Viable Public App)
1. **Reliable Refill Estimator** ← **#1 Priority Right Now**
   - Customers take photos of empty/mostly-empty candle vessels at home (with or without soda can for scale)
   - Dramatically improve accuracy and consistency over current Bedrock Nova Lite results
   - Handle real-world cases: multiple vessels, wide bowls, irregular shapes, poor lighting, no reference object
   - Grok vision has shown stronger performance — explore as primary model or intelligent fallback

2. **Seamless Purchase Flow**
   - Instant quote → clear pricing → “Purchase Refill” button
   - Square integration for payments (refills + goods + bundles)

3. **Class Scheduling**
   - Basic browsing and booking
   - Sync with existing Squarespace site (availability, bookings, customer data)

4. **Product Shop**
   - Browse and purchase goods separately or bundled with refills

## Success Metrics
- Refill estimator success rate >80% on first try for typical user photos
- End-to-end refill purchase flow completes without friction
- App approved and live on Apple App Store + Google Play
- Positive user feedback on estimator reliability

## Current Priorities (May/June 2026)
1. Improve refill estimator accuracy and robustness (highest priority)
2. Complete Square purchase integration
3. Finish Squarespace class synchronization
4. Minimal polish + internal testing → App Store submission

## MiniMax Best Practices (Applied to This Project)
- **Keep prompts clear, structured, and example-driven** — especially for vision tasks (include scale reference rules, output JSON schema, realistic volume ranges).
- **Use low temperature (0.0–0.1) for estimation consistency** and higher only for creative flows.
- **Implement robust fallback logic** — when AI confidence is low, gracefully guide the user to better photos or manual entry.
- **Iterate with real user photos** — maintain a small test set (wide bowls, no soda can, bad lighting, multiple vessels) and re-test prompts regularly.
- **Agentic / multi-step workflows** — separate detection → scaling → pricing → checkout steps for better reliability.
- **Minimal yet professional architecture** — avoid over-engineering; focus on fast iteration and measurable improvements (MiniMax-style agent best practices).
- **Version prompts and track performance** — store prompt versions in the repo and log estimator results for continuous improvement.

## Non-Goals (for MVP)
- Heavy visual polish / animations
- Advanced analytics dashboard
- Offline estimation (can be added later)
- Complex bundling logic

## Tech Stack
- **Mobile**: React Native + Expo
- **Backend**: AWS CDK + Lambda (Bedrock Nova Lite + potential Grok vision integration)
- **Payments**: Square
- **Classes**: Squarespace sync
- **AI Vision**: Focus on reliable volume estimation from user photos

## File References
- `TODO.md` — daily/weekly tasks
- `tasks_plan.md` — detailed implementation plans
- GitHub Issues — track major features

**Last Updated:** May 28, 2026
