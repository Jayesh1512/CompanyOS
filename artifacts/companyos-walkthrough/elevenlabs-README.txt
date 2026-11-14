COMPANYOS — ELEVENLABS WALKTHROUGH AUDIO

1. Open the ignored private file .env.elevenlabs at the repository root.
2. Set ELEVENLABS_API_KEY to your ElevenLabs key. Do not paste it in chat or commit it.
3. Optionally change ELEVENLABS_VOICE_ID. The prepared job uses the API-reference example voice and Eleven Multilingual v2.
4. Tell the agent the key is saved, or run:

   node scripts/narrate-product-walkthrough.mjs

Output: artifacts/companyos-walkthrough/narration-elevenlabs.mp3
Individual source clips: artifacts/companyos-walkthrough/audio-scenes/
Timing information: artifacts/companyos-walkthrough/narration-elevenlabs.json

The job contains seven narration sections, seven scene scripts, and actual screen-capture timings. It sends only narration text and voice settings to ElevenLabs. Generation uses account credits; the credit amount depends on your account and model. The opening audio says Company O S; unchanged scenes reuse the earlier generated audio.

A completed clip is reused on subsequent runs. An unresolved original provider request is held rather than resent automatically. If speech needs more than 20% speed-up to fit a scene, assembly stops and keeps the source clips so the narration or video can be adjusted. Audio is never silently truncated to fit.

Useful commands:

   node scripts/narrate-product-walkthrough.mjs --plan
   node scripts/narrate-product-walkthrough.mjs --voices
   node scripts/narrate-product-walkthrough.mjs --assemble-only

The plan command makes no API call. Voices reads your account's available voices. Assembly only uses existing downloaded audio. A generation needs text-to-speech access and enough account credits. ffmpeg and ffprobe are used locally to align the audio.

Official API references checked during preparation:
https://elevenlabs.io/docs/api-reference/text-to-speech/convert
https://elevenlabs.io/docs/api-reference/voices/search
