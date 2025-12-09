import React, { useEffect, useRef, useState } from 'react';
import { blobToBase64 } from '../services/audioUtils';
import { AppState } from '../types';
import { ScanEye, Loader2 } from 'lucide-react';

interface CameraViewProps {
  isActive: boolean;
  appState: AppState;
  onFrame: (base64: string) => void;
  onError: (msg: string) => void;
}

const FPS = 2; 
const JPEG_QUALITY = 0.6;

export const CameraView: React.FC<CameraViewProps> = ({ isActive, appState, onFrame, onError }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const intervalRef = useRef<number | null>(null);

  const isConnecting = appState === AppState.CONNECTING;

  useEffect(() => {
    const startCamera = async () => {
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'environment',
            width: { ideal: 1280 },
            height: { ideal: 720 }
          }
        });
        setStream(mediaStream);
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }
      } catch (err) {
        onError("Camera access denied. Please enable permissions.");
        console.error(err);
      }
    };

    if (isActive && !stream) {
      startCamera();
    } else if (!isActive && stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
      if (videoRef.current) videoRef.current.srcObject = null;
    }

    return () => {
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
        }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive]);

  useEffect(() => {
    if (isActive && stream) {
      intervalRef.current = window.setInterval(async () => {
        if (!videoRef.current || !canvasRef.current) return;
        
        const video = videoRef.current;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        
        if (video.readyState === video.HAVE_ENOUGH_DATA && ctx) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            
            canvas.toBlob(async (blob) => {
                if (blob) {
                    const base64 = await blobToBase64(blob);
                    onFrame(base64);
                }
            }, 'image/jpeg', JPEG_QUALITY);
        }
      }, 1000 / FPS);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isActive, stream, onFrame]);

  return (
    <div className="relative w-full h-full bg-neutral-950 overflow-hidden flex flex-col items-center justify-center">
        
        {/* HUD Overlay for IDLE/CONNECTING states */}
        {!isActive && (
            <div className="absolute inset-0 bg-neutral-950 flex flex-col items-center justify-center z-20 overflow-hidden text-neutral-400">
                 {/* Sci-fi Grid Background */}
                 <div className="absolute inset-0 opacity-10 pointer-events-none" 
                      style={{ 
                         backgroundImage: 'linear-gradient(#404040 1px, transparent 1px), linear-gradient(90deg, #404040 1px, transparent 1px)', 
                         backgroundSize: '40px 40px',
                         maskImage: 'radial-gradient(circle at center, black 40%, transparent 100%)'
                      }} 
                 />
                 
                 {/* Central HUD Element */}
                 <div className="relative z-10 flex flex-col items-center">
                    {/* Animated Circle Container */}
                    <div className="relative w-48 h-48 flex items-center justify-center mb-8">
                        {/* Outer Decoration Ring */}
                        <div className={`absolute inset-0 border border-neutral-800 rounded-full transition-all duration-700 ${isConnecting ? 'scale-110 opacity-50' : 'scale-100 opacity-100'}`}></div>
                        
                        {/* Inner Dynamic Rings */}
                        {isConnecting ? (
                           <>
                             {/* Spinning Cyan Ring */}
                             <div className="absolute inset-0 border-2 border-t-cyan-500 border-r-transparent border-b-cyan-500 border-l-transparent rounded-full animate-spin duration-1000"></div>
                             {/* Counter-Spinning Inner Ring */}
                             <div className="absolute inset-4 border-2 border-t-transparent border-r-cyan-500/50 border-b-transparent border-l-cyan-500/50 rounded-full animate-spin [animation-direction:reverse] duration-1000"></div>
                           </>
                        ) : (
                           /* Breathing Standby Ring */
                           <div className="absolute inset-2 border-2 border-dashed border-neutral-700 rounded-full animate-[spin_10s_linear_infinite] opacity-50"></div>
                        )}

                        {/* Center Icon */}
                        <div className={`relative z-20 bg-neutral-900 p-6 rounded-full border border-neutral-800 transition-all duration-500 ${isConnecting ? 'shadow-[0_0_30px_rgba(6,182,212,0.2)] border-cyan-500/30' : ''}`}>
                           {isConnecting ? (
                               <Loader2 className="text-cyan-400 animate-spin" size={48} />
                           ) : (
                               <ScanEye className="text-neutral-500 animate-pulse" size={48} />
                           )}
                        </div>
                    </div>

                    {/* Text Status */}
                    <div className="text-center space-y-3">
                        <h2 className={`text-xl font-bold tracking-[0.2em] transition-colors duration-300 ${isConnecting ? 'text-cyan-400' : 'text-neutral-300'}`}>
                            {isConnecting ? "SYSTEM INITIALIZING" : "VISUAL CORE STANDBY"}
                        </h2>
                        <div className="h-6 flex items-center justify-center gap-2">
                             {isConnecting && (
                                 <div className="flex gap-1.5">
                                     <div className="w-1.5 h-1.5 bg-cyan-500 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                                     <div className="w-1.5 h-1.5 bg-cyan-500 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                                     <div className="w-1.5 h-1.5 bg-cyan-500 rounded-full animate-bounce"></div>
                                 </div>
                             )}
                             <p className="text-neutral-500 font-mono text-xs uppercase tracking-wider">
                                {isConnecting ? "Establishing neural link" : "Awaiting activation command"}
                             </p>
                        </div>
                    </div>
                 </div>
            </div>
        )}
      
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className={`w-full h-full object-cover transition-all duration-1000 ${isActive ? 'opacity-100 scale-100' : 'opacity-0 scale-105'}`}
      />
      
      {/* Off-screen canvas for frame capture */}
      <canvas ref={canvasRef} className="hidden" />
      
      {/* Active AI Overlay - Scanner Effect */}
      {isActive && (
          <>
            <div className="absolute inset-0 bg-gradient-to-b from-cyan-500/10 to-transparent pointer-events-none z-10 animate-scan h-[150%]">
                <div className="w-full h-1 bg-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.8)]"></div>
            </div>
            <div className="absolute bottom-4 left-4 z-10">
                <span className="bg-black/60 backdrop-blur-md border border-cyan-500/30 text-cyan-400 text-[10px] font-mono px-2 py-1 rounded uppercase tracking-wider shadow-lg">
                    Gemini Vision // Online
                </span>
            </div>
          </>
      )}
    </div>
  );
};