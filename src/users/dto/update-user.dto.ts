import { PartialType } from '@nestjs/mapped-types';
import { CreateUserDto } from './create-user.dto';
import { IsString, IsEmail, MinLength, MaxLength } from 'class-validator';

export class UpdateUserDto extends PartialType(CreateUserDto) {
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  name?: string;

  @IsEmail()
  email?: string;

  @IsString()
  @MinLength(6)
  @MaxLength(100)
  password?: string;
}
