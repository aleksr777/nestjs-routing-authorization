import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import {
  IsEmail,
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
  // Автоинкрементный первичный ключ
  id: number;

  @CreateDateColumn({
    // Автоматически задает дату создания записи
    type: 'timestamp',
    name: 'createdAt',
    default: () => 'LOCALTIMESTAMP',
  })
  createdAt: Date;

  @UpdateDateColumn({
    //Автоматически обновляет дату при изменении записи
    type: 'timestamp',
    name: 'updatedAt',
    default: () => 'LOCALTIMESTAMP',
    onUpdate: 'CURRENT_TIMESTAMP',
  })
  updatedAt: Date;

  @IsNotEmpty()
  @IsString()
  @Length(2, 50)
  @Column({ unique: true })
  nickname: string;

  @IsNotEmpty()
  @IsEmail()
  @Column({ unique: true })
  email: string;

  @IsNotEmpty()
  @IsString()
  @Length(6, 100)
  @Column({ select: false }) // Исключает поле из выборок по умолчанию (безопасность)
  password: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(150)
  @Column({ nullable: true }) // В БД запишется NULL, если значение не указано
  age: number;

  @IsOptional()
  @IsString()
  @Column({ nullable: true })
  gender: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  @Column({ nullable: true })
  about: string;
}
