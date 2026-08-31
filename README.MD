# Candle Garden Estimator

## Repository layout

This repository contains three independently deployable applications plus shared data:

- `candle-garden-mobile/` — Expo iOS and Android app, released through EAS.
- `candle-garden-web/` — Next.js public storefront, deployed through its own Vercel project.
- `candle-saas-cdk/` — AWS infrastructure and APIs, deployed through CDK.
- `packages/catalog/` — product and class snapshots consumed by web and mobile.

GitHub Actions use path filters so a web-only change does not validate the mobile app and a mobile-only change does not validate the website. Shared catalog changes validate both consumers.

**A powerful iOS tool for precise candle-making calculations**  
Built for The Candle Garden – Jacksonville, Florida's premier soy candle and house plant studio.

---

## About the App

Candle Garden Estimator takes the guesswork out of candle production. Quickly calculate wax requirements, fragrance oil loads, total batch costs, and more for any mold or container size. Perfect for small-batch soy candle makers who want accurate, repeatable results without spreadsheets.

Whether you're preparing for a class, fulfilling online orders, or scaling up production, this app helps you:
- Save money on materials
- Maintain consistent quality
- Price your candles profitably

---

## Features

- **Instant Material Calculations** — Wax weight, fragrance load percentage, and wick recommendations
- **Cost Estimator** — Material costs, labor, and suggested retail pricing
- **Batch Scaling** — Scale recipes up or down for any number of candles
- **Multiple Container Support** — Jars, molds, tealights, and custom volumes
- **Soy Wax Specific Formulas** — Optimized for 100% soy wax (with support for blends)
- **Clean, Intuitive Interface** — Designed for fast use in the studio or on the go
- **Offline First** — Works without internet connection

---

## Screenshots

*(Add screenshots here once you have them — highly recommended!)*

<!-- 
![Home Screen](screenshots/home.png)
![Calculator Screen](screenshots/calculator.png)
![Results Screen](screenshots/results.png)
-->

---

## Tech Stack

- **SwiftUI** – Modern, responsive UI
- **Xcode** – Built with the latest stable version
- **iOS 17+** – Target deployment

---

## Getting Started (for Developers)

### Prerequisites
- macOS with the latest stable Xcode installed
- Apple Developer Program membership (active)
- iPhone or iPad for on-device testing

### Building and Running

1. Clone the repository:
   ```bash
   git clone https://github.com/michaeljameswalshiii/candle-garden-estimator.git
