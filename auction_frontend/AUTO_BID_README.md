# Автоматическое отключение автоставок

## Описание функциональности

Система автоматически отключает автоставки у всех пользователей, когда розыгрыш лота заканчивается. Это происходит в следующих случаях:

1. **Истечение времени лота** - когда таймер достигает 00:00:000
2. **Событие `lotFinished` от сервера** - когда сервер отправляет уведомление о завершении лота

## Как это работает

### 1. Отслеживание состояния автоставок

Все автоставки пользователя сохраняются в `userStore.autoBids` и синхронизируются с localStorage:

```typescript
autoBids: { 
  [lotId: string]: { 
    enabled: boolean; 
    maxBids: number 
  } 
}
```

### 2. Автоматическое отключение при истечении времени

В компоненте `LotPage` таймер автоматически отключает автоставки:

```typescript
useEffect(() => {
  if (!endTimeMs) return
  const interval = setInterval(() => {
    const now = Date.now()
    const rawDiff = endTimeMs - now
    const diff = Math.max(0, rawDiff)
    if (diff <= 0) {
      setTimeParts({ mm: '00', ss: '00', ms: '000' })
      // Автоматически отключаем автоставки при окончании времени
      if (autoBidEnabled) {
        setAutoBidEnabled(false)
        setAutoBidMaxBids(null)
        userStore.disableAutoBid(lotId)
        // Уведомляем сервер об отключении автоставки
        if (socketRef.current?.connected) {
          socketRef.current.emit('disableAutoBid', { lotId })
        }
      }
      clearInterval(interval)
      return
    }
    // ... обновление таймера
  }, 50)
  return () => clearInterval(interval)
}, [endTimeMs, autoBidEnabled, lotId])
```

### 3. Обработка события `lotFinished` от сервера

Слушаем событие от сервера о завершении лота:

```typescript
newSocket.on('lotFinished', ({ lotId: finishedLotId }: { lotId: string }) => {
  if (finishedLotId === lotId) {
    console.log('🏁 LotPage: Лот завершен, отключаем автоставки', { lotId: finishedLotId })
    // Отключаем автоставку локально
    setAutoBidEnabled(false)
    setAutoBidMaxBids(null)
    // Отключаем автоставку в userStore
    userStore.disableAutoBid(lotId)
    // Показываем уведомление пользователю
    setBidSuccess(true)
    setTimeout(() => setBidSuccess(false), 5000)
  }
})
```

### 4. Визуальная индикация

Компонент `AutoBet` показывает:

- **Отключенное состояние** - кнопка становится неактивной (серый цвет, `cursor: not-allowed`)
- **Сообщение о завершении** - "🏁 Лот завершен. Автоставки отключены."
- **Блокировка взаимодействия** - нельзя включить автоставки на завершенном лоте

### 5. Синхронизация с сервером

При отключении автоставок:

1. Локально обновляется состояние компонента
2. Обновляется `userStore.autoBids`
3. Отправляется уведомление серверу через `disableAutoBid`
4. Сервер подтверждает через `autoBidUpdated`

### 6. Автоматическое обновление баланса при автоставках

При включенных автоставках баланс и ставки пользователя автоматически обновляются через WebSocket события:

### 7. Автоматическое отключение автоставок при отсутствии ставок

Система автоматически отключает все автоставки пользователя, когда количество ставок достигает нуля:

#### Проверка при обновлении баланса
- При получении события `userBalanceUpdated` проверяется количество ставок
- Если `bids <= 0`, автоматически отключаются все автоставки
- Компоненты уведомляются об отключении через callback систему

#### Проверка при включении автоставки
- Нельзя включить автоставку при нулевом количестве ставок
- Лимит автоставки не может превышать доступные ставки
- Показывается соответствующее сообщение об ошибке

#### Визуальная индикация
- Кнопка автоставки становится неактивной при отсутствии ставок
- Отображается предупреждение "⚠️ Нет доступных ставок. Автоставки недоступны."
- Блокируется взаимодействие с компонентом

#### userBalanceUpdated
- Событие отправляется сервером при изменении баланса пользователя
- Автоматически обновляет `userStore.user.balance` и `userStore.user.bids`
- Синхронизируется с localStorage

#### bidPlaced
- Событие отправляется при каждой новой ставке на лоте
- Если ставка принадлежит текущему пользователю, обновляет его баланс
- Поддерживает как ручные ставки, так и автоставки
- Автоматически продлевает таймер лота

#### Пример использования в компоненте:
```typescript
// В LotPage или любом другом компоненте
useEffect(() => {
  if (!socketRef.current) return
  
  // Слушаем обновления баланса
  socketRef.current.on('userBalanceUpdated', (data) => {
    userStore.handleUserBalanceUpdate(data);
  });
  
  // Слушаем новые ставки
  socketRef.current.on('bidPlaced', (data) => {
    if (data.userBalanceUpdate && data.userBalanceUpdate.userId === userStore.user?.id) {
      userStore.updateUserData(data.userBalanceUpdate.balance, data.userBalanceUpdate.bids);
    }
  });
}, []);

// Подписка на уведомления об отключении автоставок
useEffect(() => {
  const handleAutoBidDisabled = () => {
    setAutoBidEnabled(false);
    setAutoBidMaxBids(null);
  };
  
  userStore.onAutoBidDisabled(lotId, handleAutoBidDisabled);
  
  return () => {
    userStore.offAutoBidDisabled(lotId, handleAutoBidDisabled);
  };
}, [lotId]);
```

## Файлы, затронутые изменениями

- `src/stores/userStore.ts` - добавлены методы управления автоставками, обновления баланса и callback система для уведомлений
- `src/app/lot/[id]/page.tsx` - добавлена логика автоматического отключения, обработка WebSocket событий и подписка на уведомления
- `src/components/AutoBet/AutoBet.tsx` - добавлена визуальная индикация завершения, проверка ставок и документация
- `src/components/AutoBet/AutoBet.module.css` - добавлены стили для отключенного состояния и предупреждений
- `src/hooks/useSocket.ts` - добавлена обработка событий `lotFinished`, `userBalanceUpdated`, `bidPlaced`

## API события

### Отправляемые события

- `disableAutoBid` - отключение автоставки на конкретном лоте

### Получаемые события

- `lotFinished` - уведомление о завершении лота
- `autoBidUpdated` - подтверждение изменения статуса автоставки
- `userBalanceUpdated` - обновление баланса конкретного пользователя
- `bidPlaced` - новая ставка на лоте (включая автоставки)

### Формат данных событий

#### userBalanceUpdated
```typescript
{
  userId: string,
  balance: number,    // баланс в копейках
  bids: number,       // количество доступных ставок
  timestamp: number   // время обновления
}
```

#### bidPlaced
```typescript
{
  lotId: string,
  lotBids: unknown,   // обновленное состояние лота
  newBid: {
    userId: string,
    userName: string,
    bidCount: number,
    timestamp: number
  },
  userBalanceUpdate?: {  // только если это ставка реального пользователя
    userId: string,
    balance: number,
    bids: number
  }
}
```

## Преимущества реализации

1. **Автоматичность** - не требует действий от пользователя
2. **Синхронизация** - состояние синхронизируется между клиентом и сервером
3. **Визуальная обратная связь** - пользователь видит, что автоставки отключены
4. **Безопасность** - нельзя включить автоставки на завершенном лоте
5. **Персистентность** - состояние сохраняется в localStorage

