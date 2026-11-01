# AssetPulse — Indoor Asset Tracking & Localization

AssetPulse is the web dashboard for an AWS-powered indoor BLE asset tracker. ESP32 receivers scan for an
ISC-Beacon-V01 tag (`B4:A7:24:16:BA:8A`) and publish RSSI over MQTT/TLS to AWS IoT Core. Lambda functions
process the telemetry and store results in DynamoDB. AssetPulse reads those results through API Gateway,
authenticated with Amazon Cognito, and provides:

- a configurable rectangular room with interactive **2D (SVG)** and **3D (React Three Fiber)** views;
- ESP32 receivers that can be dragged on the map or positioned by typing X/Y/Z;
- **Voronoi zones** computed from receiver positions and clipped to the room;
- the backend's position estimate, localization status and diagnostics;
- live RSSI monitoring, a session event feed and analytics;
- a **remote calibration wizard** that drives the backend calibration endpoints;
- a clearly labelled **Demo Mode** with a built-in simulator.

The backend (`BLETelemetryProcessor`, `BLELocalizationProcessor`, `BLETrackingAPI`, table `AssetTracking`, region
**`ap-southeast-2`**) remains the source of truth. This frontend does not implement localization or calibration
fitting. It never talks to DynamoDB or IoT Core directly.

## Technology stack

React 18 · TypeScript (strict) · Vite 6 · Tailwind CSS 4 · shadcn/ui-style components (Radix primitives,
`components.json` included) · Lucide · React Three Fiber + Drei + Three.js · Recharts · d3-delaunay ·
TanStack Query · React Router · Zustand (UI preferences, room draft, session history) ·
oidc-client-ts / react-oidc-context (Cognito OAuth 2.0 + PKCE) · Vitest.

## Getting started

```bash
npm install
cp .env.example .env      # fill in values for Live mode (optional for Demo Mode)
npm run dev               # http://localhost:5173
```

| Script              | Purpose                               |
| ------------------- | ------------------------------------- |
| `npm run dev`       | Vite dev server (port 5173)           |
| `npm run build`     | Type-check and production build → `dist/` |
| `npm run typecheck` | TypeScript validation only            |
| `npm test`          | Unit tests (Vitest)                   |
| `npm run preview`   | Serve the production build            |

Demo Mode works with no environment variables at all.

## Environment variables

| Variable                    | Example                                                      |
| --------------------------- | ------------------------------------------------------------ |
| `VITE_AWS_REGION`           | `ap-southeast-2` (do not change)                             |
| `VITE_COGNITO_USER_POOL_ID` | `ap-southeast-2_AbCdEfGhI`                                   |
| `VITE_COGNITO_CLIENT_ID`    | public app client ID (no client secret)                      |
| `VITE_COGNITO_DOMAIN`       | `your-prefix.auth.ap-southeast-2.amazoncognito.com`          |
| `VITE_API_BASE_URL`         | `https://abc123.execute-api.ap-southeast-2.amazonaws.com` (API Gateway, **not** DynamoDB or the IoT endpoint) |

Optional variables: `VITE_COGNITO_SCOPES` (default
`openid email profile asset-tracker/read asset-tracker/write`), `VITE_COGNITO_REDIRECT_URI` (default
`<origin>/auth/callback`) and `VITE_COGNITO_LOGOUT_URI` (default `<origin>/`).

All of these are public identifiers. Never put AWS access keys in the frontend.

## Cognito setup

On the existing User Pool app client:

1. Make it a **public client** with **no client secret**, using the **Authorization code grant** (PKCE is
   always used by the app).
2. **Allowed callback URLs:** `http://localhost:5173/auth/callback` plus your deployed origin, e.g.
   `https://dashboard.example.com/auth/callback`.
3. **Allowed sign-out URLs:** `http://localhost:5173/` plus your deployed origin.
4. **Scopes:** `openid`, `email`, `profile`, `asset-tracker/read` and `asset-tracker/write`. These come from the
   resource server whose identifier is `asset-tracker`.
5. Enable Managed Login on the domain.

Sign-in flow: the login screen redirects to Managed Login. Cognito sends the browser back to `/auth/callback`,
and the PKCE code exchange completes there. The **access token** (not the ID token) is then sent as
`Authorization: Bearer …` on every API Gateway request. Tokens are kept in `sessionStorage` by oidc-client-ts and
renewed silently with the refresh token. They are never logged or rendered. Logout clears the local session and
calls Cognito's `/logout` endpoint.

Write actions (saving the configuration, all calibration actions) are disabled in the UI unless the access
token's `scope` claim includes `asset-tracker/write`. API Gateway still enforces authorization on its side.

If you host the app as a static site (S3/CloudFront, Amplify Hosting), send every route to `index.html` (SPA
fallback) so that `/auth/callback` resolves.

## Connecting to API Gateway

The API must allow CORS from the dashboard origin, with the `Authorization` and `Content-Type` headers and the
`GET, PUT, POST, OPTIONS` methods. The app uses only these endpoints:

