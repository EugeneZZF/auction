# Руководство по Swagger API

## Обзор

Весь API аукционной системы теперь полностью документирован с помощью Swagger. Документация доступна по адресу: `http://localhost:4200/api/docs`

## Структура API

### 1. Auth (Аутентификация)
- **POST** `/api/auth/login` - Вход в систему
- **POST** `/api/auth/register` - Регистрация пользователя
- **POST** `/api/auth/login/access-token` - Обновление токенов
- **GET** `/api/auth/user/wins` - Получение побед пользователя

### 2. Lots (Лоты)
- **POST** `/api/lots` - Создание лота (только админ)
- **GET** `/api/lots` - Получение всех лотов
- **GET** `/api/lots/active` - Получение активных лотов
- **GET** `/api/lots/:id` - Получение лота по ID
- **PATCH** `/api/lots/:id` - Обновление лота (только админ)
- **DELETE** `/api/lots/:id` - Удаление лота (только админ)
- **PATCH** `/api/lots/:id/toggle` - Переключение активности лота (только админ)
- **POST** `/api/lots/update-expired` - Обновление истекших лотов (только админ)

### 3. Bidding (Ставки)
- **POST** `/api/bidding/place-bid` - Размещение ставки на лот
- **GET** `/api/bidding/lot/:lotId/bids` - Получение ставок лота
- **GET** `/api/bidding/lot/:lotId/user-bids` - Получение ставок пользователя на лот
- **GET** `/api/bidding/lot/:lotId/top-bidders` - Получение топ-биддеров лота
- **GET** `/api/bidding/active-lots` - Получение активных лотов с информацией о ставках

### 4. Bids (Покупка ставок)
- **POST** `/api/bids/buy` - Покупка ставок
- **GET** `/api/bids/user-info` - Получение информации о пользователе
- **GET** `/api/bids/price` - Получение цены ставки
- **GET** `/api/bids/calculate/:quantity` - Расчет стоимости покупки
- **GET** `/api/bids/check/:quantity` - Проверка возможности покупки

### 5. Upload (Загрузка файлов)
- **POST** `/api/upload/image` - Загрузка изображения (только админ)
- **GET** `/api/upload/image/:filename` - Получение изображения
- **DELETE** `/api/upload/image/:filename` - Удаление изображения (только админ)

### 6. Bots (Боты)
- **POST** `/api/bots` - Создание бота (только админ)

### 7. App (Основные эндпоинты)
- **GET** `/api/` - Проверка работоспособности API

## Аутентификация

Большинство эндпоинтов требуют аутентификации через JWT токен. Для авторизации:

1. Выполните POST запрос на `/api/auth/login` с email и паролем
2. Получите `accessToken` и `refreshToken`
3. Используйте `accessToken` в заголовке `Authorization: Bearer <token>`
4. При истечении токена используйте `/api/auth/login/access-token` для обновления

## Примеры запросов

### Регистрация пользователя
```json
POST /api/auth/register
{
  "email": "user@example.com",
  "password": "password123",
  "name": "Иван Иванов"
}
```

### Создание лота (требует админ права)
```json
POST /api/lots
Authorization: Bearer <admin_token>
{
  "title": "Золотое кольцо с бриллиантом",
  "description": "Красивое золотое кольцо с бриллиантом 1 карат",
  "image": "/uploads/ring.jpg",
  "basePrice": 50000,
  "periodSeconds": 3600,
  "isActive": true,
  "inactivityTimeoutMs": 10000
}
```

### Размещение ставки
```json
POST /api/bidding/place-bid
Authorization: Bearer <user_token>
{
  "lotId": "uuid",
  "bidCount": 5
}
```

### Покупка ставок
```json
POST /api/bids/buy
Authorization: Bearer <user_token>
{
  "quantity": 10
}
```

## Коды ответов

- **200** - Успешный запрос
- **201** - Ресурс создан
- **400** - Неверный запрос
- **401** - Необходима аутентификация
- **403** - Недостаточно прав
- **404** - Ресурс не найден
- **500** - Внутренняя ошибка сервера

## Особенности

1. **Валидация**: Все входные данные валидируются с помощью class-validator
2. **Типизация**: Полная типизация TypeScript для всех DTO
3. **Авторизация**: JWT токены для аутентификации, роли для авторизации
4. **Документация**: Подробные описания каждого эндпоинта с примерами
5. **Тестирование**: Возможность тестирования API прямо в Swagger UI

## Доступ к документации

После запуска приложения (`npm run start:dev`) документация будет доступна по адресу:
`http://localhost:4200/api/docs`

В Swagger UI вы можете:
- Просматривать все эндпоинты
- Читать описания и схемы данных
- Тестировать API прямо в браузере
- Авторизоваться с помощью JWT токенов
- Скачивать OpenAPI спецификацию
