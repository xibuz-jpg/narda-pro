/**
 * Procedural Canvas-2D textures for a photorealistic narda board: wood grain,
 * domed glossy checkers, and 3D dice. Generated once at runtime (no image
 * assets → zero bundle weight, works offline / inside Telegram) and handed to
 * PixiJS as textures. Canvas 2D gives us radial gradients, soft shadows and
 * per-pixel grain that are awkward to express with vector Graphics.
 */

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

export interface WoodOptions {
  base: string;
  grainDark: string;
  grainLight: string;
  lines?: number;
  seams?: number;
  seamColor?: string;
  vertical?: boolean;
}

/** A plank of wood: base tone + wavering grain lines + fine speckle. */
export function woodTexture(w: number, h: number, o: WoodOptions): HTMLCanvasElement {
  const c = makeCanvas(w, h);
  const x = c.getContext('2d')!;
  const along = o.vertical ? h : w;
  const across = o.vertical ? w : h;

  x.fillStyle = o.base;
  x.fillRect(0, 0, w, h);

  // Broad tonal wash for depth.
  const wash = x.createLinearGradient(0, 0, w, h);
  wash.addColorStop(0, 'rgba(255,255,255,0.05)');
  wash.addColorStop(0.5, 'rgba(0,0,0,0)');
  wash.addColorStop(1, 'rgba(0,0,0,0.16)');
  x.fillStyle = wash;
  x.fillRect(0, 0, w, h);

  // Grain lines running along the plank, gently wavering.
  const lines = o.lines ?? Math.round(across / 6);
  for (let i = 0; i < lines; i += 1) {
    const pos = (across * (i + 0.5)) / lines + (Math.random() - 0.5) * (across / lines) * 0.9;
    const amp = 2 + Math.random() * 7;
    const freq = 0.004 + Math.random() * 0.01;
    const phase = Math.random() * Math.PI * 2;
    const dark = Math.random() > 0.5;
    x.strokeStyle = dark ? o.grainDark : o.grainLight;
    x.globalAlpha = 0.12 + Math.random() * 0.28;
    x.lineWidth = 0.6 + Math.random() * 1.6;
    x.beginPath();
    for (let a = 0; a <= along; a += 6) {
      const wobble = Math.sin(a * freq + phase) * amp + Math.sin(a * freq * 2.7) * amp * 0.3;
      const p = pos + wobble;
      const px = o.vertical ? p : a;
      const py = o.vertical ? a : p;
      if (a === 0) x.moveTo(px, py);
      else x.lineTo(px, py);
    }
    x.stroke();
  }
  x.globalAlpha = 1;

  // Occasional darker plank seams.
  const seams = o.seams ?? 0;
  for (let i = 1; i <= seams; i += 1) {
    const p = (along * i) / (seams + 1) + (Math.random() - 0.5) * 8;
    x.strokeStyle = o.seamColor ?? 'rgba(0,0,0,0.35)';
    x.lineWidth = 2.5;
    x.globalAlpha = 0.5;
    x.beginPath();
    if (o.vertical) {
      x.moveTo(p, 0);
      x.lineTo(p, h);
    } else {
      x.moveTo(0, p);
      x.lineTo(w, p);
    }
    x.stroke();
  }
  x.globalAlpha = 1;

  // Fine speckle for a non-flat surface.
  const speckle = Math.round((w * h) / 900);
  for (let i = 0; i < speckle; i += 1) {
    const px = Math.random() * w;
    const py = Math.random() * h;
    x.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)';
    x.fillRect(px, py, 1.4, 1.4);
  }

  return c;
}

