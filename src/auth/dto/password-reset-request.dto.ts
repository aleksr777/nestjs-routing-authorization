import { IsEmail, IsNotEmpty, Length } from 'class-validator';

export class PasswordResetRequestDto {
  @IsEmail()
  @IsNotEmpty()
  @Length(6, 255)
  email!: string;
}
