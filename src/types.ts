export interface Card {
  id: string;
  layoutId: string;
  url: string;
  name: string | null;
  x: number;           // Canvas-space coordinates
  y: number;
  width: number;
  height: number;
  scrollX: number;
  scrollY: number;
  thermal: 'hot' | 'warm' | 'cold';
  snapshotPath: string | null;
  isLive: boolean;
}

export interface CanvasState {
  panX: number;
  panY: number;
  zoom: number;        // 0.05 = full overview, 1.0 = 1:1, up to 3.0
}

export interface Connection {
  id: string;
  fromCard: string;
  toCard: string;
  label: string;
}

export interface CommandArg {
  name: string;
  placeholder: string;
  required?: boolean;
}

export interface Command {
  id: string;
  keywords: string[];
  description: string;
  args?: CommandArg[];
  execute: (args: string[], context: any) => void | Promise<void>;
}
