import React, { useEffect, useRef, useState } from 'react';
import * as PIXI from 'pixi.js';
import { gsap } from 'gsap';
import { useCardsStore } from '../store/cards';
import { useCanvasStore, canvasActions } from '../store/canvas';
import { CardSprite } from './CardSprite';
import { useCanvasInput } from './useCanvasInput';
import { ConnectionLayer } from './ConnectionLayer';
import { invoke } from '@tauri-apps/api/core';

export const PixiCanvas: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  
  const {
    cards,
    activeCardId,
    addConnection,
    connectMode,
  } = useCardsStore();

  const { panX, panY, zoom, setPan, setCanvasState } = useCanvasStore();

  const [pixiApp, setPixiApp] = useState<PIXI.Application | null>(null);
  const [canvasContainer, setCanvasContainer] = useState<PIXI.Container | null>(null);
  const [rendererError, setRendererError] = useState(false);
  const pixiAppRef = useRef<PIXI.Application | null>(null);
  
  // Bind canvas actions globally
  useEffect(() => {
    canvasActions.zoomToCard = zoomToCard;
    canvasActions.zoomToVoid = zoomToVoid;
    canvasActions.getCanvasThumbnail = getCanvasThumbnail;
  }, [canvasContainer, cards, pixiApp]);
  
  const [previewConnection, setPreviewConnection] = useState<{
    fromId: string;
    mouseX: number;
    mouseY: number;
  } | null>(null);

  // Keep references to our card sprites mapped by card ID
  const cardSpritesRef = useRef<Map<string, CardSprite>>(new Map());
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const panStartRef = useRef({ x: 0, y: 0 });

  // Camera animations using GSAP
  const zoomToCard = (cardId: string) => {
    const card = cards.find((c) => c.id === cardId);
    if (!card || !canvasContainer) return;

    const screenW = window.innerWidth;
    const screenH = window.innerHeight;

    // Center card logical target position
    const targetZoom = 1.0;
    const targetPanX = screenW / 2 - (card.x + card.width / 2) * targetZoom;
    const targetPanY = screenH / 2 - (card.y + card.height / 2) * targetZoom;

    // Animate viewport container
    gsap.to(canvasContainer.scale, {
      x: targetZoom,
      y: targetZoom,
      duration: 0.35,
      ease: 'power2.inOut',
    });

    gsap.to(canvasContainer.position, {
      x: targetPanX,
      y: targetPanY,
      duration: 0.35,
      ease: 'power2.inOut',
      onUpdate: () => {
        // Sync our Zustand store on update
        setCanvasState({
          panX: canvasContainer.position.x,
          panY: canvasContainer.position.y,
          zoom: canvasContainer.scale.x,
        });
      },
      onComplete: () => {
        setCanvasState({
          panX: targetPanX,
          panY: targetPanY,
          zoom: targetZoom,
        });
      },
    });
  };

  const zoomToVoid = () => {
    if (!canvasContainer) return;
    if (cards.length === 0) {
      // Zoom out to origin if empty
      gsap.to(canvasContainer.scale, { x: 1.0, y: 1.0, duration: 0.35 });
      gsap.to(canvasContainer.position, { x: 0, y: 0, duration: 0.35, onUpdate: () => {
        setCanvasState({ panX: canvasContainer.position.x, panY: canvasContainer.position.y, zoom: canvasContainer.scale.x });
      }});
      return;
    }

    const screenW = window.innerWidth;
    const screenH = window.innerHeight;

    // 1. Compute bounding box of all cards
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    cards.forEach((card) => {
      minX = Math.min(minX, card.x);
      minY = Math.min(minY, card.y);
      maxX = Math.max(maxX, card.x + card.width);
      maxY = Math.max(maxY, card.y + card.height);
    });

    const boxW = maxX - minX;
    const boxH = maxY - minY;

    // 2. Compute zoom required to fit bounding box with padding
    const padding = 100; // px
    const zoomW = (screenW - padding * 2) / boxW;
    const zoomH = (screenH - padding * 2) / boxH;
    const targetZoom = Math.max(0.05, Math.min(1.0, Math.min(zoomW, zoomH)));

    // 3. Center viewport
    const centerCanvasX = minX + boxW / 2;
    const centerCanvasY = minY + boxH / 2;
    const targetPanX = screenW / 2 - centerCanvasX * targetZoom;
    const targetPanY = screenH / 2 - centerCanvasY * targetZoom;

    // Tween scale & positions
    gsap.to(canvasContainer.scale, {
      x: targetZoom,
      y: targetZoom,
      duration: 0.35,
      ease: 'power2.inOut',
    });

    gsap.to(canvasContainer.position, {
      x: targetPanX,
      y: targetPanY,
      duration: 0.35,
      ease: 'power2.inOut',
      onUpdate: () => {
        setCanvasState({
          panX: canvasContainer.position.x,
          panY: canvasContainer.position.y,
          zoom: canvasContainer.scale.x,
        });
      },
      onComplete: () => {
        setCanvasState({
          panX: targetPanX,
          panY: targetPanY,
          zoom: targetZoom,
        });
      },
    });
  };

  const addConnectionLocal = async (from: string, to: string, label: string) => {
    try {
      const connId = `conn_${Date.now()}`;
      // Commit connection in SQLite
      await invoke('save_layout', {
        name: 'Default Session',
        state: {
          panX,
          panY,
          zoom,
          cards,
          connections: [...useCardsStore.getState().connections, { id: connId, fromCard: from, toCard: to, label }],
          thumbnailB64: null,
        },
      });
      addConnection({ id: connId, fromCard: from, toCard: to, label });
    } catch (e) {
      console.error('Failed to save connection:', e);
    }
  };

  const { handleCanvasClick, handleCanvasDoubleClick } = useCanvasInput(
    zoomToCard,
    addConnectionLocal
  );

  // Initialize PixiJS Application
  useEffect(() => {
    if (!containerRef.current) return;

    const initPixi = async () => {
      const app = new PIXI.Application();
      try {
        await app.init({
          resizeTo: window,
          backgroundColor: 0x0a0a0a,
          antialias: true,
          resolution: window.devicePixelRatio || 1,
          autoDensity: true,
        });
      } catch (initErr) {
        console.error('PixiJS renderer init failed:', initErr);
        setRendererError(true);
        return;
      }

      // Mount canvas element
      containerRef.current?.appendChild(app.canvas);

      const mainContainer = new PIXI.Container();
      app.stage.addChild(mainContainer);

      // Create infinite Dot Grid Background cached as tiling sprite
      const dotGraphics = new PIXI.Graphics();
      dotGraphics.circle(14, 14, 0.8);
      dotGraphics.fill({ color: 0x2a2a2a });

      const dotTexture = app.renderer.generateTexture({
        target: dotGraphics,
      });

      const gridTiling = new PIXI.TilingSprite({
        texture: dotTexture,
        width: 200000,
        height: 200000,
      });
      gridTiling.position.set(-100000, -100000);
      mainContainer.addChild(gridTiling);

      pixiAppRef.current = app;
      setPixiApp(app);
      setCanvasContainer(mainContainer);
    };

    initPixi();

    return () => {
      if (pixiAppRef.current) {
        pixiAppRef.current.destroy(true, { children: true });
      }
    };
  }, []);

  // Synchronize canvas container transform with Zustand store when manipulated
  useEffect(() => {
    if (canvasContainer) {
      canvasContainer.position.set(panX, panY);
      canvasContainer.scale.set(zoom);
    }
  }, [panX, panY, zoom, canvasContainer]);

  // Synchronize cards sprites mapping
  useEffect(() => {
    if (!canvasContainer) return;

    // 1. Clean up deleted cards
    const cardIds = new Set(cards.map((c) => c.id));
    for (const [id, sprite] of cardSpritesRef.current.entries()) {
      if (!cardIds.has(id)) {
        sprite.destroy();
        cardSpritesRef.current.delete(id);
      }
    }

    // 2. Add or update active card sprites
    cards.forEach(async (card) => {
      let cardSprite = cardSpritesRef.current.get(card.id);
      
      if (!cardSprite) {
        // Create new Card Sprite
        cardSprite = new CardSprite(card.id, card.width, card.height);
        canvasContainer.addChild(cardSprite.container);
        cardSpritesRef.current.set(card.id, cardSprite);
      }

      // Update positions
      cardSprite.container.position.set(card.x, card.y);

      // Hide snapshot if it is currently live (WebView window overlays on top)
      cardSprite.container.visible = !card.isLive;

      // Update active border highlighting
      const isActive = activeCardId === card.id;
      const borderColor = isActive ? 0xe0e0e0 : 0x222222;
      cardSprite.drawBorder(card.width, card.height, borderColor);

      // Load/Update texture snapshot
      await cardSprite.updateTexture(card.snapshotPath, card.width, card.height);
    });
  }, [cards, activeCardId, canvasContainer]);

  // Dragging and Zooming camera controls (anchor-focused)
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (!canvasContainer) return;

    // Trackpad Pinch detection or Mouse Wheel zoom
    const zoomFactor = 1.1;
    const dZoom = e.deltaY < 0 ? zoomFactor : 1.0 / zoomFactor;
    const nextZoom = Math.max(0.05, Math.min(3.0, zoom * dZoom));

    const mouseX = e.clientX;
    const mouseY = e.clientY;

    const canvasMouseX = (mouseX - panX) / zoom;
    const canvasMouseY = (mouseY - panY) / zoom;

    const nextPanX = mouseX - canvasMouseX * nextZoom;
    const nextPanY = mouseY - canvasMouseY * nextZoom;

    setCanvasState({
      panX: nextPanX,
      panY: nextPanY,
      zoom: nextZoom,
    });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 1 || e.button === 0) { // Middle click or Left click dragging
      isDraggingRef.current = true;
      dragStartRef.current = { x: e.clientX, y: e.clientY };
      panStartRef.current = { x: panX, y: panY };
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDraggingRef.current) {
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      setPan(panStartRef.current.x + dx, panStartRef.current.y + dy);
    }

    // Connect mode draw preview path follow
    if (connectMode.active && connectMode.fromCardId) {
      setPreviewConnection({
        fromId: connectMode.fromCardId,
        mouseX: e.clientX,
        mouseY: e.clientY,
      });
    } else {
      setPreviewConnection(null);
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    const clickDistance = Math.sqrt(
      Math.pow(e.clientX - dragStartRef.current.x, 2) +
      Math.pow(e.clientY - dragStartRef.current.y, 2)
    );

    isDraggingRef.current = false;

    // If drag distance is very small, treat as click
    if (clickDistance < 5) {
      handleCanvasClick(e.clientX, e.clientY);
    }
  };

  const getCanvasThumbnail = async (): Promise<string | null> => {
    if (!pixiApp) return null;
    try {
      // In PixiJS v8, generate texture and extract canvas as base64
      const image64 = await pixiApp.renderer.extract.base64(pixiApp.stage);
      return image64;
    } catch (e) {
      console.error('Extract thumbnail error:', e);
      return null;
    }
  };

  return (
    <div
      className="canvas-container"
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onDoubleClick={(e) => handleCanvasDoubleClick(e.clientX, e.clientY)}
    >
      {/* PixiJS Mount Node */}
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {/* SVG Connection Layer */}
      <ConnectionLayer previewConnection={previewConnection} />

      {/* Renderer Error Fallback */}
      {rendererError && (
        <div className="renderer-error">
          <div className="renderer-error-icon">⚠</div>
          <div className="renderer-error-title">Graphics Renderer Unavailable</div>
          <div className="renderer-error-text">
            WebGL/WebGPU could not be initialized. This may happen in VMs,<br/>
            RDP sessions, or systems with limited GPU support.
          </div>
        </div>
      )}

      {/* Empty State Hint */}
      {!rendererError && cards.length === 0 && (
        <div className="empty-state-hint">
          <div className="empty-state-icon">⌘</div>
          <div className="empty-state-text">
            Press <kbd>Space</kbd> then type <code>open &lt;url&gt;</code>
          </div>
          <div className="empty-state-sub">
            e.g. <code>open github.com</code> or <code>open machine learning</code>
          </div>
        </div>
      )}

      {/* DOM UI Overlays (Constant Text Size Card Labels) */}
      {cards.map((card) => {
        const left = card.x * zoom + panX;
        const top = card.y * zoom + panY;
        const visible = !card.isLive && zoom >= 0.2;
        
        if (!visible) return null;

        let domain = 'blank';
        try {
          domain = new URL(card.url).hostname;
        } catch {
          domain = card.url;
        }

        return (
          <div
            key={`label-${card.id}`}
            className="card-label-container"
            style={{
              left: `${left + 8}px`,
              top: `${top - 28}px`,
            }}
          >
            <span className="card-domain-label">{domain}</span>
            {card.name && <span className="card-name-label">{card.name}</span>}
          </div>
        );
      })}
    </div>
  );
};
