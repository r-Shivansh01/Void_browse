import { useEffect } from 'react';
import { useCardsStore } from '../store/cards';
import { useLiveView } from './useLiveView';

export const useKeyboard = (onTriggerVoidMode?: () => void) => {
  const { paletteOpen, setPaletteOpen, cards, updateCard } = useCardsStore();
  const { blurLiveCard } = useLiveView();

  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      // 1. Check for Command Palette trigger (Space key, when not typing in an input)
      if (e.code === 'Space') {
        const activeTag = document.activeElement?.tagName;
        if (activeTag !== 'INPUT' && activeTag !== 'TEXTAREA') {
          e.preventDefault();
          setPaletteOpen(!paletteOpen);
        }
      }

      // 2. Check for Escape key
      if (e.key === 'Escape') {
        if (paletteOpen) {
          // Close palette if open
          setPaletteOpen(false);
        } else {
          // If a card is live, exit focus mode (blur it and transition to void)
          const liveCard = cards.find((c) => c.isLive);
          if (liveCard) {
            try {
              const snapPath = await blurLiveCard(liveCard.id);
              updateCard(liveCard.id, {
                isLive: false,
                snapshotPath: snapPath,
                thermal: 'hot',
              });
              if (onTriggerVoidMode) {
                onTriggerVoidMode();
              }
            } catch (err) {
              console.error('Failed to escape focus mode:', err);
            }
          } else {
            // Trigger standard overview if already out of focus
            if (onTriggerVoidMode) {
              onTriggerVoidMode();
            }
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [paletteOpen, cards, setPaletteOpen, blurLiveCard, updateCard, onTriggerVoidMode]);
};