/** A glossy domed checker (ivory or ebony), lit from the upper-left. */
export function checkerTexture(diameter: number, light: boolean): HTMLCanvasElement {
  const d = Math.max(8, Math.round(diameter));
  const c = makeCanvas(d, d);
  const x = c.getContext('2d')!;
  const r = d / 2;
  const cx = r;
  const cy = r;
  const rr = r - d * 0.06;

  // Contact shadow.
  x.save();
  x.beginPath();
  x.ellipse(cx, cy + rr * 0.14, rr * 0.98, rr * 0.98, 0, 0, Math.PI * 2);
  x.fillStyle = 'rgba(0,0,0,0.35)';
  x.filter = `blur(${d * 0.04}px)`;
  x.fill();
  x.restore();

  // Body — radial gradient offset toward the light.
  const body = x.createRadialGradient(cx - rr * 0.35, cy - rr * 0.4, rr * 0.1, cx, cy, rr);
  if (light) {
    body.addColorStop(0, '#fffdf6');
    body.addColorStop(0.45, '#f0e6cf');
    body.addColorStop(0.82, '#d8c49a');
    body.addColorStop(1, '#a9906087');
  } else {
    // A true black stone — just a hint of top sheen keeps the dome readable.
    body.addColorStop(0, '#3a3a42');
    body.addColorStop(0.4, '#111116');
    body.addColorStop(0.8, '#060608');
    body.addColorStop(1, '#000000');
  }
  x.beginPath();
  x.arc(cx, cy, rr, 0, Math.PI * 2);
  x.fillStyle = body;
  x.fill();

  // Outer rim.
  x.lineWidth = d * 0.03;
  x.strokeStyle = light ? 'rgba(120,96,54,0.7)' : 'rgba(0,0,0,0.8)';
  x.stroke();

  // Concentric turned grooves.
  for (const f of [0.72, 0.58]) {
    x.beginPath();
    x.arc(cx, cy, rr * f, 0, Math.PI * 2);
    x.lineWidth = d * 0.015;
    x.strokeStyle = light ? 'rgba(120,96,54,0.35)' : 'rgba(0,0,0,0.5)';
    x.stroke();
  }
  // Inner disc, slightly recessed.
  const inner = x.createRadialGradient(cx - rr * 0.2, cy - rr * 0.25, rr * 0.05, cx, cy, rr * 0.5);
  if (light) {
    inner.addColorStop(0, '#fff9ec');
    inner.addColorStop(1, '#e4d3ab');
  } else {
    inner.addColorStop(0, '#26262e');
    inner.addColorStop(1, '#050508');
  }
  x.beginPath();
  x.arc(cx, cy, rr * 0.44, 0, Math.PI * 2);
  x.fillStyle = inner;
  x.fill();

  // Specular highlight (upper-left).
  const spec = x.createRadialGradient(cx - rr * 0.4, cy - rr * 0.45, 0, cx - rr * 0.4, cy - rr * 0.45, rr * 0.9);
  spec.addColorStop(0, `rgba(255,255,255,${light ? 0.55 : 0.3})`);
  spec.addColorStop(0.4, 'rgba(255,255,255,0)');
  x.beginPath();
  x.arc(cx, cy, rr, 0, Math.PI * 2);
  x.fillStyle = spec;
  x.fill();

  return c;
}

const PIPS: Record<number, [number, number][]> = {
  1: [[0, 0]],
  2: [[-1, -1], [1, 1]],
  3: [[-1, -1], [0, 0], [1, 1]],
  4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
  5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
  6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
};

/** A single 3D die face (rounded ivory cube, top-lit, inset black pips). */
export function dieTexture(size: number, value: number): HTMLCanvasElement {
  const s = Math.max(16, Math.round(size));
  const pad = Math.round(s * 0.14);
  const c = makeCanvas(s + pad * 2, s + pad * 2);
  const x = c.getContext('2d')!;
  const rad = s * 0.2;
  const x0 = pad;
  const y0 = pad;

  const round = (rx: number, ry: number, rw: number, rh: number, r: number) => {
    x.beginPath();
    x.moveTo(rx + r, ry);
    x.arcTo(rx + rw, ry, rx + rw, ry + rh, r);
    x.arcTo(rx + rw, ry + rh, rx, ry + rh, r);
    x.arcTo(rx, ry + rh, rx, ry, r);
    x.arcTo(rx, ry, rx + rw, ry, r);
    x.closePath();
  };

  // Drop shadow.
  x.save();
  x.filter = `blur(${s * 0.05}px)`;
  round(x0 + s * 0.06, y0 + s * 0.1, s, s, rad);
  x.fillStyle = 'rgba(0,0,0,0.4)';
  x.fill();
  x.restore();

  // Body gradient (top-lit ivory).
  const g = x.createLinearGradient(x0, y0, x0, y0 + s);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.5, '#f4efe2');
  g.addColorStop(1, '#dcd2bd');
  round(x0, y0, s, s, rad);
  x.fillStyle = g;
  x.fill();
  x.lineWidth = Math.max(1, s * 0.02);
  x.strokeStyle = 'rgba(150,135,105,0.6)';
  x.stroke();

  // Soft top sheen.
  const sheen = x.createLinearGradient(x0, y0, x0, y0 + s * 0.5);
  sheen.addColorStop(0, 'rgba(255,255,255,0.6)');
  sheen.addColorStop(1, 'rgba(255,255,255,0)');
  round(x0 + s * 0.06, y0 + s * 0.05, s * 0.88, s * 0.42, rad * 0.7);
  x.fillStyle = sheen;
  x.fill();

  // Pips.
  const cx = x0 + s / 2;
  const cy = y0 + s / 2;
  const off = s * 0.26;
  const pr = s * 0.084;
  for (const [dx, dy] of PIPS[value] ?? []) {
    const px = cx + dx * off;
    const py = cy + dy * off;
    const pg = x.createRadialGradient(px - pr * 0.3, py - pr * 0.3, pr * 0.1, px, py, pr);
    pg.addColorStop(0, '#3a3a3a');
    pg.addColorStop(1, '#050505');
    x.beginPath();
    x.arc(px, py, pr, 0, Math.PI * 2);
    x.fillStyle = pg;
    x.fill();
  }

  return c;
}

