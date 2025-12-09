import React, { useState, useEffect } from 'react';
import { CameraView } from './components/CameraView';
import { Controls } from './components/Controls';
import { SettingsModal } from './components/SettingsModal';
import { useGeminiLive } from './hooks/useGeminiLive';
import { AppState, UserSettings } from './types';
import { Settings, Info } from 'lucide-react';

const DEFAULT_SETTINGS: UserSettings = {
  voiceName: 'Kore'
};

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>(AppState.IDLE);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [showSettings, setShowSettings] = useState(false);
  
  // Load settings from localStorage or use defaults
  const [settings, setSettings] = useState<UserSettings>(() => {
    try {
      const saved = localStorage.getItem('visuassist_settings');
      return saved ? JSON.parse(saved) : DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  });

  const updateSettings = (newSettings: UserSettings) => {
    setSettings(newSettings);
    localStorage.setItem('visuassist_settings', JSON.stringify(newSettings));
  };

  const { connect, disconnect, isStreaming, sendVideoFrame } = useGeminiLive({
    onStateChange: setAppState,
    onError: (msg) => {
        setErrorMsg(msg);
        setAppState(AppState.ERROR);
    },
    settings
  });

  const handleToggle = () => {
    if (appState === AppState.ACTIVE || appState === AppState.CONNECTING) {
      disconnect();
    } else {
      setErrorMsg("");
      connect();
    }
  };

  return (
    <div className="fixed inset-0 bg-neutral-950 text-white flex flex-col overflow-hidden">
      
      {/* Header Overlay */}
      <div className="absolute top-0 left-0 right-0 z-20 p-4 pt-safe flex justify-between items-center bg-gradient-to-b from-black/80 to-transparent pointer-events-none">
        <div className="flex items-center gap-2 pointer-events-auto">
            <div className="w-8 h-8 bg-yellow-400 rounded-lg flex items-center justify-center text-black font-bold text-xl shadow-lg">
                V
            </div>
            <h1 className="text-xl font-bold tracking-tight text-white drop-shadow-md">VisuAssist</h1>
        </div>
        <div className="flex gap-4 pointer-events-auto">
            <button 
              onClick={() => setShowSettings(true)}
              disabled={appState === AppState.ACTIVE || appState === AppState.CONNECTING}
              className="p-2 rounded-full bg-white/10 backdrop-blur-md hover:bg-white/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed" 
              aria-label="Settings"
            >
                <Settings size={20} />
            </button>
        </div>
      </div>

      {/* Main Camera Area */}
      <main className="flex-1 relative bg-neutral-900 w-full flex flex-col">
        <div className="absolute inset-0 z-0">
           <CameraView 
             isActive={isStreaming} 
             appState={appState}
             onFrame={sendVideoFrame}
             onError={(msg) => setErrorMsg(msg)}
           />
        </div>

        {/* Error Notification Banner */}
        {errorMsg && (
            <div className="absolute top-24 left-4 right-4 z-30 animate-in slide-in-from-top-4 fade-in">
                <div className="bg-red-600/90 backdrop-blur-md text-white px-4 py-3 rounded-xl border border-red-500 shadow-xl flex items-center gap-3">
                    <Info size={24} className="shrink-0" />
                    <p className="font-medium text-sm">{errorMsg}</p>
                </div>
            </div>
        )}
      </main>

      {/* Control Deck - Bottom Sheet */}
      <div className="relative z-20 bg-neutral-900 border-t border-neutral-800 rounded-t-2xl shadow-[0_-10px_40px_rgba(0,0,0,0.5)] safe-pb">
        <Controls appState={appState} onToggle={handleToggle} />
      </div>

      {/* Settings Modal */}
      <SettingsModal 
        isOpen={showSettings} 
        onClose={() => setShowSettings(false)}
        settings={settings}
        onUpdateSettings={updateSettings}
      />
    </div>
  );
};

export default App;
