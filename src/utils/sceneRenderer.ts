import {
  drawCelestialBody,
  drawSubject,
  drawWeatherLayer,
  PaletteColors,
  SubjectKind,
} from './subjectRenderer';

export type VisualTheme =
  | 'sunset'
  | 'cyberpunk'
  | 'cosmos'
  | 'ocean'
  | 'forest'
  | 'snow'
  | 'desert'
  | 'day'
  | 'abstract';

export type CelestialKind =
  | 'sun'
  | 'full_moon'
  | 'crescent_moon'
  | 'ringed_planet'
  | 'rainbow'
  | 'none';

export type WeatherKind =
  | 'clear'
  | 'rain'
  | 'snow'
  | 'lightning'
  | 'petals'
  | 'fireflies'
  | 'stars'
  | 'embers';

export interface ParsedSceneSpec {
  theme: VisualTheme;
  subjects: SubjectKind[];
  celestial: CelestialKind;
  weather: WeatherKind;
  palette: PaletteColors;
  description: string;
}

export function hashPromptSeed(prompt: string): number {
  let hash = 2166136261;
  const normalized = prompt.trim().toLowerCase() || 'cairn-scene';
  for (let i = 0; i < normalized.length; i++) {
    hash ^= normalized.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createRng(seed: number): () => number {
  let state = seed || 1;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function classifyVisualTheme(prompt: string): VisualTheme {
  const q = prompt.toLowerCase();

  if (
    /\b(cyber|neon|city|skyline|futuristic|sci-fi|scifi|synth|matrix|tokyo|night\s*street|shohor|highway|road)\b|শহর|রাস্তা/.test(
      q
    )
  ) {
    return 'cyberpunk';
  }
  if (
    /\b(snow|winter|ice|glacier|frost|arctic|blizzard|tushar|sheet)\b|বরফ|শীত/.test(
      q
    )
  ) {
    return 'snow';
  }
  if (/\b(desert|dune|dunes|sahara|pyramid|oasis|morubhumi)\b|মরুভূমি/.test(q)) {
    return 'desert';
  }
  if (
    /\b(ocean|sea|wave|waves|beach|waterfall|samudr\w*|island|river|lake|nodi\w*|water)\b|সমুদ্র|নদী|সাগর|বৃষ্টি/.test(
      q
    )
  ) {
    return 'ocean';
  }
  if (
    /\b(space|galaxy|nebula|cosmos|planet|saturn|orbit|astronaut|universe|rocket|spaceship|meteor|akash\w*)\b|মহাকাশ|গ্রহ|রকেট/.test(
      q
    )
  ) {
    return 'cosmos';
  }
  if (
    /\b(forest|tree|trees|jungle|nature|garden|meadow|valley|leaf|leaves|firefly|bon\w*|gach\w*|woods|village|gram\w*)\b|বন|গাছ|বাগান|গ্রাম/.test(
      q
    )
  ) {
    return 'forest';
  }
  if (
    /\b(sunset|sunrise|mountain|mountains|hill|hills|dawn|dusk|golden|horizon|surj\w*|pahad\w*|evening|sondha\w*)\b|সূর্যাস্ত|পাহাড়|সূর্য/.test(
      q
    )
  ) {
    return 'sunset';
  }
  if (
    /\b(day|morning|sunny|bright|afternoon|park|field|sokal|dupur)\b|সকাল|দুপুর|রৌদ্র/.test(
      q
    )
  ) {
    return 'day';
  }

  return 'abstract';
}

function resolveColorOverride(
  prompt: string,
  theme: VisualTheme
): PaletteColors {
  const q = prompt.toLowerCase();

  const defaults: Record<VisualTheme, PaletteColors> = {
    sunset: {
      primary: '#EA580C',
      secondary: '#7C2D12',
      accent: '#FACC15',
      glow: 'rgba(251, 146, 60, 0.45)',
      skyTop: '#0F172A',
      skyMid: '#4C1D95',
      skyBottom: '#F59E0B',
      groundTop: '#1E1B4B',
      groundBottom: '#020617',
    },
    cyberpunk: {
      primary: '#EC4899',
      secondary: '#3B0764',
      accent: '#22D3EE',
      glow: 'rgba(34, 211, 238, 0.42)',
      skyTop: '#040714',
      skyMid: '#1E1042',
      skyBottom: '#4C1D95',
      groundTop: '#050816',
      groundBottom: '#020617',
    },
    cosmos: {
      primary: '#0F766E',
      secondary: '#1E1B4B',
      accent: '#5EEAD4',
      glow: 'rgba(94, 234, 212, 0.35)',
      skyTop: '#020617',
      skyMid: '#090D24',
      skyBottom: '#1E1B4B',
      groundTop: '#090D24',
      groundBottom: '#020617',
    },
    ocean: {
      primary: '#0D9488',
      secondary: '#134E4A',
      accent: '#5EEAD4',
      glow: 'rgba(45, 212, 191, 0.3)',
      skyTop: '#020617',
      skyMid: '#0F172A',
      skyBottom: '#134E4A',
      groundTop: '#0F766E',
      groundBottom: '#042F2E',
    },
    forest: {
      primary: '#059669',
      secondary: '#064E3B',
      accent: '#6EE7B7',
      glow: 'rgba(110, 231, 183, 0.28)',
      skyTop: '#022C22',
      skyMid: '#064E3B',
      skyBottom: '#0F172A',
      groundTop: '#065F46',
      groundBottom: '#022C22',
    },
    snow: {
      primary: '#0284C7',
      secondary: '#1E293B',
      accent: '#BAE6FD',
      glow: 'rgba(186, 230, 253, 0.35)',
      skyTop: '#0F172A',
      skyMid: '#1E3A5F',
      skyBottom: '#94A3B8',
      groundTop: '#E2E8F0',
      groundBottom: '#94A3B8',
    },
    desert: {
      primary: '#D97706',
      secondary: '#78350F',
      accent: '#FDE68A',
      glow: 'rgba(251, 191, 36, 0.45)',
      skyTop: '#451A03',
      skyMid: '#B45309',
      skyBottom: '#FCD34D',
      groundTop: '#D97706',
      groundBottom: '#78350F',
    },
    day: {
      primary: '#0EA5E9',
      secondary: '#0369A1',
      accent: '#FACC15',
      glow: 'rgba(250, 204, 21, 0.38)',
      skyTop: '#0284C7',
      skyMid: '#38BDF8',
      skyBottom: '#BAE6FD',
      groundTop: '#15803D',
      groundBottom: '#14532D',
    },
    abstract: {
      primary: '#0D9488',
      secondary: '#1E1B4B',
      accent: '#5EEAD4',
      glow: 'rgba(94, 234, 212, 0.35)',
      skyTop: '#0F172A',
      skyMid: '#134E4A',
      skyBottom: '#1E1B4B',
      groundTop: '#0F172A',
      groundBottom: '#020617',
    },
  };

  const base = { ...defaults[theme] };

  // Honor sunset/sunrise or bright daytime sky modifiers even when environment theme is ocean/forest/snow
  if (
    theme !== 'sunset' &&
    /\b(sunset|sunrise|dawn|dusk|golden|horizon|surj\w*|evening|sondha\w*)\b|সূর্যাস্ত|সূর্য/.test(q)
  ) {
    base.skyTop = defaults.sunset.skyTop;
    base.skyMid = '#7C2D12';
    base.skyBottom = defaults.sunset.skyBottom;
    base.glow = defaults.sunset.glow;
  } else if (
    theme !== 'day' &&
    theme !== 'sunset' &&
    /\b(day|morning|sunny|bright|afternoon|sokal|dupur)\b|সকাল|দুপুর|রৌদ্র/.test(q)
  ) {
    base.skyTop = defaults.day.skyTop;
    base.skyMid = defaults.day.skyMid;
    base.skyBottom = defaults.day.skyBottom;
    base.glow = defaults.day.glow;
  }

  if (/\b(red|crimson|scarlet|ruby|lal)\b|লাল/.test(q)) {
    base.primary = '#DC2626';
    base.accent = '#FCA5A5';
    base.glow = 'rgba(239, 68, 68, 0.42)';
  } else if (/\b(blue|azure|sapphire|cobalt|nil)\b|নীল/.test(q)) {
    base.primary = '#2563EB';
    base.accent = '#93C5FD';
    base.glow = 'rgba(59, 130, 246, 0.4)';
  } else if (/\b(green|emerald|jade|sobuj)\b|সবুজ/.test(q)) {
    base.primary = '#16A34A';
    base.accent = '#86EFAC';
    base.glow = 'rgba(34, 197, 94, 0.38)';
  } else if (/\b(purple|violet|lavender|amethyst|beguni)\b|বেগুনি/.test(q)) {
    base.primary = '#9333EA';
    base.accent = '#D8B4FE';
    base.glow = 'rgba(168, 85, 247, 0.4)';
  } else if (/\b(pink|rose|magenta|sakura|cherry|golapi)\b|গোলাপি/.test(q)) {
    base.primary = '#EC4899';
    base.accent = '#FBCFE8';
    base.glow = 'rgba(244, 114, 182, 0.42)';
  } else if (/\b(gold|golden|amber|yellow|shonali|holud)\b|সোনালি|হলুদ/.test(q)) {
    base.primary = '#D97706';
    base.accent = '#FDE047';
    base.glow = 'rgba(250, 204, 21, 0.44)';
  }

  return base;
}

const SUBJECT_PATTERNS: Array<{ kind: SubjectKind; pattern: RegExp }> = [
  { kind: 'rocket', pattern: /\b(rocket|spaceship|shuttle|launch|missile)\b|রকেট/i },
  { kind: 'astronaut', pattern: /\b(astronaut|spaceman|cosmonaut)\b|মহাকাশচারী/i },
  { kind: 'car', pattern: /\b(car|sports\s*car|ferrari|lamborghini|sedan|taxi|truck|bus|vehicle|gari\w*)\b|গাড়ি/i },
  { kind: 'boat', pattern: /\b(boat|ship|sailboat|yacht|canoe|ferry|nouka\w*)\b|নৌকা|জাহাজ/i },
  { kind: 'bicycle', pattern: /\b(bicycle|bike|cycle|cyclist)\b|সাইকেল/i },
  { kind: 'airplane', pattern: /\b(airplane|plane|jet|aircraft|flight|biman\w*)\b|বিমান/i },
  { kind: 'cat', pattern: /\b(cat|kitten|kitty|feline|beral\w*|biral\w*)\b|বিড়াল/i },
  { kind: 'dog', pattern: /\b(dog|puppy|hound|canine|kukur\w*)\b|কুকুর/i },
  { kind: 'dragon', pattern: /\b(dragon|wyvern)\b|ড্রাগন/i },
  { kind: 'bird', pattern: /\b(bird|birds|eagle|owl|seagull|crow|dove|pakhi\w*)\b|পাখি/i },
  { kind: 'butterfly', pattern: /\b(butterfly|butterflies|projapoti\w*)\b|প্রজাপতি/i },
  { kind: 'whale', pattern: /\b(whale|dolphin|shark|timi\w*)\b|তিমি/i },
  { kind: 'fish', pattern: /\b(fish|fishes|koi|mach\w*)\b|মাছ/i },
  { kind: 'robot', pattern: /\b(robot|android|cyborg|mech|drone)\b|রোবট/i },
  { kind: 'castle', pattern: /\b(castle|fortress|palace|kingdom|durgo\w*)\b|দুর্গ|প্রাসাদ/i },
  { kind: 'lighthouse', pattern: /\b(lighthouse|beacon)\b|বাতিঘর/i },
  { kind: 'house', pattern: /\b(house|home|cabin|cottage|hut|bari\w*|ghor\w*)\b|বাড়ি|ঘর/i },
  { kind: 'bridge', pattern: /\b(bridge|setu\w*)\b|সেতু/i },
  { kind: 'campfire', pattern: /\b(campfire|bonfire|fire|flame|agun\w*)\b|আগুন/i },
  { kind: 'flower', pattern: /\b(flower|flowers|rose|lotus|tulip|sunflower|ful\w*)\b|ফুল|গোলাপ|পদ্ম/i },
  { kind: 'kite', pattern: /\b(kite|ghuri\w*)\b|ঘুড়ি/i },
  { kind: 'tree', pattern: /\b(tree|trees|sakura|palm|pine|oak|gach\w*)\b|গাছ/i },
  { kind: 'person', pattern: /\b(person|boy|girl|man|woman|hiker|traveler|child|silhouette|manush\w*|chele\w*|meye\w*)\b|মানুষ|ছেলে|মেয়ে/i },
];

export function parseScenePrompt(prompt: string): ParsedSceneSpec {
  const q = prompt.toLowerCase();
  let theme = classifyVisualTheme(prompt);

  const subjects: SubjectKind[] = [];
  for (const entry of SUBJECT_PATTERNS) {
    if (entry.pattern.test(q) && !subjects.includes(entry.kind)) {
      subjects.push(entry.kind);
      if (subjects.length >= 4) break;
    }
  }

  if (theme === 'abstract') {
    if (subjects.includes('boat') || subjects.includes('fish') || subjects.includes('whale') || subjects.includes('lighthouse')) {
      theme = 'ocean';
    } else if (subjects.includes('rocket') || subjects.includes('astronaut')) {
      theme = 'cosmos';
    } else if (subjects.includes('tree') || subjects.includes('flower') || subjects.includes('butterfly')) {
      theme = 'forest';
    }
  }

  const palette = resolveColorOverride(prompt, theme);

  let celestial: CelestialKind = 'none';
  if (/\b(rainbow|ramdhenu)\b|রংধনু/.test(q)) {
    celestial = 'rainbow';
  } else if (/\b(crescent|eid|half\s*moon)\b/.test(q)) {
    celestial = 'crescent_moon';
  } else if (/\b(moon|moonlight|lunar|chad|chand|night|midnight)\b|চাঁদ|রাত/.test(q)) {
    celestial = 'full_moon';
  } else if (/\b(planet|saturn|ringed)\b|গ্রহ/.test(q)) {
    celestial = 'ringed_planet';
  } else if (
    /\b(sun|sunset|sunrise|sunny|morning|dawn|surjo)\b|সূর্য/.test(q) ||
    theme === 'sunset' ||
    theme === 'day' ||
    theme === 'desert'
  ) {
    celestial = 'sun';
  } else if (theme === 'cosmos') {
    celestial = 'ringed_planet';
  } else if (theme === 'ocean') {
    celestial = 'full_moon';
  }

  let weather: WeatherKind = 'clear';
  if (/\b(lightning|thunder|storm|jhor)\b|বজ্র|ঝড়/.test(q)) {
    weather = 'lightning';
  } else if (/\b(rain|rainy|brishti)\b|বৃষ্টি/.test(q)) {
    weather = 'rain';
  } else if (/\b(snow|snowing|blizzard|tushar)\b|বরফ/.test(q) || theme === 'snow') {
    weather = 'snow';
  } else if (/\b(sakura|cherry\s*blossom|petal|petals)\b/.test(q)) {
    weather = 'petals';
  } else if (/\b(firefly|fireflies|jonaki)\b/.test(q) || theme === 'forest') {
    weather = 'fireflies';
  } else if (/\b(ember|embers|spark|sparks|volcano)\b/.test(q) || subjects.includes('campfire')) {
    weather = 'embers';
  } else if (
    /\b(star|stars|starry|galaxy|cosmos|night|midnight|tara)\b|তারা/.test(q) ||
    theme === 'cosmos'
  ) {
    weather = 'stars';
  }

  const parts: string[] = [];
  if (subjects.length > 0) parts.push(subjects.join(', '));
  parts.push(`${theme} scene`);
  if (weather !== 'clear') parts.push(weather);

  return {
    theme,
    subjects,
    celestial,
    weather,
    palette,
    description: parts.join(' · '),
  };
}

export function inferMediaIntentFromPrompt(
  prompt: string
): 'creative' | 'briefing' {
  const q = prompt.toLowerCase().trim();
  if (!q) return 'briefing';

  const hasExplicitBriefingIntent =
    /\b(briefing|document|documents|doc|docs|pdf|docx|txt|summarize|audit|findings|executive|selected files|vault)\b/.test(
      q
    );

  if (hasExplicitBriefingIntent) {
    return 'briefing';
  }
  return 'creative';
}

function wrapLines(
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

function drawEnvironmentBackdrop(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  spec: ParsedSceneSpec,
  rng: () => number,
  t: number
) {
  const { theme, palette } = spec;

  // Sky gradient
  const sky = ctx.createLinearGradient(0, 0, 0, h * 0.74);
  sky.addColorStop(0, palette.skyTop);
  sky.addColorStop(0.55, palette.skyMid);
  sky.addColorStop(1, palette.skyBottom);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  // Drifting atmospheric clouds for non-space scenes
  if (theme !== 'cosmos') {
    for (let c = 0; c < 5; c++) {
      const baseX = ((rng() * w + t * (32 + c * 12)) % (w + 280)) - 140;
      const cy = h * (0.14 + rng() * 0.24);
      const cw = 100 + rng() * 110;
      ctx.fillStyle =
        theme === 'day'
          ? 'rgba(255, 255, 255, 0.42)'
          : 'rgba(248, 250, 252, 0.1)';
      ctx.beginPath();
      ctx.ellipse(baseX, cy, cw, 16 + rng() * 10, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Celestial body (sun, moon, planet, rainbow)
  drawCelestialBody(ctx, w, h, spec.celestial, palette, t);

  // Theme-specific mid-ground & terrain
  if (theme === 'cyberpunk') {
    const horizonY = h * 0.68;
    const count = 24;
    const slotW = w / count;
    for (let i = 0; i < count; i++) {
      const bw = slotW * (0.76 + rng() * 0.34);
      const bh = h * (0.12 + rng() * 0.34);
      const bx = i * slotW - 4;
      const by = horizonY - bh;
      ctx.fillStyle = i % 2 === 0 ? '#090D1F' : '#111633';
      ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = i % 2 === 0 ? palette.accent : palette.primary;
      ctx.fillRect(bx, by, bw, 2);

      const cols = Math.max(2, Math.floor(bw / 11));
      const rows = Math.max(3, Math.floor(bh / 14));
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (rng() > 0.62) {
            ctx.fillStyle =
              (r + c) % 4 === 0
                ? 'rgba(244, 114, 182, 0.55)'
                : 'rgba(34, 211, 238, 0.5)';
            ctx.fillRect(bx + 4 + c * 9, by + 8 + r * 12, 4, 6);
          }
        }
      }
    }

    ctx.fillStyle = palette.groundTop;
    ctx.fillRect(0, horizonY, w, h - horizonY);
    ctx.strokeStyle = 'rgba(34, 211, 238, 0.35)';
    ctx.lineWidth = 1;
    const vanishX = w * 0.5;
    for (let i = -12; i <= 12; i++) {
      ctx.beginPath();
      ctx.moveTo(vanishX + i * 24, horizonY);
      ctx.lineTo(vanishX + i * 130, h);
      ctx.stroke();
    }
    return;
  }

  if (theme === 'cosmos') {
    const nebulaColors = [
      'rgba(20, 184, 166, 0.22)',
      'rgba(168, 85, 247, 0.22)',
      palette.glow,
    ];
    for (let n = 0; n < 6; n++) {
      const nx = w * (0.18 + rng() * 0.64) + Math.sin(t * Math.PI * 2 + n) * 16;
      const ny = h * (0.2 + rng() * 0.6) + Math.cos(t * Math.PI * 2 + n) * 12;
      const nr = Math.min(w, h) * (0.2 + rng() * 0.2);
      const ng = ctx.createRadialGradient(nx, ny, 0, nx, ny, nr);
      ng.addColorStop(0, nebulaColors[n % nebulaColors.length]);
      ng.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = ng;
      ctx.beginPath();
      ctx.arc(nx, ny, nr, 0, Math.PI * 2);
      ctx.fill();
    }
    return;
  }

  if (theme === 'ocean') {
    const waveColors =
      spec.celestial === 'sun'
        ? ['#0369A1', '#0E7490', '#0F766E', '#042F2E']
        : ['#0E7490', '#115E59', '#134E4A', '#042F2E'];
    for (let layer = 0; layer < 4; layer++) {
      const baseY = h * (0.56 + layer * 0.1);
      const amp = 12 + layer * 4;
      const freq = 0.011 - layer * 0.0015;
      const speed = (layer + 1) * Math.PI * 2;
      ctx.fillStyle = waveColors[layer];
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let x = 0; x <= w; x += 14) {
        const y =
          baseY +
          Math.sin(x * freq + t * speed + layer) * amp +
          Math.cos(x * freq * 0.5 - t * speed * 0.6) * (amp * 0.45);
        ctx.lineTo(x, y);
      }
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fill();
    }
    if (spec.celestial === 'sun') {
      const sunX = w * 0.72;
      for (let s = 0; s < 5; s++) {
        const sy = h * (0.58 + s * 0.032);
        const sw = 74 - s * 10 + Math.sin(t * Math.PI * 4 + s) * 8;
        ctx.fillStyle = `rgba(253, 224, 71, ${(0.34 - s * 0.05).toFixed(2)})`;
        ctx.beginPath();
        ctx.ellipse(sunX + Math.sin(t * 6 + s) * 6, sy, sw, 3.2, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    return;
  }

  if (theme === 'desert') {
    const dunes = [
      { y: h * 0.62, amp: 36, color: '#B45309' },
      { y: h * 0.72, amp: 28, color: '#D97706' },
      { y: h * 0.82, amp: 20, color: '#92400E' },
    ];
    for (const d of dunes) {
      ctx.fillStyle = d.color;
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let x = 0; x <= w; x += 16) {
        ctx.lineTo(x, d.y + Math.sin(x * 0.006 + d.amp) * d.amp);
      }
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fill();
    }
    return;
  }

  // Mountain / hill silhouette layers + ground plane (sunset, forest, snow, day, abstract)
  const hillLayers =
    theme === 'snow'
      ? [
          { baseY: h * 0.58, amp: h * 0.14, color: '#475569', freq: 0.006 },
          { baseY: h * 0.67, amp: h * 0.1, color: '#CBD5E1', freq: 0.0085 },
        ]
      : theme === 'forest'
      ? [
          { baseY: h * 0.62, amp: h * 0.09, color: '#065F46', freq: 0.0055 },
          { baseY: h * 0.7, amp: h * 0.06, color: '#047857', freq: 0.008 },
        ]
      : [
          { baseY: h * 0.6, amp: h * 0.11, color: palette.secondary, freq: 0.0055 },
          { baseY: h * 0.68, amp: h * 0.08, color: palette.groundTop, freq: 0.008 },
        ];

  for (const layer of hillLayers) {
    const phase = rng() * 8;
    ctx.fillStyle = layer.color;
    ctx.beginPath();
    ctx.moveTo(0, h * 0.76);
    for (let x = 0; x <= w; x += 16) {
      const n =
        Math.sin(x * layer.freq + phase) * layer.amp * 0.65 +
        Math.cos(x * layer.freq * 2.1 + phase) * layer.amp * 0.35;
      ctx.lineTo(x, layer.baseY - Math.abs(n));
    }
    ctx.lineTo(w, h * 0.76);
    ctx.closePath();
    ctx.fill();
  }

  // Ground or lake plane
  const groundGrad = ctx.createLinearGradient(0, h * 0.72, 0, h);
  groundGrad.addColorStop(0, palette.groundTop);
  groundGrad.addColorStop(1, palette.groundBottom);
  ctx.fillStyle = groundGrad;
  ctx.fillRect(0, h * 0.72, w, h * 0.28);

  if (theme === 'abstract' && spec.subjects.length === 0) {
    for (let r = 0; r < 3; r++) {
      ctx.fillStyle =
        r % 2 === 0 ? 'rgba(94, 234, 212, 0.2)' : 'rgba(168, 85, 247, 0.18)';
      ctx.beginPath();
      const baseY = h * (0.34 + r * 0.15);
      ctx.moveTo(0, h);
      for (let x = 0; x <= w; x += 24) {
        const y =
          baseY +
          Math.sin(x * 0.006 + t * Math.PI * 2 + r * 1.4) * 52 +
          Math.cos(x * 0.011 - t * Math.PI * 2) * 24;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fill();
    }
  }
}

export function renderCreativeSceneFrame(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  options: {
    prompt: string;
    theme?: VisualTheme;
    time?: number;
    mode: 'artwork' | 'poster' | 'scene' | 'motion';
    title?: string;
    subtitle?: string;
  }
): void {
  const seed = hashPromptSeed(options.prompt);
  const rng = createRng(seed);
  const spec = parseScenePrompt(options.prompt);
  if (options.theme) {
    spec.theme = options.theme;
  }
  const t = options.time ?? 0.35;

  // Subtle cinematic camera zoom for video frames
  const isVideoMode = options.mode === 'scene' || options.mode === 'motion';
  const zoom = isVideoMode ? 1 + Math.sin(t * Math.PI) * 0.035 : 1;

  ctx.save();
  if (zoom !== 1) {
    ctx.translate(width / 2, height / 2);
    ctx.scale(zoom, zoom);
    ctx.translate(-width / 2, -height / 2);
  }

  drawEnvironmentBackdrop(ctx, width, height, spec, rng, t);

  // Render all concrete subjects detected from the prompt
  spec.subjects.forEach((subject, idx) => {
    drawSubject(
      ctx,
      subject,
      width,
      height,
      idx,
      spec.subjects.length,
      spec.palette,
      t
    );
  });

  // Render weather & atmospheric particles on top
  drawWeatherLayer(ctx, width, height, spec.weather, rng, t);
  ctx.restore();

  if (options.mode === 'poster' || options.mode === 'motion') {
    const bottomSafeOffset = options.mode === 'motion' ? 56 : 0;
    const scrimTop = height * 0.42;
    const scrim = ctx.createLinearGradient(0, scrimTop, 0, height);
    scrim.addColorStop(0, 'rgba(2, 6, 23, 0)');
    scrim.addColorStop(0.55, 'rgba(2, 6, 23, 0.58)');
    scrim.addColorStop(1, 'rgba(2, 6, 23, 0.88)');
    ctx.fillStyle = scrim;
    ctx.fillRect(0, scrimTop, width, height - scrimTop);

    const headline = (options.title || options.prompt || 'Visual Studio').trim();
    ctx.fillStyle = '#5EEAD4';
    ctx.font = '600 13px "JetBrains Mono", monospace';
    ctx.fillText(spec.description.toUpperCase(), 48, height - 144 - bottomSafeOffset);

    ctx.fillStyle = '#F8FAFC';
    ctx.font = '700 30px "Plus Jakarta Sans", sans-serif';
    const titleLines = wrapLines(ctx, headline, width - 96).slice(0, 2);
    let y = height - 108 - bottomSafeOffset;
    for (const line of titleLines) {
      ctx.fillText(line, 48, y);
      y += 38;
    }

    if (options.subtitle) {
      ctx.fillStyle = '#CBD5E1';
      ctx.font = '400 16px "DM Sans", sans-serif';
      ctx.fillText(options.subtitle.slice(0, 90), 48, height - 34 - bottomSafeOffset);
    }
  }
}
