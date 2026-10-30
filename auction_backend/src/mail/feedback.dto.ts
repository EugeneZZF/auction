import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class FeedbackDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name: string;

  @IsEmail()
  @MaxLength(254)
  email: string;

  @IsString()
  @MinLength(3)
  @MaxLength(120)
  subject: string;

  @IsString()
  @MinLength(10)
  @MaxLength(4000)
  message: string;
}
