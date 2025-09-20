import { IsNotEmpty, IsString, Length } from 'class-validator';

export class PasswordResetConfirmDto {
  @IsString()
  @IsNotEmpty()
  token!: string;

  @IsString()
  @Length(8, 100)
  new_password!: string;
}
