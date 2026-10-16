<h1 align="center">アイリ VTuber</h1>

<p align="center">
  [<a href="https://airi.ayaka.io">Try it</a>]
</p>

> Heavily inspired by [Neuro-sama](https://www.youtube.com/@Neurosama)

## Shared local configuration

When served on localhost through Vite development or preview, this app shares `~/.config/angela/config.json` with desktop and CLI.
Set `ANGELA_CONFIG` before starting Vite to select another file. Provider settings save automatically and external edits refresh every 1.5 seconds.
Each browser profile imports its existing direct providers once. Shared values take priority when instance IDs match.
The Vite endpoint only accepts local, same-origin requests. Hosted builds keep their current configuration behavior.
See [local configuration](../../packages/local-config/README.md) for the file contract.

## Performance diagnostics

Run `pnpm dev:web:https` from the repository root. Open `/devtools/performance-visualizer` and enable FPS.
The floating overlay shows the last 10 seconds of FPS history, with time and FPS axes.
The minimum, maximum, and latest values describe the visible samples. Other metrics retain their distribution charts.

Start a recording, then navigate within the app to the scene you want to measure.
Stop the recording within 60 seconds, or let it stop automatically.
Return to the visualizer to inspect the recorded FPS history. Export the recording as CSV for individual timestamps and values.

Each FPS sample is `1000 / frameIntervalMs`, from `requestAnimationFrame` callbacks.
Use these samples to locate changes in animation frame timing. They do not measure GPU presentation or native application FPS.
Keep the page in the foreground. Reloading the page clears the recording.

For device comparisons, use the same scene, model, warm-up period, and recording duration.
The development server and the visible overlay affect performance, so record these conditions with the results.
