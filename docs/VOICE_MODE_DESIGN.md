# Voice Mode Design for AI Todo List Agent

## 1. Problem Statement & Goals
- Provide a fully voice-driven experience that allows users to converse with the AI agent hands-free.
- Support both speech-to-text (STT) for capturing user utterances and text-to-speech (TTS) for streaming agent replies.
- Maintain compatibility with existing Server-Sent Events (SSE) streaming architecture and offline-first philosophy.
- Offer graceful degradation when device or browser capabilities are limited.

## 2. Scope
- **In scope**: Web voice mode inside the existing AgentChatbot, backend endpoints for audio processing, session and UX management, analytics, accessibility, and feature flag controls.
- **Out of scope**: Native mobile wrappers, telephony integrations, long-term storage of raw audio, and wake-word/always-on listening.

## 3. Key Requirements
### Functional
1. Users can tap a microphone button to start and stop listening.
2. Captured speech is transcribed and fed into the existing `/agent/stream` flow.
3. Agent responses are spoken aloud while still rendering textual content.
4. Users can interrupt playback or speech capture at any time.
5. Voice mode state persists per session and survives page reloads when supported.

### Non-Functional
1. **Latency**: First audible response within 1.5 seconds for short replies.
2. **Reliability**: Voice mode must auto-recover from transient audio errors.
3. **Accessibility**: Provide captions, controls, and aria-labels for assistive tech.
4. **Privacy**: Never retain audio beyond transcription/streaming lifecycle.
5. **Compatibility**: Support Chrome/Edge voice mode natively and provide fallbacks for Safari/Firefox.

## 4. High-Level Architecture
```
+-----------------------+       +-----------------------------+
|  AgentChatbot (web)   |       |       FastAPI Backend       |
|-----------------------|       |-----------------------------|
| Voice UI controls     | <---> | /agent/voice-input (STT)    |
| useVoiceInput hook    |  WS   | /agent/text-to-speech (TTS) |
| useTextToSpeech hook  |       | /agent/stream (existing)    |
+-----------+-----------+       +-----------------------------+
            |                                  |
     Web Speech API                 OpenAI Whisper & TTS models
 (or fetch to backend)                (optional fallback)
```
- Prefer browser-native APIs (Web Speech/Synthesis). When unsupported, fall back to backend endpoints utilizing OpenAI Whisper and GPT-4o-mini-tts.
- Audio assets are streamed, not stored. SSE stream remains source of truth for conversation state.

## 5. Frontend Design
### 5.1 UI/UX Enhancements
- Add a **Voice Mode** toggle in AgentChatbot header that persists via `localStorage`.
- Show microphone button with animated levels during capture and spinner during transcription.
- Display interim transcript bubbles distinct from confirmed messages.
- Add playback controls (play/pause, stop) and visual progress for spoken responses.

### 5.2 State & Hooks
- `useVoiceInput.ts`
  - Manage Web Speech API recognition, handle permissions, errors, silence timeout, and fallback upload to backend STT when unsupported.
  - Emit events: `onTranscript`, `onError`, `onFinalized`.
- `useTextToSpeech.ts`
  - Queue sentences derived from streaming tokens, handle `SpeechSynthesis` voices, interruptions, and caching of rendered audio URLs when backend TTS is used.
- Extend AgentChatbot state machine to coordinate listening/playing states to avoid feedback loops (pause TTS when listening).

### 5.3 Networking
- For browsers without native STT/TTS, upload recorded audio blobs (`audio/webm;codecs=opus`) to `/agent/voice-input` via `fetch`.
- Consume backend `/agent/text-to-speech` endpoint for audio when Web Speech Synthesis is unavailable or disabled by user preference.
- Maintain feature flag (`VOICE_MODE_ENABLED`) fetched from `/config` endpoint to allow gradual rollout.

### 5.4 Error Handling & Accessibility
- Show inline errors with retry action when microphone access is denied.
- Provide keyboard shortcuts (e.g., `Space` to toggle listening) and descriptive aria labels.
- Include captions/subtitles for spoken responses and maintain focus management for screen readers.

