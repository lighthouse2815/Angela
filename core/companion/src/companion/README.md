# Shared desktop and Telegram companion

## Run

The supported Telegram adapter is `apps/cli/src/telegram.ts`.
From the repository root, run `pnpm telegram` or `pnpm cli telegram`.
Use the existing private Telegram environment file for the token and allowed user IDs.
Never commit that file.

Desktop and Telegram use `~/.angela/sessions` unless `ANGELA_DATA_DIR` selects another root.
Use the same `ANGELA_DATA_DIR` and `ANGELA_WORKSPACE` for both processes.
The workspace defaults to the process working directory.
Set `ANGELA_TELEGRAM_SHARED_USER_ID` to one allowed Telegram user ID to link that owner to desktop memory.
Other allowed users remain in isolated directories. Group messages do not enter this adapter.

The default character ID is `default`.
Set `ANGELA_TELEGRAM_CHARACTER_ID` to the desktop character ID when linking a different character.
Other characters use opaque subdirectories. Character and workspace identity both constrain typed records.
Personal memory retains its existing owner-wide scope within a character directory.

## Runtime and data

Electron main owns AngelaRuntime, Memory V2, Tasks, and OpenLoops.
The renderer retains provider selection, generation, attachments, streaming, avatar animation, voice, and authorized device tools.
Eventa binds each request, runtime tool call, cancellation, and notification receipt to the requesting application window.
There is one model generation path per turn.

Learning and companion records live as typed semantic pages in `memory/recall.sqlite`.
Both adapters use those pages for context and model edits.
The desktop panels edit the same records through IPC and refresh linked-channel edits every five seconds.
Browser-only stage-web retains its local storage implementation and shared schemas.

The first desktop access imports the existing learning and companion records for that character in a SQLite transaction.
Record IDs, timestamps, review progress, due dates, dismissal, and previous presentation markers survive import.
The import receipt prevents re-import after an edit or deletion.
Source localStorage remains intact as an inert recovery copy. Desktop never writes changes back to it after host installation.
Invalid or sensitive imports fail without publishing a partial receipt. The next access retries.
The interface reports import failures. Inspect the invalid source before retrying rather than deleting it blindly.

Memory disabled through either channel prevents new personal writes and excludes companion context.
Protected turns expose no companion write tools. These controls do not replace the desktop chat-history retention policy.

## Notifications

The visible main Stage polls runtime reminders while idle and companion mode is enabled.
The scheduler retains its lease until the renderer acknowledges presentation.
Closing a window or failing to show a notification rejects the receipt and releases unacknowledged task delivery.
OpenLoops retain their existing at-most-once reservation policy, including possible loss after reservation.
Telegram and desktop task schedulers coordinate through the existing store locks and delivery leases.
Learning-review notifications and activity follow-ups keep their desktop presentation and durable shared progress.
They do not send additional Telegram review or activity notifications.

An elapsed activity remains open until the user confirms completion or dismisses it.
Voice interruption cancels the corresponding runtime request and generation.
No notification is promised while all hosts are closed.

## Archived prototype

`integrations/telegram/archive` is excluded from the default workspace.
Its PostgreSQL history and media code remain available as archived source.
Those media workflows and database records are not silently transferred into the supported private companion.
