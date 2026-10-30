import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { BotsController } from './bots.controller';
import { BiddingModule } from '../bidding/bidding.module';

@Module({
  controllers: [BotsController],
  providers: [PrismaService],
  imports: [BiddingModule],
  exports: [],
})
export class BotsModule {}

