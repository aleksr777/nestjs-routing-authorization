import { IsString, Length, Matches } from 'class-validator';

class MfaTotpCodeDto {
  @IsString()
  @Matches(/^\d{6}$/, { message: 'MFA code must contain exactly 6 digits' })
  code!: string;
}

export class MfaLoginVerifyDto extends MfaTotpCodeDto {
  @IsString()
  @Length(32, 256)
  challenge!: string;
}

class MfaPasswordCodeDto extends MfaTotpCodeDto {
  @IsString()
  @Length(8, 100)
  password!: string;
}

export class MfaEnableDto extends MfaPasswordCodeDto {}

export class MfaDisableDto extends MfaPasswordCodeDto {}
