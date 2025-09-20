import { IsString, IsNotEmpty, Length } from 'class-validator';

export class PasswordChangeByTokenDto {
  @IsNotEmpty()
  @IsString()
  token!: string;

  @IsString()
  @Length(8, 100)
  new_password!: string;
}
