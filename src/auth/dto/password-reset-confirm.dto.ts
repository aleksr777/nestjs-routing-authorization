import { IsString, Length, IsNotEmpty } from 'class-validator';

export class PasswordResetConfirmDto {
  @IsNotEmpty()
  token!: string;

  @IsString()
  @IsNotEmpty()
  @Length(8, 100)
  newPassword!: string;
}