/**
 * An engraved decorative medallion — a standing stag within an ornamental
 * ring with corner flourishes — drawn in dark sepia ink so it reads as an
 * inlay burnt into the light wood. One is placed at the centre of each half.
 */
export function emblemTexture(size: number): HTMLCanvasElement {
  const s = Math.round(size);
  const c = makeCanvas(s, s);
  const x = c.getContext('2d')!;
  const cx = s / 2;
  const cy = s / 2;
  const R = s * 0.45;
  const u = R / 100;
  const ink = 'rgba(58,40,24,0.9)';
  x.strokeStyle = ink;
  x.fillStyle = ink;
  x.lineCap = 'round';
  x.lineJoin = 'round';

  const ring = (r: number, w: number) => {
    x.lineWidth = w;
    x.beginPath();
    x.arc(cx, cy, r, 0, Math.PI * 2);
    x.stroke();
  };
  ring(R, s * 0.007);
  ring(R * 0.94, s * 0.004);

  // Diamond flourishes at the four diagonals + top/bottom.
  const diamond = (ang: number, d: number) => {
    const dx = cx + Math.cos(ang) * R;
    const dy = cy + Math.sin(ang) * R;
    x.save();
    x.translate(dx, dy);
    x.rotate(ang + Math.PI / 4);
    x.beginPath();
    x.moveTo(0, -d);
    x.lineTo(d * 0.6, 0);
    x.lineTo(0, d);
    x.lineTo(-d * 0.6, 0);
    x.closePath();
    x.fill();
    x.restore();
  };
  for (const a of [0, 90, 180, 270]) diamond((a * Math.PI) / 180, s * 0.028);
  for (const a of [45, 135, 225, 315]) diamond((a * Math.PI) / 180, s * 0.018);

  // Small leaf sprigs curling inward from the diagonal flourishes.
  x.lineWidth = s * 0.004;
  for (const a of [45, 135, 225, 315]) {
    const ang = (a * Math.PI) / 180;
    const bx = cx + Math.cos(ang) * R * 0.86;
    const by = cy + Math.sin(ang) * R * 0.86;
    for (const side of [-1, 1]) {
      x.beginPath();
      x.moveTo(bx, by);
      x.quadraticCurveTo(
        bx - Math.cos(ang) * 12 * u + side * 8 * u,
        by - Math.sin(ang) * 12 * u + side * 8 * u,
        bx - Math.cos(ang) * 22 * u,
        by - Math.sin(ang) * 22 * u,
      );
      x.stroke();
    }
  }

  // ── Stag (side profile, facing left) ────────────────────────────────
  const P = (px: number, py: number): [number, number] => [cx + px * u, cy + py * u];

  // Legs (behind the body).
  x.lineWidth = 4 * u;
  for (const [lx, ly] of [
    [-26, 8], [-14, 10], [22, 10], [34, 8],
  ] as const) {
    const [x0, y0] = P(lx, ly);
    const [x1, y1] = P(lx + (lx < 0 ? -2 : 2), 60);
    x.beginPath();
    x.moveTo(x0, y0);
    x.lineTo(x1, y1);
    x.stroke();
    // hoof
    x.beginPath();
    x.arc(x1, y1, 2.4 * u, 0, Math.PI * 2);
    x.fill();
  }

  // Body + neck + head as one silhouette.
  x.beginPath();
  const b = (px: number, py: number) => {
    const [X, Y] = P(px, py);
    x.lineTo(X, Y);
  };
  const m = (px: number, py: number) => {
    const [X, Y] = P(px, py);
    x.moveTo(X, Y);
  };
  m(-34, 0); // chest top
  x.bezierCurveTo(...P(-20, -14), ...P(20, -14), ...P(40, -2)); // back
  x.bezierCurveTo(...P(46, 4), ...P(44, 16), ...P(36, 18)); // rump
  b(-14, 20); // belly
  x.bezierCurveTo(...P(-26, 20), ...P(-30, 12), ...P(-34, 6)); // chest
  x.bezierCurveTo(...P(-40, 0), ...P(-44, -12), ...P(-48, -26)); // neck front up
  x.bezierCurveTo(...P(-52, -34), ...P(-60, -36), ...P(-64, -32)); // snout
  x.bezierCurveTo(...P(-60, -28), ...P(-54, -28), ...P(-50, -24)); // jaw
  x.bezierCurveTo(...P(-44, -18), ...P(-40, -10), ...P(-34, 0)); // back to chest
  x.closePath();
  x.fill();

  // Ear + antlers (a clean symmetric rack sweeping up and back).
  x.lineWidth = 3.6 * u;
  const antler = (base: [number, number], pts: [number, number][]) => {
    x.beginPath();
    x.moveTo(...P(...base));
    for (const p of pts) x.lineTo(...P(...p));
    x.stroke();
  };
  // Ear.
  antler([-49, -32], [[-44, -40], [-40, -36]]);
  // Front beam (sweeps up and back over the body) with tines.
  antler([-50, -34], [[-46, -54], [-40, -70], [-32, -82]]);
  antler([-45, -58], [[-34, -60]]);
  antler([-40, -70], [[-29, -72]]);
  // Rear beam (more upright) with tines.
  antler([-54, -34], [[-57, -54], [-58, -70], [-57, -84]]);
  antler([-57, -56], [[-67, -58]]);
  antler([-58, -71], [[-68, -73]]);
  // eye (negative space).
  x.save();
  x.globalCompositeOperation = 'destination-out';
  x.beginPath();
  x.arc(...P(-52, -30), 1.6 * u, 0, Math.PI * 2);
  x.fill();
  x.restore();

  // Tail.
  x.beginPath();
  x.moveTo(...P(40, 2));
  x.lineTo(...P(48, 8));
  x.lineTo(...P(42, 12));
  x.closePath();
  x.fill();

  return c;
}


