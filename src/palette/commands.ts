import { invoke } from '@tauri-apps/api/core';
import { Command, Card } from '../types';

export interface AppContext {
  cards: Card[];
  activeCardId: string | null;
  currentLayoutId: string;
  panX: number;
  panY: number;
  zoom: number;
  
  addCard: (card: Card) => void;
  updateCard: (id: string, updates: Partial<Card>) => void;
  removeCard: (id: string) => void;
  setCards: (cards: Card[]) => void;
  setConnections: (conns: any[]) => void;
  setPaletteOpen: (open: boolean) => void;
  setCurrentLayoutId: (id: string) => void;
  
  syncLiveCard: (card: Card) => Promise<void>;
  blurLiveCard: (id: string) => Promise<string>;
  zoomToCard: (cardId: string) => void;
  zoomToVoid: () => void;
  setConnectMode: (active: boolean, fromCardId?: string | null) => void;
  setDisconnectMode: (active: boolean) => void;
  loadLayoutsList: () => Promise<void>;
  
  // A callback to get the PixiJS canvas base64 image
  getCanvasThumbnailB64: () => Promise<string | null>;
}

export const getCommands = (ctx: AppContext): Command[] => [
  {
    id: 'open',
    keywords: ['open', 'new', 'url', 'http', 'browse'],
    description: 'Open a new card at the center of the viewport',
    args: [{ name: 'url', placeholder: 'Enter URL (e.g. google.com or a search term)', required: true }],
    execute: async (args) => {
      const url = args[0] || 'https://google.com';
      // Center coordinates in canvas-space
      const logicalWidth = window.innerWidth;
      const logicalHeight = window.innerHeight;
      
      const canvasX = (logicalWidth / 2 - ctx.panX) / ctx.zoom - 480; // offset by half card size (960/2)
      const canvasY = (logicalHeight / 2 - ctx.panY) / ctx.zoom - 320; // offset by half card height (640/2)

      try {
        const card = await invoke<Card>('open_card', {
          layoutId: ctx.currentLayoutId,
          url,
          x: canvasX,
          y: canvasY,
        });
        ctx.addCard(card);
        ctx.setPaletteOpen(false);
      } catch (e) {
        console.error('Failed to open card:', e);
      }
    },
  },
  {
    id: 'focus',
    keywords: ['focus', 'zoom in', 'read', 'view'],
    description: 'Zoom into and focus the active card',
    execute: async () => {
      if (ctx.activeCardId) {
        const card = ctx.cards.find((c) => c.id === ctx.activeCardId);
        if (card) {
          ctx.setPaletteOpen(false);
          ctx.zoomToCard(card.id);
        }
      }
    },
  },
  {
    id: 'void',
    keywords: ['void', 'zoom out', 'overview', 'show all'],
    description: 'Zoom out to view all cards on the canvas',
    execute: async () => {
      ctx.setPaletteOpen(false);
      ctx.zoomToVoid();
    },
  },
  {
    id: 'name',
    keywords: ['name', 'rename', 'label', 'title'],
    description: 'Assign a custom name to the active card',
    args: [{ name: 'name', placeholder: 'Enter custom card name', required: true }],
    execute: async (args) => {
      if (ctx.activeCardId && args[0]) {
        ctx.updateCard(ctx.activeCardId, { name: args[0] });
        ctx.setPaletteOpen(false);
      }
    },
  },
  {
    id: 'zoom',
    keywords: ['zoom', 'go to', 'find', 'navigate'],
    description: 'Fly the canvas view to a specific card by name',
    args: [{ name: 'card', placeholder: 'Select card to zoom to', required: true }],
    execute: async (args) => {
      const match = ctx.cards.find((c) => c.name?.toLowerCase().includes(args[0].toLowerCase()));
      if (match) {
        ctx.setPaletteOpen(false);
        ctx.zoomToCard(match.id);
      }
    },
  },
  {
    id: 'connect',
    keywords: ['connect', 'link', 'relation', 'draw connection'],
    description: 'Enter connection mode (click start card, then target card)',
    execute: async () => {
      ctx.setPaletteOpen(false);
      ctx.setConnectMode(true);
    },
  },
  {
    id: 'save',
    keywords: ['save', 'layout', 'session', 'export'],
    description: 'Serialize current canvas and cards state as a layout',
    args: [{ name: 'name', placeholder: 'Enter layout name', required: true }],
    execute: async (args) => {
      const name = args[0];
      if (!name) return;
      
      const thumb = await ctx.getCanvasThumbnailB64();
      
      try {
        const layoutId = await invoke<string>('save_layout', {
          name,
          state: {
            panX: ctx.panX,
            panY: ctx.panY,
            zoom: ctx.zoom,
            cards: ctx.cards,
            connections: [], // Connections are fetched from state or store in real implementations
            thumbnailB64: thumb,
          },
        });
        ctx.setCurrentLayoutId(layoutId);
        await ctx.loadLayoutsList();
        ctx.setPaletteOpen(false);
      } catch (e) {
        console.error('Failed to save layout:', e);
      }
    },
  },
  {
    id: 'restore',
    keywords: ['restore', 'load', 'open layout'],
    description: 'Load a saved layout and reset canvas state',
    args: [{ name: 'layout_id', placeholder: 'Select layout to restore', required: true }],
    execute: async (args) => {
      const layoutId = args[0];
      if (!layoutId) return;
      
      try {
        const payload = await invoke<any>('restore_layout', { id: layoutId });
        ctx.setCurrentLayoutId(payload.id);
        ctx.setCards(payload.cards);
        ctx.setConnections(payload.connections || []);
        ctx.setPaletteOpen(false);
        
        // Fly canvas to restored coordinates
        ctx.zoomToVoid();
      } catch (e) {
        console.error('Failed to restore layout:', e);
      }
    },
  },
  {
    id: 'layouts',
    keywords: ['layouts', 'sessions', 'list layouts'],
    description: 'Open the saved layouts listing overlay',
    execute: async () => {
      // List layouts will be triggered in the command palette UI automatically
    },
  },
  {
    id: 'kill',
    keywords: ['kill', 'close', 'remove', 'delete card'],
    description: 'Close and permanently delete the active card',
    execute: async () => {
      if (ctx.activeCardId) {
        try {
          await invoke('close_card', { id: ctx.activeCardId });
          ctx.removeCard(ctx.activeCardId);
          ctx.setPaletteOpen(false);
        } catch (e) {
          console.error('Failed to close card:', e);
        }
      }
    },
  },
  {
    id: 'kill all',
    keywords: ['kill all', 'clear', 'reset', 'clear canvas'],
    description: 'Close all open cards on the canvas',
    execute: async () => {
      if (confirm('Are you sure you want to close all cards? This will reset the current session.')) {
        for (const card of ctx.cards) {
          try {
            await invoke('close_card', { id: card.id });
          } catch (e) {
            console.error('Error closing card during reset:', e);
          }
        }
        ctx.setCards([]);
        ctx.setConnections([]);
        ctx.setPaletteOpen(false);
      }
    },
  },
  {
    id: 'disconnect',
    keywords: ['disconnect', 'unlink', 'delete connection'],
    description: 'Enter disconnect mode (click a connection line to delete it)',
    execute: async () => {
      ctx.setPaletteOpen(false);
      ctx.setDisconnectMode(true);
    },
  },
];
