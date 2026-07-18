import { Module } from '@nestjs/common';
import { ProgressionService } from './progression.service';

/** Progression bounded context: stats and ELO updates on game completion. */
@Module({
  providers: [ProgressionService],
  exports: [ProgressionService],
})
export class ProgressionModule {}
