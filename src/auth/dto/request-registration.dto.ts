import { IsEmail, IsString, Length, IsNotEmpty } from 'class-validator';

export class RequestRegistrationDto {
  @IsEmail()
  @IsNotEmpty()
  @Length(6, 255)
  email!: string;

  @IsString()
  @IsNotEmpty()
  @Length(8, 100)
  password!: string;
}
