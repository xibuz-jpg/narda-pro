import { IsIn } from 'class-validator';
import type { AiLevel } from '@narda/game-engine';

const LEVELS: AiLevel[] = ['EASY', 'MEDIUM', 'HARD', 'EXPERT', 'GRANDMASTER'];

/** Body for `POST /games/ai`. */
export class CreateAiGameDto {
  @IsIn(LEVELS)
  level!: AiLevel;
}
