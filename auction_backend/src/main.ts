import './config/env.types';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Настройка статической раздачи файлов из папки uploads
  app.useStaticAssets(join(__dirname, '..', 'uploads'), {
    prefix: '/uploads/',
  });

  // Настройка Swagger
  const config = new DocumentBuilder()
    .setTitle('Auction API')
    .setDescription('API для аукционной системы с системой ставок')
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT',
        description: 'Введите JWT токен',
        in: 'header',
      },
      'JWT-auth',
    )
    .addTag('Auth', 'Аутентификация и авторизация')
    .addTag('Lots', 'Управление лотами')
    .addTag('Bidding', 'Система ставок')
    .addTag('Bids', 'Покупка и управление ставками')
    .addTag('Upload', 'Загрузка файлов')
    .addTag('Bots', 'Управление ботами')
    .addTag('App', 'Основные эндпоинты')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  app.setGlobalPrefix('api');
  app.enableCors();
  await app.listen(process.env.PORT ?? 4200);
}
bootstrap();
