import React from 'react';
import { Mic, Power, Loader2 } from 'lucide-react';
import { AppState } from '../types';

interface ControlsProps {
  appState: AppState;
  onToggle: () => void;
}

export const Controls: React.FC<ControlsProps> = ({ appState, onToggle }) => {
  const isRunning = appState === AppState.ACTIVE || appState === AppState.CONNECTING;
  const isConnecting = appState === AppState.CONNECTING;

  return (
    <div className="w-full px-4 py-2 flex flex-col items-center gap-3">
      
      {/* Status & Visualizer - Compact */}
      <div className="h-6 w-full flex items-center justify-center gap-1">
        {appState === AppState.ACTIVE ? (
            <>
                <div className="w-1 bg-green-500/80 rounded-full animate-wave" style={{ animationDelay: '0ms', animationDuration: '0.8s' }}></div>
                <div className="w-1 bg-green-500/80 rounded-full animate-wave" style={{ animationDelay: '100ms', animationDuration: '1.2s' }}></div>
                <div className="w-1 bg-green-500/80 rounded-full animate-wave" style={{ animationDelay: '200ms', animationDuration: '0.5s' }}></div>
                <span className="ml-2 text-green-500 font-bold tracking-widest text-xs">LISTENING</span>
            </>
        ) : (
            <span className="text-neutral-500 font-medium text-xs tracking-wide">
                {isConnecting ? "CONNECTING..." : "READY"}
            </span>
        )}
      </div>

      {/* Main Action Button - Reduced Size */}
      <button
        onClick={onToggle}
        disabled={isConnecting}
        className={`
          relative group w-[72px] h-[72px] rounded-full flex items-center justify-center transition-all duration-300
          ${isRunning 
            ? 'bg-red-500 hover:bg-red-600 shadow-[0_0_30px_rgba(239,68,68,0.4)]' 
            : 'bg-yellow-400 hover:bg-yellow-300 shadow-[0_0_30px_rgba(250,204,21,0.2)]'
          }
          ${isConnecting ? 'opacity-80 scale-95 cursor-not-allowed' : 'hover:scale-105 active:scale-95'}
        `}
        aria-label={isRunning ? "Stop Assistant" : "Start Assistant"}
      >
        {/* Button Inner Content */}
        <div className="relative z-10">
            {isConnecting ? (
                <Loader2 className="animate-spin text-black" size={32} />
            ) : isRunning ? (
                <Power className="text-white drop-shadow-md" size={32} />
            ) : (
                <Mic className="text-black drop-shadow-sm" size={32} />
            )}
        </div>

        {/* Pulsing Ring Effect */}
        {appState === AppState.IDLE && (
            <div className="absolute inset-0 rounded-full border-2 border-yellow-400/50 animate-ping opacity-20"></div>
        )}
      </button>

      {/* Instructional / Secondary Info - Smaller */}
      <div className="text-center pb-1">
        <p className="text-neutral-500 text-xs max-w-[200px] mx-auto leading-tight">
          {isRunning 
             ? "Vision & Navigation active" 
             : "Tap to start guidance"}
        </p>
      </div>

    </div>
  );
};