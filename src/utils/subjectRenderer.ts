export type SubjectKind =
  | 'cat'
  | 'dog'
  | 'bird'
  | 'butterfly'
  | 'fish'
  | 'whale'
  | 'dragon'
  | 'car'
  | 'rocket'
  | 'boat'
  | 'bicycle'
  | 'airplane'
  | 'robot'
  | 'house'
  | 'castle'
  | 'lighthouse'
  | 'bridge'
  | 'tree'
  | 'flower'
  | 'astronaut'
  | 'person'
  | 'campfire'
  | 'kite';

export interface PaletteColors {
  primary: string;
  secondary: string;
  accent: string;
  glow: string;
  skyTop: string;
  skyMid: string;
  skyBottom: string;
  groundTop: string;
  groundBottom: string;
}

export function drawCelestialBody(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  celestial: 'sun' | 'full_moon' | 'crescent_moon' | 'ringed_planet' | 'rainbow' | 'none',
  palette: PaletteColors,
  t: number
): void {
  if (celestial === 'none') return;

  if (celestial === 'rainbow') {
    const cx = w * 0.5;
    const cy = h * 0.74;
    const baseR = Math.min(w, h) * 0.62;
    const colors = [
      'rgba(239, 68, 68, 0.28)',
      'rgba(249, 115, 22, 0.28)',
      'rgba(234, 179, 8, 0.28)',
      'rgba(34, 197, 94, 0.28)',
      'rgba(59, 130, 246, 0.28)',
      'rgba(168, 85, 247, 0.28)',
    ];
    colors.forEach((col, i) => {
      ctx.strokeStyle = col;
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.arc(cx, cy, baseR - i * 10, Math.PI, Math.PI * 2);
      ctx.stroke();
    });
    return;
  }

  if (celestial === 'sun') {
    const sx = w * 0.72;
    const sy = h * (0.28 + Math.sin(t * Math.PI) * 0.03);
    const sr = Math.min(w, h) * 0.11;
    const corona = ctx.createRadialGradient(sx, sy, sr * 0.25, sx, sy, sr * 3.1);
    corona.addColorStop(0, 'rgba(254, 243, 199, 0.95)');
    corona.addColorStop(0.35, palette.glow);
    corona.addColorStop(1, 'rgba(251, 146, 60, 0)');
    ctx.fillStyle = corona;
    ctx.beginPath();
    ctx.arc(sx, sy, sr * 3.1, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#FEF3C7';
    ctx.beginPath();
    ctx.arc(sx, sy, sr, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  if (celestial === 'full_moon' || celestial === 'crescent_moon') {
    const mx = w * 0.76;
    const my = h * 0.23;
    const mr = Math.min(w, h) * 0.082;
    const halo = ctx.createRadialGradient(mx, my, mr * 0.3, mx, my, mr * 3.2);
    halo.addColorStop(0, 'rgba(241, 245, 249, 0.85)');
    halo.addColorStop(0.35, 'rgba(148, 163, 184, 0.22)');
    halo.addColorStop(1, 'rgba(148, 163, 184, 0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(mx, my, mr * 3.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.fillStyle = '#F8FAFC';
    ctx.beginPath();
    ctx.arc(mx, my, mr, 0, Math.PI * 2);
    ctx.fill();
    if (celestial === 'crescent_moon') {
      ctx.fillStyle = palette.skyTop;
      ctx.beginPath();
      ctx.arc(mx + mr * 0.38, my - mr * 0.14, mr * 0.88, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Subtle lunar craters
      ctx.fillStyle = 'rgba(148, 163, 184, 0.24)';
      ctx.beginPath();
      ctx.arc(mx - mr * 0.28, my - mr * 0.15, mr * 0.2, 0, Math.PI * 2);
      ctx.arc(mx + mr * 0.22, my + mr * 0.25, mr * 0.14, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    return;
  }

  if (celestial === 'ringed_planet') {
    const px = w * 0.68;
    const py = h * 0.34;
    const pr = Math.min(w, h) * 0.13;

    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(-0.26);
    ctx.strokeStyle = 'rgba(94, 234, 212, 0.38)';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.ellipse(0, 0, pr * 2.1, pr * 0.44, 0, Math.PI, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    const pGrad = ctx.createRadialGradient(px - pr * 0.35, py - pr * 0.35, pr * 0.1, px, py, pr);
    pGrad.addColorStop(0, palette.accent);
    pGrad.addColorStop(0.6, palette.primary);
    pGrad.addColorStop(1, '#090D1F');
    ctx.fillStyle = pGrad;
    ctx.beginPath();
    ctx.arc(px, py, pr, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(-0.26);
    ctx.strokeStyle = 'rgba(153, 246, 228, 0.72)';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.ellipse(0, 0, pr * 2.1, pr * 0.44, 0, 0, Math.PI);
    ctx.stroke();
    ctx.restore();
  }
}

export function drawWeatherLayer(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  weather: 'clear' | 'rain' | 'snow' | 'lightning' | 'petals' | 'fireflies' | 'stars' | 'embers',
  rng: () => number,
  t: number
): void {
  if (weather === 'clear') return;

  if (weather === 'stars') {
    for (let i = 0; i < 95; i++) {
      const sx = (rng() * w + t * (4 + (i % 4) * 3)) % w;
      const sy = rng() * h * 0.72;
      const sr = 0.6 + rng() * 1.7;
      const alpha = 0.3 + 0.65 * Math.abs(Math.sin(t * Math.PI * 3 + i));
      ctx.fillStyle = `rgba(248, 250, 252, ${alpha.toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(sx, sy, sr, 0, Math.PI * 2);
      ctx.fill();
    }
    return;
  }

  if (weather === 'rain' || weather === 'lightning') {
    ctx.strokeStyle = 'rgba(186, 230, 253, 0.36)';
    ctx.lineWidth = 1.25;
    for (let i = 0; i < 65; i++) {
      const rx = ((rng() * w + t * 180) % (w + 40)) - 20;
      const ry = ((rng() * h + t * 540) % (h + 40)) - 20;
      ctx.beginPath();
      ctx.moveTo(rx, ry);
      ctx.lineTo(rx - 7, ry + 20);
      ctx.stroke();
    }
    if (weather === 'lightning' && Math.sin(t * Math.PI * 6) > 0.55) {
      const bx = w * (0.28 + rng() * 0.44);
      ctx.strokeStyle = 'rgba(224, 242, 254, 0.92)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(bx, 0);
      ctx.lineTo(bx - 24, h * 0.18);
      ctx.lineTo(bx + 18, h * 0.31);
      ctx.lineTo(bx - 16, h * 0.52);
      ctx.stroke();
    }
    return;
  }

  if (weather === 'snow') {
    for (let i = 0; i < 60; i++) {
      const sx = (rng() * w + Math.sin(t * Math.PI * 2 + i) * 32) % w;
      const sy = (rng() * h + t * (140 + (i % 5) * 28)) % h;
      const sr = 1.4 + rng() * 2.6;
      ctx.fillStyle = 'rgba(248, 250, 252, 0.8)';
      ctx.beginPath();
      ctx.arc(sx < 0 ? sx + w : sx, sy, sr, 0, Math.PI * 2);
      ctx.fill();
    }
    return;
  }

  if (weather === 'petals') {
    for (let i = 0; i < 36; i++) {
      const px = (rng() * w + t * 180 + Math.sin(t * Math.PI * 2 + i) * 24) % w;
      const py = (rng() * h + t * 130) % h;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(t * Math.PI * 4 + i);
      ctx.fillStyle = 'rgba(251, 207, 232, 0.78)';
      ctx.beginPath();
      ctx.ellipse(0, 0, 6, 3.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    return;
  }

  if (weather === 'fireflies') {
    for (let i = 0; i < 32; i++) {
      const fx = rng() * w + Math.sin(t * Math.PI * 2 + i) * 26;
      const fy = h * (0.28 + rng() * 0.62) + Math.cos(t * Math.PI * 2 + i * 1.4) * 18;
      const glow = 0.35 + 0.65 * Math.abs(Math.sin(t * Math.PI * 4 + i));
      ctx.fillStyle = `rgba(167, 243, 208, ${glow.toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(fx, fy, 2 + rng() * 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
    return;
  }

  if (weather === 'embers') {
    for (let i = 0; i < 36; i++) {
      const ex = w * (0.2 + rng() * 0.6) + Math.sin(t * Math.PI * 3 + i) * 24;
      const ey = h - ((rng() * h * 0.7 + t * 240) % (h * 0.8));
      const alpha = 0.35 + 0.6 * Math.abs(Math.cos(t * Math.PI * 4 + i));
      ctx.fillStyle = `rgba(251, 146, 60, ${alpha.toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(ex, ey, 1.5 + rng() * 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

export function drawSubject(
  ctx: CanvasRenderingContext2D,
  kind: SubjectKind,
  w: number,
  h: number,
  slotIndex: number,
  totalSlots: number,
  palette: PaletteColors,
  t: number
): void {
  const spreadX =
    totalSlots === 1
      ? w * 0.5
      : w * (0.24 + (slotIndex / Math.max(1, totalSlots - 1)) * 0.52);
  const s = Math.min(w, h) * (totalSlots > 2 ? 0.24 : 0.3);

  switch (kind) {
    case 'rocket': {
      const rx = w * 0.48 + Math.sin(t * Math.PI * 2) * 10;
      const ry = h * (0.64 - t * 0.36);
      const scale = s * 0.42;

      ctx.save();
      ctx.translate(rx, ry);
      ctx.rotate(-0.14);

      // Exhaust plume
      const flameH = scale * (0.9 + Math.abs(Math.sin(t * 28)) * 0.55);
      const fGrad = ctx.createLinearGradient(0, scale * 0.55, 0, scale * 0.55 + flameH);
      fGrad.addColorStop(0, '#FEF08A');
      fGrad.addColorStop(0.45, '#F97316');
      fGrad.addColorStop(1, 'rgba(239, 68, 68, 0)');
      ctx.fillStyle = fGrad;
      ctx.beginPath();
      ctx.moveTo(-scale * 0.22, scale * 0.55);
      ctx.lineTo(0, scale * 0.55 + flameH);
      ctx.lineTo(scale * 0.22, scale * 0.55);
      ctx.closePath();
      ctx.fill();

      // Smoke puffs
      for (let p = 0; p < 5; p++) {
        ctx.fillStyle = `rgba(226, 232, 240, ${(0.34 - p * 0.05).toFixed(2)})`;
        ctx.beginPath();
        ctx.arc(
          Math.sin(p * 2 + t * 8) * 14,
          scale * 0.9 + p * scale * 0.34,
          scale * (0.2 + p * 0.09),
          0,
          Math.PI * 2
        );
        ctx.fill();
      }

      // Fins
      ctx.fillStyle = palette.primary;
      ctx.beginPath();
      ctx.moveTo(-scale * 0.28, scale * 0.22);
      ctx.lineTo(-scale * 0.6, scale * 0.62);
      ctx.lineTo(-scale * 0.22, scale * 0.52);
      ctx.closePath();
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(scale * 0.28, scale * 0.22);
      ctx.lineTo(scale * 0.6, scale * 0.62);
      ctx.lineTo(scale * 0.22, scale * 0.52);
      ctx.closePath();
      ctx.fill();

      // Rocket fuselage
      const bodyGrad = ctx.createLinearGradient(-scale * 0.3, 0, scale * 0.3, 0);
      bodyGrad.addColorStop(0, '#E2E8F0');
      bodyGrad.addColorStop(0.5, '#FFFFFF');
      bodyGrad.addColorStop(1, '#94A3B8');
      ctx.fillStyle = bodyGrad;
      ctx.beginPath();
      ctx.moveTo(0, -scale * 0.95);
      ctx.quadraticCurveTo(scale * 0.36, -scale * 0.25, scale * 0.26, scale * 0.55);
      ctx.lineTo(-scale * 0.26, scale * 0.55);
      ctx.quadraticCurveTo(-scale * 0.36, -scale * 0.25, 0, -scale * 0.95);
      ctx.fill();

      // Nose cap
      ctx.fillStyle = palette.primary;
      ctx.beginPath();
      ctx.moveTo(0, -scale * 0.95);
      ctx.quadraticCurveTo(scale * 0.22, -scale * 0.55, scale * 0.21, -scale * 0.42);
      ctx.lineTo(-scale * 0.21, -scale * 0.42);
      ctx.quadraticCurveTo(-scale * 0.22, -scale * 0.55, 0, -scale * 0.95);
      ctx.fill();

      // Porthole window
      ctx.fillStyle = '#0EA5E9';
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, -scale * 0.08, scale * 0.14, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.restore();
      break;
    }

    case 'car': {
      const roadTop = h * 0.72;
      ctx.fillStyle = '#1E293B';
      ctx.fillRect(0, roadTop, w, h - roadTop);
      ctx.fillStyle = '#334155';
      ctx.fillRect(0, roadTop, w, 4);

      // Animated dashed road lane
      ctx.fillStyle = '#FDE047';
      const dashOffset = (t * 420) % 96;
      for (let x = -96; x < w + 96; x += 96) {
        ctx.fillRect(x - dashOffset, h * 0.85, 48, 5);
      }

      const cx = w * (0.28 + t * 0.44);
      const cy = h * 0.77;
      const cw = s * 1.15;
      const ch = s * 0.36;

      ctx.save();
      ctx.translate(cx, cy);

      // Headlight beam
      const beam = ctx.createLinearGradient(cw * 0.48, 0, cw * 1.45, 0);
      beam.addColorStop(0, 'rgba(254, 240, 138, 0.55)');
      beam.addColorStop(1, 'rgba(254, 240, 138, 0)');
      ctx.fillStyle = beam;
      ctx.beginPath();
      ctx.moveTo(cw * 0.46, -ch * 0.15);
      ctx.lineTo(cw * 1.45, -ch * 0.45);
      ctx.lineTo(cw * 1.45, ch * 0.38);
      ctx.lineTo(cw * 0.46, ch * 0.1);
      ctx.closePath();
      ctx.fill();

      // Car shadow
      ctx.fillStyle = 'rgba(2, 6, 23, 0.55)';
      ctx.beginPath();
      ctx.ellipse(0, ch * 0.42, cw * 0.52, ch * 0.16, 0, 0, Math.PI * 2);
      ctx.fill();

      // Sleek chassis
      const carGrad = ctx.createLinearGradient(0, -ch * 0.7, 0, ch * 0.3);
      carGrad.addColorStop(0, palette.accent);
      carGrad.addColorStop(0.45, palette.primary);
      carGrad.addColorStop(1, '#0F172A');
      ctx.fillStyle = carGrad;
      ctx.beginPath();
      ctx.moveTo(-cw * 0.48, ch * 0.24);
      ctx.lineTo(-cw * 0.46, -ch * 0.18);
      ctx.lineTo(-cw * 0.22, -ch * 0.56);
      ctx.lineTo(cw * 0.12, -ch * 0.56);
      ctx.lineTo(cw * 0.32, -ch * 0.2);
      ctx.lineTo(cw * 0.5, -ch * 0.04);
      ctx.lineTo(cw * 0.48, ch * 0.24);
      ctx.closePath();
      ctx.fill();

      // Cabin glass
      ctx.fillStyle = '#0F172A';
      ctx.beginPath();
      ctx.moveTo(-cw * 0.18, -ch * 0.2);
      ctx.lineTo(-cw * 0.14, -ch * 0.46);
      ctx.lineTo(cw * 0.1, -ch * 0.46);
      ctx.lineTo(cw * 0.24, -ch * 0.2);
      ctx.closePath();
      ctx.fill();

      // Wheels with spinning spokes
      const wheelR = ch * 0.3;
      for (const wx of [-cw * 0.29, cw * 0.29]) {
        ctx.fillStyle = '#090D16';
        ctx.beginPath();
        ctx.arc(wx, ch * 0.24, wheelR, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#CBD5E1';
        ctx.beginPath();
        ctx.arc(wx, ch * 0.24, wheelR * 0.56, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 2;
        for (let k = 0; k < 4; k++) {
          const ang = t * Math.PI * 10 + (k * Math.PI) / 2;
          ctx.beginPath();
          ctx.moveTo(wx, ch * 0.24);
          ctx.lineTo(
            wx + Math.cos(ang) * wheelR * 0.52,
            ch * 0.24 + Math.sin(ang) * wheelR * 0.52
          );
          ctx.stroke();
        }
      }
      ctx.restore();
      break;
    }

    case 'boat': {
      const bx = w * (0.28 + t * 0.42);
      const waveBob = Math.sin(t * Math.PI * 6) * 6;
      const by = h * 0.72 + waveBob;
      const bw = s * 0.92;
      const bh = s * 0.26;

      ctx.save();
      ctx.translate(bx, by);
      ctx.rotate(Math.sin(t * Math.PI * 4) * 0.045);

      // Sail or bamboo canopy (Nouka style)
      ctx.fillStyle = '#F8FAFC';
      ctx.beginPath();
      ctx.moveTo(0, -bh * 2.1);
      ctx.lineTo(bw * 0.36, -bh * 0.3);
      ctx.lineTo(0, -bh * 0.3);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = palette.accent;
      ctx.beginPath();
      ctx.moveTo(-bw * 0.04, -bh * 1.9);
      ctx.lineTo(-bw * 0.26, -bh * 0.35);
      ctx.lineTo(-bw * 0.04, -bh * 0.35);
      ctx.closePath();
      ctx.fill();

      // Mast
      ctx.strokeStyle = '#78350F';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -bh * 2.15);
      ctx.stroke();

      // Wooden hull
      const hullGrad = ctx.createLinearGradient(0, -bh * 0.2, 0, bh * 0.45);
      hullGrad.addColorStop(0, '#B45309');
      hullGrad.addColorStop(1, '#451A03');
      ctx.fillStyle = hullGrad;
      ctx.beginPath();
      ctx.moveTo(-bw * 0.52, -bh * 0.16);
      ctx.quadraticCurveTo(0, bh * 0.72, bw * 0.54, -bh * 0.16);
      ctx.lineTo(bw * 0.36, bh * 0.34);
      ctx.lineTo(-bw * 0.36, bh * 0.34);
      ctx.closePath();
      ctx.fill();

      // Warm deck lantern
      ctx.fillStyle = '#FDE047';
      ctx.beginPath();
      ctx.arc(-bw * 0.22, -bh * 0.26, 5, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
      break;
    }

    case 'cat': {
      const cx = spreadX;
      const cy = h * 0.72;
      const r = s * 0.28;

      ctx.save();
      ctx.translate(cx, cy);

      // Animated curling tail
      const tailSway = Math.sin(t * Math.PI * 4) * r * 0.35;
      ctx.strokeStyle = '#1E293B';
      ctx.lineWidth = r * 0.22;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(r * 0.55, r * 0.65);
      ctx.bezierCurveTo(r * 1.25, r * 0.55, r * 1.45 + tailSway, -r * 0.15, r * 1.05 + tailSway, -r * 0.55);
      ctx.stroke();

      // Seated body
      ctx.fillStyle = '#1E293B';
      ctx.beginPath();
      ctx.ellipse(0, r * 0.35, r * 0.65, r * 0.8, 0, 0, Math.PI * 2);
      ctx.fill();

      // Head + ears
      ctx.beginPath();
      ctx.arc(0, -r * 0.55, r * 0.48, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(-r * 0.44, -r * 0.78);
      ctx.lineTo(-r * 0.48, -r * 1.24);
      ctx.lineTo(-r * 0.1, -r * 0.96);
      ctx.closePath();
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(r * 0.44, -r * 0.78);
      ctx.lineTo(r * 0.48, -r * 1.24);
      ctx.lineTo(r * 0.1, -r * 0.96);
      ctx.closePath();
      ctx.fill();

      // Inner pink ears
      ctx.fillStyle = '#F472B6';
      ctx.beginPath();
      ctx.moveTo(-r * 0.38, -r * 0.82);
      ctx.lineTo(-r * 0.41, -r * 1.12);
      ctx.lineTo(-r * 0.18, -r * 0.93);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(r * 0.38, -r * 0.82);
      ctx.lineTo(r * 0.41, -r * 1.12);
      ctx.lineTo(r * 0.18, -r * 0.93);
      ctx.closePath();
      ctx.fill();

      // Blinking luminous eyes
      const blink = Math.abs(Math.sin(t * Math.PI * 2)) < 0.08 ? 0.15 : 1;
      ctx.fillStyle = '#FDE047';
      ctx.beginPath();
      ctx.ellipse(-r * 0.18, -r * 0.58, r * 0.085, r * 0.085 * blink, 0, 0, Math.PI * 2);
      ctx.ellipse(r * 0.18, -r * 0.58, r * 0.085, r * 0.085 * blink, 0, 0, Math.PI * 2);
      ctx.fill();

      // Whiskers
      ctx.strokeStyle = 'rgba(226, 232, 240, 0.7)';
      ctx.lineWidth = 1.4;
      for (const dir of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(dir * r * 0.22, -r * 0.45);
        ctx.lineTo(dir * r * 0.65, -r * 0.52);
        ctx.moveTo(dir * r * 0.22, -r * 0.38);
        ctx.lineTo(dir * r * 0.65, -r * 0.36);
        ctx.stroke();
      }
      ctx.restore();
      break;
    }

    case 'dog': {
      const dx = spreadX;
      const dy = h * 0.72;
      const r = s * 0.28;
      ctx.save();
      ctx.translate(dx, dy);
      const tailWag = Math.sin(t * Math.PI * 10) * r * 0.3;
      ctx.strokeStyle = '#92400E';
      ctx.lineWidth = r * 0.2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(r * 0.6, r * 0.35);
      ctx.quadraticCurveTo(r * 1.15, r * 0.1 + tailWag, r * 1.22, -r * 0.3 + tailWag);
      ctx.stroke();

      ctx.fillStyle = '#B45309';
      ctx.beginPath();
      ctx.ellipse(0, r * 0.35, r * 0.72, r * 0.62, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(-r * 0.35, -r * 0.42, r * 0.46, 0, Math.PI * 2);
      ctx.fill();

      // Floppy ear + snout
      ctx.fillStyle = '#78350F';
      ctx.beginPath();
      ctx.ellipse(-r * 0.14, -r * 0.36, r * 0.18, r * 0.36, 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#FDE68A';
      ctx.beginPath();
      ctx.ellipse(-r * 0.65, -r * 0.34, r * 0.24, r * 0.18, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0F172A';
      ctx.beginPath();
      ctx.arc(-r * 0.82, -r * 0.4, r * 0.08, 0, Math.PI * 2);
      ctx.arc(-r * 0.48, -r * 0.55, r * 0.06, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      break;
    }

    case 'bird': {
      for (let b = 0; b < 5; b++) {
        const bx = (w * (0.14 + b * 0.11 + t * 0.45)) % (w + 80) - 40;
        const by = h * (0.2 + (b % 3) * 0.07) + Math.sin(t * Math.PI * 4 + b) * 14;
        const flap = Math.sin(t * Math.PI * 10 + b * 1.2) * 12;
        const span = 18 + (b % 2) * 8;
        ctx.strokeStyle = '#0F172A';
        ctx.lineWidth = 2.8;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(bx - span, by - flap);
        ctx.quadraticCurveTo(bx - span * 0.45, by - 10, bx, by);
        ctx.quadraticCurveTo(bx + span * 0.45, by - 10, bx + span, by - flap);
        ctx.stroke();
      }
      break;
    }

    case 'butterfly': {
      for (let i = 0; i < 3; i++) {
        const bx = w * (0.28 + i * 0.2) + Math.sin(t * Math.PI * 2 + i) * 45;
        const by = h * (0.42 + (i % 2) * 0.12) + Math.cos(t * Math.PI * 4 + i) * 24;
        const flap = 0.4 + 0.6 * Math.abs(Math.sin(t * Math.PI * 10 + i));
        ctx.save();
        ctx.translate(bx, by);
        ctx.fillStyle = i % 2 === 0 ? palette.accent : '#F472B6';
        ctx.beginPath();
        ctx.ellipse(-12 * flap, -6, 14 * flap, 10, -0.3, 0, Math.PI * 2);
        ctx.ellipse(12 * flap, -6, 14 * flap, 10, 0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = palette.primary;
        ctx.beginPath();
        ctx.ellipse(-9 * flap, 8, 10 * flap, 8, 0.3, 0, Math.PI * 2);
        ctx.ellipse(9 * flap, 8, 10 * flap, 8, -0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#0F172A';
        ctx.fillRect(-2, -12, 4, 24);
        ctx.restore();
      }
      break;
    }

    case 'fish':
    case 'whale': {
      const fx = w * (0.22 + t * 0.56);
      const fy = h * 0.72 + Math.sin(t * Math.PI * 4) * 14;
      const scale = kind === 'whale' ? s * 0.72 : s * 0.34;
      const tailOsc = Math.sin(t * Math.PI * 8) * scale * 0.16;

      ctx.save();
      ctx.translate(fx, fy);
      ctx.fillStyle = kind === 'whale' ? '#1E3A8A' : '#F97316';
      ctx.beginPath();
      ctx.ellipse(0, 0, scale * 0.75, scale * 0.35, 0, 0, Math.PI * 2);
      ctx.fill();

      // Tail fin
      ctx.beginPath();
      ctx.moveTo(-scale * 0.65, 0);
      ctx.lineTo(-scale * 1.05, -scale * 0.35 + tailOsc);
      ctx.lineTo(-scale * 1.05, scale * 0.35 + tailOsc);
      ctx.closePath();
      ctx.fill();

      // Eye + bubbles
      ctx.fillStyle = '#F8FAFC';
      ctx.beginPath();
      ctx.arc(scale * 0.42, -scale * 0.08, scale * 0.07, 0, Math.PI * 2);
      ctx.fill();

      for (let b = 0; b < 4; b++) {
        ctx.strokeStyle = 'rgba(224, 242, 254, 0.65)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(
          scale * 0.6 + b * 10,
          -scale * 0.25 - ((t * 90 + b * 18) % 60),
          3 + b * 1.2,
          0,
          Math.PI * 2
        );
        ctx.stroke();
      }
      ctx.restore();
      break;
    }

    case 'dragon': {
      const dx = w * 0.52;
      const dy = h * (0.42 + Math.sin(t * Math.PI * 2) * 0.04);
      const wingFlap = Math.sin(t * Math.PI * 6) * 24;
      ctx.save();
      ctx.translate(dx, dy);

      // Wings
      ctx.fillStyle = 'rgba(15, 23, 42, 0.86)';
      ctx.beginPath();
      ctx.moveTo(-10, 0);
      ctx.quadraticCurveTo(-s * 0.85, -s * 0.75 + wingFlap, -s * 1.2, -s * 0.1 + wingFlap);
      ctx.lineTo(-s * 0.4, s * 0.25);
      ctx.closePath();
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(10, 0);
      ctx.quadraticCurveTo(s * 0.85, -s * 0.75 + wingFlap, s * 1.2, -s * 0.1 + wingFlap);
      ctx.lineTo(s * 0.4, s * 0.25);
      ctx.closePath();
      ctx.fill();

      // Body + neck + horned head
      ctx.fillStyle = '#090D16';
      ctx.beginPath();
      ctx.ellipse(0, s * 0.18, s * 0.25, s * 0.42, 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-14, -s * 0.1);
      ctx.quadraticCurveTo(-s * 0.25, -s * 0.55, -s * 0.5, -s * 0.52);
      ctx.lineTo(-s * 0.42, -s * 0.32);
      ctx.quadraticCurveTo(-s * 0.15, -s * 0.3, 12, s * 0.05);
      ctx.fill();

      // Fire breath
      const breath = ctx.createLinearGradient(-s * 0.5, -s * 0.42, -s * 1.25, -s * 0.35);
      breath.addColorStop(0, '#FEF08A');
      breath.addColorStop(0.45, '#F97316');
      breath.addColorStop(1, 'rgba(239, 68, 68, 0)');
      ctx.fillStyle = breath;
      ctx.beginPath();
      ctx.moveTo(-s * 0.5, -s * 0.45);
      ctx.lineTo(-s * 1.25, -s * 0.62 + Math.sin(t * 20) * 10);
      ctx.lineTo(-s * 1.2, -s * 0.22 + Math.cos(t * 20) * 10);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      break;
    }

    case 'house': {
      const hx = spreadX;
      const hy = h * 0.72;
      const hw = s * 0.82;
      const hh = s * 0.58;
      ctx.save();
      ctx.translate(hx, hy);

      // Chimney + animated smoke puffs
      ctx.fillStyle = '#475569';
      ctx.fillRect(hw * 0.2, -hh * 1.15, hw * 0.12, hh * 0.5);
      for (let p = 0; p < 4; p++) {
        const py = -hh * 1.22 - ((t * 75 + p * 22) % 68);
        const px = hw * 0.26 + Math.sin(t * 6 + p) * 10;
        ctx.fillStyle = `rgba(226, 232, 240, ${(0.45 - p * 0.08).toFixed(2)})`;
        ctx.beginPath();
        ctx.arc(px, py, 7 + p * 3, 0, Math.PI * 2);
        ctx.fill();
      }

      // House walls
      ctx.fillStyle = '#334155';
      ctx.fillRect(-hw * 0.42, -hh * 0.45, hw * 0.84, hh * 0.75);

      // Roof
      ctx.fillStyle = palette.primary;
      ctx.beginPath();
      ctx.moveTo(-hw * 0.52, -hh * 0.42);
      ctx.lineTo(0, -hh * 1.05);
      ctx.lineTo(hw * 0.52, -hh * 0.42);
      ctx.closePath();
      ctx.fill();

      // Warm glowing windows + door
      ctx.fillStyle = '#FDE047';
      ctx.fillRect(-hw * 0.3, -hh * 0.25, hw * 0.18, hh * 0.22);
      ctx.fillRect(hw * 0.12, -hh * 0.25, hw * 0.18, hh * 0.22);
      ctx.fillStyle = '#78350F';
      ctx.fillRect(-hw * 0.07, -hh * 0.06, hw * 0.14, hh * 0.36);

      ctx.restore();
      break;
    }

    case 'castle': {
      const cx = spreadX;
      const cy = h * 0.72;
      const cw = s * 1.1;
      const ch = s * 0.85;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.fillStyle = '#1E293B';
      // Keep + 2 side towers
      ctx.fillRect(-cw * 0.45, -ch * 0.75, cw * 0.2, ch * 0.9);
      ctx.fillRect(cw * 0.25, -ch * 0.75, cw * 0.2, ch * 0.9);
      ctx.fillRect(-cw * 0.25, -ch * 0.55, cw * 0.5, ch * 0.7);
      ctx.fillRect(-cw * 0.12, -ch * 0.95, cw * 0.24, ch * 0.45);

      // Spire roofs
      ctx.fillStyle = palette.primary;
      for (const [rx, rw, ry] of [
        [-cw * 0.35, cw * 0.24, -ch * 0.75],
        [cw * 0.35, cw * 0.24, -ch * 0.75],
        [0, cw * 0.28, -ch * 0.95],
      ]) {
        ctx.beginPath();
        ctx.moveTo(rx - rw * 0.5, ry);
        ctx.lineTo(rx, ry - ch * 0.32);
        ctx.lineTo(rx + rw * 0.5, ry);
        ctx.closePath();
        ctx.fill();
      }

      // Arched gate + lit windows
      ctx.fillStyle = '#F59E0B';
      ctx.beginPath();
      ctx.arc(0, ch * 0.15, cw * 0.09, Math.PI, 0);
      ctx.fill();
      ctx.fillRect(-cw * 0.38, -ch * 0.55, 8, 14);
      ctx.fillRect(cw * 0.32, -ch * 0.55, 8, 14);
      ctx.restore();
      break;
    }

    case 'lighthouse': {
      const lx = spreadX;
      const ly = h * 0.74;
      const lh = s * 1.05;
      ctx.save();
      ctx.translate(lx, ly);

      // Rotating volumetric light beam
      const beamDir = Math.sin(t * Math.PI * 2);
      const beam = ctx.createLinearGradient(0, -lh * 0.85, beamDir * w * 0.55, -lh * 0.65);
      beam.addColorStop(0, 'rgba(254, 240, 138, 0.82)');
      beam.addColorStop(1, 'rgba(254, 240, 138, 0)');
      ctx.fillStyle = beam;
      ctx.beginPath();
      ctx.moveTo(0, -lh * 0.85);
      ctx.lineTo(beamDir * w * 0.55, -lh * 1.15);
      ctx.lineTo(beamDir * w * 0.55, -lh * 0.35);
      ctx.closePath();
      ctx.fill();

      // Striped tower
      ctx.fillStyle = '#F8FAFC';
      ctx.beginPath();
      ctx.moveTo(-22, 0);
      ctx.lineTo(-13, -lh * 0.82);
      ctx.lineTo(13, -lh * 0.82);
      ctx.lineTo(22, 0);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#DC2626';
      ctx.fillRect(-17, -lh * 0.55, 34, lh * 0.18);
      ctx.fillRect(-15, -lh * 0.22, 30, lh * 0.14);

      // Lantern room
      ctx.fillStyle = '#FDE047';
      ctx.fillRect(-12, -lh * 0.94, 24, lh * 0.12);
      ctx.fillStyle = '#0F172A';
      ctx.beginPath();
      ctx.moveTo(-16, -lh * 0.94);
      ctx.lineTo(0, -lh * 1.08);
      ctx.lineTo(16, -lh * 0.94);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      break;
    }

    case 'bridge': {
      const yDeck = h * 0.68;
      ctx.strokeStyle = palette.primary;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(0, yDeck);
      ctx.lineTo(w, yDeck);
      ctx.stroke();

      // Towers + parabolic cables
      for (const tx of [w * 0.28, w * 0.72]) {
        ctx.fillStyle = '#334155';
        ctx.fillRect(tx - 8, yDeck - s * 0.75, 16, s * 0.95);
      }
      ctx.strokeStyle = palette.accent;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(0, yDeck);
      ctx.quadraticCurveTo(w * 0.14, yDeck - s * 0.2, w * 0.28, yDeck - s * 0.72);
      ctx.quadraticCurveTo(w * 0.5, yDeck - s * 0.1, w * 0.72, yDeck - s * 0.72);
      ctx.quadraticCurveTo(w * 0.86, yDeck - s * 0.2, w, yDeck);
      ctx.stroke();
      break;
    }

    case 'tree': {
      const tx = spreadX;
      const ty = h * 0.76;
      const th = s * 0.95;
      const sway = Math.sin(t * Math.PI * 2) * 6;
      ctx.save();
      ctx.translate(tx, ty);
      ctx.fillStyle = '#78350F';
      ctx.fillRect(-10, -th * 0.55, 20, th * 0.65);

      ctx.fillStyle =
        palette.primary === '#EC4899' ? '#F472B6' : '#15803D';
      ctx.beginPath();
      ctx.arc(sway, -th * 0.75, th * 0.34, 0, Math.PI * 2);
      ctx.arc(-th * 0.22 + sway, -th * 0.58, th * 0.26, 0, Math.PI * 2);
      ctx.arc(th * 0.22 + sway, -th * 0.58, th * 0.26, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      break;
    }

    case 'flower': {
      const fx = spreadX;
      const fy = h * 0.78;
      const fh = s * 0.7;
      const sway = Math.sin(t * Math.PI * 2) * 8;
      ctx.save();
      ctx.translate(fx, fy);
      ctx.strokeStyle = '#16A34A';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(sway * 0.5, -fh * 0.45, sway, -fh * 0.85);
      ctx.stroke();

      // Petals
      ctx.translate(sway, -fh * 0.85);
      for (let i = 0; i < 8; i++) {
        ctx.save();
        ctx.rotate((i * Math.PI) / 4 + t * 0.2);
        ctx.fillStyle = i % 2 === 0 ? palette.primary : palette.accent;
        ctx.beginPath();
        ctx.ellipse(0, -fh * 0.24, fh * 0.14, fh * 0.26, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      ctx.fillStyle = '#FACC15';
      ctx.beginPath();
      ctx.arc(0, 0, fh * 0.14, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      break;
    }

    case 'robot': {
      const rx = spreadX;
      const ry = h * 0.7;
      const r = s * 0.45;
      const bob = Math.sin(t * Math.PI * 4) * 4;
      ctx.save();
      ctx.translate(rx, ry + bob);

      // Antenna
      ctx.strokeStyle = '#94A3B8';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.95);
      ctx.lineTo(0, -r * 1.28);
      ctx.stroke();
      ctx.fillStyle = Math.sin(t * 12) > 0 ? '#22D3EE' : '#F472B6';
      ctx.beginPath();
      ctx.arc(0, -r * 1.3, 6, 0, Math.PI * 2);
      ctx.fill();

      // Head
      ctx.fillStyle = '#E2E8F0';
      ctx.beginPath();
      ctx.roundRect(-r * 0.45, -r * 0.95, r * 0.9, r * 0.65, 10);
      ctx.fill();

      // Glowing visor
      ctx.fillStyle = '#0F172A';
      ctx.beginPath();
      ctx.roundRect(-r * 0.34, -r * 0.78, r * 0.68, r * 0.26, 6);
      ctx.fill();
      ctx.fillStyle = '#22D3EE';
      ctx.beginPath();
      ctx.arc(-r * 0.14, -r * 0.65, r * 0.07, 0, Math.PI * 2);
      ctx.arc(r * 0.14, -r * 0.65, r * 0.07, 0, Math.PI * 2);
      ctx.fill();

      // Torso
      ctx.fillStyle = '#CBD5E1';
      ctx.beginPath();
      ctx.roundRect(-r * 0.52, -r * 0.22, r * 1.04, r * 0.85, 12);
      ctx.fill();
      ctx.fillStyle = palette.primary;
      ctx.beginPath();
      ctx.arc(0, r * 0.16, r * 0.18, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      break;
    }

    case 'astronaut': {
      const ax = w * 0.38 + Math.sin(t * Math.PI * 2) * 28;
      const ay = h * 0.46 + Math.cos(t * Math.PI * 2) * 22;
      const r = s * 0.34;
      ctx.save();
      ctx.translate(ax, ay);
      ctx.rotate(Math.sin(t * Math.PI * 2) * 0.12);

      // Life-support backpack
      ctx.fillStyle = '#94A3B8';
      ctx.beginPath();
      ctx.roundRect(-r * 0.58, -r * 0.2, r * 0.36, r * 0.85, 6);
      ctx.fill();

      // Suit torso & limbs
      ctx.fillStyle = '#F8FAFC';
      ctx.beginPath();
      ctx.roundRect(-r * 0.36, -r * 0.22, r * 0.72, r * 0.9, 10);
      ctx.fill();

      // Helmet + gold visor
      ctx.beginPath();
      ctx.arc(0, -r * 0.52, r * 0.42, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#F59E0B';
      ctx.beginPath();
      ctx.ellipse(r * 0.06, -r * 0.52, r * 0.28, r * 0.22, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      break;
    }

    case 'bicycle': {
      const bx = w * (0.26 + t * 0.46);
      const by = h * 0.77;
      const wr = s * 0.22;
      ctx.save();
      ctx.translate(bx, by);
      for (const wx of [-wr * 1.4, wr * 1.4]) {
        ctx.strokeStyle = '#0F172A';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(wx, 0, wr, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = '#64748B';
        ctx.lineWidth = 1.5;
        for (let k = 0; k < 6; k++) {
          const ang = t * Math.PI * 8 + (k * Math.PI) / 3;
          ctx.beginPath();
          ctx.moveTo(wx, 0);
          ctx.lineTo(wx + Math.cos(ang) * wr, Math.sin(ang) * wr);
          ctx.stroke();
        }
      }
      ctx.strokeStyle = palette.primary;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(-wr * 1.4, 0);
      ctx.lineTo(-wr * 0.2, -wr * 0.95);
      ctx.lineTo(wr * 0.9, -wr * 0.95);
      ctx.lineTo(0, 0);
      ctx.closePath();
      ctx.moveTo(wr * 0.9, -wr * 1.25);
      ctx.lineTo(wr * 1.4, 0);
      ctx.stroke();
      ctx.restore();
      break;
    }

    case 'airplane': {
      const px = w * (0.14 + t * 0.72);
      const py = h * (0.34 - t * 0.14);
      const scale = s * 0.48;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(-0.12);
      // Contrail
      ctx.strokeStyle = 'rgba(248, 250, 252, 0.42)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(-scale * 0.8, 0);
      ctx.lineTo(-scale * 3.5, 16);
      ctx.stroke();

      ctx.fillStyle = '#F8FAFC';
      ctx.beginPath();
      ctx.ellipse(0, 0, scale * 0.72, scale * 0.16, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-scale * 0.1, 0);
      ctx.lineTo(-scale * 0.45, -scale * 0.52);
      ctx.lineTo(scale * 0.18, 0);
      ctx.lineTo(-scale * 0.45, scale * 0.46);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      break;
    }

    case 'campfire': {
      const fx = spreadX;
      const fy = h * 0.78;
      const fr = s * 0.34;
      ctx.save();
      ctx.translate(fx, fy);
      // Radial warm glow
      const glow = ctx.createRadialGradient(0, -fr * 0.4, 4, 0, -fr * 0.4, fr * 2.4);
      glow.addColorStop(0, 'rgba(251, 146, 60, 0.55)');
      glow.addColorStop(1, 'rgba(251, 146, 60, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(0, -fr * 0.4, fr * 2.4, 0, Math.PI * 2);
      ctx.fill();

      // Crossed logs
      ctx.fillStyle = '#451A03';
      ctx.fillRect(-fr * 0.6, 0, fr * 1.2, 12);

      // Flickering flames
      const flick = Math.sin(t * Math.PI * 12) * 10;
      ctx.fillStyle = '#EA580C';
      ctx.beginPath();
      ctx.moveTo(-fr * 0.42, 4);
      ctx.quadraticCurveTo(-fr * 0.2, -fr * 1.1, flick, -fr * 1.35);
      ctx.quadraticCurveTo(fr * 0.35, -fr * 0.9, fr * 0.42, 4);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#FDE047';
      ctx.beginPath();
      ctx.moveTo(-fr * 0.24, 4);
      ctx.quadraticCurveTo(0, -fr * 0.85, flick * 0.5, -fr * 0.92);
      ctx.quadraticCurveTo(fr * 0.22, -fr * 0.65, fr * 0.24, 4);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      break;
    }

    case 'kite': {
      const kx = w * 0.62 + Math.sin(t * Math.PI * 4) * 32;
      const ky = h * 0.28 + Math.cos(t * Math.PI * 4) * 18;
      const ks = s * 0.34;
      ctx.save();
      ctx.strokeStyle = 'rgba(248, 250, 252, 0.5)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(w * 0.38, h * 0.78);
      ctx.quadraticCurveTo(w * 0.48, h * 0.56, kx, ky);
      ctx.stroke();

      ctx.translate(kx, ky);
      ctx.rotate(0.25 + Math.sin(t * Math.PI * 4) * 0.12);
      ctx.fillStyle = palette.primary;
      ctx.beginPath();
      ctx.moveTo(0, -ks);
      ctx.lineTo(ks * 0.7, 0);
      ctx.lineTo(0, ks * 1.15);
      ctx.lineTo(-ks * 0.7, 0);
      ctx.closePath();
      ctx.fill();

      // Kite tail
      ctx.strokeStyle = palette.accent;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, ks * 1.15);
      ctx.quadraticCurveTo(
        Math.sin(t * 14) * 26,
        ks * 1.8,
        Math.cos(t * 14) * 20,
        ks * 2.4
      );
      ctx.stroke();
      ctx.restore();
      break;
    }

    case 'person': {
      const px = spreadX + Math.sin(t * Math.PI * 2) * 18;
      const py = h * 0.75;
      const ph = s * 0.62;
      ctx.save();
      ctx.translate(px, py);
      ctx.fillStyle = '#0F172A';
      ctx.beginPath();
      ctx.arc(0, -ph * 0.85, ph * 0.14, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.roundRect(-ph * 0.14, -ph * 0.68, ph * 0.28, ph * 0.45, 6);
      ctx.fill();
      ctx.lineWidth = 5;
      ctx.strokeStyle = '#0F172A';
      const stride = Math.sin(t * Math.PI * 6) * ph * 0.12;
      ctx.beginPath();
      ctx.moveTo(-ph * 0.06, -ph * 0.25);
      ctx.lineTo(-ph * 0.08 - stride, ph * 0.12);
      ctx.moveTo(ph * 0.06, -ph * 0.25);
      ctx.lineTo(ph * 0.08 + stride, ph * 0.12);
      ctx.stroke();
      ctx.restore();
      break;
    }
  }
}
