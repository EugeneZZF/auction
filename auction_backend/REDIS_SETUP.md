# Настройка Redis для системы аукционов

## Установка Redis в WSL

### 1. Установка Redis
```bash
sudo apt update
sudo apt install redis-server -y
```

### 2. Запуск Redis сервиса
```bash
sudo systemctl start redis-server
sudo systemctl enable redis-server
```

### 3. Проверка статуса
```bash
sudo systemctl status redis-server
redis-cli ping
```

## Конфигурация

### Переменные окружения (.env)
```env
# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
```

### Настройки по умолчанию
- **Хост**: localhost
- **Порт**: 6379
- **Пароль**: не установлен (для разработки)

## Использование в приложении

### Подключение к Redis
```typescript
import Redis from 'ioredis';

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD,
});
```

### Структура данных в Redis

#### Ставки пользователей
```
lot:{lotId}:user:{userId} -> Hash
- userId: string
- userName: string
- bidCount: number
- timestamp: number
```

#### Общее количество ставок
```
lot:{lotId}:total -> String (number)
```

#### Лидер лота
```
lot:{lotId}:leader -> Hash
- userId: string
- userName: string
- bidCount: number
```

#### Последние ставки
```
lot:{lotId}:recent -> List (JSON strings)
```

## Команды для управления Redis

### Подключение к Redis CLI
```bash
redis-cli
```

### Основные команды
```bash
# Проверка подключения
PING

# Просмотр всех ключей
KEYS *

# Просмотр ключей лота
KEYS lot:*

# Получение данных пользователя
HGETALL lot:{lotId}:user:{userId}

# Получение общего количества ставок
GET lot:{lotId}:total

# Очистка всех данных лота
DEL lot:{lotId}:*

# Мониторинг команд в реальном времени
MONITOR
```

## Мониторинг и отладка

### Просмотр логов Redis
```bash
sudo tail -f /var/log/redis/redis-server.log
```

### Статистика Redis
```bash
redis-cli info
```

### Проверка памяти
```bash
redis-cli info memory
```

## Безопасность

### Для продакшена рекомендуется:
1. Установить пароль Redis
2. Настроить брандмауэр
3. Ограничить доступ только с localhost
4. Использовать SSL/TLS

### Настройка пароля
```bash
# В /etc/redis/redis.conf
requirepass your_strong_password
```

## Устранение неполадок

### Redis не запускается
```bash
sudo systemctl status redis-server
sudo journalctl -u redis-server
```

### Проблемы с подключением
```bash
# Проверка порта
netstat -tlnp | grep 6379

# Проверка процесса
ps aux | grep redis
```

### Очистка всех данных
```bash
redis-cli FLUSHALL
``` 