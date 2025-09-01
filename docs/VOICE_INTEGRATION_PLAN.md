# Voice Input/Output Integration Plan for AI Agent

## Current Architecture Analysis

### 1. Agent Implementation Structure
- **Backend Agent**: Located in `/backend/agent/`
  - `agent.py`: Main streaming SSE endpoint at `/agent/stream` 
  - `tools.py`: 11 direct tool functions (weather, tasks, journals, search, etc.)
  - `schemas.py`: Pydantic schemas for OpenAI function calling
  - Uses GPT-4.1 with function calling for intelligent responses
  
- **Frontend Agent**: `/frontend/components/AgentChatbot.tsx`
  - Text-based chat interface using Server-Sent Events
  - Real-time streaming responses with tool call visualization
  - Space-aware conversations with session storage
  - Displays tool inputs/outputs in user-friendly format
  
- **Service Worker**: Routes `/agent` endpoints correctly to backend
- **No existing audio/voice code** found in codebase

### 2. Current SSE Streaming Flow
1. User types query → Frontend sends to `/agent/stream`
2. Backend streams OpenAI responses via SSE events:
   - `ready`: Initial setup with available tools
   - `tool_result`: Results from tool executions  
   - `token`: Streaming response tokens
   - `done`: Completion signal
3. Frontend accumulates tokens and displays formatted responses

## Voice Integration Implementation Plan

### Phase 1: Voice Input (Speech-to-Text)

#### 1.1 Web Speech API Implementation
```typescript
// /frontend/hooks/useVoiceInput.ts
interface UseVoiceInputReturn {
  isListening: boolean;
  transcript: string;
  interimTranscript: string;
  startListening: () => void;
  stopListening: () => void;
  isSupported: boolean;
  error: string | null;
}
```

**Features:**
- Add microphone button with recording state indicator
- Implement `SpeechRecognition` with fallback handling
- Add voice input permissions and browser compatibility checks
- Support continuous vs single-utterance modes
- Integrate with existing question state in AgentChatbot

#### 1.2 Backend STT Option (GPT-4o-transcribe)
```python
# /backend/agent/voice.py
@router.post("/agent/voice-input")
async def voice_input(
    file: UploadFile,
    space_id: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    # Use OpenAI's Whisper API for transcription
    transcript = await transcribe_audio(file)
    # Feed transcript to existing agent stream
    return await agent_stream(transcript, space_id, current_user)
```

#### 1.3 UI Enhancements
- Voice recording button with visual feedback (pulsing red dot)
- Real-time transcription display during recording
- Voice confidence indicators and error states
- Auto-submit on silence detection (configurable)

### Phase 2: Voice Output (Text-to-Speech)

#### 2.1 Web Speech Synthesis API
```typescript
// /frontend/hooks/useTextToSpeech.ts
interface UseTTSReturn {
  speak: (text: string) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  isSpeaking: boolean;
  voices: SpeechSynthesisVoice[];
  selectedVoice: string;
  setVoice: (voiceURI: string) => void;
  rate: number;
  setRate: (rate: number) => void;
}
```

