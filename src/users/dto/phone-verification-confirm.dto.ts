import { IsString, Length, Matches, IsNotEmpty } from 'class-validator';

export class PhoneVerificationConfirmDto {
  @IsNotEmpty()
  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/)
  code!: string;
}
