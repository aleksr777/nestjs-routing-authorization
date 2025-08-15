import { Role } from '../../common/types/role.enum';

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import {
  IsEmail,
  IsPhoneNumber,
  IsString,
  Length,
  IsNotEmpty,
  IsOptional,
  Max,
} from 'class-validator';

@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id!: number;

  /* Account creation time */
  @CreateDateColumn({
    default: () => 'CURRENT_TIMESTAMP',
    name: 'created_at',
    type: 'timestamp',
    select: false,
  })
  created_at!: Date;

  /* Data update time */
  @UpdateDateColumn({
    default: () => 'CURRENT_TIMESTAMP',
    onUpdate: 'CURRENT_TIMESTAMP',
    name: 'updated_at',
    type: 'timestamp',
    select: false,
  })
  updated_at!: Date;

  /* Last activity time */
  @Column({
    type: 'timestamp',
    name: 'last_activity_at',
    nullable: true,
  })
  last_activity_at?: Date;

  /* Email */
  @IsEmail()
  @IsNotEmpty()
  @Length(6, 255)
  @Column({
    type: 'varchar',
    name: 'email',
    unique: true,
    select: false,
    length: 255,
    nullable: false,
  })
  email!: string;

  /* Phone number */
  @IsPhoneNumber()
  @IsOptional()
  @Length(4, 40)
  @Column({
    type: 'varchar',
    name: 'phone_number',
    unique: true,
    nullable: true,
    select: false,
    length: 30,
  })
  phone_number?: string | null;

  /* Nickname */
  @IsOptional()
  @IsString()
  @Length(2, 50)
  @Column({
    type: 'varchar',
    name: 'nickname',
    unique: true,
    nullable: true,
    length: 50,
  })
  nickname?: string | null;

  /* Password */
  @IsNotEmpty()
  @IsString()
  @Length(8, 100)
  @Column({
    type: 'varchar',
    name: 'password',
    length: 100,
    select: false,
  })
  password!: string;

  /* refresh_token */
  @IsString()
  @Max(512)
  @Column({
    type: 'varchar',
    name: 'refresh_token',
    length: 512,
    nullable: true,
    select: false,
  })
  refresh_token?: string | null;

  /* role */
  @IsNotEmpty()
  @IsString()
  @Max(20)
  @Column({
    type: 'varchar',
    name: 'role',
    length: 20,
    default: Role.USER,
  })
  role!: Role;
}