/* eslint-disable @typescript-eslint/no-non-null-assertion */
/**
 * Turns an emblem (light-background line art, or a silhouette) into a tintable
 * ink stamp: white pixels whose alpha is the source's darkness × opacity. The
 * result can be `tint`ed dark to engrave onto a light checker, or white to draw
 * onto a black one. Same-origin sources only (so the canvas isn't tainted).
 */
export function inkMask(source: CanvasImageSource, size = 256): HTMLCanvasElement {
  const c = makeCanvas(size, size);
  const x = c.getContext('2d')!;
  x.drawImage(source, 0, 0, size, size);
  const img = x.getImageData(0, 0, size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const lum = (0.299 * d[i]! + 0.587 * d[i + 1]! + 0.114 * d[i + 2]!) / 255;
    const alpha = d[i + 3]! / 255;
    d[i] = 255;
    d[i + 1] = 255;
    d[i + 2] = 255;
    d[i + 3] = Math.round((1 - lum) * alpha * 255);
  }
  x.putImageData(img, 0, 0);
  return c;
}

/** A soft radial vignette (transparent centre → shadowed corners) for depth. */
export function vignetteTexture(w: number, h: number): HTMLCanvasElement {
  const c = makeCanvas(w, h);
  const x = c.getContext('2d')!;
  const g = x.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.62);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(0.7, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.32)');
  x.fillStyle = g;
  x.fillRect(0, 0, w, h);
  return c;
}

/** A brass hinge plate with two screws, for the board's centre fold. */
export function hingeTexture(w: number, h: number): HTMLCanvasElement {
  const c = makeCanvas(w, h);
  const x = c.getContext('2d')!;
  const g = x.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#e8c877');
  g.addColorStop(0.5, '#b8933f');
  g.addColorStop(1, '#8a6d2a');
  const round = (r: number) => {
    x.beginPath();
    x.moveTo(r, 0);
    x.arcTo(w, 0, w, h, r);
    x.arcTo(w, h, 0, h, r);
    x.arcTo(0, h, 0, 0, r);
    x.arcTo(0, 0, w, 0, r);
    x.closePath();
  };
  round(Math.min(w, h) * 0.2);
  x.fillStyle = g;
  x.fill();
  x.lineWidth = 1.5;
  x.strokeStyle = 'rgba(90,66,20,0.8)';
  x.stroke();
  // Screws.
  for (const fx of [0.22, 0.78]) {
    const sx = w * fx;
    const sy = h * 0.5;
    const sr = Math.min(w, h) * 0.16;
    const sg = x.createRadialGradient(sx - sr * 0.3, sy - sr * 0.3, sr * 0.1, sx, sy, sr);
    sg.addColorStop(0, '#f3e2a8');
    sg.addColorStop(1, '#7a5f22');
    x.beginPath();
    x.arc(sx, sy, sr, 0, Math.PI * 2);
    x.fillStyle = sg;
    x.fill();
    x.strokeStyle = 'rgba(70,52,16,0.9)';
    x.lineWidth = 1;
    x.stroke();
    x.beginPath();
    x.moveTo(sx - sr * 0.6, sy);
    x.lineTo(sx + sr * 0.6, sy);
    x.strokeStyle = 'rgba(60,44,12,0.9)';
    x.lineWidth = 1.5;
    x.stroke();
  }
  return c;
}
