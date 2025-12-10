
import React from 'react';
import { Mic, Power, Loader2, ScanEye, Type, TriangleAlert, Footprints } from 'lucide-react';
import { AppState, AppMode } from '../types';

interface ControlsProps {
  appState: AppState;
  appMode: AppMode;
  onToggle: () => void;
  onModeChange: (mode: AppMode) => void;
}

export const Controls: React.FC<ControlsProps> = ({ appState, appMode, onToggle, onModeChange }) => {
  const isRunning = appState === AppState.ACTIVE || appState === AppState.CONNECTING;
  const isConnecting = appState === AppState.CONNECTING;

  const MODES = [
      { id: AppMode.DESCRIBE, label: 'Describe', icon: ScanEye },
      { id: AppMode.READ_TEXT, label: 'Read Text', icon: Type },
      { id: AppMode.HAZARD, label: 'Hazard', icon: TriangleAlert },
      { id: AppMode.NAVIGATE, label: 'Navigate', icon: Footprints },
  ];

  return (
    <div className="w-full flex flex-col items-center gap-2 pt-1 pb-2">
      
      {/* Mode Selector - Horizontal Scroll */}
      {/* We use inline styles to hide scrollbar for cross-browser compatibility without global CSS */}
      <div 
        className="w-full overflow-x-auto flex gap-3 px-4 py-3 snap-x snap-mandatory"
        style={{ 
            scrollbarWidth: 'none', 
            msOverflowStyle: 'none' 
        }}
      >
        {/* Webkit scrollbar hiding for Chrome/Safari */}
        <style>{`
            .mode-scroll::-webkit-scrollbar { display: none; }
        `}</style>
        
        {MODES.map((mode) => {
            const Icon = mode.icon;
            const isActive = appMode === mode.id;
            return (
                <button
                    key={mode.id}
                    onClick={() => onModeChange(mode.id)}
                    className={`
                        flex-shrink-0 snap-center
                        flex flex-col items-center justify-center p-2 rounded-xl min-w-[76px] transition-all duration-200
                        ${isActive 
                            ? 'bg-neutral-800 border border-yellow-500/50 shadow-[0_0_15px_rgba(234,179,8,0.2)] scale-105' 
                            : 'bg-neutral-900/50 border border-neutral-800 text-neutral-500 hover:bg-neutral-800 hover:text-neutral-300'
                        }
                    `}
                    aria-label={`Switch to ${mode.label} mode`}
                    aria-pressed={isActive}
                >
                    <Icon 
                        size={22} 
                        className={`mb-1 transition-colors ${isActive ? 'text-yellow-400' : 'text-current'}`} 
                    />
                    <span className={`text-[11px] font-medium tracking-wide whitespace-nowrap ${isActive ? 'text-yellow-100' : 'text-current'}`}>
                        {mode.label}
                    </span>
                </button>
            )
        })}
        
        {/* Spacer to allow scrolling the last item fully into view if needed */}
        <div className="w-2 flex-shrink-0" />
      </div>

      {/* Status & Visualizer - Compact */}
      <div className="h-6 w-full flex items-center justify-center gap-1">
        {appState === AppState.ACTIVE ? (
            <>
                <div className="w-1 bg-green-500/80 rounded-full animate-wave" style={{ animationDelay: '0ms', animationDuration: '0.8s' }}></div>
                <div className="w-1 bg-green-500/80 rounded-full animate-wave" style={{ animationDelay: '100ms', animationDuration: '1.2s' }}></div>
                <div className="w-1 bg-green-500/80 rounded-full animate-wave" style={{ animationDelay: '200ms', animationDuration: '0.5s' }}></div>
                <span className="ml-2 text-green-500 font-bold tracking-widest text-xs uppercase">
                    {appMode.replace('_', ' ')} ACTIVE
                </span>
            </>
        ) : (
            <span className="text-neutral-500 font-medium text-xs tracking-wide">
                {isConnecting ? "INITIALIZING..." : "READY TO START"}
            </span>
        )}
      </div>

      {/* Main Action Button */}
      <button
        onClick={onToggle}
        disabled={isConnecting}
        className={`
          relative group w-[72px] h-[72px] rounded-full flex items-center justify-center transition-all duration-300 mb-1
          ${isRunning 
            ? 'bg-red-500 hover:bg-red-600 shadow-[0_0_30px_rgba(239,68,68,0.4)]' 
            : 'bg-yellow-400 hover:bg-yellow-300 shadow-[0_0_30px_rgba(250,204,21,0.2)]'
          }
          ${isConnecting ? 'opacity-80 scale-95 cursor-not-allowed' : 'hover:scale-105 active:scale-95'}
        `}
        aria-label={isRunning ? "Stop Assistant" : "Start Assistant"}
      >
        <div className="relative z-10">
            {isConnecting ? (
                <Loader2 className="animate-spin text-black" size={32} />
            ) : isRunning ? (
                <Power className="text-white drop-shadow-md" size={32} />
            ) : (
                <Mic className="text-black drop-shadow-sm" size={32} />
            )}
        </div>
        
        {appState === AppState.IDLE && (
            <div className="absolute inset-0 rounded-full border-2 border-yellow-400/50 animate-ping opacity-20"></div>
        )}
      </button>

    </div>
  );
};
