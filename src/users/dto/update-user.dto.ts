import { PartialType } from '@nestjs/mapped-types';
import { RequestRegistrationDto } from '../../auth/dto/request-registration.dto';
import {
  IsString,
  IsEmail,
  IsPhoneNumber,
  Length,
  IsOptional,
} from 'class-validator';

export class UpdateUserDto extends PartialType(RequestRegistrationDto) {
  @IsOptional()
  @IsString()
  @Length(2, 50)
  nickname?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @Length(8, 100)
  password?: string;

  @IsOptional()
  @IsPhoneNumber()
  @Length(4, 40)
  phone_number?: string;
}
