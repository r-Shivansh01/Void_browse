import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';

export interface LayoutMeta {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  panX: number;
  panY: number;
  zoom: number;
  thumbnail: string | null;
}

interface LayoutsStore {
  layouts: LayoutMeta[];
  setLayouts: (layouts: LayoutMeta[]) => void;
  loadLayoutsList: () => Promise<void>;
}

export const useLayoutsStore = create<LayoutsStore>((set) => ({
  layouts: [],
  setLayouts: (layouts) => set({ layouts }),
  loadLayoutsList: async () => {
    try {
      const list = await invoke<LayoutMeta[]>('list_layouts');
      set({ layouts: list });
    } catch (e) {
      console.error('Failed to load layouts:', e);
    }
  },
}));
