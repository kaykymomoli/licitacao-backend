import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

// Configurar LangSmith antes de qualquer coisa
process.env.LANGCHAIN_TRACING_V2 = process.env.LANGCHAIN_TRACING_V2 ?? 'false';
process.env.LANGCHAIN_PROJECT = process.env.LANGCHAIN_PROJECT ?? 'licitacao-saas';

async function bootstrap() {
  const fastifyAdapter = new FastifyAdapter();

  // Registrar multipart antes de criar a aplicação
  fastifyAdapter.register(
    require('@fastify/multipart'),
    {
      limits: {
        fileSize: 10 * 1024 * 1024,
        files: 1,
      },
      attachFieldsToBody: false,
    },
  );

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    fastifyAdapter,
  );

  const configService = app.get(ConfigService);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  app.enableCors({
    origin: true,
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  });

  const port = configService.get<number>('PORT') ?? 3000;
  await app.listen(port, '0.0.0.0');
  console.log(`Servidor rodando na porta ${port}`);
} 

bootstrap();