import { IsEmail } from 'class-validator';

export class GrantAdminRoleDto {
  @IsEmail()
  email: string;
}
