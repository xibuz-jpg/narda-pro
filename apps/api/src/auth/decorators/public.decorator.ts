import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marks a route (or whole controller) as public, bypassing the global
 * {@link JwtAuthGuard}. Use sparingly — only for endpoints that must be
 * reachable without authentication (login, refresh, health).
 */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);
