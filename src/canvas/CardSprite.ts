import * as PIXI from 'pixi.js';
import { convertFileSrc } from '@tauri-apps/api/core';

/**
 * Wraps a PixiJS container to display a card snapshot sprite and border graphics.
 */
export class CardSprite {
  public container: PIXI.Container;
  public sprite: PIXI.Sprite | null = null;
  public border: PIXI.Graphics;
  public cardId: string;

  constructor(cardId: string, width: number, height: number) {
    this.cardId = cardId;
    this.container = new PIXI.Container();
    
    // Create card border graphics
    this.border = new PIXI.Graphics();
    this.drawBorder(width, height, 0x222222); // Default inactive color --card-border (#222222)
    this.container.addChild(this.border);
  }

  public drawBorder(width: number, height: number, color: number) {
    this.border.clear();
    this.border.rect(0, 0, width, height);
    this.border.stroke({ width: 1, color });
  }

  public async updateTexture(snapshotPath: string | null, width: number, height: number) {
    if (!snapshotPath) {
      // Draw solid dark gray texture fallback
      const whiteTexture = PIXI.Texture.WHITE;
      if (this.sprite) {
        this.sprite.texture = whiteTexture;
        this.sprite.tint = 0x0f0f0f;
        this.sprite.width = width;
        this.sprite.height = height;
      } else {
        this.sprite = new PIXI.Sprite(whiteTexture);
        this.sprite.tint = 0x0f0f0f;
        this.sprite.width = width;
        this.sprite.height = height;
        this.container.addChildAt(this.sprite, 0); // Insert below border
      }
      return;
    }

    try {
      const secureSrc = convertFileSrc(snapshotPath);
      const cacheBustUrl = `${secureSrc}?t=${Date.now()}`;
      // Unload old cached version to pick up updated snapshot files
      if (PIXI.Assets.cache.has(secureSrc)) {
        PIXI.Assets.unload(secureSrc);
      }
      const texture = await PIXI.Assets.load(cacheBustUrl);
      
      if (this.sprite) {
        this.sprite.texture = texture;
        this.sprite.tint = 0xffffff;
        this.sprite.width = width;
        this.sprite.height = height;
      } else {
        this.sprite = new PIXI.Sprite(texture);
        this.sprite.width = width;
        this.sprite.height = height;
        this.container.addChildAt(this.sprite, 0);
      }
    } catch (e) {
      console.error('Failed to load snapshot texture in PixiJS:', e);
    }
  }

  public destroy() {
    this.container.destroy({ children: true });
  }
}
