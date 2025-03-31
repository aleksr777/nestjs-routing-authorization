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
  MinLength,
  Length,
  IsNotEmpty,
} from 'class-validator';

@Entity()
export class User {
  @PrimaryGeneratedColumn()
  // Автоинкрементный первичный ключ (стандартный подход для ID)
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

  @IsString()
  @Length(2, 200)
  @IsNotEmpty()
  @Column({ unique: true })
  nickname: string;

  @IsEmail()
  @IsNotEmpty()
  @Column({ unique: true })
  email: string;

  @IsString()
  @MinLength(8)
  @IsNotEmpty()
  @Column({ select: false }) // Исключает поле из выборок по умолчанию (безопасность)
  password: string;
}
