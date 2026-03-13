import { useEffect, useState } from "react";

interface PreparedAssetOptions {
  backgroundFloodTrim?: boolean;
}

const preparedAssetCache = new Map<string, Promise<string>>();

function clamp(value: number, min: number, max: number): number {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

function quantize(value: number): number {
  return Math.round(value / 16) * 16;
}

function colorDistance(a: number[], b: number[]): number {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function isBackgroundLike(
  pixels: Uint8ClampedArray,
  index: number,
  palette: number[][]
): boolean {
  const alpha = pixels[index + 3];
  if (alpha < 8) {
    return true;
  }

  const sample = [pixels[index], pixels[index + 1], pixels[index + 2]];
  return palette.some((color) => colorDistance(sample, color) <= 42);
}

function collectBorderPalette(pixels: Uint8ClampedArray, width: number, height: number): number[][] {
  const samples: number[][] = [];
  const points: number[][] = [];
  const strideX = Math.max(1, Math.floor(width / 40));
  const strideY = Math.max(1, Math.floor(height / 40));

  for (let x = 0; x < width; x += strideX) {
    points.push([x, 0], [x, height - 1]);
  }
  for (let y = 0; y < height; y += strideY) {
    points.push([0, y], [width - 1, y]);
  }

  for (const [x, y] of points) {
    const index = (clamp(y, 0, height - 1) * width + clamp(x, 0, width - 1)) * 4;
    if (pixels[index + 3] < 8) {
      continue;
    }
    const sample = [quantize(pixels[index]), quantize(pixels[index + 1]), quantize(pixels[index + 2])];
    if (samples.some((candidate) => colorDistance(candidate, sample) <= 28)) {
      continue;
    }
    samples.push(sample);
  }

  return samples;
}

async function prepareBorderTrimmedImage(src: string): Promise<string> {
  const response = await fetch(src);
  if (!response.ok) {
    throw new Error("image-fetch-failed");
  }

  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob);

  const sourceWidth = bitmap.width;
  const sourceHeight = bitmap.height;
  if (sourceWidth <= 0 || sourceHeight <= 0) {
    return src;
  }

  const maxDimension = Math.max(sourceWidth, sourceHeight);
  const scale = maxDimension > 1024 ? 1024 / maxDimension : 1;
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    return src;
  }

  context.clearRect(0, 0, width, height);
  context.drawImage(bitmap, 0, 0, width, height);

  function floodTrimCanvas(input: HTMLCanvasElement): HTMLCanvasElement | null {
    const inputContext = input.getContext("2d");
    if (!inputContext) {
      return null;
    }
    const currentWidth = input.width;
    const currentHeight = input.height;
    const imageData = inputContext.getImageData(0, 0, currentWidth, currentHeight);
    const pixels = imageData.data;
    const palette = collectBorderPalette(pixels, currentWidth, currentHeight);
    if (palette.length === 0) {
      return null;
    }

    const visited = new Uint8Array(currentWidth * currentHeight);
    const queue: number[] = [];
    let head = 0;

    function enqueue(x: number, y: number): void {
      if (x < 0 || y < 0 || x >= currentWidth || y >= currentHeight) {
        return;
      }
      const pixelIndex = y * currentWidth + x;
      if (visited[pixelIndex]) {
        return;
      }
      const rgbaIndex = pixelIndex * 4;
      if (!isBackgroundLike(pixels, rgbaIndex, palette)) {
        return;
      }
      visited[pixelIndex] = 1;
      queue.push(pixelIndex);
    }

    for (let x = 0; x < currentWidth; x += 1) {
      enqueue(x, 0);
      enqueue(x, currentHeight - 1);
    }
    for (let y = 0; y < currentHeight; y += 1) {
      enqueue(0, y);
      enqueue(currentWidth - 1, y);
    }

    while (head < queue.length) {
      const pixelIndex = queue[head++];
      const x = pixelIndex % currentWidth;
      const y = Math.floor(pixelIndex / currentWidth);
      enqueue(x - 1, y);
      enqueue(x + 1, y);
      enqueue(x, y - 1);
      enqueue(x, y + 1);
      enqueue(x - 1, y - 1);
      enqueue(x + 1, y - 1);
      enqueue(x - 1, y + 1);
      enqueue(x + 1, y + 1);
    }

    let minX = currentWidth;
    let minY = currentHeight;
    let maxX = -1;
    let maxY = -1;

    for (let i = 0; i < currentWidth * currentHeight; i += 1) {
      const rgbaIndex = i * 4;
      if (visited[i]) {
        pixels[rgbaIndex + 3] = 0;
        continue;
      }
      if (pixels[rgbaIndex + 3] < 8) {
        continue;
      }
      const x = i % currentWidth;
      const y = Math.floor(i / currentWidth);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }

    if (maxX < minX || maxY < minY) {
      return null;
    }

    inputContext.putImageData(imageData, 0, 0);

    const padding = Math.max(6, Math.round(Math.max(currentWidth, currentHeight) * 0.012));
    const cropX = clamp(minX - padding, 0, currentWidth - 1);
    const cropY = clamp(minY - padding, 0, currentHeight - 1);
    const cropWidth = clamp(maxX - minX + 1 + padding * 2, 1, currentWidth - cropX);
    const cropHeight = clamp(maxY - minY + 1 + padding * 2, 1, currentHeight - cropY);

    const output = document.createElement("canvas");
    output.width = cropWidth;
    output.height = cropHeight;
    const outputContext = output.getContext("2d");
    if (!outputContext) {
      return null;
    }
    outputContext.clearRect(0, 0, cropWidth, cropHeight);
    outputContext.drawImage(input, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
    return output;
  }

  let currentCanvas: HTMLCanvasElement = canvas;
  for (let pass = 0; pass < 3; pass += 1) {
    const trimmed = floodTrimCanvas(currentCanvas);
    if (!trimmed) {
      break;
    }
    currentCanvas = trimmed;
  }

  return currentCanvas.toDataURL("image/png");
}

function getPreparedAsset(src: string, options: PreparedAssetOptions): Promise<string> {
  const key = `${src}::${options.backgroundFloodTrim ? "trim" : "raw"}`;
  const cached = preparedAssetCache.get(key);
  if (cached) {
    return cached;
  }

  const promise = (async () => {
    if (options.backgroundFloodTrim) {
      try {
        return await prepareBorderTrimmedImage(src);
      } catch {
        return src;
      }
    }
    return src;
  })();

  preparedAssetCache.set(key, promise);
  return promise;
}

export function usePreparedAssetSrc(
  src: string | undefined,
  options: PreparedAssetOptions = {}
): string | undefined {
  const [preparedSrc, setPreparedSrc] = useState<string | undefined>(src);

  useEffect(() => {
    let disposed = false;

    if (!src) {
      setPreparedSrc(undefined);
      return () => {
        disposed = true;
      };
    }

    getPreparedAsset(src, options).then((resolved) => {
      if (!disposed) {
        setPreparedSrc(resolved);
      }
    });

    return () => {
      disposed = true;
    };
  }, [src, options.backgroundFloodTrim]);

  return preparedSrc;
}
