"use client";

import { useState, useEffect } from 'react';
import styles from './AutoBet.module.css';

interface AutoBetProps {
  enabled: boolean;
  onToggle: (maxBids?: number) => void;
  currentMaxBids?: number | null;
  lotFinished?: boolean; // Добавляем пропс для состояния завершения лота
  userBids?: number; // Добавляем пропс для количества доступных ставок
}

/**
 * Компонент автоставки с автоматическим обновлением баланса через WebSocket
 * 
 * При включенных автоставках баланс и ставки пользователя автоматически обновляются
 * через события WebSocket:
 * - userBalanceUpdated - обновление баланса конкретного пользователя
 * - bidPlaced - новая ставка на лоте (включая автоставки)
 * 
 * Пример использования с useSocket:
 * ```typescript
 * const { socket, isConnected } = useSocket({
 *   lotId: 'lot-123',
 *   onUserBalanceUpdated: (data) => {
 *     // Автоматически обновляем баланс через MobX
 *     userStore.handleUserBalanceUpdate(data);
 *   },
 *   onBidPlaced: (data) => {
 *     // Если это ставка текущего пользователя, обновляем баланс
 *     if (data.userBalanceUpdate && data.userBalanceUpdate.userId === userStore.user?.id) {
 *       userStore.updateUserData(data.userBalanceUpdate.balance, data.userBalanceUpdate.bids);
 *     }
 *   }
 * });
 * ```
 */
const AutoBet = ({ enabled, onToggle, currentMaxBids, lotFinished = false, userBids = 0 }: AutoBetProps) => {
  const [maxBids, setMaxBids] = useState<number>(currentMaxBids ?? 100);
  const [showLimitInput, setShowLimitInput] = useState(false);

  useEffect(() => {
    if (currentMaxBids !== undefined && currentMaxBids !== null) {
      setMaxBids(currentMaxBids);
    }
  }, [currentMaxBids]);

  const handleToggle = () => {
    if (lotFinished) {
      // Если лот завершен, не позволяем включать автоставки
      return;
    }
    
    if (userBids <= 0) {
      // Если нет ставок, не позволяем включать автоставки
      return;
    }
    
    if (enabled) {
      // Если автоставка уже включена, просто отключаем
      onToggle();
    } else {
      // Если включаем, показываем поле ввода лимита
      setShowLimitInput(true);
    }
  };

  const handleEnableWithLimit = () => {
    if (maxBids > 0) {
      onToggle(maxBids);
      setShowLimitInput(false);
    }
  };

  const handleCancel = () => {
    setShowLimitInput(false);
    setMaxBids(currentMaxBids ?? 100);
  };

  return (
    <div className={styles.autoBet}>
      <div className={styles.autoBetHeader}>
        <p>Вручную</p>
        <div 
          className={`${enabled ? styles.autoBet_button_active : styles.autoBet_button} ${lotFinished || userBids <= 0 ? styles.autoBet_button_disabled : ''}`}
          onClick={handleToggle}
        >
          <div className={enabled ? styles.autoBet_button_toggle_active : styles.autoBet_button_toggle}></div>
        </div>
        <p>Автоставка</p>
      </div>

      {lotFinished && (
        <div className={styles.lotFinishedMessage}>
          <p>🏁 Лот завершен. Автоставки отключены.</p>
        </div>
      )}

      {!lotFinished && userBids <= 0 && (
        <div className={styles.noBidsMessage}>
          <p>⚠️ Нет доступных ставок. Автоставки недоступны.</p>
        </div>
      )}

      {enabled && !lotFinished && (
        <div className={styles.autoBetInfo}>
          <p className={styles.autoBetStatus}>✅ Автоставка активна</p>
          {currentMaxBids && (
            <p className={styles.autoBetLimit}>Лимит: {currentMaxBids} ставок</p>
          )}
        </div>
      )}

      {showLimitInput && !lotFinished && (
        <div className={styles.limitInputContainer}>
          <div className={styles.limitInputGroup}>
            <label htmlFor="maxBids" className={styles.limitLabel}>
              Максимальное количество ставок:
            </label>
            <input
              id="maxBids"
              type="number"
              min="1"
              max="1000"
              value={maxBids}
              onChange={(e) => setMaxBids(Number(e.target.value))}
              className={styles.limitInput}
              placeholder="100"
            />
          </div>
          <div className={styles.limitButtons}>
            <button 
              onClick={handleEnableWithLimit}
              className={styles.limitButton}
              disabled={maxBids <= 0}
            >
              Включить
            </button>
            <button 
              onClick={handleCancel}
              className={styles.limitButtonCancel}
            >
              Отмена
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AutoBet;