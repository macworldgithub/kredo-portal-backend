import type { Request, Response } from 'express';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';

let appPromise: Promise<INestApplication> | undefined;

function getApp(): Promise<INestApplication> {
  if (!appPromise) {
    appPromise = NestFactory.create(AppModule)
      .then(async (app) => {
        configureApp(app);
        await app.init();
        return app;
      })
      .catch((error: unknown) => {
        appPromise = undefined;
        throw error;
      });
  }
  return appPromise;
}

export default async function handler(request: Request, response: Response): Promise<void> {
  const app = await getApp();
  const expressApp = app.getHttpAdapter().getInstance();
  expressApp(request, response);
}
