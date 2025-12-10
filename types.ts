
export enum AppState {
  IDLE = 'IDLE',
  CONNECTING = 'CONNECTING',
  ACTIVE = 'ACTIVE',
  ERROR = 'ERROR'
}

export enum AppMode {
  DESCRIBE = 'describe',
  READ_TEXT = 'read_text',
  HAZARD = 'hazard',
  NAVIGATE = 'navigate'
}

export interface AudioConfig {
  sampleRate: number;
}

export type StreamConfig = {
  videoIntervalMs: number;
  jpegQuality: number;
};

export interface UserSettings {
  voiceName: 'Puck' | 'Charon' | 'Kore' | 'Fenrir' | 'Aoede';
}
