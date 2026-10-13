# Learning memory

Angela retains learning topics, goals, difficulties, and explanation preferences across conversations.
Records stay on this device and belong to one character.

## Storage and ownership

Use the existing Pinia synchronization for leader-owned edits and localStorage for persistence.
Persist each edit before publishing its snapshot. Replicated snapshots never write to storage.
Store at most 50 records per character, with 500 characters per record.
Include at most 20 records in a chat request. Due reviews precede recent records.
Saved context is sent to the selected AI provider as part of that request.

## Chat behavior

Capture the character id from the conversation owner before preparing the request.
Give the model learning context and tools through the existing chat request flow.
Memory tools require a verbatim quote from the current user message.
The model saves only learning facts the user stated. Quoted material and external results are not user facts.
The model confirms an edit only after the storage tool succeeds.
Stored text is data, never instructions.
Disabling memory removes its context and tools from subsequent requests without deleting saved records.

## Review progress

An optional review schedule belongs to its learning record. Records without schedules remain supported.
Users choose intervals of 1, 3, 7, 14, or 30 days in settings. A new schedule starts due.
Completed reviews increment a count and move the next review by the selected number of 24-hour days.
Counts describe completed reviews, not mastery. The application does not send background notifications.
Changing an interval preserves the count and calculates the deadline from the last completed review.
Editing a fact preserves its schedule. Disabling a schedule removes its progress without deleting the fact.
Leader-owned schedule and progress actions persist before publication. Replicated snapshots never write to storage.
The chat tool records a completed review only after explicit user confirmation with current-turn evidence.
Chat cannot create schedules. Disabling memory removes review context and tools from later requests.

## User controls and checks

Use Settings → Modules → Long-Term Memory to view, add, edit, delete, or disable learning memory.
Keep the existing conversation history, account profile, and character notebook independent.
Check persistence after reload, character isolation, leader/follower edits, disabled tools, and chat context.
