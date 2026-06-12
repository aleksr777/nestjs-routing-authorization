import { IsString, IsNotEmpty, Length } from 'class-validator';

export class PasswordChangeByTokenDto {
  @IsString()
  @IsNotEmpty()
  code!: string;

  @IsString()
  @Length(8, 100)
  new_password!: string;
}
