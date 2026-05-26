import { Card } from '../types';
import { useCardsStore } from '../store/cards';
import { useCanvasStore } from '../store/canvas';
import { useLiveView } from '../hooks/useLiveView';

export const useCanvasInput = (
  zoomToCard: (cardId: string) => void,
  addConnectionLocal: (from: string, to: string, label: string) => void
) => {
  const {
    cards,
    setActiveCardId,
    connectMode,
    setConnectMode,
    updateCard,
  } = useCardsStore();

  const { panX, panY, zoom } = useCanvasStore();
  const { syncLiveCard } = useLiveView();

  const getCanvasCoords = (clientX: number, clientY: number) => {
    return {
      x: (clientX - panX) / zoom,
      y: (clientY - panY) / zoom,
    };
  };

  const findCardAtCoords = (x: number, y: number): Card | null => {
    // Reverse Z-order (topmost first)
    for (let i = cards.length - 1; i >= 0; i--) {
      const card = cards[i];
      if (
        x >= card.x &&
        x <= card.x + card.width &&
        y >= card.y &&
        y <= card.y + card.height
      ) {
        return card;
      }
    }
    return null;
  };

  const handleCanvasClick = async (clientX: number, clientY: number) => {
    const coords = getCanvasCoords(clientX, clientY);
    const card = findCardAtCoords(coords.x, coords.y);

    if (card) {
      // 1. Connect Mode Click Handling
      if (connectMode.active) {
        if (!connectMode.fromCardId) {
          // Select source card
          setConnectMode(true, card.id);
          // Visual Border pulse feedback
          updateCard(card.id, { thermal: 'hot' });
        } else {
          // Select target card (if different)
          if (connectMode.fromCardId !== card.id) {
            const label = '';
            addConnectionLocal(connectMode.fromCardId, card.id, label);
          }
          setConnectMode(false, null);
        }
        return;
      }

      // 2. Normal Mode Click Handling
      setActiveCardId(card.id);

      // If near-focus zoom (>= 0.8) and NOT already live, activate live WebView view
      if (zoom >= 0.8 && !card.isLive) {
        // Mark card as live in store
        updateCard(card.id, { isLive: true, thermal: 'hot' });
        await syncLiveCard({ ...card, isLive: true });
      }
    } else {
      // Clicked on blank canvas space
      setActiveCardId(null);
      if (connectMode.active) {
        setConnectMode(false, null); // Cancel connect mode
      }
    }
  };

  const handleCanvasDoubleClick = (clientX: number, clientY: number) => {
    const coords = getCanvasCoords(clientX, clientY);
    const card = findCardAtCoords(coords.x, coords.y);
    if (card) {
      zoomToCard(card.id);
    }
  };

  return {
    handleCanvasClick,
    handleCanvasDoubleClick,
  };
};
