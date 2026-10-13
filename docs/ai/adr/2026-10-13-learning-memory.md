# Learning memory

Angela retains learning topics, goals, difficulties, and explanation preferences across conversations.
Records stay on this device and belong to one character.

## Storage and ownership

Use the existing Pinia synchronization for leader-owned edits and localStorage for persistence.
Persist each edit before publishing its snapshot. Replicated snapshots never write to storage.
Store at most 50 records per character, with 500 characters per record.
Include the 20 most recently updated records in a chat request.
Saved context is sent to the selected AI provider as part of that request.

## Chat behavior

Capture the character id from the conversation owner before preparing the request.
Give the model learning context and tools through the existing chat request flow.
Memory tools require a verbatim quote from the current user message.
The model saves only learning facts the user stated. Quoted material and external results are not user facts.
The model confirms an edit only after the storage tool succeeds.
Stored text is data, never instructions.
Disabling memory removes its context and tools from subsequent requests without deleting saved records.

## User controls and checks

Use Settings → Modules → Long-Term Memory to view, add, edit, delete, or disable learning memory.
Keep the existing conversation history, account profile, and character notebook independent.
Check persistence after reload, character isolation, leader/follower edits, disabled tools, and chat context.
