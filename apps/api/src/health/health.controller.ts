import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  MemoryHealthIndicator,
  type HealthCheckResult,
} from '@nestjs/terminus';
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaHealthIndicator } from './prisma.health';
import { RedisHealthIndicator } from './redis.health';
import { Public } from '../auth/decorators/public.decorator';

/**
 * Liveness/readiness endpoints for load balancers and orchestrators.
 *
 * `/health` is a lightweight liveness probe (process is up and not out of
 * memory). Database and Redis readiness indicators are added when those
 * modules land, so the check grows with the system.
 */
@Controller('health')
@Public()
@SkipThrottle()
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly memory: MemoryHealthIndicator,
    private readonly database: PrismaHealthIndicator,
    private readonly redis: RedisHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  check(): Promise<HealthCheckResult> {
    return this.health.check([
      // Alert if the process heap exceeds 512 MB — a cheap liveness signal.
      () => this.memory.checkHeap('memory_heap', 512 * 1024 * 1024),
      // Readiness: the database must be reachable.
      () => this.database.pingCheck('database'),
      // Readiness: Redis must be reachable.
      () => this.redis.pingCheck('redis'),
    ]);
  }
}
