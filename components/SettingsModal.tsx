import React from 'react';
import { X, Check } from 'lucide-react';
import { UserSettings } from '../types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: UserSettings;
  onUpdateSettings: (newSettings: UserSettings) => void;
}

const VOICES = ['Puck', 'Charon', 'Kore', 'Fenrir', 'Aoede'];

export const SettingsModal: React.FC<SettingsModalProps> = ({ 
  isOpen, 
  onClose, 
  settings, 
  onUpdateSettings 
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-neutral-800">
          <h2 className="text-lg font-bold text-white">Assistant Settings</h2>
          <button 
            onClick={onClose}
            className="p-2 bg-neutral-800 rounded-full hover:bg-neutral-700 transition-colors"
            aria-label="Close Settings"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6">
          
          {/* Voice Selection */}
          <div className="space-y-3">
            <label className="text-sm font-medium text-neutral-400 uppercase tracking-wider">
              Voice Personality
            </label>
            <div className="grid grid-cols-1 gap-2">
              {VOICES.map((voice) => (
                <button
                  key={voice}
                  onClick={() => onUpdateSettings({ ...settings, voiceName: voice as any })}
                  className={`flex items-center justify-between px-4 py-3 rounded-xl border transition-all ${
                    settings.voiceName === voice 
                      ? 'bg-cyan-950/30 border-cyan-500/50 text-cyan-400' 
                      : 'bg-neutral-800/50 border-neutral-800 text-neutral-300 hover:bg-neutral-800'
                  }`}
                >
                  <span className="font-medium">{voice}</span>
                  {settings.voiceName === voice && <Check size={18} />}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-blue-900/20 p-4 rounded-xl border border-blue-500/20">
             <p className="text-blue-200 text-xs">
               Using Gemini 2.5 Flash Native Audio. Changes apply on next connection.
             </p>
          </div>
        </div>

      </div>
    </div>
  );
};
