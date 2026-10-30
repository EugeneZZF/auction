import { Module } from '@nestjs/common';
import { LotsService } from './lots.service';
import { LotsController } from './lots.controller';
import { PrismaService } from '../prisma.service';
import { RedisService } from '../bidding/redis.service';

@Module({
  controllers: [LotsController],
  providers: [LotsService, PrismaService, RedisService],
  exports: [LotsService],
})
export class LotsModule {}
