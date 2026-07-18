import { Body, Controller, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { AuthService, type AuthResult } from './auth.service';
import { TelegramAuthDto, RefreshTokenDto, DevLoginDto } from './dto/auth.dto';
import { Public } from './decorators/public.decorator';
import type { AuthTokens, SessionContext } from './auth.types';

/**
 * Authentication endpoints. All are public (they establish, refresh, or drop a
 * session) but rate-limited more tightly than the global default to blunt
 * credential-stuffing and brute-force attempts.
 */
@Controller('auth')
@Public()
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** Log in / register from Telegram Mini App init data. */
  @Post('telegram')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  login(@Body() dto: TelegramAuthDto, @Req() req: Request): Promise<AuthResult> {
    return this.auth.loginWithTelegram(dto.initData, sessionContext(req));
  }

  /** Development-only login for browser testing (disabled in production). */
  @Post('dev')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  devLogin(@Body() dto: DevLoginDto, @Req() req: Request): Promise<AuthResult> {
    return this.auth.devLogin(dto, sessionContext(req));
  }

  /** Rotate an access/refresh token pair. */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  refresh(@Body() dto: RefreshTokenDto, @Req() req: Request): Promise<AuthTokens> {
    return this.auth.refresh(dto.refreshToken, sessionContext(req));
  }

  /** Revoke a refresh token (logout). */
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Body() dto: RefreshTokenDto): Promise<void> {
    await this.auth.logout(dto.refreshToken);
  }
}

function sessionContext(req: Request): SessionContext {
  const userAgent = req.headers['user-agent'];
  return {
    ip: req.ip,
    ...(typeof userAgent === 'string' ? { userAgent } : {}),
  };
}
