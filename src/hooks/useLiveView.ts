import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Card } from '../types';
import { useCanvasStore } from '../store/canvas';

export const useLiveView = () => {
  const { panX, panY, zoom } = useCanvasStore();

  const syncLiveCard = async (card: Card) => {
    try {
      const mainWin = getCurrentWindow();
      
      // Get the position of the viewport on the screen in physical pixels
      const innerPos = await mainWin.innerPosition();
      const dpr = window.devicePixelRatio || 1.0;

      // 1. Compute logical client-space bounding box of the card
      const logicalX = card.x * zoom + panX;
      const logicalY = card.y * zoom + panY;
      const logicalW = card.width * zoom;
      const logicalH = card.height * zoom;

      // 2. Translate to physical screen coordinates
      const physicalX = Math.round(innerPos.x + logicalX * dpr);
      const physicalY = Math.round(innerPos.y + logicalY * dpr);
      const physicalW = Math.round(logicalW * dpr);
      const physicalH = Math.round(logicalH * dpr);

      // 3. Invoke Rust focus command with physical positioning
      await invoke('focus_card', {
        id: card.id,
        url: card.url,
        x: physicalX,
        y: physicalY,
        width: physicalW,
        height: physicalH,
      });
    } catch (e) {
      console.error('Error synchronizing live card viewport:', e);
    }
  };

  const blurLiveCard = async (cardId: string): Promise<string> => {
    try {
      const snapPath = await invoke<string>('blur_card', { id: cardId });
      return snapPath;
    } catch (e) {
      console.error('Error blurring live card:', e);
      throw e;
    }
  };

  return {
    syncLiveCard,
    blurLiveCard,
  };
};
