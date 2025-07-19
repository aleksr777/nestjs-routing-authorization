import { IsEmail, IsNotEmpty, Length } from 'class-validator';

export class RequestPasswordResetDto {
  @IsEmail()
  @IsNotEmpty()
  @Length(6, 255)
  email!: string;
}
