import { IsEmail, IsString, Length, IsNotEmpty } from 'class-validator';

export class RegistrationRequestDto {
  @IsEmail()
  @IsNotEmpty()
  @Length(6, 255)
  email!: string;

  @IsString()
  @IsNotEmpty()
  @Length(8, 100)
  password!: string;
}
