import { IsString, IsUUID, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyLoginCodeDto {
  @ApiProperty({ description: 'Идентификатор запроса на подтверждение' })
  @IsUUID()
  challengeId: string;

  @ApiProperty({ description: 'Одноразовый восьмизначный код из письма' })
  @IsString()
  @Matches(/^\d{8}$/)
  code: string;
}
