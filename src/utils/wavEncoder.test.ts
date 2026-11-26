import test from 'node:test';
import assert from 'node:assert/strict';
import { computeWaveformPeaks, encodePcmToWav, synthesizeAcousticBriefing } from './wavEncoder';

test('encodePcmToWav writes valid RIFF WAVE header and byte length', () => {
  const samples = new Float32Array([0, 0.5, -0.5, 0.25]);
  const wav = encodePcmToWav(samples, 22050);

  assert.equal(wav.length, 44 + samples.length * 2);
  const header = String.fromCharCode(wav[0], wav[1], wav[2], wav[3]);
  const format = String.fromCharCode(wav[8], wav[9], wav[10], wav[11]);
  assert.equal(header, 'RIFF');
  assert.equal(format, 'WAVE');
});

test('computeWaveformPeaks normalizes amplitudes between 0 and 1', () => {
  const samples = new Float32Array([0.1, -0.8, 0.2, 0.4, -0.3, 0.9]);
  const peaks = computeWaveformPeaks(samples, 3);
  assert.equal(peaks.length, 3);
  assert.equal(peaks[0], 0.8);
  assert.equal(peaks[1], 0.4);
  assert.equal(peaks[2], 0.9);
});

test('synthesizeAcousticBriefing generates deterministic playable WAV bytes', () => {
  const result = synthesizeAcousticBriefing({ durationSec: 3, sampleRate: 16000, seedText: 'Audit Q3' });
  assert.equal(result.durationSec, 3);
  assert.equal(result.sampleRate, 16000);
  assert.equal(result.wavBytes.length, 44 + 3 * 16000 * 2);
  assert.equal(result.waveformPeaks.length, 44);
});
