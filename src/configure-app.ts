import { ValidationPipe, type INestApplication } from '@nestjs/common';

function isLocalDevelopmentOrigin(origin: string): boolean {
  if (process.env.NODE_ENV === 'production') return false;

  try {
    const url = new URL(origin);
    if (url.protocol !== 'http:' || url.port !== '3000') return false;
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') return true;

    const octets = url.hostname.split('.').map(Number);
    if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
      return false;
    }
    return octets[0] === 10
      || (octets[0] === 192 && octets[1] === 168)
      || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31);
  } catch {
    return false;
  }
}

export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix('api');

  const allowedOrigins = new Set(
    [
      process.env.FRONTEND_URL,
      ...(process.env.CORS_ORIGINS || '').split(','),
      ...(process.env.NODE_ENV === 'production' ? [] : ['http://localhost:3000']),
    ]
      .map((origin) => origin?.trim().replace(/\/+$/, ''))
      .filter((origin): origin is string => Boolean(origin)),
  );

  app.enableCors({
    origin: (origin: string | undefined, callback: (error: Error | null, origin?: boolean) => void) => {
      const normalizedOrigin = origin?.replace(/\/+$/, '');
      callback(
        null,
        !origin || (normalizedOrigin !== undefined && allowedOrigins.has(normalizedOrigin))
          || isLocalDevelopmentOrigin(origin),
      );
    },
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
}
