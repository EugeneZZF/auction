import { UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

// JWT validation is handled by Passport; role authorization is handled by AdminMiddleware.
export const Admin = () => UseGuards(AuthGuard('jwt'));
