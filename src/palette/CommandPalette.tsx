import React, { useState, useEffect, useRef } from 'react';
import { useCardsStore } from '../store/cards';
import { useCanvasStore, canvasActions } from '../store/canvas';
import { useLayoutsStore, LayoutMeta } from '../store/layouts';
import { useLiveView } from '../hooks/useLiveView';
import { fuzzySearch } from './fuzzy';
import { getCommands, AppContext } from './commands';
import { Command } from '../types';

export const CommandPalette: React.FC = () => {
  const {
    paletteOpen,
    setPaletteOpen,
    cards,
    activeCardId,
    currentLayoutId,
    addCard,
    updateCard,
    removeCard,
    setCards,
    setConnections,
    setConnectMode,
    setDisconnectMode,
    setCurrentLayoutId,
  } = useCardsStore();

  const { panX, panY, zoom } = useCanvasStore();
  const { layouts, loadLayoutsList } = useLayoutsStore();
  const { syncLiveCard, blurLiveCard } = useLiveView();

  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<'command' | 'arg' | 'layout_list'>('command');
  const [selectedCommand, setSelectedCommand] = useState<Command | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);

  // App Context for executing commands
  const context: AppContext = {
    cards,
    activeCardId,
    currentLayoutId,
    panX,
    panY,
    zoom,
    addCard,
    updateCard,
    removeCard,
    setCards,
    setConnections,
    setPaletteOpen,
    setCurrentLayoutId,
    syncLiveCard,
    blurLiveCard,
    zoomToCard: canvasActions.zoomToCard,
    zoomToVoid: canvasActions.zoomToVoid,
    setConnectMode,
    setDisconnectMode,
    loadLayoutsList,
    getCanvasThumbnailB64: canvasActions.getCanvasThumbnail,
  };

  const allCommands = getCommands(context);

  // Load layouts once when palette opens
  useEffect(() => {
    if (paletteOpen) {
      loadLayoutsList();
      setQuery('');
      setMode('command');
      setSelectedCommand(null);
      setActiveIdx(0);
      
      // Auto-focus input
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [paletteOpen, loadLayoutsList]);

  if (!paletteOpen) return null;

  // Filter items based on mode
  let items: any[] = [];
  if (mode === 'command') {
    items = fuzzySearch(query, allCommands, (c) => [c.id, ...c.keywords]);
  } else if (mode === 'layout_list') {
    items = fuzzySearch(query, layouts, (l) => [l.name]);
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      setPaletteOpen(false);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((prev) => (items.length > 0 ? (prev + 1) % items.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((prev) => (items.length > 0 ? (prev - 1 + items.length) % items.length : 0));
    } else if (e.key === 'Tab') {
      e.preventDefault();
      setActiveIdx((prev) => (items.length > 0 ? (prev + 1) % items.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      handleExecute();
    }
  };

  const handleExecute = async () => {
    if (mode === 'command') {
      const activeItem = items[activeIdx] as Command;
      if (!activeItem) return;

      if (activeItem.id === 'layouts') {
        // Switch to layout listing mode
        setMode('layout_list');
        setQuery('');
        setActiveIdx(0);
      } else if (activeItem.id === 'restore') {
        // Restore layout listing mode directly
        setMode('layout_list');
        setQuery('');
        setActiveIdx(0);
      } else if (activeItem.args && activeItem.args.length > 0) {
        // Capture command and prompt for argument
        setSelectedCommand(activeItem);
        setMode('arg');
        setQuery('');
        setActiveIdx(0);
      } else {
        // Execute argument-less command
        await activeItem.execute([], context);
      }
    } else if (mode === 'arg') {
      if (selectedCommand) {
        await selectedCommand.execute([query], context);
      }
    } else if (mode === 'layout_list') {
      const activeLayout = items[activeIdx] as LayoutMeta;
      if (activeLayout) {
        // Execute restore layout directly
        const restoreCmd = allCommands.find((c) => c.id === 'restore');
        if (restoreCmd) {
          await restoreCmd.execute([activeLayout.id], context);
        }
      }
    }
  };

  return (
    <div className="palette-overlay" onClick={() => setPaletteOpen(false)}>
      <div className="palette-container" onClick={(e) => e.stopPropagation()}>
        <div className="palette-input-container">
          <span className="palette-prompt">
            {mode === 'command' && 'VOID >'}
            {mode === 'arg' && selectedCommand && `${selectedCommand.id} :`}
            {mode === 'layout_list' && 'select layout >'}
          </span>
          <input
            ref={inputRef}
            type="text"
            className="palette-input"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIdx(0);
            }}
            placeholder={
              mode === 'command'
                ? 'Type a command or keywords...'
                : mode === 'arg' && selectedCommand?.args
                ? selectedCommand.args[0].placeholder
                : 'Search layouts...'
            }
            onKeyDown={handleKeyDown}
          />
        </div>
        
        {items.length > 0 && (
          <div className="palette-results">
            {items.map((item, idx) => (
              <div
                key={item.id}
                className={`palette-row ${idx === activeIdx ? 'active' : ''}`}
                onClick={() => {
                  setActiveIdx(idx);
                  handleExecute();
                }}
                onMouseEnter={() => setActiveIdx(idx)}
              >
                {mode === 'command' ? (
                  <>
                    <div className="palette-row-left">
                      <span className="palette-row-keyword">{item.id}</span>
                      <span className="palette-row-desc">{item.description}</span>
                    </div>
                    {item.keywords[0] && (
                      <span className="palette-row-shortcut">{item.keywords[0]}</span>
                    )}
                  </>
                ) : (
                  <>
                    <div className="palette-row-left">
                      <span className="palette-row-keyword">{item.name}</span>
                      <span className="palette-row-desc">
                        Last updated: {new Date(item.updatedAt).toLocaleString()}
                      </span>
                    </div>
                    <span className="palette-row-shortcut">Layout</span>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
