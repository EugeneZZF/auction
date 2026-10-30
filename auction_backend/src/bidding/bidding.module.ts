import { Module } from '@nestjs/common';
import { BiddingService } from './bidding.service';
import { BiddingController } from './bidding.controller';
import { BiddingGateway } from './bidding.gateway';
import { RedisService } from './redis.service';
import { PrismaService } from '../prisma.service';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { getJwtConfig } from '../config/jwt.config';
import { BidsModule } from '../bids/bids.module';
import { AuctionSchedulerService } from './scheduler.service';
import { BotService } from '../bots/bot.service';
import { TimersGateway } from './timers.gateway';
import { forwardRef } from '@nestjs/common';

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: getJwtConfig,
    }),
    BidsModule,
  ],
  controllers: [BiddingController],
  providers: [
    BiddingService,
    BiddingGateway,
    TimersGateway,
    RedisService,
    PrismaService,
    AuctionSchedulerService,
    BotService,
  ],
  exports: [BiddingService, RedisService, BiddingGateway, AuctionSchedulerService, BotService],
})
export class BiddingModule {}
