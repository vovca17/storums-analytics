import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { securityHeaders } from './common/security-headers';
import type { Env } from './config';

// Prisma отдаёт Decimal объектом — в JSON отправляем строкой "1234.50".
import { Prisma } from '@storums/db';
(Prisma.Decimal.prototype as unknown as { toJSON: () => string }).toJSON = function (this: Prisma.Decimal) {
  return this.toFixed(2);
};

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService<Env, true>);

  app.use(securityHeaders);
  app.setGlobalPrefix('api/v1');
  app.enableCors({ origin: config.get('WEB_ORIGIN', { infer: true }), credentials: true });
  app.enableShutdownHooks();

  // Swagger только вне прода: на проде он открыт без авторизации и нужен лишь для разведки
  if (process.env.VERCEL_ENV !== 'production') {
    const doc = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('Storums API').setVersion('1').addBearerAuth().build(),
    );
    SwaggerModule.setup('api/docs', app, doc, { jsonDocumentUrl: 'api/docs.json' });
  }

  await app.listen(config.get('PORT', { infer: true }));
}
bootstrap();
