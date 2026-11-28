import {
  ImageStylePreset,
  MediaArtifact,
  VaultDocument,
  VideoStylePreset,
} from '../types/workspace';
import { extractKeyMetrics, extractTopTerms } from './edgeEngine';
import { parseScenePrompt, renderCreativeSceneFrame } from './sceneRenderer';
import { computeWaveformPeaks, synthesizeAcousticBriefing } from './wavEncoder';

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

function estimateDataUrlBytes(dataUrl: string): number {
  const base64Part = dataUrl.split(',')[1] || '';
  return Math.round((base64Part.length * 3) / 4);
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Failed to encode media blob'));
    reader.readAsDataURL(blob);
  });
}

function wrapCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export interface ImageGenerationInput {
  prompt: string;
  docs: VaultDocument[];
  stylePreset: ImageStylePreset;
  aspectRatio?: '16:9' | '1:1';
  highlights?: string[];
}

export async function generateLocalImageArtifact(
  input: ImageGenerationInput
): Promise<MediaArtifact> {
  const width = input.aspectRatio === '1:1' ? 1024 : 1200;
  const height = input.aspectRatio === '1:1' ? 1024 : 675;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');

  const titleText = input.prompt.trim() || 'Private Edge Visual';

  if (input.stylePreset === 'artwork' || input.stylePreset === 'poster') {
    renderCreativeSceneFrame(ctx, width, height, {
      prompt: titleText,
      mode: input.stylePreset,
      time: 0.35,
      title: titleText,
      subtitle: input.highlights?.[0],
    });
    const dataUrl = canvas.toDataURL('image/png');
    return {
      id: `media-img-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      kind: 'image',
      title:
        titleText.length > 48 ? `${titleText.slice(0, 45).trim()}...` : titleText,
      prompt: input.prompt,
      createdAt: Date.now(),
      mimeType: 'image/png',
      dataUrl,
      width,
      height,
      sizeBytes: estimateDataUrlBytes(dataUrl),
      sourceDocIds: [],
      stylePreset: input.stylePreset,
    };
  }

  const combinedText = input.docs
    .flatMap((d) => d.pages.map((p) => p.text))
    .join('\n');
  const metrics = extractKeyMetrics(combinedText || input.prompt, 4);
  const topTerms = extractTopTerms(combinedText || input.prompt, 7);
  const docNames = input.docs.map((d) => d.name).slice(0, 3);

  // Clean light editorial canvas background
  ctx.fillStyle = '#F8FAFC';
  ctx.fillRect(0, 0, width, height);

  // Subtle architectural grid lines
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.04)';
  ctx.lineWidth = 1;
  for (let x = 64; x < width; x += 64) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 64; y < height; y += 64) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  // Top accent bar
  ctx.fillStyle = '#0F766E';
  ctx.fillRect(48, 44, 64, 5);

  ctx.fillStyle = '#475569';
  ctx.font = '600 15px "DM Sans", sans-serif';
  const presetLabel =
    input.stylePreset === 'network'
      ? 'LOCAL CONCEPT GRAPH'
      : input.stylePreset === 'metrics'
      ? 'LOCAL TERM & METRIC DENSITY'
      : 'LOCAL EXECUTIVE BRIEFING';
  ctx.fillText(presetLabel, 128, 52);

  // Main Title
  ctx.fillStyle = '#0F172A';
  ctx.font = '700 32px "Plus Jakarta Sans", sans-serif';
  const titleLines = wrapCanvasText(ctx, titleText, width - 96).slice(0, 2);
  let yCursor = 104;
  for (const line of titleLines) {
    ctx.fillText(line, 48, yCursor);
    yCursor += 42;
  }

  // Hairline divider
  ctx.strokeStyle = '#E2E8F0';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(48, yCursor + 6);
  ctx.lineTo(width - 48, yCursor + 6);
  ctx.stroke();

  const bodyTop = yCursor + 34;

  if (input.stylePreset === 'network') {
    const centerX = width / 2;
    const centerY = bodyTop + (height - bodyTop - 72) / 2;
    const radius = Math.min(width, height - bodyTop) * 0.31;

    // Central node
    const nodes = topTerms.length > 0 ? topTerms : [{ term: 'local', count: 4 }, { term: 'vault', count: 3 }, { term: 'analysis', count: 2 }];
    nodes.forEach((node, idx) => {
      const angle = (idx / nodes.length) * Math.PI * 2 - Math.PI / 2;
      const nx = centerX + Math.cos(angle) * radius;
      const ny = centerY + Math.sin(angle) * radius;

      ctx.strokeStyle = 'rgba(15, 118, 110, 0.28)';
      ctx.lineWidth = Math.max(1.5, Math.min(5, node.count));
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.lineTo(nx, ny);
      ctx.stroke();

      // Outer node box
      ctx.fillStyle = '#FFFFFF';
      ctx.strokeStyle = '#CBD5E1';
      ctx.lineWidth = 1.5;
      const boxW = 156;
      const boxH = 48;
      ctx.beginPath();
      ctx.roundRect(nx - boxW / 2, ny - boxH / 2, boxW, boxH, 8);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#0F172A';
      ctx.font = '600 16px "DM Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${node.term} (${node.count})`, nx, ny + 6);
    });

    // Center hub
    ctx.fillStyle = '#0F766E';
    ctx.beginPath();
    ctx.roundRect(centerX - 100, centerY - 30, 200, 60, 10);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '700 17px "Plus Jakarta Sans", sans-serif';
    ctx.fillText('Edge Vault Index', centerX, centerY + 6);
    ctx.textAlign = 'left';
  } else if (input.stylePreset === 'metrics') {
    const terms =
      topTerms.length > 0
        ? topTerms
        : [
            { term: 'resilience', count: 6 },
            { term: 'local', count: 5 },
            { term: 'edge', count: 4 },
            { term: 'storage', count: 3 },
          ];
    const maxCount = Math.max(...terms.map((t) => t.count), 1);
    const barMaxW = width - 320;
    let barY = bodyTop + 12;

    for (const item of terms.slice(0, 6)) {
      ctx.fillStyle = '#334155';
      ctx.font = '600 17px "DM Sans", sans-serif';
      ctx.fillText(item.term, 48, barY + 24);

      // Track
      ctx.fillStyle = '#E2E8F0';
      ctx.beginPath();
      ctx.roundRect(220, barY + 6, barMaxW, 24, 6);
      ctx.fill();

      // Bar
      const fillW = Math.max(28, (item.count / maxCount) * barMaxW);
      ctx.fillStyle = '#0F766E';
      ctx.beginPath();
      ctx.roundRect(220, barY + 6, fillW, 24, 6);
      ctx.fill();

      ctx.fillStyle = '#0F172A';
      ctx.font = '600 16px "JetBrains Mono", monospace';
      ctx.fillText(String(item.count), 232 + barMaxW, barY + 24);
      barY += 54;
    }
  } else {
    // Executive Briefing Card
    const highlights =
      input.highlights && input.highlights.length > 0
        ? input.highlights
        : input.docs.slice(0, 3).map((d) => `${d.name}: ${d.pages[0]?.text.slice(0, 130) ?? ''}`);

    // Metrics strip if available
    if (metrics.length > 0) {
      const boxW = (width - 96 - (metrics.length - 1) * 16) / metrics.length;
      metrics.forEach((m, idx) => {
        const bx = 48 + idx * (boxW + 16);
        ctx.fillStyle = '#FFFFFF';
        ctx.strokeStyle = '#E2E8F0';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(bx, bodyTop, boxW, 74, 8);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#0F766E';
        ctx.font = '700 22px "JetBrains Mono", monospace';
        ctx.fillText(m.slice(0, 16), bx + 16, bodyTop + 34);
        ctx.fillStyle = '#64748B';
        ctx.font = '500 13px "DM Sans", sans-serif';
        ctx.fillText(`Detected Figure ${idx + 1}`, bx + 16, bodyTop + 58);
      });
    }

    const listStartY = metrics.length > 0 ? bodyTop + 104 : bodyTop + 8;
    let itemY = listStartY;

    highlights.slice(0, 3).forEach((item, idx) => {
      ctx.fillStyle = '#FFFFFF';
      ctx.strokeStyle = '#E2E8F0';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(48, itemY, width - 96, 86, 8);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#0F766E';
      ctx.font = '700 15px "JetBrains Mono", monospace';
      ctx.fillText(`0${idx + 1}`, 68, itemY + 32);

      ctx.fillStyle = '#1E293B';
      ctx.font = '400 16px "DM Sans", sans-serif';
      const lines = wrapCanvasText(ctx, item, width - 190).slice(0, 2);
      lines.forEach((line, lIdx) => {
        ctx.fillText(line, 114, itemY + 32 + lIdx * 24);
      });
      itemY += 102;
    });
  }

  // Footer attribution
  ctx.fillStyle = '#64748B';
  ctx.font = '500 13px "DM Sans", sans-serif';
  const footerText =
    docNames.length > 0
      ? `Sources: ${docNames.join(' · ')} · Generated locally on device`
      : 'Generated locally on device';
  ctx.fillText(footerText.slice(0, 110), 48, height - 28);

  const dataUrl = canvas.toDataURL('image/png');
  return {
    id: `media-img-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    kind: 'image',
    title:
      titleText.length > 48 ? `${titleText.slice(0, 45).trim()}...` : titleText,
    prompt: input.prompt,
    createdAt: Date.now(),
    mimeType: 'image/png',
    dataUrl,
    width,
    height,
    sizeBytes: estimateDataUrlBytes(dataUrl),
    sourceDocIds: input.docs.map((d) => d.id),
    stylePreset: input.stylePreset,
  };
}

export async function generateLocalAudioArtifact(options: {
  title: string;
  scriptText: string;
  docs: VaultDocument[];
  durationSec?: number;
}): Promise<MediaArtifact> {
  const result = synthesizeAcousticBriefing({
    durationSec: options.durationSec ?? 5,
    sampleRate: 22050,
    seedText: options.scriptText || options.title,
  });

  const base64 = bytesToBase64(result.wavBytes);
  const dataUrl = `data:audio/wav;base64,${base64}`;

  return {
    id: `media-aud-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    kind: 'audio',
    title: options.title,
    prompt: options.scriptText.slice(0, 160),
    createdAt: Date.now(),
    mimeType: 'audio/wav',
    dataUrl,
    durationSec: result.durationSec,
    sizeBytes: result.wavBytes.byteLength,
    sourceDocIds: options.docs.map((d) => d.id),
    scriptText: options.scriptText,
    waveformPeaks: result.waveformPeaks,
  };
}

