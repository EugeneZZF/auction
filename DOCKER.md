# GoldenDay: запуск через Docker Compose

На сервере должны быть установлены Docker Engine и плагин Docker Compose. Откройте папку проекта и выполните:

```sh
cp .env.example .env
```

Отредактируйте `.env`:

- задайте длинные случайные значения для `POSTGRES_PASSWORD`, `JWT_SECRET` и `OTP_HASH_SECRET`;
- укажите SMTP-реквизиты в `SMTP_USER`, `SMTP_PASS` и `SMTP_FROM` — они нужны для отправки кодов входа по email;
- укажите почту первого администратора в `ADMIN_USER`.

Секреты можно сгенерировать командой `openssl rand -hex 32` (запустите её отдельно для каждого значения).

Затем запустите проект:

```sh
docker compose up -d --build
```

Сайт будет доступен по `http://АДРЕС_СЕРВЕРА/`, Swagger — по `http://АДРЕС_СЕРВЕРА/api/docs`. Если порт 80 уже занят, задайте, например, `WEB_PORT=8080` в `.env` и откройте `http://АДРЕС_СЕРВЕРА:8080/`.

PostgreSQL и Redis запускаются вместе с приложением. При старте backend автоматически применяет Prisma-миграции. Данные PostgreSQL, Redis и загруженные файлы хранятся в Docker volumes и сохраняются после пересоздания контейнеров.

Для первого входа зарегистрируйте пользователя с адресом из `ADMIN_USER`, подтвердите код из почты, затем в Swagger выполните `POST /api/auth/roles/admin` с телом:

```json
{"email":"admin@example.com"}
```

Чтобы посмотреть логи и остановить контейнеры:

```sh
docker compose logs -f
docker compose down
```

`docker compose down` сохраняет данные. Для окончательного удаления данных используйте `docker compose down -v`.
