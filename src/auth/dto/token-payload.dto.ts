import { IsNumber, IsString } from 'class-validator';

export class TokenPayloadDto {
  @IsString()
  accessToken!: string;

  @IsString()
  refreshToken!: string;

  @IsNumber()
  accessTokenExpires!: number;
}