export async function analyzeLocalAudioFile(file: File): Promise<MediaArtifact> {
  const dataUrl = await blobToDataUrl(file);
  let durationSec = 0;
  let waveformPeaks: number[] = [];

  try {
    const arrayBuffer = await file.arrayBuffer();
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioCtx) {
      const ctx = new AudioCtx();
      try {
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
        durationSec = Number(audioBuffer.duration.toFixed(1));
        const channel = audioBuffer.getChannelData(0);
        waveformPeaks = computeWaveformPeaks(channel, 44);
      } finally {
        await ctx.close();
      }
    }
  } catch {
    // Fallback deterministic visual peaks if browser codec cannot decode raw buffer
    const fallback = new Float32Array(44);
    for (let i = 0; i < 44; i++) {
      fallback[i] = 0.25 + 0.55 * Math.abs(Math.sin(i * 0.45));
    }
    waveformPeaks = computeWaveformPeaks(fallback, 44);
  }

  return {
    id: `media-aud-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    kind: 'audio',
    title: file.name,
    prompt: `Local audio inspection (${file.type || 'audio'})`,
    createdAt: Date.now(),
    mimeType: file.type || 'audio/wav',
    dataUrl,
    durationSec: durationSec || undefined,
    sizeBytes: file.size,
    sourceDocIds: [],
    waveformPeaks,
  };
}

export async function generateLocalVideoArtifact(options: {
  title: string;
  slides: { heading: string; body: string }[];
  docs: VaultDocument[];
  videoStyle?: VideoStylePreset;
  durationSec?: number;
  onProgress?: (pct: number) => void;
  onFramePreview?: (previewDataUrl: string, pct: number) => void;
}): Promise<MediaArtifact> {
  const width = 960;
  const height = 540;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable for video rendering');

  const videoStyle: VideoStylePreset = options.videoStyle ?? 'briefing';
  const isCreativeVideo = videoStyle === 'scene' || videoStyle === 'motion';

  const slides =
    options.slides.length > 0
      ? options.slides.slice(0, 4)
      : [
          {
            heading: options.title || 'Local Visual Video',
            body: 'Synthesized locally on your edge device.',
          },
        ];

  const keyframes: string[] = [];

  const drawBriefingSlide = (slideIdx: number, localProgress: number) => {
    const slide = slides[slideIdx];
    const alpha = Math.min(1, localProgress * 4) * Math.min(1, (1 - localProgress) * 5 + 0.2);

    ctx.fillStyle = '#0F172A';
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = 'rgba(20, 184, 166, 0.14)';
    ctx.lineWidth = 1;
    ctx.strokeRect(32, 32, width - 64, height - 64);

    ctx.save();
    ctx.globalAlpha = Math.max(0.15, Math.min(1, alpha));

    ctx.fillStyle = '#14B8A6';
    ctx.fillRect(64, 68, 48, 4);
    ctx.fillStyle = '#94A3B8';
    ctx.font = '600 14px "JetBrains Mono", monospace';
    ctx.fillText(`SCENE 0${slideIdx + 1} / 0${slides.length}`, 128, 75);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#64748B';
    ctx.font = '500 13px "DM Sans", sans-serif';
    ctx.fillText('Cairn Local Edge Renderer', width - 64, 75);
    ctx.textAlign = 'left';

    ctx.fillStyle = '#F8FAFC';
    ctx.font = '700 32px "Plus Jakarta Sans", sans-serif';
    const headingLines = wrapCanvasText(ctx, slide.heading, width - 128).slice(0, 2);
    let y = 140;
    for (const line of headingLines) {
      ctx.fillText(line, 64, y);
      y += 42;
    }

    ctx.fillStyle = '#CBD5E1';
    ctx.font = '400 20px "DM Sans", sans-serif';
    const bodyLines = wrapCanvasText(ctx, slide.body, width - 140).slice(0, 6);
    y += 18;
    for (const line of bodyLines) {
      ctx.fillText(line, 64, y);
      y += 32;
    }

    ctx.restore();

    const totalProgress = (slideIdx + localProgress) / slides.length;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.fillRect(64, height - 96, width - 128, 4);
    ctx.fillStyle = '#14B8A6';
    ctx.fillRect(64, height - 96, (width - 128) * totalProgress, 4);
  };

  const renderFrameAt = (overall: number) => {
    if (isCreativeVideo) {
      const beatIdx = Math.min(slides.length - 1, Math.floor(overall * slides.length));
      const beat = slides[beatIdx];
      renderCreativeSceneFrame(ctx, width, height, {
        prompt: options.title || beat?.heading || 'Creative Scene',
        mode: videoStyle,
        time: overall,
        title: options.title,
        subtitle:
          videoStyle === 'motion'
            ? beat?.body || beat?.heading
            : undefined,
      });
      return;
    }
    const rawSlide = Math.min(slides.length - 0.001, overall * slides.length);
    const slideIdx = Math.floor(rawSlide);
    const localProgress = rawSlide - slideIdx;
    drawBriefingSlide(slideIdx, localProgress);
  };

  if (isCreativeVideo) {
    for (const ratio of [0.1, 0.35, 0.65, 0.9]) {
      renderFrameAt(ratio);
      keyframes.push(canvas.toDataURL('image/png'));
    }
  } else {
    for (let i = 0; i < slides.length; i++) {
      drawBriefingSlide(i, 0.5);
      keyframes.push(canvas.toDataURL('image/png'));
    }
  }

  const targetDurationMs = isCreativeVideo
    ? Math.max(3000, Math.min(8000, (options.durationSec ?? 4) * 1000))
    : slides.length * 900;

  const canRecord =
    typeof MediaRecorder !== 'undefined' && typeof canvas.captureStream === 'function';

  if (!canRecord) {
    return {
      id: `media-vid-${Date.now()}`,
      kind: 'video',
      title: options.title,
      prompt: options.title || slides.map((s) => s.heading).join(' · '),
      createdAt: Date.now(),
      mimeType: 'image/png',
      dataUrl: keyframes[0],
      durationSec: Number((targetDurationMs / 1000).toFixed(1)),
      width,
      height,
      sizeBytes: estimateDataUrlBytes(keyframes[0]),
      sourceDocIds: isCreativeVideo ? [] : options.docs.map((d) => d.id),
      keyframes,
      videoStyle,
    };
  }

  const stream = canvas.captureStream(24);
  const mimeCandidates = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
    'video/mp4',
  ];
  const supportedMime =
    typeof MediaRecorder.isTypeSupported === 'function'
      ? mimeCandidates.find((m) => MediaRecorder.isTypeSupported(m))
      : 'video/webm';

  const recorderOptions: MediaRecorderOptions = {
    videoBitsPerSecond: 2_200_000,
    ...(supportedMime ? { mimeType: supportedMime } : {}),
  };

  const recorder = new MediaRecorder(stream, recorderOptions);
  const effectiveMime = recorder.mimeType || supportedMime || 'video/webm';

  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };

  const stopPromise = new Promise<Blob>((resolve) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: effectiveMime }));
  });

  // Prime initial frame before starting recorder
  renderFrameAt(0);
  options.onFramePreview?.(canvas.toDataURL('image/png'), 0);
  recorder.start(200);

  const frameIntervalMs = 42;
  const totalSteps = Math.max(1, Math.round(targetDurationMs / frameIntervalMs));

  for (let step = 0; step <= totalSteps; step++) {
    const overall = step / totalSteps;
    const pct = Math.round(overall * 100);
    renderFrameAt(overall);
    options.onProgress?.(pct);
    if (options.onFramePreview && (step % 6 === 0 || step === totalSteps)) {
      options.onFramePreview(canvas.toDataURL('image/png'), pct);
    }
    await new Promise((r) => setTimeout(r, frameIntervalMs));
  }

  recorder.stop();
  stream.getTracks().forEach((t) => t.stop());

  const videoBlob = await stopPromise;
  const dataUrl = await blobToDataUrl(videoBlob);

  return {
    id: `media-vid-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    kind: 'video',
    title: options.title,
    prompt: options.title || slides.map((s) => s.heading).join(' · '),
    createdAt: Date.now(),
    mimeType: effectiveMime,
    dataUrl,
    durationSec: Number((targetDurationMs / 1000).toFixed(1)),
    width,
    height,
    sizeBytes: videoBlob.size,
    sourceDocIds: isCreativeVideo ? [] : options.docs.map((d) => d.id),
    keyframes,
    videoStyle,
  };
}

