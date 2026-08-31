import { useEffect, useRef, useState } from 'react';
import seasons, { isSeasonKey, readStoredSeason, storeSeason } from '../constants/seasons';

const PIXEL_SCALE = 5;
const TRANSITION_CLEANUP_MS = 920;

function applySeasonPalette(season) {
  const { accent, palette } = seasons[season];
  const root = document.documentElement;

  root.style.setProperty('--season-accent', accent);
  Object.entries(palette).forEach(([name, value]) => root.style.setProperty(`--${name}`, value));
}

function drawPixelCover(canvas, image) {
  if (!canvas || !image.naturalWidth || !image.naturalHeight) return;

  const width = Math.ceil(window.innerWidth / PIXEL_SCALE);
  const height = Math.ceil(window.innerHeight / PIXEL_SCALE);
  const context = canvas.getContext('2d');

  if (!context) return;

  canvas.width = width;
  canvas.height = height;
  context.imageSmoothingEnabled = false;
  context.clearRect(0, 0, width, height);

  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  const x = (width - drawWidth) / 2;
  const y = (height - drawHeight) / 2;

  context.drawImage(image, x, y, drawWidth, drawHeight);
}

function getCachedImage(cache, src) {
  const cached = cache.get(src);
  if (cached) return cached;

  const image = new Image();
  const ready = new Promise((resolve, reject) => {
    image.addEventListener('load', () => resolve(image), { once: true });
    image.addEventListener('error', reject, { once: true });
  });

  image.src = src;
  const entry = { image, ready };
  cache.set(src, entry);
  return entry;
}

export default function SeasonPixelBackground() {
  const activeCanvasRef = useRef(null);
  const previousCanvasRef = useRef(null);
  const imageCache = useRef(new Map());
  const [season, setSeason] = useState(readStoredSeason);
  const [previousSeason, setPreviousSeason] = useState(null);

  useEffect(() => {
    document.documentElement.dataset.theme = 'beihang-seasons';
    document.documentElement.dataset.season = season;
    applySeasonPalette(season);

    const onSeasonChange = (event) => {
      const nextSeason = event.detail?.season;
      if (!isSeasonKey(nextSeason) || nextSeason === season) return;

      setPreviousSeason(season);
      setSeason(nextSeason);
      storeSeason(nextSeason);
    };

    window.addEventListener('beihang-season-change', onSeasonChange);
    return () => window.removeEventListener('beihang-season-change', onSeasonChange);
  }, [season]);

  useEffect(() => {
    let resizeFrame = 0;
    let disposed = false;

    const draw = (canvas, seasonKey) => {
      const entry = getCachedImage(imageCache.current, seasons[seasonKey].src);

      if (entry.image.complete && entry.image.naturalWidth) {
        drawPixelCover(canvas, entry.image);
        return;
      }

      entry.ready
        .then((image) => {
          if (!disposed) drawPixelCover(canvas, image);
        })
        .catch(() => {
          // 图片加载失败时保留纯色画布兜底，不阻断页面其余内容。
        });
    };

    const drawAll = () => {
      if (activeCanvasRef.current) draw(activeCanvasRef.current, season);
      if (previousCanvasRef.current && previousSeason) {
        draw(previousCanvasRef.current, previousSeason);
      }
    };

    // 缩放窗口时每帧最多重绘一次，避免连续 resize 触发大量 canvas 运算。
    const handleResize = () => {
      window.cancelAnimationFrame(resizeFrame);
      resizeFrame = window.requestAnimationFrame(drawAll);
    };

    drawAll();
    window.addEventListener('resize', handleResize);
    return () => {
      disposed = true;
      window.cancelAnimationFrame(resizeFrame);
      window.removeEventListener('resize', handleResize);
    };
  }, [season, previousSeason]);

  useEffect(() => {
    if (!previousSeason) return undefined;

    // 动画结束后移除旧画布，避免长期保留两层全屏 canvas。
    const timer = window.setTimeout(
      () => setPreviousSeason(null),
      TRANSITION_CLEANUP_MS,
    );
    return () => window.clearTimeout(timer);
  }, [previousSeason]);

  return (
    <div className="season-pixel-bg" aria-hidden="true">
      {previousSeason && (
        <canvas
          key={`old-${previousSeason}`}
          ref={previousCanvasRef}
          className="season-pixel-bg__canvas season-pixel-bg__canvas--leaving"
        />
      )}
      <canvas
        key={`new-${season}`}
        ref={activeCanvasRef}
        className="season-pixel-bg__canvas season-pixel-bg__canvas--entering"
      />
    </div>
  );
}
