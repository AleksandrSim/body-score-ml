# BodyScore — iOS app (minimal)

A native SwiftUI client for the Body Score analyzer. Take/choose a photo, it POSTs
to the FastAPI `/analyze` endpoint and shows the scores. The model still runs on the
server (your Mac via the tunnel) — this is the thin-client MVP. On-device MLX is a v2.

## Requirements
- **Xcode 16+** (install from the Mac App Store — Command Line Tools alone is not enough).
- An **Apple Developer account** to ship to TestFlight ($99/yr). Not needed just to run on
  your own phone via free provisioning (7-day expiry).

## Open & run
1. `open ios/BodyScore.xcodeproj`
2. Select the **BodyScore** target → **Signing & Capabilities** → set **Team** to your
   Apple ID, and change **Bundle Identifier** from `com.example.bodyscore` to something
   unique (e.g. `com.yourname.bodyscore`).
3. Plug in your iPhone, pick it as the run destination, press **▶︎**.
4. In the app, tap the ⚙️ (top-right) and paste the **current** server URL
   (the tunnel URL changes every restart). Default points at the last known tunnel.

## Ship to TestFlight
1. Set the run destination to **Any iOS Device (arm64)**.
2. **Product → Archive**.
3. In the Organizer: **Distribute App → TestFlight & App Store → Upload**.
4. In App Store Connect → your app → TestFlight: add testers (internal = instant;
   external = ~1 day beta review). Testers install via the TestFlight app link.

## Notes / limits
- The server must be reachable (Mac awake + `uvicorn` + tunnel running) for the app to work.
- For a stable tester experience, give the backend a **permanent URL** (named Cloudflare
  tunnel) instead of the random `trycloudflare.com` one, then paste it in ⚙️ once.
- The app calls HTTPS only (the tunnel is HTTPS), so no ATS exception is needed.
