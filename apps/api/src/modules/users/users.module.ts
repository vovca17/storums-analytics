import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { PasswordResetController } from './password-reset.controller';

@Module({ controllers: [UsersController, PasswordResetController], providers: [UsersService], exports: [UsersService] })
export class UsersModule {}
