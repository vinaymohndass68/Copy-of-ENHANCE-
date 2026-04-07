
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/


import React, { useState, useCallback, useEffect, useRef, MouseEvent } from 'react';
import { DropZone } from './components/DropZone';
import { ImageDisplay } from './components/ImageDisplay';
import { PixelDissolve } from './components/PixelDissolve';
import { StatusBar } from './components/StatusBar';
import { SelectionAnimator } from './components/SelectionAnimator';
import type { Rect, HistoryStep, ImageDescription } from './types';
import { AppState } from './types';
import { cropImage } from './utils/imageUtils';
import { serviceEnhance } from './utils/serviceEnhance';
import { serviceDescribeImage } from './utils/serviceDescribeImage';
import { generateZoomGif } from './utils/gifGenerator';

interface EnhancementJob {
  originalRect: Rect;
  canvasWithSelectionDataUrl: string;
  pixelatedSrc: string;
  screenRect: Rect;
}

const App: React.FC = () => {
  // --- FEATURE FLAG ---
  const useFixedSelectionBox = false; 
  const fixedSelectionSizePercentage = 0.125;

  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);
  const [appState, setAppState] = useState<AppState>(AppState.LOADING);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [pixelatedImageSrc, setPixelatedImageSrc] = useState<string | null>(null);
  const [enhancedImageSrc, setEnhancedImageSrc] = useState<string | null>(null);
  const [finalImageSrc, setFinalImageSrc] = useState<string | null>(null);

  const [history, setHistory] = useState<HistoryStep[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [newHistoryEntryData, setNewHistoryEntryData] = useState<{description: ImageDescription, originalRect: Rect} | null>(null);

  const [enhancementJob, setEnhancementJob] = useState<EnhancementJob | null>(null);
  const [finalEnhancementRect, setFinalEnhancementRect] = useState<Rect | null>(null);
  const [displaySelection, setDisplaySelection] = useState<Rect | null>(null);
  const [currentSelection, setCurrentSelection] = useState<{ originalRect: Rect, screenRect: Rect, canvasDataUrl: string } | null>(null);
  
  const [isGeneratingGif, setIsGeneratingGif] = useState<boolean>(false);
  const [showBananaBanner, setShowBananaBanner] = useState<boolean>(false);
  const [hasFoundBanana, setHasFoundBanana] = useState<boolean>(false);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const imageObjectURLRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Check for API key on mount
  useEffect(() => {
    const checkKey = async () => {
      const hasKey = await (window as any).aistudio.hasSelectedApiKey();
      setHasApiKey(hasKey);
    };
    checkKey();
  }, []);

  const handleOpenKeySelector = async () => {
    await (window as any).aistudio.openSelectKey();
    setHasApiKey(true); 
  };

  const loadInitialImage = useCallback(async () => {
    if (imageObjectURLRef.current) {
      URL.revokeObjectURL(imageObjectURLRef.current);
      imageObjectURLRef.current = null;
    }

    setAppState(AppState.LOADING);
    try {
      const response = await fetch('https://www.gstatic.com/aistudio/starter-apps/enhance/living_room.png');
      if (!response.ok) {
        throw new Error(`Failed to fetch initial image: ${response.statusText}`);
      }
      const blob = await response.blob();
      const objectURL = URL.createObjectURL(blob);
      imageObjectURLRef.current = objectURL;

      const img = new Image();
      img.onload = () => {
        const newStep: HistoryStep = { imageSrc: objectURL, description: null, originalRect: null };
        setHistory([newStep]);
        setHistoryIndex(0);
        setImage(img);
        setFinalImageSrc(objectURL);
        setDisplaySelection(null);
        setCurrentSelection(null);
        setAppState(AppState.LOADED);
      };
      img.src = objectURL;
    } catch (error) {
      console.error("Failed to load initial image:", error);
      setAppState(AppState.IDLE);
    }
  }, []);
  
  const resetState = useCallback(() => {
    if (window.confirm("Are you sure you want to reset session? This will wipe your enhancement history.")) {
      setEnhancementJob(null);
      setFinalEnhancementRect(null);
      setHistory([]);
      setHistoryIndex(-1);
      setNewHistoryEntryData(null);
      setDisplaySelection(null);
      setCurrentSelection(null);
      setShowBananaBanner(false);
      loadInitialImage();
    }
  }, [loadInitialImage]);

  useEffect(() => {
    if (hasApiKey) {
      loadInitialImage();
    }
    return () => {
      if (imageObjectURLRef.current) URL.revokeObjectURL(imageObjectURLRef.current);
    };
  }, [loadInitialImage, hasApiKey]);

  const handleUndo = useCallback(() => {
    if (historyIndex <= 0 || appState === AppState.ENHANCING || isGeneratingGif) return;
    const newIndex = historyIndex - 1;
    setHistoryIndex(newIndex);
    setCurrentSelection(null);
    
    // Preview the selection that was undone
    const undoneStep = history[newIndex + 1];
    setDisplaySelection(undoneStep?.originalRect || null);

    const newImageSrc = history[newIndex].imageSrc;
    const img = new Image();
    img.onload = () => {
      setImage(img);
      setFinalImageSrc(newImageSrc);
    };
    img.src = newImageSrc;
  }, [history, historyIndex, appState, isGeneratingGif]);

  const handleRedo = useCallback(() => {
    if (historyIndex >= history.length - 1 || appState === AppState.ENHANCING || isGeneratingGif) return;
    const newIndex = historyIndex + 1;
    setHistoryIndex(newIndex);
    setCurrentSelection(null);

    // If we're at a step that had a selection leading to the NEXT step, show it
    const nextStep = history[newIndex + 1];
    setDisplaySelection(nextStep?.originalRect || null);

    const newImageSrc = history[newIndex].imageSrc;
    const img = new Image();
    img.onload = () => {
      setImage(img);
      setFinalImageSrc(newImageSrc);
    };
    img.src = newImageSrc;
  }, [history, historyIndex, appState, isGeneratingGif]);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        handleRedo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo]);

  const handleFileDrop = useCallback((file: File) => {
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const newImageSrc = e.target?.result as string;
          const newStep: HistoryStep = { imageSrc: newImageSrc, description: null, originalRect: null };
          setHistory([newStep]);
          setHistoryIndex(0);
          setImage(img);
          setFinalImageSrc(newImageSrc);
          setEnhancementJob(null);
          setFinalEnhancementRect(null);
          setDisplaySelection(null);
          setCurrentSelection(null);
          setAppState(AppState.LOADED);
        };
        img.src = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  }, []);

  const handleSelectionChange = useCallback((originalRect: Rect, screenRect: Rect, canvasDataUrl: string) => {
    setCurrentSelection({ originalRect, screenRect, canvasDataUrl });
  }, []);

  const handleEnhance = useCallback(async () => {
    if (!currentSelection || !image) return;
    const { originalRect, screenRect, canvasDataUrl } = currentSelection;

    // Truncate redo history when branching
    let currentHistory = history;
    if (historyIndex < history.length - 1) {
      currentHistory = history.slice(0, historyIndex + 1);
      setHistory(currentHistory);
    }

    setAppState(AppState.ENHANCING);
    setCurrentSelection(null);
    
    const aspectRatio = originalRect.w / originalRect.h;
    const padding = 0.05;
    const maxWidth = window.innerWidth * (1 - padding);
    const maxHeight = window.innerHeight * (1 - padding);

    let targetWidth = maxWidth;
    let targetHeight = targetWidth / aspectRatio;

    if (targetHeight > maxHeight) {
        targetHeight = maxHeight;
        targetWidth = targetHeight * aspectRatio;
    }
    
    setFinalEnhancementRect({
        w: targetWidth,
        h: targetHeight,
        x: (window.innerWidth - targetWidth) / 2,
        y: (window.innerHeight - targetHeight) / 2,
    });

    const pixelatedSrc = await cropImage(image, originalRect, originalRect.w, originalRect.h, true);
    
    setEnhancementJob({
      originalRect,
      canvasWithSelectionDataUrl: canvasDataUrl,
      pixelatedSrc,
      screenRect,
    });

  }, [image, history, historyIndex, currentSelection]);

  const handleZoom = useCallback(async () => {
      if (!currentSelection || !image) return;
      const { originalRect } = currentSelection;
      
      const zoomedDataUrl = await cropImage(image, originalRect, originalRect.w, originalRect.h, false);
      const newImage = new Image();
      newImage.onload = () => {
          const newStep: HistoryStep = {
              imageSrc: zoomedDataUrl,
              description: { selectionDescription: 'User performed a manual zoom' },
              originalRect: null 
          };

          const truncatedHistory = history.slice(0, historyIndex + 1);
          const newHistory = [...truncatedHistory, newStep];
          
          setHistory(newHistory);
          setHistoryIndex(newHistory.length - 1);
          setImage(newImage);
          setFinalImageSrc(zoomedDataUrl);
          setCurrentSelection(null);
          setAppState(AppState.LOADED);
      };
      newImage.src = zoomedDataUrl;
  }, [currentSelection, image, history, historyIndex]);

  const runEnhancementJob = useCallback(async () => {
    if (!enhancementJob || !image) return;
    const { originalRect, canvasWithSelectionDataUrl, pixelatedSrc } = enhancementJob;

    try {
        const descriptionHistory = history.slice(0, historyIndex + 1).map(h => h.description).filter((d): d is ImageDescription => d !== null);
        const description = await serviceDescribeImage(canvasWithSelectionDataUrl, descriptionHistory);
        setNewHistoryEntryData({ description, originalRect });

        const sourceImageWidth = image.naturalWidth;
        const sourceImageHeight = image.naturalHeight;
        const padding = 0.25;

        const paddedX = originalRect.x - originalRect.w * padding;
        const paddedY = originalRect.y - originalRect.h * padding;
        const paddedW = originalRect.w * (1 + 2 * padding);
        const paddedH = originalRect.h * (1 + 2 * padding);

        const finalPaddedX = Math.max(0, paddedX);
        const finalPaddedY = Math.max(0, paddedY);
        const finalPaddedX2 = Math.min(sourceImageWidth, paddedX + paddedW);
        const finalPaddedY2 = Math.min(sourceImageHeight, paddedY + paddedH);

        const paddedRect = {
            x: finalPaddedX,
            y: finalPaddedY,
            w: finalPaddedX2 - finalPaddedX,
            h: finalPaddedY2 - finalPaddedY,
        };
        
        const aspect = paddedRect.h / paddedRect.w;
        const targetWidth = 512 * (1.+padding);
        const targetHeight = Math.round(targetWidth * aspect);
        const croppedForEnhancement = await cropImage(image, paddedRect, targetWidth, targetHeight, false);

        const { imageSrc: enhancedPaddedSrc, foundTheBanana } = await serviceEnhance(croppedForEnhancement, [...descriptionHistory.map(d=>d.prompt), description.prompt], hasFoundBanana);
        
        if (foundTheBanana) {
            setShowBananaBanner(true);
            setHasFoundBanana(true);
        }

        const enhancedPaddedImage = await new Promise<HTMLImageElement>((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = enhancedPaddedSrc;
        });

        const finalCropRect = {
            x: enhancedPaddedImage.naturalWidth * ((originalRect.x - paddedRect.x) / paddedRect.w),
            y: enhancedPaddedImage.naturalHeight * ((originalRect.y - paddedRect.y) / paddedRect.h),
            w: enhancedPaddedImage.naturalWidth * (originalRect.w / paddedRect.w),
            h: enhancedPaddedImage.naturalHeight * (originalRect.h / paddedRect.h),
        };

        const finalImageWidth = 1024;
        const finalImageHeight = Math.round(finalImageWidth * (originalRect.h / originalRect.w));
        const enhancedSrc = await cropImage(enhancedPaddedImage, finalCropRect, finalImageWidth, finalImageHeight, false);

        setPixelatedImageSrc(pixelatedSrc);
        setEnhancedImageSrc(enhancedSrc);
        setAppState(AppState.ENHANCED);
    } catch (error: any) {
        console.error("Enhancement process failed:", error);
        if (error.message?.includes("PERMISSION_DENIED") || error.message?.includes("Requested entity was not found")) {
            alert("API Key Permission Error. Please select a valid API key with billing enabled.");
            handleOpenKeySelector();
        }
        setAppState(AppState.LOADED);
    } finally {
        setEnhancementJob(null);
    }
  }, [enhancementJob, image, history, historyIndex, hasFoundBanana]);
  
  const handleEnhancementComplete = useCallback(() => {
    if (enhancedImageSrc && newHistoryEntryData) {
        const newStep: HistoryStep = {
            imageSrc: enhancedImageSrc,
            description: newHistoryEntryData.description,
            originalRect: newHistoryEntryData.originalRect,
        };

        const truncatedHistory = history.slice(0, historyIndex + 1);
        const newHistory = [...truncatedHistory, newStep];
        setHistory(newHistory);
        setHistoryIndex(newHistory.length - 1);

        const newImage = new Image();
        newImage.onload = () => {
            setImage(newImage);
            setFinalImageSrc(enhancedImageSrc);
            setEnhancedImageSrc(null);
            setFinalEnhancementRect(null);
            setNewHistoryEntryData(null);
            setDisplaySelection(null);
            setAppState(AppState.LOADED);
        }
        newImage.src = enhancedImageSrc;
    }
  }, [enhancedImageSrc, newHistoryEntryData, history, historyIndex]);

  const handleRegenerate = useCallback(async () => {
    if (historyIndex <= 0 || appState !== AppState.LOADED || isGeneratingGif) return;
    setAppState(AppState.ENHANCING);
    
    const previousStep = history[historyIndex - 1];
    const currentStep = history[historyIndex];
    const originalRect = currentStep.originalRect;

    if (!originalRect) {
        setAppState(AppState.LOADED);
        return;
    }

    const sourceImage = new Image();
    sourceImage.crossOrigin = "anonymous";
    sourceImage.onload = async () => {
      try {
        const descriptionHistory = history.slice(0, historyIndex).map(h => h.description).filter((d): d is ImageDescription => d !== null);
        const croppedForDescription = await cropImage(sourceImage, originalRect, originalRect.w, originalRect.h, false);
        const description = await serviceDescribeImage(croppedForDescription, descriptionHistory);
        
        const padding = 0.5;
        const paddedRect = {
            x: Math.max(0, originalRect.x - originalRect.w * padding),
            y: Math.max(0, originalRect.y - originalRect.h * padding),
            w: Math.min(sourceImage.naturalWidth, originalRect.w * (1 + 2 * padding)),
            h: Math.min(sourceImage.naturalHeight, originalRect.h * (1 + 2 * padding)),
        };

        const targetWidth = 512;
        const targetHeight = Math.round(targetWidth * (paddedRect.h / paddedRect.w));
        const croppedForEnhancement = await cropImage(sourceImage, paddedRect, targetWidth, targetHeight, false);
        
        const { imageSrc: enhancedPaddedSrc, foundTheBanana } = await serviceEnhance(croppedForEnhancement, [...descriptionHistory.map(d=>d.prompt), description.prompt], hasFoundBanana);

        if (foundTheBanana) {
            setShowBananaBanner(true);
            setHasFoundBanana(true);
        }

        const enhancedPaddedImage = await new Promise<HTMLImageElement>((resolve) => {
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.onload = () => resolve(img);
            img.src = enhancedPaddedSrc;
        });

        const finalCropRect = {
            x: enhancedPaddedImage.naturalWidth * ((originalRect.x - paddedRect.x) / paddedRect.w),
            y: enhancedPaddedImage.naturalHeight * ((originalRect.y - paddedRect.y) / paddedRect.h),
            w: enhancedPaddedImage.naturalWidth * (originalRect.w / paddedRect.w),
            h: enhancedPaddedImage.naturalHeight * (originalRect.h / paddedRect.h),
        };

        const finalImageWidth = 1024;
        const finalImageHeight = Math.round(finalImageWidth * (originalRect.h / originalRect.w));
        const enhancedSrc = await cropImage(enhancedPaddedImage, finalCropRect, finalImageWidth, finalImageHeight, false);

        const newStep: HistoryStep = { imageSrc: enhancedSrc, description, originalRect };
        const newHistory = [...history.slice(0, historyIndex), newStep];
        setHistory(newHistory);

        const newImage = new Image();
        newImage.onload = () => {
            setImage(newImage);
            setFinalImageSrc(enhancedSrc);
            setAppState(AppState.LOADED);
        };
        newImage.src = enhancedSrc;
      } catch (error: any) {
        console.error("Regeneration failed:", error);
        if (error.message?.includes("PERMISSION_DENIED") || error.message?.includes("Requested entity was not found")) {
            handleOpenKeySelector();
        }
        setAppState(AppState.LOADED);
      }
    };
    sourceImage.src = previousStep.imageSrc;
  }, [history, historyIndex, appState, isGeneratingGif, hasFoundBanana]);

  const handleExportGif = useCallback(async () => {
    if (historyIndex < 1) return;
    setIsGeneratingGif(true);
    try {
      const blob = await generateZoomGif(history.slice(0, historyIndex + 1));
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'enhancement-zoom.gif';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Failed to generate GIF:", error);
    } finally {
      setIsGeneratingGif(false);
    }
  }, [history, historyIndex]);

  const stopPropagation = (ev:MouseEvent) => ev.stopPropagation();

  // Initial Splash Screen for API Key Selection
  if (hasApiKey === false) {
    return (
      <div className="fixed inset-0 bg-black flex flex-col items-center justify-center p-8 z-50 text-green-400 font-mono">
        <div className="max-w-md w-full border border-green-500/50 p-8 rounded-lg bg-black/80 backdrop-blur shadow-[0_0_30px_rgba(0,255,0,0.2)] flex flex-col items-center text-center">
          <h1 className="text-3xl font-bold mb-6 tracking-tighter">[ CSI ENHANCE! ]</h1>
          <p className="mb-8 text-sm leading-relaxed opacity-80">
            This application uses high-performance Gemini models. To proceed, you must provide a Google Gemini API Key from a paid GCP project.
          </p>
          <button
            onClick={handleOpenKeySelector}
            className="w-full py-4 bg-green-500 text-black font-bold text-lg rounded hover:bg-green-400 transition-all shadow-[0_0_20px_rgba(34,197,94,0.4)] mb-4"
          >
            CONNECT API KEY
          </button>
          <a
            href="https://ai.google.dev/gemini-api/docs/billing"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs underline opacity-50 hover:opacity-100 transition-opacity"
          >
            Billing Documentation
          </a>
        </div>
      </div>
    );
  }

  return (
    <div 
      ref={containerRef}
      className="fixed inset-0 bg-black flex flex-col items-center justify-center p-4 overflow-hidden"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        if (e.dataTransfer.files?.[0]) handleFileDrop(e.dataTransfer.files[0]);
      }}
    >
      {showBananaBanner && (
        <div className="absolute top-0 left-0 right-0 bg-yellow-400 text-black text-center p-2 z-30 font-bold text-lg animate-pulse flex items-center justify-center shadow-lg">
          <span>🍌 YOU FOUND THE NANO BANANA! 🍌</span>
          <button onClick={() => setShowBananaBanner(false)} className="absolute right-4 text-black hover:opacity-70 text-2xl font-bold">&times;</button>
        </div>
      )}

      {/* Main Command History Bar (Undo/Redo) */}
      {history.length > 0 && (
        <div className="absolute top-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-4 bg-black/80 backdrop-blur-xl px-6 py-2 rounded-full border border-green-500/40 shadow-[0_0_40px_rgba(0,255,0,0.1)] transition-all duration-500">
          <div className="flex items-center gap-2 border-r border-green-500/20 pr-4">
            <button 
              onClick={handleUndo}
              disabled={historyIndex <= 0 || appState === AppState.ENHANCING}
              title="Undo Last Action (Ctrl+Z)"
              className="w-10 h-10 flex items-center justify-center text-xl text-green-400 disabled:text-gray-700 disabled:cursor-not-allowed hover:enabled:bg-green-500/20 rounded-full transition-all active:scale-90"
            >
              ⟲
            </button>
            <button 
              onClick={handleRedo}
              disabled={historyIndex >= history.length - 1 || appState === AppState.ENHANCING}
              title="Redo Action (Ctrl+Y)"
              className="w-10 h-10 flex items-center justify-center text-xl text-green-400 disabled:text-gray-700 disabled:cursor-not-allowed hover:enabled:bg-green-500/20 rounded-full transition-all active:scale-90"
            >
              ⟳
            </button>
          </div>

          <div className="flex flex-col items-center justify-center min-w-[120px]">
            <span className="text-[10px] text-green-500/60 font-bold uppercase tracking-[0.2em] mb-0.5">Operation Depth</span>
            <div className="flex items-center gap-1.5">
              {history.map((_, i) => (
                <div 
                  key={i} 
                  className={`h-1.5 rounded-full transition-all duration-300 ${i === historyIndex ? 'w-6 bg-green-400 shadow-[0_0_10px_rgba(74,222,128,0.5)]' : i < historyIndex ? 'w-1.5 bg-green-900' : 'w-1.5 bg-gray-800'}`}
                />
              ))}
            </div>
            <span className="text-[12px] text-green-400 font-mono mt-1 font-bold">
              {String(historyIndex + 1).padStart(2, '0')} / {String(history.length).padStart(2, '0')}
            </span>
          </div>

          <div className="flex items-center gap-2 border-l border-green-500/20 pl-4">
            <button 
              onClick={resetState}
              title="Return to Original State"
              className="w-10 h-10 flex items-center justify-center text-xl text-red-500/80 hover:bg-red-500/10 rounded-full transition-all active:scale-90"
            >
              ⌂
            </button>
          </div>
        </div>
      )}

      {appState === AppState.IDLE && <DropZone />}
      
      <div className="w-full h-full flex items-center justify-center relative">
        {finalImageSrc && ![AppState.ENHANCED, AppState.ENHANCING].includes(appState) && (
          <ImageDisplay
            imageSrc={finalImageSrc}
            onSelect={handleSelectionChange}
            isEnhancing={appState === AppState.ENHANCING || isGeneratingGif}
            historicalSelection={displaySelection}
            useFixedSelectionBox={useFixedSelectionBox}
            fixedSelectionSizePercentage={fixedSelectionSizePercentage}
          />
        )}
      </div>

      {currentSelection && appState === AppState.LOADED && (
          <div 
            className="absolute z-30 flex gap-2 pointer-events-none"
            style={{
                top: `${currentSelection.screenRect.y + currentSelection.screenRect.h + 10}px`,
                left: `${currentSelection.screenRect.x + currentSelection.screenRect.w/2}px`,
                transform: 'translateX(-50%)'
            }}
          >
              <button 
                onClick={handleEnhance} 
                className="pointer-events-auto bg-green-500 hover:bg-green-400 text-black font-bold py-2 px-6 rounded shadow-[0_0_20px_rgba(34,197,94,0.4)] transition-all uppercase tracking-tighter text-sm flex items-center gap-2"
              >
                  <span className="text-lg">✧</span> ENHANCE
              </button>
              <button 
                onClick={handleZoom} 
                className="pointer-events-auto bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 px-6 rounded shadow-[0_0_20px_rgba(37,99,235,0.4)] transition-all uppercase tracking-tighter text-sm flex items-center gap-2"
              >
                  <span className="text-lg">⊕</span> ZOOM
              </button>
              <button 
                onClick={() => setCurrentSelection(null)} 
                className="pointer-events-auto bg-gray-900/80 hover:bg-gray-800 text-white font-bold py-2 px-4 rounded border border-white/10 transition-all"
              >
                  &times;
              </button>
          </div>
      )}

      {enhancementJob && appState === AppState.ENHANCING && finalEnhancementRect && (
          <SelectionAnimator
              rect={enhancementJob.screenRect}
              finalRect={finalEnhancementRect}
              src={enhancementJob.pixelatedSrc}
              onComplete={runEnhancementJob}
          />
      )}

      {appState === AppState.ENHANCED && pixelatedImageSrc && enhancedImageSrc && finalEnhancementRect && (
        <div 
          className="absolute z-10 shadow-2xl"
          style={{
            top: `${finalEnhancementRect.y}px`,
            left: `${finalEnhancementRect.x}px`,
            width: `${finalEnhancementRect.w}px`,
            height: `${finalEnhancementRect.h}px`,
          }}
        >
          <PixelDissolve
            lowResSrc={pixelatedImageSrc}
            highResSrc={enhancedImageSrc}
            onComplete={handleEnhancementComplete}
          />
        </div>
      )}

      {/* Secondary Controls Bar (Gif, Regen) */}
      {appState === AppState.LOADED && history.length > 0 && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 bg-black/60 backdrop-blur-md p-1 rounded-full border border-white/10 shadow-xl transition-all">
            <button 
              onClick={handleRegenerate} 
              onMouseDownCapture={stopPropagation}
              disabled={historyIndex <= 0 || isGeneratingGif} 
              className="px-5 py-2 text-xs font-bold text-white/70 hover:enabled:text-green-400 hover:enabled:bg-white/5 rounded-full transition-all flex items-center gap-2"
            >
              REGENERATE
            </button>
            <div className="h-4 w-[1px] bg-white/10" />
            <button 
              onClick={handleExportGif} 
              onMouseDownCapture={stopPropagation}
              disabled={historyIndex < 1 || isGeneratingGif} 
              className="px-5 py-2 text-xs font-bold text-white/70 hover:enabled:text-blue-400 hover:enabled:bg-white/5 rounded-full transition-all flex items-center gap-2"
            >
              {isGeneratingGif ? 'GENERATING...' : 'EXPORT GIF'}
            </button>
        </div>
      )}

      <input
        type="file"
        ref={fileInputRef}
        onChange={(e) => {
          if (e.target.files?.[0]) handleFileDrop(e.target.files[0]);
        }}
        style={{ display: 'none' }}
        accept="image/*"
      />
      <StatusBar 
        state={appState} 
        useFixedSelectionBox={useFixedSelectionBox}
        isInitialState={history.length <= 1}
        onUploadClick={() => fileInputRef.current?.click()}
      />
    </div>
  );
};

export default App;