export async function analyzeLocalVideoFile(file: File): Promise<MediaArtifact> {
  const dataUrl = await blobToDataUrl(file);
  const keyframes: string[] = [];
  let durationSec = 0;
  let width = 0;
  let height = 0;

  try {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.src = dataUrl;

    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error('Could not load video metadata'));
      setTimeout(() => reject(new Error('Video metadata timeout')), 4000);
    });

    durationSec = Number((video.duration || 0).toFixed(1));
    width = video.videoWidth || 640;
    height = video.videoHeight || 360;

    const canvas = document.createElement('canvas');
    canvas.width = Math.min(480, width);
    canvas.height = Math.round((canvas.width / Math.max(1, width)) * height);
    const ctx = canvas.getContext('2d');

    if (ctx && durationSec > 0) {
      const points = [0.1, 0.5, 0.85].map((r) => Math.min(durationSec - 0.05, durationSec * r));
      for (const t of points) {
        video.currentTime = Math.max(0, t);
        await new Promise<void>((res) => {
          video.onseeked = () => res();
          setTimeout(() => res(), 800);
        });
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        keyframes.push(canvas.toDataURL('image/png'));
      }
    }
  } catch {
    // Keep playable video artifact even if keyframe seek fails
  }

  return {
    id: `media-vid-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    kind: 'video',
    title: file.name,
    prompt: `Local video file (${width || '?'}x${height || '?'})`,
    createdAt: Date.now(),
    mimeType: file.type || 'video/mp4',
    dataUrl,
    durationSec: durationSec || undefined,
    width: width || undefined,
    height: height || undefined,
    sizeBytes: file.size,
    sourceDocIds: [],
    keyframes,
  };
}