#### 2.2 Streaming TTS Integration
- Buffer complete sentences from streaming tokens
- Start TTS playback as sentences complete (don't wait for full response)
- Handle interruption when new voice input starts
- Queue management for multi-sentence responses

#### 2.3 Backend TTS Option (GPT-4o-mini-tts)
```python
# /backend/agent/voice.py
@router.post("/agent/text-to-speech")
async def text_to_speech(
    text: str,
    voice: str = "alloy",
    current_user: User = Depends(get_current_user)
):
    # Use OpenAI's TTS API
    audio_response = await generate_speech(text, voice)
    return StreamingResponse(audio_response, media_type="audio/mpeg")
```

### Phase 3: Complete Voice Flow Architecture

#### 3.1 Modified AgentChatbot Component
```tsx
// Key additions to AgentChatbot.tsx
const AgentChatbot = () => {
  const { 
    isListening, 
    transcript, 
    startListening, 
    stopListening 
  } = useVoiceInput();
  
  const { 
    speak, 
    stop: stopSpeaking, 
    isSpeaking 
  } = useTextToSpeech();
  
  // Auto-submit voice transcript
  useEffect(() => {
    if (transcript && !isListening) {
      handleSendMessage(transcript);
    }
  }, [transcript, isListening]);
  
  // Stream TTS for agent responses
  useEffect(() => {
    if (streamingMessage && !isListening) {
      const sentences = extractCompleteSentences(streamingMessage);
      sentences.forEach(speak);
    }
  }, [streamingMessage]);
};
```

#### 3.2 Service Worker Considerations
- Cache voice preference settings in IndexedDB
- Handle offline voice capabilities gracefully
- Queue voice commands for sync when online

#### 3.3 Mobile/Capacitor Integration
```typescript
// /frontend/utils/voice-capacitor.ts
import { SpeechRecognition } from '@capacitor-community/speech-recognition';

export const initializeCapacitorVoice = async () => {
  // Request permissions
  await SpeechRecognition.requestPermissions();
  
  // Native speech recognition for better accuracy
  const { matches } = await SpeechRecognition.start({
    language: 'en-US',
    maxResults: 1,
    prompt: 'Speak your command',
    partialResults: true,
    popup: false,
  });
  
  return matches[0];
};
```

### Phase 4: Advanced Voice Features

#### 4.1 Voice Commands & Shortcuts
- **Wake word detection**: "Hey AI" / "Hey Todo"
- **Direct commands**: 
  - "Add task: [description]"
  - "What's the weather?"
  - "Show my tasks"
  - "Mark task as complete"
- **Voice navigation**: "Go to journal", "Open settings"

#### 4.2 Conversation Context
- Maintain voice conversation context across interactions
- Support follow-up questions without re-stating context
- Voice-specific prompts for clearer responses

#### 4.3 Accessibility Features
- Keyboard shortcuts (Space to start/stop recording)
- Screen reader compatibility announcements
- Visual indicators for all voice states
- Adjustable TTS speed and pitch
- Voice output toggle (on/off/auto)

### Implementation Timeline

#### Week 1: Basic Voice Input
- [ ] Implement Web Speech API recognition
- [ ] Add microphone UI to AgentChatbot
- [ ] Test browser compatibility
- [ ] Handle permissions and errors

#### Week 2: Voice Output
- [ ] Implement Web Speech Synthesis
- [ ] Add TTS controls to UI
- [ ] Stream sentence-by-sentence TTS
- [ ] Voice selection and settings

#### Week 3: Backend Integration (Optional)
- [ ] Add OpenAI Whisper transcription endpoint
- [ ] Add OpenAI TTS generation endpoint
- [ ] Handle audio file uploads/downloads
- [ ] Optimize for streaming

#### Week 4: Polish & Testing
- [ ] Mobile/Capacitor integration
- [ ] Offline handling
- [ ] Performance optimization
- [ ] User testing and feedback

### Technical Considerations

#### Browser Support
- **Chrome/Edge**: Full Web Speech API support
- **Safari**: Limited support, may need fallbacks
- **Firefox**: No native support, requires backend STT/TTS
- **Mobile browsers**: Variable support, prefer native APIs

#### Performance
- Debounce voice input to prevent API spam
- Cache TTS audio for repeated phrases
- Optimize audio encoding (Opus for web, AAC for mobile)
- Stream audio chunks for long responses

#### Privacy & Security
- Request microphone permissions explicitly
- Show clear recording indicators
- Allow users to disable voice features
- Don't store voice recordings without consent
- Use HTTPS for all audio transmission

### Configuration Options

```typescript
// /frontend/config/voice.ts
export const VOICE_CONFIG = {
  // Speech Recognition
  recognition: {
    continuous: false,
    interimResults: true,
    maxAlternatives: 1,
    language: 'en-US',
    silenceTimeout: 2000, // ms
  },
  
  // Text-to-Speech
  synthesis: {
    voice: 'Google US English', // or user preference
    rate: 1.0,
    pitch: 1.0,
    volume: 1.0,
    sentenceDelimiter: /[.!?]+/,
  },
  
  // UI/UX
  ui: {
    autoSubmitOnSilence: true,
    showTranscript: true,
    showConfidence: false,
    enableWakeWord: false,
  },
  
  // Backend (optional)
  backend: {
    useOpenAITranscription: false,
    useOpenAITTS: false,
    whisperModel: 'whisper-1',
    ttsModel: 'tts-1',
    ttsVoice: 'alloy',
  },
};
```

### Testing Strategy

#### Unit Tests
- Voice input hook functionality
- TTS hook functionality
- Sentence extraction logic
- Audio state management

#### Integration Tests
- Voice → Agent → Response flow
- Interruption handling
- Error recovery
- Offline behavior

#### E2E Tests
- Complete voice conversation
- Voice command execution
- Multi-turn dialogue
- Cross-browser compatibility

### Rollout Strategy

1. **Feature Flag**: Enable voice features behind a flag
2. **Beta Testing**: Roll out to subset of users
3. **Gradual Rollout**: Increase availability based on feedback
4. **Full Launch**: Enable for all users with opt-out option

### Success Metrics

- **Adoption Rate**: % of users trying voice features
- **Retention**: % continuing to use after first try
- **Accuracy**: Transcription and command success rate
- **Performance**: Time to first byte for voice responses
- **User Satisfaction**: Feedback and ratings

### Fallback Strategy

If voice features fail or are unsupported:
1. Gracefully degrade to text-only interface
2. Show clear messaging about why voice is unavailable
3. Provide alternative interaction methods
4. Log failures for debugging and improvement

## References

- [Web Speech API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API)
- [OpenAI Speech to Text](https://platform.openai.com/docs/guides/speech-to-text)
- [OpenAI Text to Speech](https://platform.openai.com/docs/guides/text-to-speech)
- [Capacitor Speech Recognition](https://github.com/capacitor-community/speech-recognition)

## Next Steps

1. Review this plan with the team
2. Decide on Web API vs Backend approach for STT/TTS
3. Create feature branch for voice integration
4. Start with Phase 1 (basic voice input)
5. Iterate based on user feedback