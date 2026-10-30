import { IsBoolean } from 'class-validator';

export class SetBotsEnabledDto {
  @IsBoolean()
  enabled: boolean;
}
