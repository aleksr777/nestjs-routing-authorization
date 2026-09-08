import { IsString, Matches } from 'class-validator';

export class TransferConfirmDto {
  @IsString()
  @Matches(/^\d{6}$/, { message: 'Code must contain exactly 6 digits' })
  code!: string;
}
