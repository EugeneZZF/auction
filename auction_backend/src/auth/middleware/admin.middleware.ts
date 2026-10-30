import {
  Injectable,
  NestMiddleware,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { NextFunction, Request, Response } from 'express';
import { PrismaService } from '../../prisma.service';

@Injectable()
export class AdminMiddleware implements NestMiddleware {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const [scheme, token] = (req.headers.authorization ?? '').split(' ');
    if (scheme !== 'Bearer' || !token) {
      return res.status(401).json({ message: 'Требуется авторизация' });
    }

    try {
      const payload = await this.jwt.verifyAsync<{ id: string }>(token, {
        secret: this.config.getOrThrow<string>('JWT_SECRET'),
      });
      const user = await this.prisma.user.findUnique({
        where: { id: payload.id },
      });
      if (!user) throw new UnauthorizedException();

      const bootstrapAdmin = this.config
        .get<string>('ADMIN_USER')
        ?.trim()
        .toLowerCase();
      const isBootstrapGrantRequest =
        req.path.endsWith('/auth/roles/admin') &&
        !!bootstrapAdmin &&
        user.email.toLowerCase() === bootstrapAdmin;
      if (user.role !== 'ADMIN' && !isBootstrapGrantRequest) {
        return res.status(403).json({ message: 'Доступ только для администратора' });
      }

      next();
    } catch {
      return res.status(401).json({ message: 'Недействительный или просроченный токен' });
    }
  }
}
