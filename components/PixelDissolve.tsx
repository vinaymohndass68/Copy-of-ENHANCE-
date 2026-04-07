/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/


import React, { useRef, useEffect, useCallback } from 'react';

interface PixelDissolveProps {
  lowResSrc: string;
  highResSrc: string;
  onComplete: () => void;
}

export const PixelDissolve: React.FC<PixelDissolveProps> = ({ lowResSrc, highResSrc, onComplete }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameId = useRef<number | null>(null);

  const startAnimation = useCallback((lowResImg: HTMLImageElement, highResImg: HTMLImageElement) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const parent = canvas.parentElement;
    if(!parent) return;

    const { width, height } = parent.getBoundingClientRect();
    canvas.width = width;
    canvas.height = height;
    
    const offscreenLow = document.createElement('canvas');
    const offscreenHigh = document.createElement('canvas');
    offscreenLow.width = canvas.width;
    offscreenLow.height = canvas.height;
    offscreenHigh.width = canvas.width;
    offscreenHigh.height = canvas.height;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const ctxLow = offscreenLow.getContext('2d', { willReadFrequently: true });
    const ctxHigh = offscreenHigh.getContext('2d', { willReadFrequently: true });

    if (!ctx || !ctxLow || !ctxHigh) return;

    ctxLow.imageSmoothingEnabled = false;
    ctxLow.drawImage(lowResImg, 0, 0, canvas.width, canvas.height);

    ctxHigh.imageSmoothingEnabled = true;
    ctxHigh.drawImage(highResImg, 0, 0, canvas.width, canvas.height);
    
    const lowData = ctxLow.getImageData(0, 0, canvas.width, canvas.height);
    const highData = ctxHigh.getImageData(0, 0, canvas.width, canvas.height);
    
    ctx.putImageData(lowData, 0, 0);

    // --- New Diagonal Wave Animation Logic ---
    const waveGroups: number[][] = [];
    const maxWave = canvas.width + canvas.height - 2;
    for (let i = 0; i <= maxWave; i++) {
        waveGroups.push([]);
    }

    for (let y = 0; y < canvas.height; y++) {
        for (let x = 0; x < canvas.width; x++) {
            const waveIndex = x + y;
            const pixelIndex = (y * canvas.width + x) * 4;
            waveGroups[waveIndex].push(pixelIndex);
        }
    }
    
    let currentWave = 0;
    const wavesPerFrame = Math.max(1, Math.ceil(maxWave / 60)); // Aim for ~1s transition

    const animate = () => {
        if (!canvasRef.current) return; // Stop if component unmounted

        if (currentWave > maxWave) {
            ctx.putImageData(highData, 0, 0);
            onComplete();
            return;
        }

        const endWave = Math.min(currentWave + wavesPerFrame, maxWave + 1);
        for (let i = currentWave; i < endWave; i++) {
            for (const pIndex of waveGroups[i]) {
                lowData.data[pIndex] = highData.data[pIndex];
                lowData.data[pIndex + 1] = highData.data[pIndex + 1];
                lowData.data[pIndex + 2] = highData.data[pIndex + 2];
                lowData.data[pIndex + 3] = highData.data[pIndex + 3];
            }
        }

        ctx.putImageData(lowData, 0, 0);
        currentWave = endWave;
        animationFrameId.current = requestAnimationFrame(animate);
    };

    animate();

  }, [onComplete]);


  useEffect(() => {
    let lowResImg: HTMLImageElement;
    let highResImg: HTMLImageElement;

    const lowPromise = new Promise<HTMLImageElement>(resolve => {
        lowResImg = new Image();
        lowResImg.crossOrigin = "anonymous";
        lowResImg.src = lowResSrc;
        lowResImg.onload = () => resolve(lowResImg);
    });

    const highPromise = new Promise<HTMLImageElement>(resolve => {
        highResImg = new Image();
        highResImg.crossOrigin = "anonymous";
        highResImg.src = highResSrc;
        highResImg.onload = () => resolve(highResImg);
    });
    
    Promise.all([lowPromise, highPromise]).then(([loadedLow, loadedHigh]) => {
        startAnimation(loadedLow, loadedHigh);
    });

    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, [lowResSrc, highResSrc, startAnimation]);

  return <canvas ref={canvasRef} className="w-full h-full" />;
};
