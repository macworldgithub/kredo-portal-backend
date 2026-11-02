import { ValidationPipe, type INestApplication } from '@nestjs/common';
import helmet from 'helmet';
import compression from 'compression';

function normalizeOrigin(origin: string): string {
  return origin.trim().replace(/\/+$/, '');
}

export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix('api');

  // ── Security middleware ──
  app.use(helmet());
  app.use(compression());

  // ── CORS ──
  // Supports multiple origins separated by commas in CORS_ORIGINS.
  const allowedOrigins = new Set(
    [
      process.env.FRONTEND_URL,
      ...(process.env.CORS_ORIGINS || '').split(','),
      // Local development URLs
      'http://localhost:3000',
      'http://127.0.0.1:3000',
    ]
      .filter((origin): origin is string => Boolean(origin?.trim()))
      .map(normalizeOrigin),
  );

  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (error: Error | null, allow?: boolean) => void,
    ) => {
      // Allow requests without an Origin header, such as Postman,
      // server-to-server requests, or health checks.
      if (!origin) {
        return callback(null, true);
      }

      const normalizedOrigin = normalizeOrigin(origin);

      if (allowedOrigins.has(normalizedOrigin)) {
        return callback(null, true);
      }

      return callback(
        new Error(`CORS policy does not allow access from origin: ${origin}`),
        false,
      );
    },

    credentials: true,

    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],

    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // ── Validation ──
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
}