# Changelog

All notable changes to dashtab are documented in this file.

## [1.5.0] - 2026-06-14

### Added
- **Optional notes:** sticky notes can now be turned on or off from Settings. The
  toggle saves and applies instantly, no "Save & Reload" needed. Notes are
  **off by default** on a fresh install.

### Changed
- **Portfolio bar is now contextual:** the "Current Portfolio" summary only shows
  when you have entered share amounts for at least one ticker. Price-only setups
  no longer display an empty portfolio bar.
- Default greeting is now the generic "🤖 HELLO, STRANGER" (still editable in Settings).

## [1.4.1] - 2026-03-17

### Fixed
- **Weekend / pre-market 0.00% bug:** the daily change no longer shows 0.00%
  during weekends, holidays or before the market opens. A smart calendar
  fallback calculates the difference using the last real trading session.
- **HTTP 401 errors:** reverted to the public `v8/chart` Yahoo Finance endpoint
  to avoid requests being blocked for lacking session cookies.
- **Privacy toggle reloads:** the privacy (👁️) button now updates the UI
  instantly from cached data instead of triggering a full network reload.
- **Privacy obfuscation:** the privacy toggle correctly hides the summary
  percentages (`***%`) even in equal-weight mode (no shares entered).

## [1.4.0] - 2026-03-16

### Added
- **Backup & Restore:** export your full configuration (tickers, shares, UI
  preferences) to a `.json` file and import it back, so you never lose your
  setup during manual updates.
- Added this changelog to track project history.

## [1.3.1] - 2026-03-15

### Added
- **Weighted portfolio math:** the summary bar calculates weighted performance
  (Today, 30D, 365D) based on the dollar value of your holdings.
- **Share inputs:** Settings fields to track how many shares of each stock you own.
- **Privacy mode:** an "eye" toggle (👁️) to hide total value and holdings (`***`).

## [1.3.0] - 2026-02-12

### Added
- **Portfolio summary bar** below the search bar showing high-level performance
  (Today, 30 days, 365 days) using equally-weighted averages.

## [1.2.0] - Earlier versions

### Added
- Grid layout for stocks with sparkline charts.
- Drag-and-drop ordering in the Settings panel.
- Live clock and personalized greeting.
- Google search bar integration.
- Live weather widget using the Open-Meteo API.
- Yahoo Finance integration via a background service worker to bypass CORS.
