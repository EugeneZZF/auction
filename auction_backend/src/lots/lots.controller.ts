import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { LotsService } from './lots.service';
import { CreateLotDto } from './dto/create-lot.dto';
import { UpdateLotDto } from './dto/update-lot.dto';
import { SetBotsEnabledDto } from './dto/set-bots-enabled.dto';
import { Admin } from '../auth/decorators';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
  ApiParam,
} from '@nestjs/swagger';

@ApiTags('Lots')
@Controller('lots')
export class LotsController {
  constructor(private readonly lotsService: LotsService) {}

  @ApiOperation({
    summary: 'Создание лота',
    description: 'Создание нового лота (только для администраторов)',
  })
  @ApiResponse({
    status: 201,
    description: 'Лот успешно создан',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string', example: 'uuid' },
        title: { type: 'string', example: 'Золотое кольцо с бриллиантом' },
        description: { type: 'string', example: 'Красивое золотое кольцо' },
        image: { type: 'string', example: '/uploads/ring.jpg' },
        basePrice: { type: 'number', example: 50000 },
        periodSeconds: { type: 'number', example: 3600 },
        currentStart: { type: 'string', format: 'date-time' },
        currentEnd: { type: 'string', format: 'date-time' },
        isActive: { type: 'boolean', example: true },
        inactivityTimeoutMs: { type: 'number', example: 10000 },
        createdAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Необходимы права администратора',
  })
  @ApiBearerAuth('JWT-auth')
  @ApiBody({ type: CreateLotDto })
  @Post()
  @Admin()
  create(@Body() createLotDto: CreateLotDto) {
    return this.lotsService.create(createLotDto);
  }

