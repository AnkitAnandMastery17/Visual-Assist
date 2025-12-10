import { useEffect, useRef, useState, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { createPCMBlob, decode, decodeAudioData, OUTPUT_SAMPLE_RATE, PCM_SAMPLE_RATE } from '../services/audioUtils';
import { AppState, UserSettings, AppMode } from '../types';

interface UseGeminiLiveProps {
  onStateChange: (state: AppState) => void;
  onError: (error: string) => void;
  settings: UserSettings;
  mode: AppMode;
}

export const useGeminiLive = ({ onStateChange, onError, settings, mode }: UseGeminiLiveProps) => {
  const [isStreaming, setIsStreaming] = useState(false);
  
  // Refs for State Management
  const sessionRef = useRef<Promise<any> | null>(null);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  
  // Audio Playback Queue Management
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  
  // Audio Input Refs
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  
  // Track current mode to handle switching
  const currentModeRef = useRef<AppMode>(mode);

  const stopAudio = useCallback(() => {
    // Stop all playing sources
    if (sourcesRef.current) {
        sourcesRef.current.forEach(source => {
        try {
            source.stop();
            source.disconnect();
        } catch (e) { /* Ignore if already stopped */ }
        });
        sourcesRef.current.clear();
    }
    nextStartTimeRef.current = 0;

    // Close Audio Contexts
    if (inputAudioContextRef.current) {
      inputAudioContextRef.current.close().catch(console.error);
      inputAudioContextRef.current = null;
    }

    if (outputAudioContextRef.current) {
      outputAudioContextRef.current.close().catch(console.error);
      outputAudioContextRef.current = null;
    }

    // Stop Microphone Stream (Release Hardware)
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    
    // Disconnect Nodes
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (sourceNodeRef.current) {
      sourceNodeRef.current.disconnect();
      sourceNodeRef.current = null;
    }
  }, []);

  const getSystemInstruction = (appMode: AppMode) => {
    // Base prompt for latency optimization
    const base = `
    You are Visual Assist, a real-time vision AI for the blind.
    MODE: "${appMode.toUpperCase()}"
    IMPORTANT: Be extremely concise. High latency is dangerous. Speak fast.
    `;

    if (appMode === 'navigate') {
      return `${base}
      TASK: Navigation Guidance.
      STYLE: Imperative Command Mode. Max 5-8 words per response.
      MANDATORY START: When you receive "Start", immediately say: "Navigation active. Ready."
      RULES:
      1. Give immediate directional commands: "Turn left", "Go straight", "Stop".
      2. Use clock directions for precision: "Door at 2 o'clock".
      3. NO fluff. NO polite conversational filler.
      4. If clear, say "Path clear".
      5. If blocked, say "Stop. Obstacle ahead."
      `;
    }

    if (appMode === 'hazard') {
      return `${base}
      TASK: Hazard Detection.
      STYLE: Urgent Warnings.
      MANDATORY START: When you receive "Start", immediately say: "Hazard scanning enabled."
      RULES:
      1. Immediately call out dangers: "Stairs down", "Car coming", "Wet floor".
      2. If safe, stay silent or say "Clear".
      3. Prioritize head-level obstacles and drop-offs.
      `;
    }

    if (appMode === 'read_text') {
      return `${base}
      TASK: Read Text.
      MANDATORY START: When you receive "Start", immediately say: "Reading mode active. Align text."
      RULES:
      1. Read visible text immediately.
      2. If text is cut off, say "Move camera right/left".
      3. Do not describe the font or color, just read the content.
      `;
    }

    // Default: Describe
    return `${base}
    TASK: Scene Description.
    MANDATORY START: When you receive "Start", immediately say: "Hello! Visual Assist is ready."
    RULES:
    1. 1-2 short sentences summarizing the scene.
    2. Focus on spatial layout and key objects.
    `;
  };

  const connect = useCallback(async () => {
    try {
      if (!process.env.API_KEY) {
        throw new Error("API Key is missing.");
      }

      onStateChange(AppState.CONNECTING);
      currentModeRef.current = mode; 

      // 1. Initialize Audio Contexts IMMEDIATELY (Sync with user gesture)
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      
      // Optimization: 'interactive' latencyHint forces the browser to use the smallest possible buffer
      const inputCtx = new AudioContextClass({ 
          sampleRate: PCM_SAMPLE_RATE,
          latencyHint: 'interactive'
      });
      const outputCtx = new AudioContextClass({ 
          sampleRate: OUTPUT_SAMPLE_RATE,
          latencyHint: 'interactive'
      });
      
      inputAudioContextRef.current = inputCtx;
      outputAudioContextRef.current = outputCtx;

      // Resume immediately - critical for iOS
      await Promise.all([
        inputCtx.state === 'suspended' ? inputCtx.resume() : Promise.resolve(),
        outputCtx.state === 'suspended' ? outputCtx.resume() : Promise.resolve()
      ]);

      // 2. Output Chain Setup
      const outputNode = outputCtx.createGain();
      outputNode.gain.value = 1.5; 
      outputNode.connect(outputCtx.destination);

      // 3. Microphone Input Setup
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          // Note: Browser might ignore this and use hardware rate, handled by audioUtils
          sampleRate: PCM_SAMPLE_RATE 
        } 
      });
      mediaStreamRef.current = stream;

      // 4. Gemini Connection
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: settings.voiceName } },
          },
          systemInstruction: getSystemInstruction(mode),
        },
        callbacks: {
          onopen: () => {
            console.log(`Visual Assist: Connected [${mode}]`);
            onStateChange(AppState.ACTIVE);
            setIsStreaming(true);

            // --- TRIGGER GREETING ---
            sessionPromise.then(session => {
                // Reduced delay from 500ms to 100ms for faster start
                setTimeout(() => {
                    try {
                        session.sendRealtimeInput({
                            content: [{
                                role: "user",
                                parts: [{ text: "Start" }]
                            }]
                        });
                    } catch (e) {
                        console.error("Failed to send greeting", e);
                    }
                }, 100); 
            });

            if (!inputAudioContextRef.current || !mediaStreamRef.current) return;
            
            const source = inputAudioContextRef.current.createMediaStreamSource(mediaStreamRef.current);
            sourceNodeRef.current = source;
            
            // OPTIMIZATION: Reduced buffer size from 2048 to 1024
            // 1024 samples @ 16kHz = ~64ms latency
            // 1024 samples @ 48kHz = ~21ms latency
            const processor = inputAudioContextRef.current.createScriptProcessor(1024, 1, 1);
            processorRef.current = processor;

            const currentInputRate = inputAudioContextRef.current.sampleRate;
            
            processor.onaudioprocess = (e) => {
              // Safety check inside callback
              if (!sessionRef.current) return;

              const inputData = e.inputBuffer.getChannelData(0);
              const pcmBlob = createPCMBlob(inputData, currentInputRate);
              
              sessionRef.current.then(session => {
                 session.sendRealtimeInput({ media: pcmBlob });
              }).catch(err => {
                 // Silent failure expected during disconnects
              });
            };

            source.connect(processor);
            processor.connect(inputAudioContextRef.current.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            const serverContent = message.serverContent;
            
            // Handle Audio Output
            const base64Audio = serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            
            if (base64Audio && outputAudioContextRef.current && outputAudioContextRef.current.state !== 'closed') {
                const ctx = outputAudioContextRef.current;
                const currentTime = ctx.currentTime;
                
                // OPTIMIZATION: Aggressive Audio Scheduling
                // If the "next start time" is in the past (drift), reset it to "now".
                // We add a tiny lookahead (0.01s) to ensure smooth scheduling without glitches.
                // This prevents the system from trying to "catch up" on old audio.
                if (nextStartTimeRef.current < currentTime) {
                  nextStartTimeRef.current = currentTime + 0.01;
                }

                try {
                    const audioBuffer = await decodeAudioData(
                        decode(base64Audio),
                        ctx,
                        OUTPUT_SAMPLE_RATE,
                        1
                    );
                    
                    const source = ctx.createBufferSource();
                    source.buffer = audioBuffer;
                    source.connect(outputNode);
                    
                    source.addEventListener('ended', () => {
                        sourcesRef.current.delete(source);
                    });

                    source.start(nextStartTimeRef.current);
                    nextStartTimeRef.current += audioBuffer.duration;
                    sourcesRef.current.add(source);
                } catch (e) {
                    console.error("Audio Decode Error:", e);
                }
            }

            if (serverContent?.interrupted) {
                sourcesRef.current.forEach(s => {
                    try { s.stop(); } catch(e){}
                });
                sourcesRef.current.clear();
                nextStartTimeRef.current = 0;
            }
          },
          onclose: () => {
            console.log("Visual Assist: Session Closed");
            onStateChange(AppState.IDLE);
            setIsStreaming(false);
          },
          onerror: (err) => {
            console.error("Visual Assist: Session Error", err);
            onError("Connection Error. Please retry.");
            onStateChange(AppState.ERROR);
            setIsStreaming(false);
          }
        }
      });
      
      sessionRef.current = sessionPromise;

    } catch (err: any) {
      console.error("Connection Setup Error:", err);
      onError(err.message || "Failed to start assistant");
      onStateChange(AppState.ERROR);
      stopAudio();
    }
  }, [onStateChange, onError, stopAudio, settings.voiceName, mode]);

  const disconnect = useCallback(async () => {
    if (sessionRef.current) {
        try {
            const session = await sessionRef.current;
            session.close();
        } catch (e) {
            console.error("Error closing session", e);
        }
        sessionRef.current = null;
    }
    stopAudio();
    setIsStreaming(false);
    onStateChange(AppState.IDLE);
  }, [onStateChange, stopAudio]);

  const sendVideoFrame = useCallback(async (base64Data: string) => {
    if (!isStreaming || !sessionRef.current) return;
    try {
        const session = await sessionRef.current;
        session.sendRealtimeInput({
            media: {
                mimeType: 'image/jpeg',
                data: base64Data
            }
        });
    } catch (e) {
        // Frame drop is acceptable
    }
  }, [isStreaming]);

  // Robust Mode Switching Logic
  useEffect(() => {
     let isMounted = true;
     if (isStreaming && mode !== currentModeRef.current) {
         console.log(`Switching mode to ${mode} - Restarting session...`);
         const restart = async () => {
             await disconnect();
             if (isMounted) {
                connect();
             }
         };
         restart();
     }
     return () => { isMounted = false; };
  }, [mode, isStreaming, disconnect, connect]);

  // Global Cleanup
  useEffect(() => {
    return () => {
      stopAudio();
    };
  }, [stopAudio]);

  return {
    connect,
    disconnect,
    isStreaming,
    sendVideoFrame
  };
};