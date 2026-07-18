import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

/** Body for `PATCH /users/me` — sets the player's chosen display name. */
export class UpdateProfileDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(24)
  displayName!: string;
}
