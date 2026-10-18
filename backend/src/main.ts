import 'reflect-metadata';
import 'dotenv/config';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule,DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
async function bootstrap(){
 const app=await NestFactory.create(AppModule);app.setGlobalPrefix('api');app.enableShutdownHooks();
 app.enableCors({origin:process.env.FRONTEND_ORIGIN||'http://localhost:3000'});
 app.useGlobalPipes(new ValidationPipe({whitelist:true,transform:true,forbidUnknownValues:true}));
 const config=new DocumentBuilder().setTitle('Smart Classroom — nền v2').setDescription('API nền. Schema qua migration; n8n chịu trách nhiệm tự động hóa.').setVersion('0.1.0').addBearerAuth().build();
 SwaggerModule.setup('api/docs',app,SwaggerModule.createDocument(app,config));
 await app.listen(Number(process.env.PORT||3001),process.env.HOST||'127.0.0.1');console.log('API: http://localhost:3001/api | Swagger: /api/docs');
}
bootstrap().catch(e=>{console.error(e);process.exit(1);});
