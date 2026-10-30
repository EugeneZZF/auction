import {
  Controller,
  BadRequestException,
  Get,
  Param,
  Res,
  Delete,
} from '@nestjs/common';
import { join } from 'path';
import { Response } from 'express';
import { existsSync, unlinkSync } from 'fs';
import { Admin } from './auth/decorators/admin.decorator';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';

@ApiTags('Upload')
@Controller('upload')
export class UploadController {
  @ApiOperation({
    summary: 'Получение изображения',
    description: 'Получение изображения по имени файла',
  })
  @ApiResponse({
    status: 200,
    description: 'Изображение успешно получено',
    content: {
      'image/*': {
        schema: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Файл не найден',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Файл не найден' },
      },
    },
  })
  @ApiParam({
    name: 'filename',
    description: 'Имя файла изображения',
    example: 'a1b2c3d4e5f6.jpg',
  })
  @Get('image/:filename')
  getImage(@Param('filename') filename: string, @Res() res: Response) {
    const filePath = join(__dirname, '..', 'uploads', filename);

    if (!existsSync(filePath)) {
      return res.status(404).json({ message: 'Файл не найден' });
    }

    return res.sendFile(filePath);
  }

  @ApiOperation({
    summary: 'Удаление изображения',
    description: 'Удаление изображения с сервера (только для администраторов)',
  })
  @ApiResponse({
    status: 200,
    description: 'Изображение успешно удалено',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Файл успешно удален' },
        filename: { type: 'string', example: 'a1b2c3d4e5f6.jpg' },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Файл не найден или ошибка при удалении',
  })
  @ApiResponse({
    status: 401,
    description: 'Необходимы права администратора',
  })
  @ApiBearerAuth('JWT-auth')
  @ApiParam({
    name: 'filename',
    description: 'Имя файла изображения для удаления',
    example: 'a1b2c3d4e5f6.jpg',
  })
  @Delete('image/:filename')
  @Admin()
  deleteImage(@Param('filename') filename: string) {
    const filePath = join(__dirname, '..', 'uploads', filename);

    if (!existsSync(filePath)) {
      throw new BadRequestException('Файл не найден');
    }

    try {
      unlinkSync(filePath);
      return { message: 'Файл успешно удален', filename };
    } catch (error) {
      throw new BadRequestException('Ошибка при удалении файла');
    }
  }
}