## 6. Backend Design
### 6.1 Endpoints
- `POST /agent/voice-input`
  - Accept `multipart/form-data` audio upload.
  - Validate mime type and enforce max duration (e.g., 2 minutes).
  - Stream to OpenAI Whisper or equivalent; return transcript plus optional confidence.
  - Reuse `agent_stream` to continue conversation with transcribed text when `auto_submit=true`.
- `POST /agent/text-to-speech`
  - Accept `{ text, voice, space_id }` payload.
  - Use OpenAI GPT-4o-mini-tts for streaming audio response (`audio/mpeg`).
  - Support chunked streaming (FastAPI `StreamingResponse`).

### 6.2 Services & Utilities
- `backend/agent/voice.py`
  - Helper `async def transcribe_audio(...)` and `async def synthesize_speech(...)`.
  - Shared rate limiting & quota enforcement via existing auth middleware.
- Integrate with existing `User` context to ensure only authenticated users access voice endpoints.
- Add configuration in `settings.py`: model names, max durations, feature flags, per-user quotas.

### 6.3 Security & Compliance
- Require HTTPS and authenticated requests; deny anonymous access.
- Sanitize and log minimal metadata (duration, success/failure) without storing raw audio.
- Enforce content-type validation, request size limits, and antivirus scanning hooks where available.

## 7. Data Flow
1. User enables voice mode → microphone permission requested (if first time).
2. On tap:
   - If Web Speech supported → start recognition, show interim transcript.
   - Else → record audio locally, upload to `/agent/voice-input`, wait for transcript.
3. Transcript text dispatched to `/agent/stream`; SSE updates UI.
4. Agent response tokens buffered; once sentence completes, `useTextToSpeech` begins playback (browser) or fetches `/agent/text-to-speech` stream.
5. User may interrupt; playback stops and conversation continues via text or new voice input.

## 8. Feature Flag & Configuration
- Add `VOICE_MODE_ENABLED` boolean in backend config and expose via `/config` endpoint consumed by frontend.
- Allow per-user overrides stored in user preferences collection (`users.voice_mode_enabled`).
- Provide admin controls to set default voice (backend config) and disable backend STT/TTS to reduce cost.

## 9. Testing Strategy
- **Unit Tests**: Hooks logic (mock SpeechRecognition/Synthesis), backend transcription utilities, quota checks.
- **Integration Tests**: Browser-based tests verifying voice toggle, fallback path, interrupt handling.
- **Contract Tests**: Ensure `/agent/voice-input` and `/agent/text-to-speech` adhere to expected schemas.
- **Manual QA**: Cross-browser smoke tests, network throttling scenarios, accessibility review with screen reader.

## 10. Rollout Plan
1. Ship behind feature flag and internal beta toggle.
2. Conduct dogfooding session with voice metrics logging (success rate, latency).
3. Gradually enable for 10%, 50%, then 100% of authenticated users.
4. Monitor error logs, latency dashboards, and customer feedback; iterate as needed.

## 11. Metrics & Observability
- Capture events: `voice_mode_enabled`, `voice_input_started`, `voice_input_failed`, `tts_started`, `tts_interrupted`.
- Monitor latency for transcription and first audio byte.
- Track fallbacks usage to identify unsupported browsers.

## 12. Dependencies & Risks
- Browser support variability (Firefox requires backend fallback).
- OpenAI quota limits—mitigate with caching and rate limiting.
- Microphone permission denial; mitigate via education tooltips and alternate text input.
- Need to synchronize TTS playback with streaming tokens to avoid cutting sentences mid-stream.

## 13. Open Questions
- Should we allow partial transcripts to auto-send mid-speech for long utterances?
- Do we need localized voices/languages at launch or ship English-only first?
- Should backend cache synthesized audio for repeated prompts to reduce cost?

## 14. Timeline (Rough)
1. Week 1: Hook scaffolding, feature flag plumbing, UI toggle.
2. Week 2: Web Speech integration, fallback recording, backend endpoints stubs.
3. Week 3: Streaming TTS coordination, extensive testing.
4. Week 4: Beta rollout, analytics dashboards, polish.

## 15. Acceptance Criteria
- Voice mode can be enabled/disabled without page reload.
- Users can complete an entire conversation with voice only.
- System gracefully falls back to text when voice resources fail.
- Accessibility checks (WCAG AA) pass for new components.
- Observability dashboards report voice usage and error rates.
