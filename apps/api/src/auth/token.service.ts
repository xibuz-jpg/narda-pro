import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomBytes, createHash } from 'node:crypto';
import type { User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfigService } from '../config/app-config.service';
import type { AccessTokenPayload, AuthTokens, SessionContext } from './auth.types';

/**
 * Issues and rotates authentication tokens.
 *
 * Design:
 *   • Access tokens are short-lived signed JWTs — stateless, fast to verify.
 *   • Refresh tokens are long-lived **opaque** random strings. Only their
 *     SHA-256 hash is stored, so a database leak cannot yield usable tokens.
 *   • Refresh tokens rotate on every use and are grouped into a `family`.
 *     Presenting an already-rotated (revoked) token means it was stolen and
 *     replayed → the whole family is revoked immediately.
 */
@Injectable()
export class TokenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: AppConfigService,
  ) {}

  /** Issues a fresh access + refresh pair for a new session. */
  async issueTokens(user: User, ctx: SessionContext): Promise<AuthTokens> {
    const accessToken = await this.signAccessToken(user);
    const refreshToken = await this.createRefreshToken(user.id, newFamilyId(), ctx);
    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: this.config.jwt.accessTtlSeconds,
    };
  }

  /**
   * Rotates a refresh token: validates it, issues a replacement in the same
   * family, and revokes the old one. Detects and neutralizes token reuse.
   */
  async rotate(rawRefreshToken: string, ctx: SessionContext): Promise<{ tokens: AuthTokens; user: User }> {
    const tokenHash = hashToken(rawRefreshToken);
    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!record) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    if (record.revokedAt) {
      // Reuse of a rotated token — treat the whole family as compromised.
      await this.revokeFamily(record.family);
      throw new UnauthorizedException('Refresh token reuse detected');
    }
    if (record.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Refresh token expired');
    }

    const newRaw = generateRawToken();
    const newHash = hashToken(newRaw);
    const expiresAt = new Date(Date.now() + this.config.jwt.refreshTtlSeconds * 1000);

    await this.prisma.$transaction(async (tx) => {
      const replacement = await tx.refreshToken.create({
        data: {
          userId: record.userId,
          tokenHash: newHash,
          family: record.family,
          expiresAt,
          userAgent: ctx.userAgent ?? null,
          ip: ctx.ip ?? null,
        },
      });
      await tx.refreshToken.update({
        where: { id: record.id },
        data: { revokedAt: new Date(), replacedById: replacement.id },
      });
    });

    const accessToken = await this.signAccessToken(record.user);
    return {
      tokens: {
        accessToken,
        refreshToken: newRaw,
        tokenType: 'Bearer',
        expiresIn: this.config.jwt.accessTtlSeconds,
      },
      user: record.user,
    };
  }

  /** Revokes a single refresh token (logout of one device). */
  async revoke(rawRefreshToken: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: hashToken(rawRefreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private signAccessToken(user: User): Promise<string> {
    const payload: AccessTokenPayload = { sub: user.id, role: user.role };
    return this.jwt.signAsync(payload, {
      secret: this.config.jwt.accessSecret,
      expiresIn: this.config.jwt.accessTtlSeconds,
    });
  }

  private async createRefreshToken(
    userId: string,
    family: string,
    ctx: SessionContext,
  ): Promise<string> {
    const raw = generateRawToken();
    const expiresAt = new Date(Date.now() + this.config.jwt.refreshTtlSeconds * 1000);
    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: hashToken(raw),
        family,
        expiresAt,
        userAgent: ctx.userAgent ?? null,
        ip: ctx.ip ?? null,
      },
    });
    return raw;
  }

  private async revokeFamily(family: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { family, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}

function generateRawToken(): string {
  return randomBytes(48).toString('base64url');
}

function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

function newFamilyId(): string {
  return randomBytes(16).toString('hex');
}
