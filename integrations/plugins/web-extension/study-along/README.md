# Angela Study Along extension

This restricted extension shares only the current YouTube URL, title, playback time, duration, and paused state.

## Install and pair

1. Open **Settings → Study Along** in Angela Desktop.
2. Click **Open extension files**.
3. Open `chrome://extensions` in Chrome or Chromium.
4. Enable **Developer mode**, click **Load unpacked**, and select that folder.
5. Open the extension popup and copy its extension ID.
6. Paste the ID into Angela Settings and click **Create pairing**.
7. Copy the pairing JSON into the extension popup and connect.
8. Open your YouTube lesson and click **Share this video tab** in the popup.
9. Ask Angela about the lesson without supplying its URL.

Tab sharing lasts until you stop it, close the tab, or restart the extension. Switching to another tab does not share that tab. Explicit sharing grants access through Chrome's `activeTab` permission. Reloading Angela preserves pairing. Revoking access closes the bridge and invalidates the token.

## Privacy

The extension never collects cookies, passwords, profiles, storage, page text, or browsing history. Its fixed evaluation reads visible video metadata only. It runs on demand for the explicitly shared current tab. The bridge binds IPv4 loopback and requires the paired extension origin and token before accepting a WebSocket connection. Eventa carries fresh requests. Playback snapshots are never persisted.

The pairing token grants media-context access only. Keep it private. Existing Angela Browser / Playwright MCP remains the fallback when no authorized Chrome context exists.

## Build and release

Run `pnpm -F @angela/plugin-web-extension build:study-along` from the repository root. The restricted artifact is `.output-study-along/chrome-mv3` in this workspace. Desktop installer scripts build and bundle it as `resources/study-along-extension`.

The general extension build includes other capabilities. Do not distribute that build as the Study Along integration. Desktop packaging checks the restricted manifest. No Chrome Web Store listing or automatic browser installation is included.
