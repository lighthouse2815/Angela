# Angela companion

## Goal

Angela is a personal AI companion for relaxed conversation and help with learning.
The user approved reusing AIRI and keeping its existing apps, games, integrations, and tools.

## Decisions

- Rebrand the main web and desktop surfaces as Angela.
- Keep internal package names, protocols, storage keys, and custom character cards intact.
- Give new installations an Angela character that speaks Vietnamese and helps with learning when asked.
- Keep the character stage, voice pipeline, and tool execution already in the repository.
- Use existing OpenAI providers for chat, vision, transcription, and speech.
- Configure API keys through the existing provider settings. Never commit credentials.
- Replace the code in `lighthouse2815/Angela` as the user requested.
- Preserve the original AIRI license and attribution.

## Validation

Run character-card tests, locale checks, workspace builds, and lint.
Check the installed desktop executor before claiming that laptop control works.
Live API validation needs an API key entered by the user.
