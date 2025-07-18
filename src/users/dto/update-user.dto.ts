import { PartialType } from '@nestjs/mapped-types';
import { RequestRegistrationDto } from '../../auth/dto/request-registration.dto';
import {
  IsString,
  IsEmail,
  IsPhoneNumber,
  Length,
  IsOptional,
  Min,
  Max,
  IsInt,
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
  phone_number?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(150)
  age?: number;

  @IsOptional()
  @IsString()
  gender?: string;

  @IsOptional()
  @IsString()
  @Length(0, 1000)
  about?: string;
}
