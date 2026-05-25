import { create } from 'zustand';
import { CanvasState } from '../types';

interface CanvasStore extends CanvasState {
  setPan: (panX: number, panY: number) => void;
  setZoom: (zoom: number) => void;
  setCanvasState: (state: CanvasState) => void;
  reset: () => void;
}

export const useCanvasStore = create<CanvasStore>((set) => ({
  panX: 0,
  panY: 0,
  zoom: 1.0,
  setPan: (panX, panY) => set({ panX, panY }),
  setZoom: (zoom) => set({ zoom: Math.max(0.05, Math.min(3.0, zoom)) }),
  setCanvasState: (state) => set({ panX: state.panX, panY: state.panY, zoom: state.zoom }),
  reset: () => set({ panX: 0, panY: 0, zoom: 1.0 }),
}));

export const canvasActions = {
  zoomToCard: (_cardId: string) => {},
  zoomToVoid: () => {},
  getCanvasThumbnail: async () => null as string | null,
};