  @ApiOperation({
    summary: 'Получение всех лотов',
    description: 'Получение списка всех лотов с автоматическим обновлением времени',
  })
  @ApiResponse({
    status: 200,
    description: 'Список всех лотов',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', example: 'uuid' },
          title: { type: 'string', example: 'Золотое кольцо' },
          description: { type: 'string', example: 'Описание лота' },
          image: { type: 'string', example: '/uploads/image.jpg' },
          basePrice: { type: 'number', example: 50000 },
          periodSeconds: { type: 'number', example: 3600 },
          currentStart: { type: 'string', format: 'date-time' },
          currentEnd: { type: 'string', format: 'date-time' },
          isActive: { type: 'boolean', example: true },
          inactivityTimeoutMs: { type: 'number', example: 10000 },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
    },
  })
  @Get()
  findAll() {
    return this.lotsService.findAllWithAutoUpdate();
  }

  @ApiOperation({
    summary: 'Получение активных лотов',
    description: 'Получение списка только активных лотов с автоматическим обновлением времени',
  })
  @ApiResponse({
    status: 200,
    description: 'Список активных лотов',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', example: 'uuid' },
          title: { type: 'string', example: 'Золотое кольцо' },
          description: { type: 'string', example: 'Описание лота' },
          image: { type: 'string', example: '/uploads/image.jpg' },
          basePrice: { type: 'number', example: 50000 },
          periodSeconds: { type: 'number', example: 3600 },
          currentStart: { type: 'string', format: 'date-time' },
          currentEnd: { type: 'string', format: 'date-time' },
          isActive: { type: 'boolean', example: true },
          inactivityTimeoutMs: { type: 'number', example: 10000 },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
    },
  })
  @Get('active')
  findActive() {
    return this.lotsService.findActiveWithAutoUpdate();
  }

  @ApiOperation({
    summary: 'Получение лота по ID',
    description: 'Получение информации о конкретном лоте по его идентификатору',
  })
  @ApiResponse({
    status: 200,
    description: 'Информация о лоте',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string', example: 'uuid' },
        title: { type: 'string', example: 'Золотое кольцо' },
        description: { type: 'string', example: 'Описание лота' },
        image: { type: 'string', example: '/uploads/image.jpg' },
        basePrice: { type: 'number', example: 50000 },
        periodSeconds: { type: 'number', example: 3600 },
        currentStart: { type: 'string', format: 'date-time' },
        currentEnd: { type: 'string', format: 'date-time' },
        isActive: { type: 'boolean', example: true },
        inactivityTimeoutMs: { type: 'number', example: 10000 },
        createdAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Лот не найден',
  })
  @ApiParam({
    name: 'id',
    description: 'Уникальный идентификатор лота',
    example: 'uuid',
  })
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.lotsService.findOneWithAutoUpdate(id);
  }

  @ApiOperation({
    summary: 'Обновление лота',
    description: 'Обновление информации о лоте (только для администраторов)',
  })
  @ApiResponse({
    status: 200,
    description: 'Лот успешно обновлен',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string', example: 'uuid' },
        title: { type: 'string', example: 'Обновленное название' },
        description: { type: 'string', example: 'Обновленное описание' },
        image: { type: 'string', example: '/uploads/new-image.jpg' },
        basePrice: { type: 'number', example: 60000 },
        periodSeconds: { type: 'number', example: 7200 },
        currentStart: { type: 'string', format: 'date-time' },
        currentEnd: { type: 'string', format: 'date-time' },
        isActive: { type: 'boolean', example: true },
        inactivityTimeoutMs: { type: 'number', example: 15000 },
        createdAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Необходимы права администратора',
  })
  @ApiResponse({
    status: 404,
    description: 'Лот не найден',
  })
  @ApiBearerAuth('JWT-auth')
  @ApiParam({
    name: 'id',
    description: 'Уникальный идентификатор лота',
    example: 'uuid',
  })
  @ApiBody({ type: UpdateLotDto })
  @Patch(':id')
  @Admin()
  update(@Param('id') id: string, @Body() updateLotDto: UpdateLotDto) {
    return this.lotsService.update(id, updateLotDto);
  }

  @ApiOperation({
    summary: 'Удаление лота',
    description: 'Удаление лота (только для администраторов)',
  })
  @ApiResponse({
    status: 200,
    description: 'Лот успешно удален',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Лот успешно удален' },
        id: { type: 'string', example: 'uuid' },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Необходимы права администратора',
  })
  @ApiResponse({
    status: 404,
    description: 'Лот не найден',
  })
  @ApiBearerAuth('JWT-auth')
  @ApiParam({
    name: 'id',
    description: 'Уникальный идентификатор лота',
    example: 'uuid',
  })
  @Delete(':id')
  @Admin()
  remove(@Param('id') id: string) {
    return this.lotsService.remove(id);
  }

  @ApiOperation({
    summary: 'Переключение активности лота',
    description: 'Активация или деактивация лота (только для администраторов)',
  })
  @ApiResponse({
    status: 200,
    description: 'Статус активности лота изменен',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string', example: 'uuid' },
        isActive: { type: 'boolean', example: false },
        message: { type: 'string', example: 'Лот деактивирован' },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Необходимы права администратора',
  })
  @ApiResponse({
    status: 404,
    description: 'Лот не найден',
  })
  @ApiBearerAuth('JWT-auth')
  @ApiParam({
    name: 'id',
    description: 'Уникальный идентификатор лота',
    example: 'uuid',
  })
  @Patch(':id/toggle')
  @Admin()
  toggleActive(@Param('id') id: string) {
    return this.lotsService.toggleActive(id);
  }

  @ApiOperation({ summary: 'Включить или отключить ботов на лоте' })
  @ApiBearerAuth('JWT-auth')
  @ApiBody({ type: SetBotsEnabledDto })
  @Patch(':id/bots')
  @Admin()
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  setBotsEnabled(@Param('id') id: string, @Body() dto: SetBotsEnabledDto) {
    return this.lotsService.setBotsEnabled(id, dto.enabled);
  }

  @ApiOperation({
    summary: 'Обновление истекших лотов',
    description: 'Принудительное обновление времени розыгрыша для всех истекших лотов (только для администраторов)',
  })
  @ApiResponse({
    status: 200,
    description: 'Истекшие лоты обновлены',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Истекшие лоты обновлены' },
        updatedCount: { type: 'number', example: 5 },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Необходимы права администратора',
  })
  @ApiBearerAuth('JWT-auth')
  @Post('update-expired')
  @Admin()
  updateExpiredLots() {
    return this.lotsService.updateExpiredLots();
  }
}
