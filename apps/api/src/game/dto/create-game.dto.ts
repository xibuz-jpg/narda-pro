import { IsString, IsNotEmpty, Length } from 'class-validator';

/** Body for `POST /games` — start a casual game against another user. */
export class CreateGameDto {
  @IsString()
  @IsNotEmpty()
  @Length(1, 64)
  opponentId!: string;
}
