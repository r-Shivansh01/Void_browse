import React from 'react';
import { Card } from '../types';
import { useCardsStore } from '../store/cards';
import { useCanvasStore } from '../store/canvas';

interface ConnectionLayerProps {
  previewConnection: { fromId: string; mouseX: number; mouseY: number } | null;
}

export const ConnectionLayer: React.FC<ConnectionLayerProps> = ({ previewConnection }) => {
  const { cards, connections, removeConnection, disconnectModeActive, setDisconnectMode } = useCardsStore();
  const { panX, panY, zoom } = useCanvasStore();

  const handleConnectionClick = async (connId: string) => {
    if (disconnectModeActive) {
      if (confirm('Delete this connection?')) {
        try {
          // Remove from SQLite (assuming cards store or layout takes care of save)
          // In VOID, connections are saved inside layout serializations, but we can also delete them locally.
          removeConnection(connId);
          setDisconnectMode(false);
        } catch (e) {
          console.error('Failed to delete connection:', e);
        }
      }
    }
  };

  // Convert logical canvas coordinates to screen-space coordinates
  const toScreen = (x: number, y: number) => {
    return {
      x: x * zoom + panX,
      y: y * zoom + panY,
    };
  };

  const getCardAnchors = (fromCard: Card, toCardX: number, _toCardY: number) => {
    const isToRight = toCardX > fromCard.x + fromCard.width / 2;
    
    // Source anchor (A)
    const p0 = isToRight
      ? toScreen(fromCard.x + fromCard.width, fromCard.y + fromCard.height / 2) // center-right
      : toScreen(fromCard.x + fromCard.width / 2, fromCard.y + fromCard.height); // center-bottom
      
    return { p0, isToRight };
  };

  const renderBezier = (
    id: string,
    p0: { x: number; y: number },
    p3: { x: number; y: number },
    isToRight: boolean,
    label: string,
    isInteractive: boolean
  ) => {
    // Control point offsets are in screen-space (constant 80px)
    const p1 = isToRight
      ? { x: p0.x + 80, y: p0.y }
      : { x: p0.x, y: p0.y + 80 };

    const p2 = isToRight
      ? { x: p3.x - 80, y: p3.y }
      : { x: p3.x, y: p3.y - 80 };

    // Bezier path string
    const d = `M ${p0.x} ${p0.y} C ${p1.x} ${p1.y}, ${p2.x} ${p2.y}, ${p3.x} ${p3.y}`;

    // Math for midpoint (t = 0.5)
    const mx = 0.125 * p0.x + 0.375 * p1.x + 0.375 * p2.x + 0.125 * p3.x;
    const my = 0.125 * p0.y + 0.375 * p1.y + 0.375 * p2.y + 0.125 * p3.y;

    // Tangent vector B'(0.5)
    const tx = 0.75 * (p1.x - p0.x) + 1.5 * (p2.x - p1.x) + 0.75 * (p3.x - p2.x);
    const ty = 0.75 * (p1.y - p0.y) + 1.5 * (p2.y - p1.y) + 0.75 * (p3.y - p2.y);

    // Normalize tangent
    const len = Math.sqrt(tx * tx + ty * ty) || 1.0;
    const nx = -ty / len;
    const ny = tx / len;

    // Position label 12px perpendicular to tangent
    const lx = mx + nx * 12;
    const ly = my + ny * 12;

    // Angle of tangent in degrees for rotating text aligned with curve
    let angle = Math.atan2(ty, tx) * (180 / Math.PI);
    if (angle > 90 || angle < -90) {
      angle += 180; // keep text right-side up
    }

    return (
      <g key={id} style={{ pointerEvents: isInteractive ? 'auto' : 'none' }}>
        {/* Thick invisible interaction path for easy clicking */}
        {isInteractive && (
          <path
            d={d}
            fill="none"
            stroke="transparent"
            strokeWidth={15}
            style={{ cursor: disconnectModeActive ? 'pointer' : 'default' }}
            onClick={() => handleConnectionClick(id)}
          />
        )}

        {/* The visual curve line */}
        <path
          d={d}
          fill="none"
          stroke={disconnectModeActive ? '#ff3a3a' : 'var(--connection)'}
          strokeWidth={2}
          opacity={disconnectModeActive ? 0.8 : 0.6}
          strokeDasharray={disconnectModeActive ? '4 4' : 'none'}
          className={disconnectModeActive ? 'pulse-curve' : ''}
        />

        {/* Bezier text label */}
        {label && (
          <text
            x={lx}
            y={ly}
            fill="var(--connection-label)"
            fontSize={10}
            textAnchor="middle"
            transform={`rotate(${angle}, ${lx}, ${ly})`}
            style={{
              textShadow: '0 1px 3px rgba(0,0,0,0.8)',
              fontWeight: 500,
            }}
          >
            {label}
          </text>
        )}
      </g>
    );
  };

  return (
    <svg
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 50,
      }}
    >
      {/* 1. Render all committed connections */}
      {connections.map((conn) => {
        const fromCard = cards.find((c) => c.id === conn.fromCard);
        const toCard = cards.find((c) => c.id === conn.toCard);
        
        if (!fromCard || !toCard) return null;

        const { p0, isToRight } = getCardAnchors(fromCard, toCard.x, toCard.y);
        const p3 = isToRight
          ? toScreen(toCard.x, toCard.y + toCard.height / 2) // center-left
          : toScreen(toCard.x + toCard.width / 2, toCard.y); // center-top

        return renderBezier(conn.id, p0, p3, isToRight, conn.label, true);
      })}

      {/* 2. Render active draw-connection preview line */}
      {previewConnection && (() => {
        const fromCard = cards.find((c) => c.id === previewConnection.fromId);
        if (!fromCard) return null;

        // Mouse coordinates are already in logical screen space
        const { p0, isToRight } = getCardAnchors(
          fromCard,
          (previewConnection.mouseX - panX) / zoom,
          (previewConnection.mouseY - panY) / zoom
        );
        const p3 = { x: previewConnection.mouseX, y: previewConnection.mouseY };

        return renderBezier('preview', p0, p3, isToRight, 'connecting...', false);
      })()}
    </svg>
  );
};
