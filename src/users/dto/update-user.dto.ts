import { PartialType } from '@nestjs/mapped-types';
import { CreateUserDto } from './create-user.dto';
import {
  IsString,
  IsEmail,
  IsPhoneNumber,
  MinLength,
  MaxLength,
} from 'class-validator';

export class UpdateUserDto extends PartialType(CreateUserDto) {
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  nickname?: string;

  @IsEmail()
  email?: string;

  @IsPhoneNumber()
  phoneNumber?: string;

  @IsString()
  @MinLength(6)
  @MaxLength(100)
  password?: string;
}
