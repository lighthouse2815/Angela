# Dependency patches

## @xsai/stream-text 0.5.1

Gemini's OpenAI-compatible stream can omit `index` on complete function calls. The SDK stored these calls on an undefined array key and silently skipped execution. This patch uses each call's position when the index is absent, while keeping explicit indices and Google replay metadata unchanged.

The regression in `packages/core-agent/src/runtime/chat-completions.test.ts` uses the real SDK with two unindexed calls and a `stop` finish reason. It checks that both tools execute once and their metadata reaches the next request. Remove this patch when an upstream release passes that regression.

## @xsai-ext/responses 0.5.1

This patch fixes behavior in the published SDK. AIRI's protocol and billing code remain in workspace packages.

- Reject `response.incomplete` and stream error events so AIRI does not store failed turns.
- Type native `web_search` tools and their output Items for replay across steps.
- Await `onNativeEvent` before transcript commit so consumers can retain sources and search activity.

Browser regressions are in `packages/provider-inference/src/responses.browser.test.ts`. Core integration tests use the real patched SDK with synthetic HTTP responses in `packages/core-agent/src/runtime/responses.test.ts`.

The patch changes `dist` because the npm artifact ships compiled code. To contribute upstream, port these changes to the corresponding sources in [xsAI](https://github.com/moeru-ai/xsai), then run the same regressions.

Remove the patch when an upstream release passes these tests and provides native event callbacks and web search types. Recheck incomplete-response behavior before removal: AIRI treats an incomplete turn as a failure.

To update the patch:

```sh
pnpm patch @xsai-ext/responses@0.5.1
# Edit the directory printed by pnpm.
pnpm patch-commit <directory>
```
