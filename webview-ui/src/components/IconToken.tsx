import React, { useEffect, useState } from "react";
import { usePreparedAssetSrc } from "../world/preparedAsset";

interface IconTokenProps {
  src?: string;
  title: string;
  fallback: string;
  className?: string;
  autoTrim?: boolean;
  maxAutoScale?: number;
  minAutoScale?: number;
  backgroundFloodTrim?: boolean;
}

const trimScaleCache = new Map<string, number>();

function clamp(value: number, min: number, max: number): number {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

async function resolveTrimScale(src: string, maxAutoScale: number): Promise<number> {
  const cachedBase = trimScaleCache.get(src);
  if (typeof cachedBase === "number") {
    return clamp(cachedBase, 1, maxAutoScale);
  }

  const image = new Image();
  const loaded = new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("image-load-failed"));
  });

  image.src = src;
  await loaded;

  const width = image.naturalWidth;
  const height = image.naturalHeight;
  if (width <= 0 || height <= 0) {
    trimScaleCache.set(src, 1);
    return 1;
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    trimScaleCache.set(src, 1);
    return 1;
  }

  let baseScale = 1;

  try {
    context.drawImage(image, 0, 0, width, height);
    const pixels = context.getImageData(0, 0, width, height).data;

    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const alpha = pixels[(y * width + x) * 4 + 3];
        if (alpha < 8) {
          continue;
        }
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }

    if (maxX >= minX && maxY >= minY) {
      const contentWidth = maxX - minX + 1;
      const contentHeight = maxY - minY + 1;
      const fitRatio = Math.min(width / contentWidth, height / contentHeight);
      baseScale = fitRatio * 0.92;
    }
  } catch {
    baseScale = 1;
  }

  trimScaleCache.set(src, baseScale);
  return clamp(baseScale, 1, maxAutoScale);
}

export default function IconToken({
  src,
  title,
  fallback,
  className,
  autoTrim = false,
  maxAutoScale = 8,
  minAutoScale = 1,
  backgroundFloodTrim = false
}: IconTokenProps): JSX.Element {
  const [errored, setErrored] = useState(false);
  const [trimScale, setTrimScale] = useState(1);
  const preparedSrc = usePreparedAssetSrc(src, { backgroundFloodTrim });
  const displaySrc = preparedSrc ?? src;

  useEffect(() => {
    setErrored(false);
  }, [displaySrc]);

  useEffect(() => {
    let disposed = false;
    if (!displaySrc || !autoTrim || errored) {
      setTrimScale(1);
      return () => {
        disposed = true;
      };
    }

    resolveTrimScale(displaySrc, maxAutoScale)
      .then((scale) => {
        if (!disposed) {
          setTrimScale(scale);
        }
      })
      .catch(() => {
        if (!disposed) {
          setTrimScale(1);
        }
      });

    return () => {
      disposed = true;
    };
  }, [displaySrc, autoTrim, maxAutoScale, errored]);

  if (displaySrc && !errored) {
    const appliedScale = autoTrim ? Math.max(trimScale, minAutoScale) : trimScale;
    return (
      <span className={`icon-token icon-image ${className ?? ""}`.trim()} title={title}>
        <img
          className="icon-token-image"
          src={displaySrc}
          alt=""
          loading="lazy"
          style={appliedScale > 1 ? { transform: `scale(${appliedScale})`, transformOrigin: "center" } : undefined}
          onError={() => setErrored(true)}
        />
      </span>
    );
  }

  return (
    <span className={`icon-token icon-fallback ${className ?? ""}`.trim()} title={title}>
      <span className="icon-fallback-glyph">{fallback}</span>
    </span>
  );
}
