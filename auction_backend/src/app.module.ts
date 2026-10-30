import { MiddlewareConsumer, Module, RequestMethod } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { ConfigModule } from '@nestjs/config';
import { UploadController } from './upload.controller';
import { LotsModule } from './lots/lots.module';
import { BidsModule } from './bids/bids.module';
import { BiddingModule } from './bidding/bidding.module';
import { BotsModule } from './bots/bots.module';
import { FeedbackModule } from './mail/feedback.module';
import { AdminMiddleware } from './auth/middleware/admin.middleware';
import { PrismaService } from './prisma.service';

@Module({
  imports: [
    ConfigModule.forRoot(),
    ScheduleModule.forRoot(),
    AuthModule,
    LotsModule,
    BidsModule,
    BiddingModule,
    BotsModule,
    FeedbackModule,
  ],
  controllers: [AppController, UploadController],
  providers: [AppService, PrismaService],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(AdminMiddleware)
      .forRoutes(
        { path: 'lots', method: RequestMethod.POST },
        { path: 'lots/:id', method: RequestMethod.PATCH },
        { path: 'lots/:id', method: RequestMethod.DELETE },
        { path: 'lots/:id/toggle', method: RequestMethod.PATCH },
        { path: 'lots/:id/bots', method: RequestMethod.PATCH },
        { path: 'lots/update-expired', method: RequestMethod.POST },
        { path: 'bots', method: RequestMethod.ALL },
        { path: 'upload/image/:filename', method: RequestMethod.DELETE },
        { path: 'auth/roles/admin', method: RequestMethod.POST },
        { path: 'auth/admin/users', method: RequestMethod.GET },
        { path: 'auth/admin/users/:id', method: RequestMethod.PATCH },
        { path: 'auth/admin/users/:id/balance', method: RequestMethod.PATCH },
      );
  }
}
