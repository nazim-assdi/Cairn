/**
 * Pure TypeScript PCM WAV encoder and acoustic briefing signal generator.
 * Runs 100% locally with zero network or hardware audio dependencies.
 */

export interface WavSynthOptions {
  durationSec?: number;
  sampleRate?: number;
  seedText?: string;
}

export interface GeneratedWavResult {
  wavBytes: Uint8Array;
  durationSec: number;
  sampleRate: number;
  waveformPeaks: number[];
}

export function encodePcmToWav(samples: Float32Array, sampleRate = 22050): Uint8Array {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = samples.length * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    const int16 = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
    view.setInt16(offset, Math.round(int16), true);
    offset += 2;
  }

  return new Uint8Array(buffer);
}

function writeAscii(view: DataView, offset: number, text: string) {
  for (let i = 0; i < text.length; i++) {
    view.setUint8(offset + i, text.charCodeAt(i));
  }
}

export function computeWaveformPeaks(samples: Float32Array, barCount = 48): number[] {
  if (samples.length === 0 || barCount <= 0) return [];
  const blockSize = Math.max(1, Math.floor(samples.length / barCount));
  const peaks: number[] = [];

  for (let i = 0; i < barCount; i++) {
    const start = i * blockSize;
    const end = Math.min(samples.length, start + blockSize);
    let maxAmp = 0;
    for (let j = start; j < end; j++) {
      const abs = Math.abs(samples[j]);
      if (abs > maxAmp) maxAmp = abs;
    }
    peaks.push(Number(Math.min(1, maxAmp).toFixed(3)));
  }

  return peaks;
}

export function synthesizeAcousticBriefing(options: WavSynthOptions = {}): GeneratedWavResult {
  const sampleRate = options.sampleRate ?? 22050;
  const durationSec = Math.max(2, Math.min(12, options.durationSec ?? 5));
  const seedText = options.seedText || 'Local edge briefing';
  const totalSamples = Math.floor(sampleRate * durationSec);
  const samples = new Float32Array(totalSamples);

  // Derive deterministic harmonic palette from the briefing text
  let hash = 0;
  for (let i = 0; i < seedText.length; i++) {
    hash = (hash * 31 + seedText.charCodeAt(i)) >>> 0;
  }

  const rootFreqs = [220, 246.94, 261.63, 293.66, 329.63];
  const baseFreq = rootFreqs[hash % rootFreqs.length];
  const phraseCount = Math.max(3, Math.min(6, Math.floor(durationSec)));
  const phraseLen = totalSamples / phraseCount;

  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    const phraseIndex = Math.floor(i / phraseLen);
    const localPos = (i % phraseLen) / phraseLen;

    // Gentle speech-cadence envelope per phrase
    const attack = Math.min(1, localPos / 0.12);
    const release = Math.min(1, (1 - localPos) / 0.22);
    const syllableMod = 0.65 + 0.35 * Math.sin(2 * Math.PI * (3.2 + (phraseIndex % 3) * 0.7) * t);
    const env = attack * release * syllableMod;

    // Warm harmonic chime + soft pad
    const ratio = [1, 1.25, 1.5, 1.125, 1.333][phraseIndex % 5];
    const freq = baseFreq * ratio;
    const tone =
      0.42 * Math.sin(2 * Math.PI * freq * t) +
      0.18 * Math.sin(2 * Math.PI * (freq * 1.5) * t) +
      0.08 * Math.sin(2 * Math.PI * (freq * 2.0) * t);

    // Master fade in / fade out
    const masterFade = Math.min(1, t / 0.15) * Math.min(1, (durationSec - t) / 0.3);
    samples[i] = tone * env * masterFade * 0.55;
  }

  const wavBytes = encodePcmToWav(samples, sampleRate);
  const waveformPeaks = computeWaveformPeaks(samples, 44);

  return {
    wavBytes,
    durationSec,
    sampleRate,
    waveformPeaks,
  };
}
