
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { Rect } from '../types';

interface ImageDisplayProps {
  imageSrc: string;
  onSelect: (originalRect: Rect, screenRect: Rect, canvasDataUrl: string) => void;
  isEnhancing: boolean;
  historicalSelection?: Rect | null;
  useFixedSelectionBox: boolean;
  fixedSelectionSizePercentage: number;
}

type DragHandle = 'tl' | 'tr' | 'bl' | 'br' | 'move';
interface DragInfo {
  handle: DragHandle;
  startX: number;
  startY: number;
  initialRect: Rect;
}

const HANDLE_SIZE = 12;

export const ImageDisplay: React.FC<ImageDisplayProps> = ({ 
    imageSrc, onSelect, isEnhancing, historicalSelection, 
    useFixedSelectionBox, fixedSelectionSizePercentage,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  
  // Interaction state
  const [selection, setSelection] = useState<Rect | null>(null);
  const [dragInfo, setDragInfo] = useState<DragInfo | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null);
  
  // Load image from src
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = imageSrc;
    img.onload = () => setImage(img);
  }, [imageSrc]);

  const getCanvasScale = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !image) return { scale: 1, offsetX: 0, offsetY: 0, dWidth: 0, dHeight: 0 };
    
    const { width: canvasWidth, height: canvasHeight } = canvas.getBoundingClientRect();

    const canvasAspect = canvasWidth / canvasHeight;
    const imageAspect = image.naturalWidth / image.naturalHeight;
    
    let dWidth, dHeight, offsetX, offsetY;

    if (canvasAspect > imageAspect) {
      dHeight = canvasHeight;
      dWidth = dHeight * imageAspect;
    } else {
      dWidth = canvasWidth;
      dHeight = dWidth / imageAspect;
    }
    
    offsetX = (canvasWidth - dWidth) / 2;
    offsetY = (canvasHeight - dHeight) / 2;
    const scale = dWidth / image.naturalWidth;
    
    return { scale, offsetX, offsetY, dWidth, dHeight };
  }, [image]);

  const getHandles = useCallback((rect: Rect): Record<DragHandle, Rect> => {
    const { x, y, w, h } = rect;
    const half = HANDLE_SIZE / 2;
    return {
      tl: { x: x - half, y: y - half, w: HANDLE_SIZE, h: HANDLE_SIZE },
      tr: { x: x + w - half, y: y - half, w: HANDLE_SIZE, h: HANDLE_SIZE },
      bl: { x: x - half, y: y + h - half, w: HANDLE_SIZE, h: HANDLE_SIZE },
      br: { x: x + w - half, y: y + h - half, w: HANDLE_SIZE, h: HANDLE_SIZE },
      move: rect,
    };
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx || !canvas || !image) return;
    
    const { width: cssWidth, height: cssHeight } = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, cssWidth, cssHeight);
    
    const { scale, offsetX, offsetY, dWidth, dHeight } = getCanvasScale();
    
    ctx.drawImage(image, offsetX, offsetY, dWidth, dHeight);

    if (selection) {
      // Draw dimming overlay around selection
      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.beginPath();
      ctx.rect(0, 0, cssWidth, cssHeight);
      ctx.rect(selection.x, selection.y, selection.w, selection.h);
      ctx.fill('evenodd');

      // Draw box
      ctx.strokeStyle = '#39FF14'; 
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.strokeRect(selection.x, selection.y, selection.w, selection.h);
      ctx.setLineDash([]);
      
      // Draw handles
      ctx.fillStyle = '#39FF14';
      const handles = getHandles(selection);
      // Fix: Cast Object.entries to correct type to avoid 'unknown' property access errors
      (Object.entries(handles) as [DragHandle, Rect][]).forEach(([key, h]) => {
          if (key !== 'move') {
              ctx.fillRect(h.x, h.y, h.w, h.h);
          }
      });

      // Draw labels
      ctx.font = '10px "Fira Code", monospace';
      const info = `SELECTION: ${Math.round(selection.w)}x${Math.round(selection.h)}`;
      const textMetrics = ctx.measureText(info);
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(selection.x - 1, selection.y - 14, textMetrics.width + 4, 12);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(info, selection.x + 1, selection.y - 4);
    } else if (historicalSelection) {
      const screenRect = {
          x: historicalSelection.x * scale + offsetX,
          y: historicalSelection.y * scale + offsetY,
          w: historicalSelection.w * scale,
          h: historicalSelection.h * scale,
      };

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.lineWidth = 1;
      ctx.strokeRect(screenRect.x, screenRect.y, screenRect.w, screenRect.h);
    }
  }, [image, selection, getCanvasScale, historicalSelection, getHandles]);

  // Resize and draw loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const resizeCanvas = () => {
      const parent = canvas.parentElement;
      if (parent) {
        const { width, height } = parent.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;

        canvas.width = width * dpr;
        canvas.height = height * dpr;
        
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;

        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.scale(dpr, dpr);
        }
        
        draw();
      }
    };
    
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    return () => window.removeEventListener('resize', resizeCanvas);
  }, [draw, image]);

  const getMousePos = (e: React.MouseEvent<HTMLCanvasElement>): { x: number; y: number } => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const notifyParentOfSelection = (currentSelection: Rect) => {
      const { scale, offsetX, offsetY } = getCanvasScale();
      const canvas = canvasRef.current;
      if (!canvas) return;

      const originalRect: Rect = {
          x: (currentSelection.x - offsetX) / scale,
          y: (currentSelection.y - offsetY) / scale,
          w: currentSelection.w / scale,
          h: currentSelection.h / scale
      };
      
      onSelect(originalRect, currentSelection, canvas.toDataURL('image/png'));
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isEnhancing) return;
    const pos = getMousePos(e);

    if (selection) {
        const handles = getHandles(selection);
        let handleHit: DragHandle | null = null;
        
        // Check handles first
        // Fix: Cast Object.entries to correct type to avoid 'unknown' property access errors
        for (const [key, h] of Object.entries(handles) as [DragHandle, Rect][]) {
            if (pos.x >= h.x && pos.x <= h.x + h.w && pos.y >= h.y && pos.y <= h.y + h.h) {
                handleHit = key as DragHandle;
                break;
            }
        }

        if (handleHit) {
            setDragInfo({
                handle: handleHit,
                startX: pos.x,
                startY: pos.y,
                initialRect: { ...selection }
            });
            return;
        }
    }

    // Start new selection
    if (useFixedSelectionBox) {
        if (!image) return;
        const { scale, offsetX, offsetY, dWidth, dHeight } = getCanvasScale();
        if (pos.x < offsetX || pos.x > offsetX + dWidth || pos.y < offsetY || pos.y > offsetY + dHeight) return;

        const boxWidth = image.naturalWidth * fixedSelectionSizePercentage * scale;
        const boxHeight = image.naturalHeight * fixedSelectionSizePercentage * scale;
        
        const newSelection: Rect = {
            x: pos.x - boxWidth / 2,
            y: pos.y - boxHeight / 2,
            w: boxWidth,
            h: boxHeight
        };
        setSelection(newSelection);
        notifyParentOfSelection(newSelection);
    } else {
        setStartPoint(pos);
        setIsCreating(true);
        setSelection(null);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isEnhancing) return;
    const pos = getMousePos(e);

    if (dragInfo) {
        const dx = pos.x - dragInfo.startX;
        const dy = pos.y - dragInfo.startY;
        let newRect = { ...dragInfo.initialRect };

        switch (dragInfo.handle) {
            case 'move':
                newRect.x += dx; newRect.y += dy;
                break;
            case 'tl':
                newRect.x += dx; newRect.y += dy; newRect.w -= dx; newRect.h -= dy;
                break;
            case 'tr':
                newRect.y += dy; newRect.w += dx; newRect.h -= dy;
                break;
            case 'bl':
                newRect.x += dx; newRect.w -= dx; newRect.h += dy;
                break;
            case 'br':
                newRect.w += dx; newRect.h += dy;
                break;
        }

        // Min size
        if (newRect.w < 10) newRect.w = 10;
        if (newRect.h < 10) newRect.h = 10;

        setSelection(newRect);
        notifyParentOfSelection(newRect);
    } else if (isCreating && startPoint) {
        const x = Math.min(pos.x, startPoint.x);
        const y = Math.min(pos.y, startPoint.y);
        const w = Math.max(1, Math.abs(pos.x - startPoint.x));
        const h = Math.max(1, Math.abs(pos.y - startPoint.y));
        const newSelection = { x, y, w, h };
        setSelection(newSelection);
    }
  };

  const handleMouseUp = () => {
    if (isCreating && selection) {
        notifyParentOfSelection(selection);
    }
    setIsCreating(false);
    setDragInfo(null);
    setStartPoint(null);
  };

  return (
    <canvas
      ref={canvasRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      className={`max-w-full max-h-full w-full h-full transition-[filter] duration-700 ${isEnhancing ? 'filter brightness-50' : 'filter brightness-100'} ${selection ? 'cursor-move' : 'cursor-crosshair'}`}
    />
  );
};
