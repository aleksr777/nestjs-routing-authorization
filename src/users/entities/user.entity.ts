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
  IsInt,
  Min,
  Max,
} from 'class-validator';

@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id!: number;

  @CreateDateColumn({
    default: () => 'CURRENT_TIMESTAMP',
    name: 'created_at',
    type: 'timestamp',
    select: false,
  })
  created_at!: Date;

  @UpdateDateColumn({
    default: () => 'CURRENT_TIMESTAMP',
    onUpdate: 'CURRENT_TIMESTAMP',
    name: 'updated_at',
    type: 'timestamp',
    select: false,
  })
  updated_at!: Date;

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
  @Length(4, 30)
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

  /* Age */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(200)
  @Column({
    type: 'smallint',
    name: 'age',
    nullable: true,
  })
  age?: number | null;

  /* Gender */
  @IsOptional()
  @IsString()
  @Length(0, 20)
  @Column({
    type: 'varchar',
    name: 'gender',
    nullable: true,
    length: 20,
  })
  gender?: string | null;

  /* About */
  @IsOptional()
  @IsString()
  @Length(0, 1000)
  @Column({
    type: 'text',
    name: 'about',
    nullable: true,
  })
  about?: string | null;

  /* refresh_token */
  @Column({
    type: 'varchar',
    name: 'refresh_token',
    length: 512,
    nullable: true,
    select: false,
  })
  refresh_token?: string | null;
}
