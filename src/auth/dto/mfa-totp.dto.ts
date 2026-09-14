import { IsString, Length, Matches } from 'class-validator';

export class MfaTotpCodeDto {
  @IsString()
  @Matches(/^\d{6}$/, { message: 'MFA code must contain exactly 6 digits' })
  code!: string;
}

export class MfaLoginVerifyDto extends MfaTotpCodeDto {
  @IsString()
  @Length(32, 256)
  challenge!: string;
}

export class MfaDisableDto extends MfaTotpCodeDto {
  @IsString()
  @Length(12, 100)
  password!: string;
}
