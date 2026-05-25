import { create } from 'zustand';
import { Card, Connection } from '../types';

// Helper to generate UUID in JS
function generateUuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

interface CardsStore {
  cards: Card[];
  connections: Connection[];
  activeCardId: string | null;
  currentLayoutId: string;
  connectMode: {
    active: boolean;
    fromCardId: string | null;
  };
  disconnectModeActive: boolean;
  paletteOpen: boolean;
  
  setCards: (cards: Card[]) => void;
  setConnections: (connections: Connection[]) => void;
  addCard: (card: Card) => void;
  updateCard: (id: string, updates: Partial<Card>) => void;
  removeCard: (id: string) => void;
  setActiveCardId: (id: string | null) => void;
  setCurrentLayoutId: (layoutId: string) => void;
  setPaletteOpen: (open: boolean) => void;
  
  addConnection: (conn: Connection) => void;
  removeConnection: (id: string) => void;
  setConnectMode: (active: boolean, fromCardId?: string | null) => void;
  setDisconnectMode: (active: boolean) => void;
}

export const useCardsStore = create<CardsStore>((set) => ({
  cards: [],
  connections: [],
  activeCardId: null,
  currentLayoutId: generateUuid(), // Pre-generate a layout UUID for this session
  connectMode: {
    active: false,
    fromCardId: null,
  },
  disconnectModeActive: false,
  paletteOpen: false,
  
  setCards: (cards) => set({ cards }),
  setConnections: (connections) => set({ connections }),
  addCard: (card) => set((state) => ({ cards: [...state.cards, card] })),
  updateCard: (id, updates) => set((state) => ({
    cards: state.cards.map((c) => (c.id === id ? { ...c, ...updates } : c)),
  })),
  removeCard: (id) => set((state) => ({
    cards: state.cards.filter((c) => c.id !== id),
    connections: state.connections.filter((conn) => conn.fromCard !== id && conn.toCard !== id),
    activeCardId: state.activeCardId === id ? null : state.activeCardId,
  })),
  setActiveCardId: (id) => set({ activeCardId: id }),
  setCurrentLayoutId: (layoutId) => set({ currentLayoutId: layoutId }),
  setPaletteOpen: (open) => set({ paletteOpen: open }),
  
  addConnection: (conn) => set((state) => ({ connections: [...state.connections, conn] })),
  removeConnection: (id) => set((state) => ({
    connections: state.connections.filter((c) => c.id !== id),
  })),
  setConnectMode: (active, fromCardId = null) => set({
    connectMode: { active, fromCardId },
  }),
  setDisconnectMode: (active) => set({ disconnectModeActive: active }),
}));
