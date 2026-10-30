import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';

@ApiTags('App')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @ApiOperation({
    summary: 'Проверка работоспособности API',
    description: 'Простой эндпоинт для проверки работоспособности API',
  })
  @ApiResponse({
    status: 200,
    description: 'API работает корректно',
    schema: {
      type: 'string',
      example: 'Hello World!',
    },
  })
  @Get()
  getHello(): string {
    return this.appService.getHello();
  }
}
