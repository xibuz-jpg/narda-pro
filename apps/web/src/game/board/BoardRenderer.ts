import { Application, Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import { Player, type BoardSnapshot } from '@narda/game-engine';
import { playDiceSound, playCheckerSound } from '../../lib/sound';
import {
  woodTexture,
  checkerTexture,
  dieTexture,
  hingeTexture,
  vignetteTexture,
  emblemTexture,
} from './textures';

/**
 * PixiJS renderer for a backgammon board.
 *
 * The board is drawn in a fixed "design space" (see {@link DESIGN_W}×
 * {@link DESIGN_H}); the whole stage is uniformly scaled to fit the host
 * element, so all geometry math stays in constant units and the board is crisp
 * at any size / device-pixel-ratio.
 *
 * Coordinate convention matches the engine: points 1–24 with White's home on
 * the bottom-right (points 1–6) and Black's on the top-right (19–24).
 */
const DESIGN_W = 1500;
const DESIGN_H = 900;
/** Landscape aspect (wide board). */
export const BOARD_ASPECT = DESIGN_W / DESIGN_H;
/** Portrait aspect (board rotated 90° to fill a tall phone screen). */
export const BOARD_ASPECT_PORTRAIT = DESIGN_H / DESIGN_W;

// Palette — a warm wooden narda set (light-wood interior, black points).
const COLOR_LABEL = 0xffffff;

// Layout constants (design units)
const MARGIN = 22;
const BORDER = 18;
const TRAY_W = 104;
const TRAY_GAP = 14;
const BAR_W = 64;

/** Duration of the dice tumble (ms). */
const DICE_ROLL_MS = 650;
/** Duration of a single checker's glide between points (ms). */
const MOVE_GLIDE_MS = 300;

/** A checker moving from one target to another, for animation. */
interface AnimMove {
  fromT: BoardTarget;
  toT: BoardTarget;
  player: Player;
}

const easeOutCubic = (t: number): number => 1 - (1 - t) ** 3;

/** Loads an image URL into a Pixi texture, or resolves null if it's missing. */
function loadImageTexture(url: string): Promise<Texture | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(Texture.from(img));
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/** Tap target on the board. */
export type BoardTarget = number | 'bar' | 'off';

/** Points/areas to highlight for move selection. */
export interface BoardHighlights {
  sources?: BoardTarget[];
  destinations?: BoardTarget[];
  selected?: BoardTarget | null;
}

export class BoardRenderer {
  private readonly board = new Container();
  private readonly checkers = new Container();
  private readonly fx = new Container();
  private readonly highlights = new Container();
  private readonly dice = new Container();
  private cssWidth = DESIGN_W;
  private cssHeight = DESIGN_H;
  /** Per-axis scale (equal unless the portrait board is stretched to fill). */
  private scaleX = 1;
  private scaleY = 1;
  private rotated = false;
  /** Viewer perspective: flip the board 180° so this viewer's pieces sit left. */
  private flipped = false;
  /** Net stage rotation (rotated ? π/2 : 0) + (flipped ? π : 0). */
  private stageRot = 0;

  // Baked textures (wood, checkers, dice, hinge).
  private texFrame!: Texture;
  private texSurface!: Texture;
  private texTray!: Texture;
  private texChecker: Record<'light' | 'dark', Texture> = {} as never;
  private texDie: Texture[] = [];
  private texHinge!: Texture;
  private texEmblem!: Texture;
  private emblemIsImage = false;

  // Animation state.
  private shownBoard: BoardSnapshot | null = null;
  private diceOwner: Player = Player.White;
  private diceSig: string | null = null;
  private diceAnim: { target: { first: number; second: number }; start: number; nextFlip: number } | null = null;
  private moveAnim: {
    target: BoardSnapshot;
    sprites: { c: Container; sx: number; sy: number; ex: number; ey: number }[];
    fxFrom: Graphics[];
    fxTo: { g: Graphics; x: number; y: number }[];
    start: number;
  } | null = null;
  private pendingBoard: BoardSnapshot | null = null;

  // Derived geometry (design units)
  private readonly playX0 = MARGIN + BORDER;
  private readonly playY0 = MARGIN + BORDER;
  private readonly playH = DESIGN_H - 2 * (MARGIN + BORDER);
  private readonly playRegionW = DESIGN_W - 2 * (MARGIN + BORDER) - TRAY_W - TRAY_GAP;
  private readonly halfW = (this.playRegionW - BAR_W) / 2;
  private readonly pointW = ((this.playRegionW - BAR_W) / 2) / 6;
  private readonly pointH = this.playH * 0.42;
  private readonly checkerR = (((this.playRegionW - BAR_W) / 2) / 6) * 0.42;
  private readonly barX = MARGIN + BORDER + (this.playRegionW - BAR_W) / 2;
  private readonly trayX = MARGIN + BORDER + this.playRegionW + TRAY_GAP;

  private constructor(private readonly app: Application) {
    app.stage.addChild(this.board, this.checkers, this.fx, this.highlights, this.dice);
    app.ticker.add(this.tick);
  }

  /** Per-frame animation pump (dice tumble + checker glides). */
  private readonly tick = (): void => {
    const now = performance.now();
    this.stepDice(now);
    this.stepMove(now);
  };

  static async create(
    host: HTMLElement,
    width: number,
    height = Number.POSITIVE_INFINITY,
    rotated = false,
    flip = false,
  ): Promise<BoardRenderer> {
    const app = new Application();
    await app.init({
      // Height is corrected by the resize() call right after create(); this
      // just avoids an Infinity from the default height arg.
      width: Math.max(1, Math.round(width)),
      height: Math.max(1, Math.round(width)),
      backgroundAlpha: 0,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
      preference: 'webgl', // skip fetching the WebGPU renderer chunk
    });
    host.appendChild(app.canvas);
    const renderer = new BoardRenderer(app);
    renderer.rotated = rotated;
    renderer.flipped = flip;
    renderer.initTextures();
    await renderer.loadEmblem();
    renderer.buildStaticBoard();
    renderer.resize(width, height);
    return renderer;
  }

  /**
   * Loads the decorative centre emblem from `/emblem.png` if the user supplied
   * one (drawn with a multiply blend so its light background melts into the
   * wood); otherwise falls back to the procedural engraved stag.
   */
  private async loadEmblem(): Promise<void> {
    const tex = await loadImageTexture('/emblem.png');
    if (tex) {
      this.texEmblem = tex;
      this.emblemIsImage = true;
    } else {
      this.texEmblem = Texture.from(emblemTexture(460));
      this.emblemIsImage = false;
    }
  }

  /** Bake all procedural textures once (design-space resolution). */
  private initTextures(): void {
    this.texFrame = Texture.from(
      woodTexture(DESIGN_W, DESIGN_H, {
        base: '#5b3a1f',
        grainDark: '#2e1c0e',
        grainLight: '#7a5230',
        seams: 3,
        seamColor: 'rgba(20,10,4,0.4)',
      }),
    );
    this.texSurface = Texture.from(
      woodTexture(1200, 820, {
        base: '#d9bd8f',
        grainDark: '#a5824f',
        grainLight: '#ecd7b0',
        lines: 120,
      }),
    );
    this.texTray = Texture.from(
      woodTexture(320, 820, {
        base: '#caa877',
        grainDark: '#8f6c3e',
        grainLight: '#e0c79c',
        vertical: true,
      }),
    );
    const cd = Math.round(this.checkerR * 2 * 2); // 2× for crispness
    this.texChecker = {
      light: Texture.from(checkerTexture(cd, true)),
      dark: Texture.from(checkerTexture(cd, false)),
    };
    this.texDie = [1, 2, 3, 4, 5, 6].map((v) => Texture.from(dieTexture(140, v)));
    this.texHinge = Texture.from(hingeTexture(180, 90));
  }

  private woodSprite(tex: Texture, x: number, y: number, w: number, h: number): Sprite {
    const s = new Sprite(tex);
    s.position.set(x, y);
    s.width = w;
    s.height = h;
    return s;
  }

  /**
   * Fit the board within a `width × height` box (height optional → width-bound),
   * as large as possible while preserving aspect. In portrait mode the whole
   * stage is rotated 90° so the wide board fills a tall phone screen; geometry
   * stays in the landscape design space and taps are un-rotated in {@link pointAt}.
   */
  resize(width: number, height: number = Number.POSITIVE_INFINITY): void {
    // Portrait board is 0.6 wide:tall; landscape is BOARD_ASPECT.
    const aspect = this.rotated ? DESIGN_H / DESIGN_W : BOARD_ASPECT;
    let w = width;
    let h = width / aspect;
    if (h > height) {
      h = height;
      w = height * aspect;
    }
    w = Math.round(w);
    h = Math.round(h);

    if (this.rotated && Number.isFinite(height)) {
      // Portrait: stretch the long axis so the board fills the screen top-to-
      // bottom (design-x → screen height, design-y → screen width).
      w = Math.round(width);
      h = Math.round(height);
      this.scaleX = h / DESIGN_W;
      this.scaleY = w / DESIGN_H;
    } else {
      // Landscape sits a touch narrower than the screen (a little margin).
      const m = this.rotated ? 1 : 0.9;
      w = Math.round(w * m);
      h = Math.round(h * m);
      const s = this.rotated ? w / DESIGN_H : w / DESIGN_W;
      this.scaleX = s;
      this.scaleY = s;
    }

    this.cssWidth = w;
    this.cssHeight = h;
    this.app.renderer.resize(w, h);

    this.stageRot = (this.rotated ? Math.PI / 2 : 0) + (this.flipped ? Math.PI : 0);
    this.app.stage.rotation = this.stageRot;
    this.app.stage.scale.set(this.scaleX, this.scaleY);
    // Translate the rotated design back into the visible [0,w]×[0,h] box.
    if (!this.rotated && !this.flipped) this.app.stage.position.set(0, 0);
    else if (this.rotated && !this.flipped) this.app.stage.position.set(w, 0);
    else if (!this.rotated && this.flipped) this.app.stage.position.set(w, h);
    else this.app.stage.position.set(0, h);
  }

  /** Extra x-scale round sprites need to stay circular under a stretched board. */
  private get roundFix(): number {
    return this.scaleY / this.scaleX;
  }

  /**
   * Render a board position. Highlights update immediately; dice animate a
   * tumble when their values change; checkers glide from their old positions to
   * the new ones when the board changes (diffing old→new, so both the local
   * player's taps and the opponent's/AI's turns animate uniformly).
   */
  render(
    board: BoardSnapshot,
    dice?: { first: number; second: number } | null,
    highlights?: BoardHighlights,
    activePlayer?: Player | null,
  ): void {
    if (import.meta.env.DEV) {
      const w = window as unknown as { __nardaBoardApp?: Application; __nardaBoardRenderer?: BoardRenderer };
      w.__nardaBoardApp = this.app;
      w.__nardaBoardRenderer = this;
    }
    // The dice sit on (and read upright for) whoever's turn it is.
    if (activePlayer != null && activePlayer !== this.diceOwner) {
      this.diceOwner = activePlayer;
      this.diceSig = null; // force a repaint on the new side
    }
    this.drawHighlights(highlights ?? {});
    this.updateDice(dice ?? null);
    this.updateCheckers(board);
  }

  /** Maps a canvas-relative CSS coordinate to the board target under it. */
  pointAt(cssX: number, cssY: number): BoardTarget | null {
    // Invert the stage transform to recover landscape design coordinates.
    let x: number;
    let y: number;
    if (!this.rotated && !this.flipped) {
      x = cssX / this.scaleX;
      y = cssY / this.scaleY;
    } else if (this.rotated && !this.flipped) {
      x = cssY / this.scaleX;
      y = (this.cssWidth - cssX) / this.scaleY;
    } else if (!this.rotated && this.flipped) {
      x = (this.cssWidth - cssX) / this.scaleX;
      y = (this.cssHeight - cssY) / this.scaleY;
    } else {
      x = (this.cssHeight - cssY) / this.scaleX;
      y = cssX / this.scaleY;
    }
    if (y < this.playY0 || y > this.playY0 + this.playH) return null;
    if (x >= this.trayX && x <= this.trayX + TRAY_W) return 'off';
    if (x >= this.barX && x <= this.barX + BAR_W) return 'bar';

    let col: number;
    if (x < this.barX) {
      col = Math.floor((x - this.playX0) / this.pointW);
      if (col < 0 || col > 5) return null;
    } else {
      col = 6 + Math.floor((x - (this.playX0 + this.halfW + BAR_W)) / this.pointW);
      if (col < 6 || col > 11) return null;
    }
    const isBottom = y > this.playY0 + this.playH / 2;
    return isBottom ? 12 - col : col + 13;
  }

  destroy(): void {
    this.app.ticker.remove(this.tick);
    this.app.destroy(true, { children: true });
  }

  // ── Static board ────────────────────────────────────────────────────────────

  private buildStaticBoard(): void {
    // 1. Wooden outer frame (dark walnut fills the whole board).
    this.board.addChild(this.woodSprite(this.texFrame, 0, 0, DESIGN_W, DESIGN_H));

    // Rounded outer bevel — a raised lip catching light top-left, shadow below.
    const bevel = new Graphics();
    bevel.roundRect(MARGIN * 0.5, MARGIN * 0.5, DESIGN_W - MARGIN, DESIGN_H - MARGIN, 26)
      .stroke({ width: 8, color: 0x1c1109, alpha: 0.7 });
    bevel.roundRect(MARGIN, MARGIN, DESIGN_W - 2 * MARGIN, DESIGN_H - 2 * MARGIN, 18)
      .stroke({ width: 3, color: 0x8a6033, alpha: 0.5 });
    this.board.addChild(bevel);

    // 2. Light-wood playing surface + bear-off tray.
    this.board.addChild(this.woodSprite(this.texSurface, this.playX0, this.playY0, this.playRegionW, this.playH));
    this.board.addChild(this.woodSprite(this.texTray, this.trayX, this.playY0, TRAY_W, this.playH));

    // Inset shadow around the well, so the surface sits below the frame.
    const inset = new Graphics();
    inset.rect(this.playX0, this.playY0, this.playRegionW, this.playH)
      .stroke({ width: 10, color: 0x1c1109, alpha: 0.28 });
    inset.rect(this.trayX, this.playY0, TRAY_W, this.playH)
      .stroke({ width: 8, color: 0x1c1109, alpha: 0.3 });
    this.board.addChild(inset);

    // 2b. Decorative medallion in the centre of each half. A user-supplied
    //     image blends into the wood via multiply (its light background melts
    //     away, leaving the inked artwork); the procedural stag just fades in.
    //     Counter-rotated in portrait so it stays upright on the phone.
    const emblemCentres = [this.playX0 + this.halfW / 2, this.playX0 + this.halfW + BAR_W + this.halfW / 2];
    emblemCentres.forEach((ex) => {
      const emblem = new Sprite(this.texEmblem);
      emblem.anchor.set(0.5);
      const size = this.emblemIsImage
        ? Math.min(this.halfW * 1.02, this.playH * 0.72)
        : Math.min(this.halfW * 0.92, this.playH * 0.6);
      emblem.width = size;
      emblem.height = size;
      emblem.scale.y *= this.roundFix; // stay proportional when the board is stretched
      if (this.emblemIsImage) {
        emblem.blendMode = 'multiply';
        emblem.alpha = 0.92;
      } else {
        emblem.alpha = 0.5;
      }
      // Both deer read upright for the viewer (net 0), on every screen.
      emblem.rotation = -this.stageRot;
      emblem.position.set(ex, this.playY0 + this.playH / 2);
      this.board.addChild(emblem);
    });

    // 3. Points: short, light-brown triangles. Scalloped light-wood cushions
    //    sit BETWEEN the triangle bases along the rail (the "ariqlar").
    const tris = new Graphics();
    const half = this.pointW / 2 - 1;
    const triLen = this.pointH * 0.7; // shorter than the stacking zone
    for (let n = 1; n <= 24; n += 1) {
      const { x, isBottom } = this.pointGeom(n);
      const railY = isBottom ? this.playY0 + this.playH : this.playY0;
      const tipY = isBottom ? railY - triLen : railY + triLen;
      tris.poly([x - half, railY, x + half, railY, x, tipY]).fill(0x9c6a3a);
    }
    this.board.addChild(tris);

    const scal = new Graphics();
    const cr = this.pointW * 0.42;
    for (let n = 1; n <= 24; n += 1) {
      const { x, isBottom } = this.pointGeom(n);
      const railY = isBottom ? this.playY0 + this.playH : this.playY0;
      const a0 = isBottom ? Math.PI : 0;
      const a1 = isBottom ? Math.PI * 2 : Math.PI;
      // A cushion at each boundary between two triangle bases.
      for (const bx of [x - this.pointW / 2, x + this.pointW / 2]) {
        scal.moveTo(bx - cr, railY);
        scal.arc(bx, railY, cr, a0, a1).fill({ color: 0xdcc094 });
        scal.arc(bx, railY, cr, a0, a1).stroke({ width: 2, color: 0x8a6c40, alpha: 0.4 });
        scal.moveTo(bx - cr * 0.55, railY);
        scal.arc(bx, railY, cr * 0.55, a0, a1).fill({ color: 0xefdcb4, alpha: 0.5 });
      }
    }
    this.board.addChild(scal);

    // 4. Centre fold: darker wood seam with brass hinges.
    this.board.addChild(this.woodSprite(this.texFrame, this.barX, this.playY0, BAR_W, this.playH));
    const seam = new Graphics();
    seam.rect(this.barX, this.playY0, BAR_W, this.playH).stroke({ width: 4, color: 0x1c1109, alpha: 0.5 });
    seam.rect(this.barX + BAR_W / 2 - 1, this.playY0, 2, this.playH).fill({ color: 0x120a04, alpha: 0.6 });
    this.board.addChild(seam);
    for (const fy of [0.2, 0.8]) {
      const hinge = new Sprite(this.texHinge);
      hinge.anchor.set(0.5);
      hinge.width = BAR_W * 1.4;
      hinge.height = BAR_W * 0.7;
      hinge.position.set(this.barX + BAR_W / 2, this.playY0 + this.playH * fy);
      this.board.addChild(hinge);
    }

    // Tray centre divider.
    const trayDiv = new Graphics();
    trayDiv.rect(this.trayX, this.playY0 + this.playH / 2 - 1, TRAY_W, 2).fill({ color: 0x000000, alpha: 0.5 });
    this.board.addChild(trayDiv);

    // 5. Vignette for depth (sits above the board, below the checkers).
    this.board.addChild(this.woodSprite(Texture.from(vignetteTexture(DESIGN_W, DESIGN_H)), 0, 0, DESIGN_W, DESIGN_H));
  }

  // ── Dynamic layers ───────────────────────────────────────────────────────────

  /**
   * Reconciles the checker layer toward `board`. Unchanged → no-op; first draw
   * → immediate; otherwise the difference is animated as gliding checkers.
   */
  private updateCheckers(board: BoardSnapshot): void {
    const sig = JSON.stringify([board.points, board.bar, board.off]);
    if (this.shownBoard && JSON.stringify([this.shownBoard.points, this.shownBoard.bar, this.shownBoard.off]) === sig) {
      return;
    }
    if (!this.shownBoard) {
      this.drawCheckers(board);
      this.shownBoard = board;
      return;
    }
    if (this.moveAnim) {
      // A glide is already running — remember the newest target and snap to it
      // when the current one finishes.
      this.pendingBoard = board;
      return;
    }
    this.startMoveAnim(this.shownBoard, board);
  }

  private startMoveAnim(from: BoardSnapshot, to: BoardSnapshot): void {
    const moves = diffMoves(from, to);
    if (moves.length === 0) {
      this.drawCheckers(to);
      this.shownBoard = to;
      return;
    }

    // Static base = the start position with the moving checkers lifted off
    // their sources (they travel as separate sprites and land via drawCheckers).
    const points = from.points.slice();
    const bar: Record<Player, number> = { ...from.bar };
    const off: Record<Player, number> = { ...from.off };
    for (const m of moves) {
      if (typeof m.fromT === 'number') {
        const i = m.fromT - 1;
        points[i] = (points[i] ?? 0) + (m.player === Player.White ? -1 : 1);
      } else if (m.fromT === 'bar') {
        bar[m.player] = Math.max(0, bar[m.player] - 1);
      }
    }
    this.drawCheckers({ points, bar, off });

    // Glow markers so it's obvious where each checker left and where it lands.
    this.fx.removeChildren().forEach((c) => c.destroy());
    const fxFrom: Graphics[] = [];
    const fxTo: { g: Graphics; x: number; y: number }[] = [];
    const sprites = moves.map((m) => {
      const s = this.markerPosition(m.fromT);
      const e = this.markerPosition(m.toT);
      const from = new Graphics();
      from.circle(0, 0, this.checkerR * 1.05).stroke({ width: 6, color: 0xf4b23e, alpha: 0.9 });
      from.position.set(s.x, s.y);
      this.fx.addChild(from);
      fxFrom.push(from);
      const to = new Graphics();
      to.circle(0, 0, this.checkerR * 1.05).stroke({ width: 6, color: 0x4ad0a0, alpha: 0.95 });
      to.position.set(e.x, e.y);
      this.fx.addChild(to);
      fxTo.push({ g: to, x: e.x, y: e.y });
      const c = this.makeChecker(s.x, s.y, m.player);
      this.checkers.addChild(c);
      return { c, sx: s.x, sy: s.y, ex: e.x, ey: e.y };
    });
    playCheckerSound();
    this.moveAnim = { target: to, sprites, fxFrom, fxTo, start: performance.now() };
  }

  private stepMove(now: number): void {
    if (!this.moveAnim) return;
    const { target, sprites, fxFrom, fxTo, start } = this.moveAnim;
    const p = Math.min(1, (now - start) / MOVE_GLIDE_MS);
    const k = easeOutCubic(p);
    for (const s of sprites) {
      s.c.position.set(s.sx + (s.ex - s.sx) * k, s.sy + (s.ey - s.sy) * k);
    }
    // Source ring fades out; destination ring pulses in as the checker lands.
    for (const g of fxFrom) g.alpha = 1 - p;
    for (const { g } of fxTo) {
      g.alpha = 0.3 + 0.7 * k;
      const s = 0.6 + 0.5 * k;
      g.scale.set(s);
    }
    if (p >= 1) {
      this.moveAnim = null;
      this.fx.removeChildren().forEach((c) => c.destroy());
      this.drawCheckers(target);
      this.shownBoard = target;
      if (this.pendingBoard) {
        const next = this.pendingBoard;
        this.pendingBoard = null;
        this.updateCheckers(next);
      }
    }
  }

  private drawCheckers(board: BoardSnapshot): void {
    this.checkers.removeChildren().forEach((c) => c.destroy());

    for (let n = 1; n <= 24; n += 1) {
      const value = board.points[n - 1] ?? 0;
      if (value === 0) continue;
      const player = value > 0 ? Player.White : Player.Black;
      const count = Math.abs(value);
      const { x, isBottom } = this.pointGeom(n);
      const baseY = isBottom ? this.playY0 + this.playH : this.playY0;
      this.stackCheckers(x, baseY, isBottom, count, player);
    }

    // Bar checkers: White low, Black high.
    if (board.bar[Player.White] > 0) {
      this.stackCheckers(this.barX + BAR_W / 2, this.playY0 + this.playH, true, board.bar[Player.White], Player.White);
    }
    if (board.bar[Player.Black] > 0) {
      this.stackCheckers(this.barX + BAR_W / 2, this.playY0, false, board.bar[Player.Black], Player.Black);
    }

    // Borne-off checkers in the tray: White bottom, Black top.
    this.drawOff(board.off[Player.White], true, Player.White);
    this.drawOff(board.off[Player.Black], false, Player.Black);
  }

  private stackCheckers(x: number, baseY: number, isBottom: boolean, count: number, player: Player): void {
    const visible = Math.min(count, 5);
    const cRad = this.checkerR * 0.95; // visual checker radius (sprite is 1.86× radius)
    const mouth = this.pointW * 0.05; // sit nestled in the scalloped cushion at the base
    const first = cRad + mouth;
    const available = this.pointH - cRad * 2 - mouth;
    const step = visible > 1 ? Math.min(cRad * 1.95, available / (visible - 1)) : 0;

    for (let i = 0; i < visible; i += 1) {
      const y = isBottom ? baseY - first - i * step : baseY + first + i * step;
      const isTop = i === visible - 1 && count > 5;
      this.checkers.addChild(this.makeChecker(x, y, player, isTop ? count : undefined));
    }
  }

  private makeChecker(x: number, y: number, player: Player, count?: number): Container {
    const c = new Container();
    const sprite = new Sprite(player === Player.White ? this.texChecker.light : this.texChecker.dark);
    sprite.anchor.set(0.5);
    // Slightly smaller than the lane so the groove walls stay visible around it.
    sprite.width = this.checkerR * 1.86;
    sprite.height = this.checkerR * 1.86;
    sprite.scale.x *= this.roundFix; // stay circular when the board is stretched
    c.addChild(sprite);
    if (count !== undefined) {
      const t = new Text({
        text: String(count),
        style: {
          fill: player === Player.White ? 0x2a2a33 : 0xf4ecd8,
          fontSize: this.checkerR * 0.9,
          fontFamily: 'Inter, sans-serif',
          fontWeight: '700',
        },
      });
      t.anchor.set(0.5);
      t.rotation = -this.stageRot; // keep the count upright for the viewer
      t.scale.y *= this.roundFix;
      c.addChild(t);
    }
    c.position.set(x, y);
    return c;
  }

  private drawOff(count: number, isBottom: boolean, player: Player): void {
    if (count <= 0) return;
    const x = this.trayX + TRAY_W / 2;
    const h = this.checkerR * 0.55;
    const stack = Math.min(count, 8);
    for (let i = 0; i < stack; i += 1) {
      const y = isBottom
        ? this.playY0 + this.playH - h - i * (h + 3) - 8
        : this.playY0 + h + i * (h + 3) + 8;
      const g = new Graphics();
      g.roundRect(x - this.checkerR * 0.8, y - h / 2, this.checkerR * 1.6, h, 4)
        .fill(player === Player.White ? 0xefe6d0 : 0x24242c)
        .stroke({ width: 2, color: player === Player.White ? 0xbfa77f : 0x4a4a58 });
      this.checkers.addChild(g);
    }
    const label = new Text({
      text: String(count),
      style: { fill: COLOR_LABEL, fontSize: 26, fontFamily: 'Inter, sans-serif', fontWeight: '700' },
    });
    label.anchor.set(0.5);
    label.rotation = -this.stageRot; // upright for the viewer
    label.scale.y *= this.roundFix;
    label.position.set(x, isBottom ? this.playY0 + this.playH / 2 + 30 : this.playY0 + this.playH / 2 - 30);
    this.checkers.addChild(label);
  }

  private drawHighlights(h: BoardHighlights): void {
    this.highlights.removeChildren().forEach((c) => c.destroy());
    const marker = (target: BoardTarget, color: number, filled: boolean) => {
      const { x, y } = this.markerPosition(target);
      const g = new Graphics();
      if (filled) g.circle(x, y, this.checkerR * 0.55).fill({ color, alpha: 0.85 });
      else g.circle(x, y, this.checkerR * 0.95).stroke({ width: 5, color, alpha: 0.9 });
      this.highlights.addChild(g);
    };
    for (const s of h.sources ?? []) marker(s, 0xf4b23e, false);
    for (const d of h.destinations ?? []) marker(d, 0x4ad0a0, true);
    if (h.selected != null) marker(h.selected, 0xffffff, false);
  }

  /** CSS-pixel centre of a target (forward transform) — for tests/animation. */
  screenCenterOf(target: BoardTarget): { x: number; y: number } {
    const { x, y } = this.markerPosition(target);
    const sx = this.scaleX;
    const sy = this.scaleY;
    if (!this.rotated && !this.flipped) return { x: x * sx, y: y * sy };
    if (this.rotated && !this.flipped) return { x: this.cssWidth - y * sy, y: x * sx };
    if (!this.rotated && this.flipped) return { x: this.cssWidth - x * sx, y: this.cssHeight - y * sy };
    return { x: y * sy, y: this.cssHeight - x * sx };
  }

  private markerPosition(target: BoardTarget): { x: number; y: number } {
    if (target === 'off') return { x: this.trayX + TRAY_W / 2, y: this.playY0 + this.playH / 2 };
    if (target === 'bar') return { x: this.barX + BAR_W / 2, y: this.playY0 + this.playH / 2 };
    const { x, isBottom } = this.pointGeom(target);
    const baseY = isBottom ? this.playY0 + this.playH : this.playY0;
    // Match the first checker slot so glides/highlights land on the cushion.
    const first = this.checkerR * 0.95 + this.pointW * 0.05;
    return { x, y: isBottom ? baseY - first : baseY + first };
  }

  /** Diff dice values; a change triggers a tumbling roll animation + sound. */
  private updateDice(dice: { first: number; second: number } | null): void {
    const sig = dice ? `${dice.first}-${dice.second}` : null;
    if (sig === this.diceSig) return;
    this.diceSig = sig;
    if (!dice) {
      this.diceAnim = null;
      this.paintDice(null);
      return;
    }
    playDiceSound();
    this.diceAnim = { target: dice, start: performance.now(), nextFlip: 0 };
  }

  private stepDice(now: number): void {
    if (!this.diceAnim) return;
    const { target, start } = this.diceAnim;
    const elapsed = now - start;
    if (elapsed >= DICE_ROLL_MS) {
      this.diceAnim = null;
      this.paintDice(target);
      return;
    }
    // Flip to fresh random faces a few times a second while tumbling.
    if (elapsed >= this.diceAnim.nextFlip) {
      this.diceAnim.nextFlip = elapsed + 70;
      const rnd = () => 1 + Math.floor(Math.random() * 6);
      this.paintDice({ first: rnd(), second: rnd() }, true);
    }
  }

  private paintDice(dice: { first: number; second: number } | null, tumbling = false): void {
    this.dice.removeChildren().forEach((c) => c.destroy());
    if (!dice) return;
    const size = this.pointW * 0.85;
    // Dice go on the active player's half (Black = design-left/portrait-top,
    // White = design-right/portrait-bottom) and read upright for that player.
    const cx =
      this.diceOwner === Player.Black
        ? this.playX0 + this.halfW / 2
        : this.playX0 + this.halfW + BAR_W + this.halfW / 2;
    const cy = this.playY0 + this.playH / 2;
    const gap = size * 0.5;
    // Dice read upright for the viewer (net 0), on the active player's half.
    const baseRot = -this.stageRot;
    const d1 = this.makeDie(cx - size / 2 - gap / 2, cy, size, dice.first);
    const d2 = this.makeDie(cx + size / 2 + gap / 2, cy, size, dice.second);
    d1.rotation = baseRot + (tumbling ? (Math.random() - 0.5) * 0.7 : 0);
    d2.rotation = baseRot + (tumbling ? (Math.random() - 0.5) * 0.7 : 0);
    this.dice.addChild(d1, d2);
  }

  private makeDie(cx: number, cy: number, size: number, value: number): Container {
    const c = new Container();
    const sprite = new Sprite(this.texDie[Math.min(6, Math.max(1, value)) - 1]);
    sprite.anchor.set(0.5);
    // The die texture includes padding for its drop shadow.
    sprite.width = size * 1.28;
    sprite.height = size * 1.28;
    // The die is rotated with the board, so the stretch fix goes on scale.y.
    sprite.scale.y *= this.roundFix;
    c.addChild(sprite);
    c.position.set(cx, cy);
    return c;
  }

  // ── Geometry helpers ─────────────────────────────────────────────────────────

  private pointGeom(n: number): { x: number; isBottom: boolean; col: number } {
    const isBottom = n >= 1 && n <= 12;
    const col = isBottom ? 12 - n : n - 13;
    return { x: this.colX(col), isBottom, col };
  }

  private colX(col: number): number {
    const withinCol = col < 6 ? col : col - 6;
    const halfOffset = col < 6 ? 0 : this.halfW + BAR_W;
    return this.playX0 + halfOffset + withinCol * this.pointW + this.pointW / 2;
  }
}

/**
 * Derives the checker movements between two board snapshots by counting, per
 * player, which points/bar lost checkers (sources) and which points/off gained
 * them (destinations), then pairing sources to destinations in order. Since
 * checkers are conserved, the two lists match per player. Good enough to animate
 * both single taps and whole multi-checker turns without threading move data.
 */
function diffMoves(from: BoardSnapshot, to: BoardSnapshot): AnimMove[] {
  const moves: AnimMove[] = [];

  for (const player of [Player.White, Player.Black]) {
    const sign = player === Player.White ? 1 : -1;
    const at = (b: BoardSnapshot, i: number) => Math.max(0, (b.points[i] ?? 0) * sign);

    const sources: BoardTarget[] = [];
    const dests: BoardTarget[] = [];

    for (let n = 1; n <= 24; n += 1) {
      const delta = at(to, n - 1) - at(from, n - 1);
      for (let k = 0; k < -delta; k += 1) sources.push(n);
      for (let k = 0; k < delta; k += 1) dests.push(n);
    }
    const barDelta = to.bar[player] - from.bar[player];
    for (let k = 0; k < -barDelta; k += 1) sources.push('bar');
    for (let k = 0; k < barDelta; k += 1) dests.push('bar');
    const offDelta = to.off[player] - from.off[player];
    for (let k = 0; k < offDelta; k += 1) dests.push('off');

    const pairs = Math.min(sources.length, dests.length);
    for (let i = 0; i < pairs; i += 1) {
      moves.push({ fromT: sources[i]!, toT: dests[i]!, player });
    }
  }
  return moves;
}
