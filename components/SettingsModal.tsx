
import React from 'react';
import { X, Check, Camera, Sun, ZoomIn } from 'lucide-react';
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

  const handleCameraChange = (key: keyof UserSettings['camera'], value: number) => {
    onUpdateSettings({
      ...settings,
      camera: {
        ...settings.camera,
        [key]: value
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-neutral-800 bg-neutral-900 shrink-0">
          <h2 className="text-lg font-bold text-white">Assistant Settings</h2>
          <button 
            onClick={onClose}
            className="p-2 bg-neutral-800 rounded-full hover:bg-neutral-700 transition-colors"
            aria-label="Close Settings"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body (Scrollable) */}
        <div className="p-6 space-y-8 overflow-y-auto">
          
          {/* Voice Selection */}
          <div className="space-y-3">
            <label className="text-sm font-medium text-neutral-400 uppercase tracking-wider flex items-center gap-2">
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

          {/* Camera Controls */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium text-neutral-400 uppercase tracking-wider">
              <Camera size={16} />
              <span>Camera Adjustments</span>
            </div>
            
            <div className="space-y-4 bg-neutral-800/30 p-4 rounded-xl border border-neutral-800">
                {/* Zoom Control */}
                <div className="space-y-2">
                    <div className="flex justify-between text-xs text-neutral-300">
                        <span className="flex items-center gap-1"><ZoomIn size={12}/> Zoom</span>
                        <span>{settings.camera.zoom.toFixed(1)}x</span>
                    </div>
                    <input 
                        type="range" 
                        min="1" 
                        max="5" 
                        step="0.1"
                        value={settings.camera.zoom}
                        onChange={(e) => handleCameraChange('zoom', parseFloat(e.target.value))}
                        className="w-full h-2 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-yellow-500"
                    />
                </div>

                {/* Exposure Control */}
                <div className="space-y-2">
                    <div className="flex justify-between text-xs text-neutral-300">
                        <span className="flex items-center gap-1"><Sun size={12}/> Exposure</span>
                        <span>{settings.camera.exposure > 0 ? '+' : ''}{settings.camera.exposure.toFixed(1)}</span>
                    </div>
                    <input 
                        type="range" 
                        min="-2" 
                        max="2" 
                        step="0.5"
                        value={settings.camera.exposure}
                        onChange={(e) => handleCameraChange('exposure', parseFloat(e.target.value))}
                        className="w-full h-2 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-yellow-500"
                    />
                </div>
                
                <p className="text-[10px] text-neutral-500 italic">
                    *Requires device support. Zoom may be limited by hardware.
                </p>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
};
