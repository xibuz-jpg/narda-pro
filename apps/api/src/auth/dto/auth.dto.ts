import { IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';

/** Body for `POST /auth/telegram`. */
export class TelegramAuthDto {
  /** The raw `initData` string handed to the Mini App by Telegram. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  initData!: string;
}

/** Body for `POST /auth/refresh` and `POST /auth/logout`. */
export class RefreshTokenDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  refreshToken!: string;
}

/** Body for `POST /auth/dev` (development only). */
export class DevLoginDto {
  @IsInt()
  @Min(1)
  telegramId!: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  firstName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  username?: string;
}
