import {
  Body,
  Controller,
  BadRequestException,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { Admin } from '../auth/decorators';
import { BotService } from './bot.service';
import { CreateBotDto } from './create-bot.dto';

@Controller('bots')
@Admin()
export class BotsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly botService: BotService,
  ) {}

  @Get()
  findAll() {
    return this.prisma.bot.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
      take: 200,
    });
  }

  @Post()
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async createBot(@Body() dto: CreateBotDto) {
    const count = await this.prisma.bot.count();
    if (count >= 200) {
      throw new BadRequestException('В пуле может быть не больше 200 ботов');
    }
    const bot = await this.prisma.bot.create({
      data: { name: dto.name.trim() },
    });
    await this.botService.refreshBotPool();
    return bot;
  }

  @Delete(':id')
  @HttpCode(200)
  async removeBot(@Param('id') id: string) {
    await this.prisma.bot.delete({ where: { id } });
    await this.botService.refreshBotPool();
    return { id, message: 'Бот удалён' };
  }
}
