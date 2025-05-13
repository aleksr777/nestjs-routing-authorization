import { IsNumber, IsString } from 'class-validator';

export class TokenPayloadDto {
  @IsString()
  access_token!: string;

  @IsString()
  refresh_token!: string;

  @IsNumber()
  access_token_expires!: number;
}
