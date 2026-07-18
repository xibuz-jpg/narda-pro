import { useEffect, useRef } from 'react';
import type { BoardSnapshot, Player } from '@narda/game-engine';
import {
  BoardRenderer,
  BOARD_ASPECT,
  BOARD_ASPECT_PORTRAIT,
  type BoardHighlights,
  type BoardTarget,
} from '../game/board/BoardRenderer';

interface GameBoardProps {
  board: BoardSnapshot;
  dice?: { first: number; second: number } | null;
  highlights?: BoardHighlights;
  onTargetClick?: (target: BoardTarget) => void;
  /** Whose turn it is — the dice render on (and upright for) this player's half. */
  activePlayer?: Player | null;
  /** Flip 180° to the viewer's perspective (their own pieces on the left). */
  flip?: boolean;
  /** Portrait mode rotates the board 90° to fill a tall phone screen. */
  rotated?: boolean;
  /** Fit inside the container's width AND height (vs. width-only, aspect box). */
  fit?: boolean;
  className?: string;
}

/**
 * Mounts a {@link BoardRenderer} and keeps it in sync with props. Translates
 * taps into board targets (points / bar / off) for move input.
 */
export function GameBoard({
  board,
  dice,
  highlights,
  onTargetClick,
  activePlayer,
  flip = false,
  rotated = false,
  fit = false,
  className = 'w-full',
}: GameBoardProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<BoardRenderer | null>(null);
  const clickRef = useRef<GameBoardProps['onTargetClick']>(onTargetClick);
  clickRef.current = onTargetClick;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let disposed = false;
    let observer: ResizeObserver | undefined;

    const onPointerDown = (event: PointerEvent) => {
      const renderer = rendererRef.current;
      const canvas = host.querySelector('canvas');
      if (!renderer || !canvas || !clickRef.current) return;
      const rect = canvas.getBoundingClientRect();
      const target = renderer.pointAt(event.clientX - rect.left, event.clientY - rect.top);
      if (target !== null) clickRef.current(target);
    };

    const width = () => host.clientWidth || 360;
    const height = () => (fit ? host.clientHeight || 600 : Number.POSITIVE_INFINITY);

    void BoardRenderer.create(host, width(), height(), rotated, flip).then((renderer) => {
      if (disposed) {
        renderer.destroy();
        return;
      }
      rendererRef.current = renderer;
      renderer.render(board, dice, highlights, activePlayer);
      host.addEventListener('pointerdown', onPointerDown);
      observer = new ResizeObserver(() => {
        if (host.clientWidth > 0) renderer.resize(width(), height());
      });
      observer.observe(host);
    });

    return () => {
      disposed = true;
      observer?.disconnect();
      host.removeEventListener('pointerdown', onPointerDown);
      rendererRef.current?.destroy();
      rendererRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rotated, fit, flip]);

  useEffect(() => {
    rendererRef.current?.render(board, dice, highlights, activePlayer);
  }, [board, dice, highlights, activePlayer]);

  if (fit) {
    return (
      <div ref={hostRef} className={`flex items-center justify-center touch-none ${className}`} />
    );
  }
  const aspectRatio = rotated ? BOARD_ASPECT_PORTRAIT : BOARD_ASPECT;
  return (
    <div ref={hostRef} className={`touch-none ${className}`} style={{ aspectRatio: String(aspectRatio) }} />
  );
}
