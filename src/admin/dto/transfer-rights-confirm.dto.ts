import { IsString, Length, Matches } from 'class-validator';

export class TransferConfirmDto {
  @IsString()
  @Matches(/^\d{6}$/, { message: 'Code must contain exactly 6 digits' })
  code!: string;

  @IsString()
  @Length(8, 100)
  password!: string;
}
