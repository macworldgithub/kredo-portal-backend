import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module.js';
import { configureApp } from './configure-app.js';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const isProduction = process.env.NODE_ENV === 'production';

  const app = await NestFactory.create(AppModule, {
    logger: isProduction
      ? ['error', 'warn', 'log']
      : ['error', 'warn', 'log', 'debug', 'verbose'],
  });

  configureApp(app);

  // Trust the first proxy (Nginx) so X-Forwarded-* headers are respected
  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.set('trust proxy', 1);

  // Disable Express "X-Powered-By" header
  expressApp.disable('x-powered-by');

  // Graceful shutdown hooks (SIGTERM from PM2/Docker, SIGINT from Ctrl+C)
  app.enableShutdownHooks();

  const port = process.env.PORT ?? 5000;
  await app.listen(port);
  logger.log(`Server running on port ${port} [${isProduction ? 'production' : 'development'}]`);

  // Signal PM2 that the app is ready (works with wait_ready: true)
  if (typeof process.send === 'function') {
    process.send('ready');
  }
}

void bootstrap();
