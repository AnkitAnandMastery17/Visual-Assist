
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
  const isMountedRef = useRef<boolean>(true);

  // Connection Stability Refs
  const userDisconnectRef = useRef<boolean>(false);
  const retryCountRef = useRef<number>(0);
  const retryTimeoutRef = useRef<any>(null);

  // Mount tracking
  useEffect(() => {
    isMountedRef.current = true;
    return () => { 
        isMountedRef.current = false;
        if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
    };
  }, []);

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
      try { inputAudioContextRef.current.close(); } catch(e) {}
      inputAudioContextRef.current = null;
    }

    if (outputAudioContextRef.current) {
      try { outputAudioContextRef.current.close(); } catch(e) {}
      outputAudioContextRef.current = null;
    }

    // Stop Microphone Stream (Release Hardware)
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    
    // Disconnect Nodes
    if (processorRef.current) {
      try { processorRef.current.disconnect(); } catch(e) {}
      processorRef.current = null;
    }
    if (sourceNodeRef.current) {
      try { sourceNodeRef.current.disconnect(); } catch(e) {}
      sourceNodeRef.current = null;
    }
    
    sessionRef.current = null;
  }, []);

  const getSystemInstruction = (appMode: AppMode) => {
    // Base prompt for latency optimization
    const base = `
    You are Visual Assist, an intelligent AI for the blind.
    MODE: "${appMode.toUpperCase()}"
    IMPORTANT: Be concise. Speak fast.
    INTERACTION PRIORITY: Listen to the user's voice.
    1. IF THE USER ASKS A QUESTION: Answer it immediately using visual context. Do not ignore them.
    2. IF THE USER IS SILENT: Perform the specific MODE TASK below.
    `;

    if (appMode === 'navigate') {
      return `${base}
      TASK: Navigation Guidance.
      STYLE: Imperative Command Mode. Short, urgent, precise.
      MANDATORY START: When you receive "Start", immediately say: "Navigation active. Ready."
      RULES:
      1. Use nuanced directions: "Slight left", "Veer right", "Hard turn left", "Continue straight".
      2. Identify path types: "Crosswalk ahead", "Doorway at 12 o'clock", "Clear sidewalk".
      3. Guide through transitions: "Enter doorway", "Step down curb", "Follow wall on right".
      4. Use clock directions for relative location: "Obstacle at 2 o'clock".
      5. If blocked, say "Stop" immediately, then explain briefly.
      6. Max 10 words per phrase. Speed is life.
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
    TASK: Visual Assistant.
    MANDATORY START: When you receive "Start", immediately say: "Hello! Visual Assist is ready. Ask me a question or point the camera."
    RULES:
    1. CONVERSATION: If the user speaks (e.g., "How can you help?", "Where are my keys?"), answer them directly.
    2. SCENE DESCRIPTION: If the user is silent, provide a 1-2 sentence summary of the scene.
    3. Focus on spatial layout and key objects.
    `;
  };

  const connect = useCallback(async (isRetry = false) => {
    // 1. CLEANUP FIRST: Ensure no previous session is lingering
    if (!isRetry) {
        stopAudio();
        // Reset retry count on fresh connection
        retryCountRef.current = 0;
    }

    // Mark that we are intentionally connecting
    userDisconnectRef.current = false;

    try {
      if (!navigator.onLine) {
        throw new Error("No internet connection");
      }
      
      if (!process.env.API_KEY) {
        throw new Error("API Key is missing.");
      }

      onStateChange(AppState.CONNECTING);
      currentModeRef.current = mode; 

      // 2. Initialize Audio Contexts IMMEDIATELY (Sync with user gesture)
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      
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

      // 3. Output Chain Setup
      const outputNode = outputCtx.createGain();
      outputNode.gain.value = 1.5; 
      outputNode.connect(outputCtx.destination);

      // 4. Microphone Input Setup
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: PCM_SAMPLE_RATE 
        } 
      });
      mediaStreamRef.current = stream;

      // 5. Gemini Connection
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
          onopen: async () => {
            // Reset retry count on successful connection
            retryCountRef.current = 0;

            if (!isMountedRef.current || userDisconnectRef.current) {
                // User disconnected while we were connecting
                const session = await sessionPromise;
                session.close();
                stopAudio();
                return;
            }

            console.log(`Visual Assist: Connected [${mode}]`);
            onStateChange(AppState.ACTIVE);
            setIsStreaming(true);

            // --- TRIGGER GREETING ---
            sessionPromise.then(session => {
                if (!isMountedRef.current || userDisconnectRef.current) return;
                setTimeout(() => {
                    if (!isMountedRef.current || userDisconnectRef.current) return;
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

            if (inputAudioContextRef.current && mediaStreamRef.current) {
                const source = inputAudioContextRef.current.createMediaStreamSource(mediaStreamRef.current);
                sourceNodeRef.current = source;
                
                // OPTIMIZATION: 4096 samples @ 16kHz for stability
                const processor = inputAudioContextRef.current.createScriptProcessor(4096, 1, 1);
                processorRef.current = processor;

                const currentInputRate = inputAudioContextRef.current.sampleRate;
                
                processor.onaudioprocess = (e) => {
                if (!sessionRef.current || !isMountedRef.current || userDisconnectRef.current) return;

                const inputData = e.inputBuffer.getChannelData(0);
                const pcmBlob = createPCMBlob(inputData, currentInputRate);
                
                sessionRef.current.then(session => {
                    if (userDisconnectRef.current) return;
                    session.sendRealtimeInput({ media: pcmBlob });
                }).catch(err => {
                    // Ignore send errors during disconnects
                });
                };

                source.connect(processor);
                processor.connect(inputAudioContextRef.current.destination);
            }
          },
          onmessage: async (message: LiveServerMessage) => {
            if (!isMountedRef.current || userDisconnectRef.current) return;
            const serverContent = message.serverContent;
            
            // Handle Audio Output
            const base64Audio = serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            
            if (base64Audio && outputAudioContextRef.current && outputAudioContextRef.current.state !== 'closed') {
                const ctx = outputAudioContextRef.current;
                const currentTime = ctx.currentTime;
                
                // OPTIMIZATION: Aggressive Audio Scheduling
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
          onclose: (event) => {
            console.log("Visual Assist: Session Closed", event);
            if (userDisconnectRef.current) {
                // Expected close
                return;
            }
            // Unexpected close - trigger retry logic
            handleConnectionError(new Error("Session closed unexpectedly"));
          },
          onerror: (err) => {
            console.error("Visual Assist: Session Error", err);
            if (userDisconnectRef.current) return;

            // Attempt Retry if not user cancelled
            handleConnectionError(err);
          }
        }
      });
      
      sessionRef.current = sessionPromise;
      
      // Handle Initial Connection Failures
      sessionPromise.catch((err) => {
          if (userDisconnectRef.current) return;
          console.error("Initial Connection Failed:", err);
          handleConnectionError(err);
      });

    } catch (err: any) {
      console.error("Connection Setup Error:", err);
      if (userDisconnectRef.current) return;
      handleConnectionError(err);
    }
  }, [onStateChange, onError, stopAudio, settings.voiceName, mode]);

  // Centralized Error Handling with Retry Logic
  const handleConnectionError = (err: any) => {
     stopAudio();
     
     if (retryCountRef.current < 3) {
         const delay = 1000 * (retryCountRef.current + 1);
         console.log(`Connection failed. Retrying in ${delay}ms... (Attempt ${retryCountRef.current + 1}/3)`);
         retryCountRef.current += 1;
         
         if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
         retryTimeoutRef.current = setTimeout(() => {
             if (isMountedRef.current && !userDisconnectRef.current) {
                 connect(true);
             }
         }, delay);
     } else {
         if (isMountedRef.current) {
            const errorMsg = err.message || "Connection unstable";
            onError(`Session Error: ${errorMsg}`);
            onStateChange(AppState.ERROR);
            setIsStreaming(false);
         }
     }
  };

  const disconnect = useCallback(async () => {
    // Explicitly mark as user action to suppress error alerts
    userDisconnectRef.current = true;
    
    if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
    }

    if (sessionRef.current) {
        try {
            const session = await sessionRef.current;
            await session.close();
        } catch (e) {
            // Ignore close errors
        }
    }
    stopAudio();
    if (isMountedRef.current) {
        setIsStreaming(false);
        onStateChange(AppState.IDLE);
    }
  }, [onStateChange, stopAudio]);

  const sendVideoFrame = useCallback(async (base64Data: string) => {
    if (!isStreaming || !sessionRef.current || userDisconnectRef.current) return;
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
     let isSwitching = false;
     if (isStreaming && mode !== currentModeRef.current) {
         console.log(`Switching mode to ${mode} - Restarting session...`);
         const restart = async () => {
             isSwitching = true;
             await disconnect();
             // Short delay to ensure socket cleanup before reconnecting
             setTimeout(() => {
                if (isMountedRef.current) {
                    connect();
                }
             }, 100);
             isSwitching = false;
         };
         restart();
     }
     return () => {
         if (isSwitching) {
             stopAudio();
         }
     };
  }, [mode, isStreaming, disconnect, connect, stopAudio]);

  // Global Cleanup
  useEffect(() => {
    return () => {
      userDisconnectRef.current = true; // Prevent errors on unmount
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
