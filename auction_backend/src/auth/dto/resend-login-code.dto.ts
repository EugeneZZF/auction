import { IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResendLoginCodeDto {
  @ApiProperty({ description: 'Идентификатор запроса на подтверждение' })
  @IsUUID()
  challengeId: string;
}
