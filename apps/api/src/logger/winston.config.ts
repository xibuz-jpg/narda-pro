import { utilities as nestWinstonUtilities } from 'nest-winston';
import * as winston from 'winston';

/**
 * Builds the Winston logger options.
 *
 *   • production → structured JSON (one line per event) for log aggregation.
 *   • development → colourised, human-readable output with a NestJS-style prefix.
 *
 * Every log line carries the service name so entries can be correlated once
 * multiple services are running.
 */
export function createWinstonOptions(
  level: string,
  isProduction: boolean,
): winston.LoggerOptions {
  const base: winston.LoggerOptions = {
    level,
    defaultMeta: { service: 'narda-api' },
  };

  if (isProduction) {
    return {
      ...base,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json(),
      ),
      transports: [new winston.transports.Console()],
    };
  }

  return {
    ...base,
    format: winston.format.combine(
      winston.format.timestamp({ format: 'HH:mm:ss.SSS' }),
      winston.format.ms(),
      winston.format.errors({ stack: true }),
      nestWinstonUtilities.format.nestLike('Narda', {
        colors: true,
        prettyPrint: true,
      }),
    ),
    transports: [new winston.transports.Console()],
  };
}