| Method | Path | Used for |
| --- | --- | --- |
| GET | `/health` | Header connection status (polled every 20 s) |
| GET | `/asset` | Tracking state (polled every 2.5 s by default; configurable 2–5 s) |
| GET / PUT | `/config` | Room and receiver configuration |
| GET | `/calibration/models` | Active models |
| GET | `/calibration/status` | Session and points (polled every 1.5 s while sampling) |
| POST | `/calibration/start`, `/point`, `/stop`, `/fit`, `/apply` | Calibration wizard |

All response parsing lives in [`src/services/normalize.ts`](src/services/normalize.ts). The shapes listed at
the top of that file were checked against the backend handlers (`api_lambda.py`, `localization_lambda.py`,
`common.py`). Behaviours the UI depends on:

- **`GET /asset`** computes the position on demand. Its `updated_at` is the computation time, so data
  freshness is taken from the newest receiver reading instead. `receivers` includes only readings up to 20 s
  old (`STALE_MS`); the dashboard uses the same 20 s threshold for "Online". `receivers_used` counts only
  receivers that also have an activated model. When three receivers report but fewer than three are
  calibrated, the UI shows **Calibration required** rather than plain insufficient data.
- **Calibration sampling state.** `GET /calibration/status` does not say which point is collecting, and
  `session.state` stays `"sampling"` after the first point (`/stop` does not reset it). The wizard therefore
  tracks the active point from the `point_id` and `expires_at` returned by `POST /calibration/point`. It keeps
  them in `sessionStorage` so a reload doesn't lose them, and treats the point as closed after Stop or once
  `expires_at` passes.
- **Fit results.** A receiver without enough data is `{ accepted: false, error }` and is shown as invalid
  with that error. On fit results, `accepted: false` means "not activated yet", not "invalid". The chart
  plots each model's `points` (per-point median RSSI vs distance), which is the data the backend fitted.
  The fit needs at least 3 positions; a position with fewer than 8 samples, or closer than 0.25 m to the
  receiver, is skipped for that receiver; and the backend accepts n between 1 and 6 and P0 between −110 and
  −20 dBm.
- **`POST /calibration/fit`** always fits the latest session. The app sends `{ "session_id": … }`, which the
  backend ignores.
- **`GET /calibration/models`** returns `{ "esp32-a": model | null, … }`. The activation time and session are
  read from each model's `updated_at` and `session_id`.
- **`PUT /config`** always returns a recalibration `warning`; the app shows it after every save.
- The dashboard has no warning for high RSSI variance, because the status endpoint doesn't report sample
  spread. A per-receiver `std_rssi` on status points would be picked up automatically.

### Suggested backend improvements (optional)

- Include the `SYSTEM/CAL_ACTIVE` item in `GET /calibration/status` (e.g. `"active": {point_id, state,
  expires_at}`). The frontend already reads it if present, which would make sampling state survive across
  devices.
- `GET /asset` writes the `POSITION` item to DynamoDB on every call. Each open dashboard tab polls every
  2.5 s (about 24 writes per minute per tab).
- `KeyError`s are returned as 400 with the bare key name (e.g. `'x'`); a clearer message would help
  operators.

## Live mode vs Demo Mode

On the login screen, choose **Sign in with Cognito** (Live) or **Explore Demo Mode**. You can switch later
under **Settings → Data mode**.

- **Live** reads only from API Gateway. If a request fails, the UI shows the real error or a "disconnected"
  state. It never silently falls back to simulated data.
- **Demo** uses a separate simulator ([`src/services/mockApi.ts`](src/services/mockApi.ts)). Its responses have
  the same raw shape as the API and go through the same normalizers, so the same UI code runs in both modes. A
  pink **DEMO MODE** badge stays in the header. The demo asset follows known simulated coordinates. The
  **Demo controls** panel can move the asset, jump to a zone, toggle receivers, simulate signal loss and restore
  normal operation. Demo state lives in memory and resets when the page reloads.

Switching modes clears all cached server data and session history.

## Using the dashboard

### Editing room dimensions

Switch the map to **Edit** (requires write scope), or press **Edit layout** in *Room configuration*. You can
then change width (X), length (Y), height (Z) and the assumed asset height. Both maps and the Voronoi zones
update immediately. Invalid values are listed and block saving. The header badge shows **Editing · unsaved
changes** until you press **Save configuration**, which sends `PUT /config` with all three receivers. Leaving
Edit mode with unsaved changes asks for confirmation. **Reload** fetches the configuration from the backend
again. Any `warning` the backend returns (for example, recalibration needed) is shown.

### Positioning receivers

In Edit mode, use either method; both edit the same draft state:

- **Drag** a receiver on the 2D map. Grid snapping is optional, positions are clamped to the room, and the
  map does not pan while you drag.
- Select a receiver and **type X/Y/Z**, or focus a marker and nudge it with the arrow keys (Shift = ×5).

A receiver's configured position is separate from its online status. ESP32 C keeps its configured position
(used for zones) while it shows Offline. If two receivers share an X/Y position, the app warns that their zones
are ambiguous.

