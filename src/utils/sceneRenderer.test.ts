import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyVisualTheme,
  hashPromptSeed,
  inferMediaIntentFromPrompt,
  parseScenePrompt,
} from './sceneRenderer';

test('classifyVisualTheme maps creative prompts to distinct visual themes', () => {
  assert.equal(classifyVisualTheme('Neon cyberpunk city in midnight rain'), 'cyberpunk');
  assert.equal(classifyVisualTheme('Golden sunset over misty mountains'), 'sunset');
  assert.equal(classifyVisualTheme('Deep space nebula with a ringed planet'), 'cosmos');
  assert.equal(classifyVisualTheme('Ocean waves under full moon light'), 'ocean');
  assert.equal(classifyVisualTheme('Emerald forest dawn with fireflies'), 'forest');
  assert.equal(classifyVisualTheme('Snowy cabin in winter mountains'), 'snow');
  assert.equal(classifyVisualTheme('Minimalist geometric gradient artwork'), 'abstract');
});

test('parseScenePrompt extracts multi-subject scenes, colors, weather, and Bengali prompts', () => {
  const carScene = parseScenePrompt('A red sports car driving by the ocean at sunset');
  assert.ok(carScene.subjects.includes('car'));
  assert.equal(carScene.theme, 'ocean');
  assert.equal(carScene.celestial, 'sun');
  assert.equal(carScene.palette.primary, '#DC2626');
  assert.equal(carScene.palette.skyBottom, '#F59E0B');

  const rocketScene = parseScenePrompt('A rocket launching toward a ringed planet in starry cosmos');
  assert.ok(rocketScene.subjects.includes('rocket'));
  assert.equal(rocketScene.theme, 'cosmos');
  assert.equal(rocketScene.celestial, 'ringed_planet');
  assert.equal(rocketScene.weather, 'stars');

  const bengaliBoat = parseScenePrompt('ekta nouka nodite cholche chad er aloy');
  assert.ok(bengaliBoat.subjects.includes('boat'));
  assert.equal(bengaliBoat.theme, 'ocean');
  assert.equal(bengaliBoat.celestial, 'full_moon');
});

test('inferMediaIntentFromPrompt routes arbitrary creative prompts to creative and explicit doc prompts to briefing', () => {
  assert.equal(inferMediaIntentFromPrompt('A cat sitting on a rooftop'), 'creative');
  assert.equal(inferMediaIntentFromPrompt('Red sports car in rain'), 'creative');
  assert.equal(inferMediaIntentFromPrompt('Cyberpunk city skyline at night'), 'creative');
  assert.equal(inferMediaIntentFromPrompt('Executive Document Briefing Visual'), 'briefing');
  assert.equal(inferMediaIntentFromPrompt('Summarize Q3 audit PDF findings'), 'briefing');
});

test('hashPromptSeed returns deterministic 32-bit unsigned integers', () => {
  const a = hashPromptSeed('Sunset lake');
  const b = hashPromptSeed('  sunset lake ');
  const c = hashPromptSeed('Cyberpunk city');
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.ok(a >= 0);
});
