import { ValidationPipe, type INestApplication } from '@nestjs/common';

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
      callback(null, !origin || allowedOrigins.has(origin.replace(/\/+$/, '')));
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