### Zones

Zones are the Voronoi cells of the receiver X/Y positions, clipped to the room (computed with
`d3-delaunay`). The highlighted zone is the one belonging to the **backend's `nearest_receiver`** for the
estimated point. It is never chosen by strongest RSSI.

### Localization display

The asset marker is drawn only when `GET /asset` returns `status: "estimated"` with coordinates, and it eases
between successive estimates. A result older than 20 s (polling stalled) is marked **stale** and shown as a dashed historical
marker. It is never extrapolated. In 3D the asset is drawn at `(x, y, asset_height)`, and that height is labelled
as assumed. `range_residual_rmse_m` is labelled as a model-consistency measure, not as positioning accuracy.
The optional **Range est.** layer draws horizontal ranges from the active P0/n models and current RSSI, and is
labelled as an estimate.

Receiver status comes from observation timestamps only. **Online** means an observation within 20 s (the backend's `STALE_MS`), **No
recent observations** means within 120 s, and **Offline** means older than that or never seen this session. The
backend has no heartbeat, so "offline" does not prove a device is powered off.

### Running calibration

Open the wizard from **Calibration** in the sidebar, or with **Calibrate** on the map toolbar.

1. **Start calibration** → `POST /calibration/start`.
2. Click the map or type the **known position** (yellow crosshair, distinct from the pink asset marker).
3. Place the beacon there physically, then press **Start sampling** → `POST /calibration/point {x, y}`. Status
   is polled and shows per-receiver sample counts, elapsed time and the last observation. The backend window is
   about 120 s, and the UI never treats a point as complete because of a local timer.
4. **Stop sampling** → `POST /calibration/stop`.
5. Repeat at **5 or more spread-out positions**. Completed points appear on the map and in the table.
6. **Fit** → `POST /calibration/fit`. The app shows P0, n, RSSI RMSE, samples and validation per receiver, a
   measured-vs-model chart (when the data exists) and quality warnings: sparse samples, high variance, unusual
   n or P0, poor fit, missing receivers.
7. **Apply** (enabled only if every model is valid) → `POST /calibration/apply {session_id}`. Success is shown
   only after the API confirms it. Backend errors are displayed exactly as returned.

The UI keeps three states separate: collected measurements, fitted models, and activated models (the latter
from `GET /calibration/models`). If the room layout was saved after the active models were applied, it warns
that calibration may be out of date.

## Current two-receiver limitation

Only `esp32-a` and `esp32-b` are deployed right now. With two receivers:

- live RSSI, receiver status, zones (all three configured positions) and calibration sampling all work;
- `GET /asset` returns `insufficient_data`, and the dashboard shows **"Position unavailable — three calibrated
  receivers required."** It does not compute or fake a 2D position;
- ESP32 C appears as configured but **Offline**, and its calibration samples stay at 0;
- the backend's fit/apply endpoints require valid models for all three receivers, so a full calibration cannot
  be activated yet. Any rejection is shown verbatim. No ESP32 C data is fabricated and the backend validation is
  not bypassed.

## Adding the third receiver

Deploy ESP32 C with receiver ID `esp32-c`, so that it publishes to the same IoT topic. Set its real position in
Edit mode and save. Then run the calibration wizard with all three receivers online. Once the backend activates
three valid models, `GET /asset` starts returning `status: "estimated"` with `x`/`y`. The dashboard then shows
the marker, zone highlight, trail and diagnostics automatically, with no code changes.

## Testing

```bash
npm test
```

The unit tests cover the coordinate transforms, room validation, Voronoi zone ownership (including coincident
and collinear receivers), API response normalization, the live API client's error handling (with a mocked
`fetch`), stale-receiver detection, rendering of each localization status, and the signal model.

**What has been verified:** the TypeScript check, the production build and the unit tests pass. A headless
browser exercised every route in Demo Mode: receiver dragging and manual entry, 2D/3D, zone updates, saving,
the two-receiver `insufficient_data` state, and the full calibration flow (start → 5 points → fit → apply,
plus the case where fit is rejected because ESP32 C has no samples).

**What has not been verified:** live AWS integration (Cognito sign-in and real API Gateway responses). It was
not tested because no AWS configuration or credentials were available.

## Project structure

```
src/
  app/          App, providers, router, ApiProvider (live vs demo data source)
  components/   layout, room (2D/3D maps, controls), tracking, calibration, charts, dashboard, auth, ui
  pages/        LiveTracking, Devices, Calibration, Analytics, Settings, Login
  services/     api.ts (API Gateway client), normalize.ts (response contract), auth.ts (Cognito), mockApi.ts (demo)
  hooks/        useAssetTracking, useRoomConfiguration, useCalibration, useReceiverStatus, useMapData, …
  stores/       modeStore, uiStore, roomDraftStore, historyStore, calibrationStore (Zustand)
  types/        api, room, tracking, calibration
  utils/        coordinates, voronoi, signal, localization, receivers, calibrationQuality, time
  config/       env.ts, constants.ts
tests/          Vitest unit tests
```
