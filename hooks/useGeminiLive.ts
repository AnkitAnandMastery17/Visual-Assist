import { useEffect, useRef, useState, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { createPCMBlob, decode, decodeAudioData, OUTPUT_SAMPLE_RATE, PCM_SAMPLE_RATE } from '../services/audioUtils';
import { AppState, UserSettings } from '../types';

interface UseGeminiLiveProps {
  onStateChange: (state: AppState) => void;
  onError: (error: string) => void;
  settings: UserSettings;
}

export const useGeminiLive = ({ onStateChange, onError, settings }: UseGeminiLiveProps) => {
  const [isStreaming, setIsStreaming] = useState(false);
  const sessionRef = useRef<Promise<any> | null>(null);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  
  // Audio Input Refs
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);

  const stopAudio = useCallback(() => {
    // Stop all playing sources
    sourcesRef.current.forEach(source => {
      try {
        source.stop();
      } catch (e) {
        // Ignore errors if already stopped
      }
    });
    sourcesRef.current.clear();
    nextStartTimeRef.current = 0;

    // Close Audio Contexts
    if (inputAudioContextRef.current) {
      inputAudioContextRef.current.close();
      inputAudioContextRef.current = null;
    }
    if (outputAudioContextRef.current) {
      outputAudioContextRef.current.close();
      outputAudioContextRef.current = null;
    }

    // Stop Microphone Stream
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

  const connect = useCallback(async () => {
    try {
      if (!process.env.API_KEY) {
        throw new Error("API Key is missing.");
      }

      onStateChange(AppState.CONNECTING);
      
      // Initialize Audio Contexts
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      inputAudioContextRef.current = new AudioContextClass({ sampleRate: PCM_SAMPLE_RATE });
      outputAudioContextRef.current = new AudioContextClass({ sampleRate: OUTPUT_SAMPLE_RATE });
      
      // Prepare Output Node
      const outputNode = outputAudioContextRef.current.createGain();
      outputNode.connect(outputAudioContextRef.current.destination);

      // Get Microphone Stream
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      });
      mediaStreamRef.current = stream;

      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      // Define System Instruction
      const systemInstruction = `You are VisuAssist, an intelligent guide for visually impaired users. 
      Your goal is to provide real-time navigation assistance and environmental understanding based on video input.
      
      CORE RESPONSIBILITIES:
      1. Navigation Guidance: Actively guide the user. Identify clear paths and say things like "Continue straight," "Turn slightly left to follow the sidewalk," or "Doorway at 2 o'clock."
      2. Hazard Alerts: IMMEDIATELY warn of dangers. Call out "Stop" for critical hazards. Mention stairs (up/down), curbs, traffic, or obstacles at head/ground level.
      3. Spatial Awareness: Describe the layout relative to the user (e.g., "Table to your right," "Open space ahead").
      4. Text Reading: If signs or text are visible and relevant (e.g., exit signs, street names), read them verbatim.
      
      COMMUNICATION PROTOCOL:
      - Be concise and direct. No filler words.
      - Do not say "I see" or "The video shows."
      - Prioritize information: Hazards > Navigation > General Description.
      - Speak as if you are the user's eyes.`;

      // Connect to Live API
      sessionRef.current = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: settings.voiceName } },
          },
          systemInstruction: systemInstruction,
        },
        callbacks: {
          onopen: () => {
            console.log("Gemini Live Session Opened");
            onStateChange(AppState.ACTIVE);
            setIsStreaming(true);

            // Start Audio Input Processing
            if (!inputAudioContextRef.current || !mediaStreamRef.current) return;
            
            const source = inputAudioContextRef.current.createMediaStreamSource(mediaStreamRef.current);
            sourceNodeRef.current = source;
            
            // Use ScriptProcessor for raw PCM access (standard for this API per guidelines)
            const processor = inputAudioContextRef.current.createScriptProcessor(4096, 1, 1);
            processorRef.current = processor;

            processor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              const pcmBlob = createPCMBlob(inputData);
              
              if (sessionRef.current) {
                sessionRef.current.then(session => {
                   session.sendRealtimeInput({ media: pcmBlob });
                }).catch(err => {
                    console.error("Session send error", err);
                });
              }
            };

            source.connect(processor);
            processor.connect(inputAudioContextRef.current.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            const serverContent = message.serverContent;
            
            // Handle Audio Output
            const base64Audio = serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (base64Audio && outputAudioContextRef.current) {
                const ctx = outputAudioContextRef.current;
                
                // Reset time if stream was interrupted
                nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);

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
                    console.error("Error decoding audio", e);
                }
            }

            // Handle Interruption
            if (serverContent?.interrupted) {
                sourcesRef.current.forEach(s => s.stop());
                sourcesRef.current.clear();
                nextStartTimeRef.current = 0;
            }
          },
          onclose: () => {
            console.log("Session Closed");
            onStateChange(AppState.IDLE);
            setIsStreaming(false);
            stopAudio();
          },
          onerror: (err) => {
            console.error("Session Error", err);
            onError("Connection Error: " + err.type);
            onStateChange(AppState.ERROR);
            setIsStreaming(false);
            stopAudio();
          }
        }
      });

    } catch (err: any) {
      console.error(err);
      onError(err.message || "Failed to start session");
      onStateChange(AppState.ERROR);
      stopAudio();
    }
  }, [onStateChange, onError, stopAudio, settings.voiceName]);

  const disconnect = useCallback(async () => {
    if (sessionRef.current) {
        const session = await sessionRef.current;
        session.close();
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
        console.error("Error sending frame", e);
    }
  }, [isStreaming]);

  // Cleanup on unmount
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