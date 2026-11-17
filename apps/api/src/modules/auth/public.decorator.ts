import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'isPublic';
/** Эндпоинт без авторизации (health, вебхуки). */
export const Public = () => SetMetadata(IS_PUBLIC, true);
