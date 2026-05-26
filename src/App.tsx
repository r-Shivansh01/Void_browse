import { useEffect, useRef } from 'react';
import { useCardsStore } from './store/cards';
import { canvasActions } from './store/canvas';
import { useKeyboard } from './hooks/useKeyboard';
import { PixiCanvas } from './canvas/PixiCanvas';
import { CommandPalette } from './palette/CommandPalette';
import { invoke } from '@tauri-apps/api/core';
import './index.css';

function App() {
  const { cards, updateCard } = useCardsStore();

  // Set up global keyboard listeners
  const triggerVoidMode = () => {
    canvasActions.zoomToVoid();
  };

  useKeyboard(triggerVoidMode);

  // Use ref for latest cards to avoid interval re-creation on every card change
  const cardsRef = useRef(cards);
  useEffect(() => {
    cardsRef.current = cards;
  }, [cards]);

  // Background Refresher: cycles through HOT cards every 8 seconds
  useEffect(() => {
    const interval = setInterval(async () => {
      const hotCards = cardsRef.current.filter((c) => c.thermal === 'hot' && !c.isLive);
      if (hotCards.length === 0) return;

      const cardToRefresh = hotCards[Math.floor(Math.random() * hotCards.length)];
      
      try {
        console.log(`[refresher] background cycle triggering refresh for card: ${cardToRefresh.url}`);
        const snapPath = await invoke<string>('refresh_snapshot', {
          id: cardToRefresh.id,
          url: cardToRefresh.url,
        });
        
        updateCard(cardToRefresh.id, {
          snapshotPath: snapPath,
        });
      } catch (err) {
        console.warn(`[refresher] snapshot refresh skipped:`, err);
      }
    }, 8000);

    return () => clearInterval(interval);
  }, [updateCard]);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      {/* PixiJS Viewport Space */}
      <PixiCanvas />

      {/* Centered frameless Command Palette Overlay */}
      <CommandPalette />
    </div>
  );
}

export default App;
