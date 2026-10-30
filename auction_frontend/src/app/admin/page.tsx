"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { userStore } from "@/stores/userStore";
import {
  AdminUser,
  AdminBot,
  addUserBalance,
  createAdminBot,
  createLot,
  deleteAdminBot,
  deleteLot,
  getAdminBots,
  getLots,
  Lot,
  LotInput,
  toggleLot,
  setLotBotsEnabled,
  searchAdminUsers,
  updateAdminUser,
  updateLot,
} from "@/utils/api";
import { backendAssetUrl } from "@/config/api";
import styles from "./page.module.css";

type Tab = "lots" | "bots" | "users";
type LotDraft = {
  description: string;
  basePrice: string;
  periodSeconds: string;
  inactivitySeconds: string;
  isActive: boolean;
};

const blankDraft: LotDraft = {
  description: "",
  basePrice: "1000",
  periodSeconds: "3600",
  inactivitySeconds: "10",
  isActive: true,
};

const rubles = (kopecks: number) =>
  new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 2,
  }).format(kopecks / 100);

const humanDuration = (seconds: number) => {
  if (seconds % 86400 === 0) return `${seconds / 86400} дн.`;
  if (seconds % 3600 === 0) return `${seconds / 3600} ч.`;
  if (seconds % 60 === 0) return `${seconds / 60} мин.`;
  return `${seconds} сек.`;
};

const requestError = (cause: unknown) => {
  if (typeof cause === "object" && cause !== null && "response" in cause) {
    const data = (
      cause as { response?: { data?: { message?: string | string[] } } }
    ).response?.data;
    if (data?.message)
      return Array.isArray(data.message)
        ? data.message.join(", ")
        : data.message;
  }
  return cause instanceof Error ? cause.message : "Не удалось выполнить запрос";
};

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>("lots");
  const [lots, setLots] = useState<Lot[]>([]);
  const [bots, setBots] = useState<AdminBot[]>([]);
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [userSearch, setUserSearch] = useState("");
  const [usersLoaded, setUsersLoaded] = useState(false);
  const [usersLoading, setUsersLoading] = useState(false);
  const [balanceDrafts, setBalanceDrafts] = useState<Record<string, string>>(
    {},
  );
  const [balanceSavingId, setBalanceSavingId] = useState<string | null>(null);
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [userEdits, setUserEdits] = useState<
    Record<string, { email: string; password: string }>
  >({});
  const [userSavingId, setUserSavingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<LotDraft>(blankDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [botName, setBotName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadData = useCallback(async () => {
    const [lotData, botData] = await Promise.all([getLots(), getAdminBots()]);
    setLots(lotData);
    setBots(botData);
  }, []);

  useEffect(() => {
    userStore.loadFromStorage();
    if (!userStore.isAuthenticated) {
      setError("Для входа в панель сначала авторизуйтесь.");
      setLoading(false);
      return;
    }
    loadData()
      .catch((cause: unknown) => setError(requestError(cause)))
      .finally(() => setLoading(false));
  }, [loadData]);

  const loadUsers = useCallback(async (search: string) => {
    setUsersLoading(true);
    try {
      setAdminUsers(await searchAdminUsers(search));
      setUsersLoaded(true);
    } finally {
      setUsersLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab !== "users" || usersLoaded) return;
    loadUsers("").catch((cause) => setError(requestError(cause)));
  }, [tab, usersLoaded, loadUsers]);

  const setField = <K extends keyof LotDraft>(key: K, value: LotDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const beginEdit = (lot: Lot) => {
    setEditingId(lot.id);
    setDraft({
      description: lot.description || "",
      basePrice: String(lot.basePrice / 100),
      periodSeconds: String(lot.periodSeconds),
      inactivitySeconds: String(Math.round(lot.inactivityTimeoutMs / 1000)),
      isActive: lot.isActive,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const resetLotForm = () => {
    setDraft(blankDraft);
    setEditingId(null);
  };

  const handleLotSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const denomination = Number(draft.basePrice);
      const input: LotInput = {
        description: draft.description.trim(),
        basePrice: denomination * 100,
        periodSeconds: Number(draft.periodSeconds),
        inactivityTimeoutMs: Number(draft.inactivitySeconds) * 1000,
        isActive: draft.isActive,
      };
      if (!Number.isFinite(input.basePrice) || input.basePrice <= 0)
        throw new Error("Укажите цену больше нуля.");
      if (!Number.isFinite(input.periodSeconds) || input.periodSeconds <= 0)
        throw new Error("Укажите длительность раунда.");
      if (
        !Number.isFinite(input.inactivityTimeoutMs) ||
        input.inactivityTimeoutMs! < 1000
      )
        throw new Error("Окно бездействия должно быть не меньше секунды.");

      if (editingId) await updateLot(editingId, input);
      else await createLot(input);
      await loadData();
      setNotice(editingId ? "Изменения лота сохранены." : "Лот создан.");
      resetLotForm();
    } catch (cause) {
      setError(requestError(cause));
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (lot: Lot) => {
    setError("");
    setNotice("");
    try {
      await toggleLot(lot.id);
      await loadData();
      setNotice(lot.isActive ? "Лот остановлен." : "Лот активирован.");
    } catch (cause) {
      setError(requestError(cause));
    }
  };

  const handleToggleBots = async (lot: Lot) => {
    setError("");
    setNotice("");
    try {
      await setLotBotsEnabled(lot.id, !lot.botsEnabled);
      await loadData();
      setNotice(
        lot.botsEnabled ? "Боты отключены на лоте." : "Боты включены на лоте.",
      );
    } catch (cause) {
      setError(requestError(cause));
    }
  };

  const handleDeleteLot = async (lot: Lot) => {
    if (
      !window.confirm(
        `Удалить лот «${lot.title}»? Это также удалит связанные записи о выигрышах и ставках.`,
      )
    )
      return;
    setError("");
    setNotice("");
    try {
      await deleteLot(lot.id);
      setLots((current) => current.filter((item) => item.id !== lot.id));
      if (editingId === lot.id) resetLotForm();
      setNotice("Лот удалён.");
    } catch (cause) {
      setError(requestError(cause));
    }
  };

  const handleSearchUsers = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    try {
      await loadUsers(userSearch);
    } catch (cause) {
      setError(requestError(cause));
    }
  };

  const handleAddUserBalance = async (
    user: AdminUser,
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    const amountRubles = Number(balanceDrafts[user.id]);
    if (!Number.isInteger(amountRubles) || amountRubles < 1) {
      setError("Введите сумму пополнения целым числом рублей.");
      return;
    }

    setError("");
    setNotice("");
    setBalanceSavingId(user.id);
    try {
      const updatedUser = await addUserBalance(user.id, amountRubles);
      setAdminUsers((current) =>
        current.map((item) => (item.id === user.id ? updatedUser : item)),
      );
      setBalanceDrafts((current) => ({ ...current, [user.id]: "" }));
      setNotice(
        `Баланс ${updatedUser.name} пополнен на ${rubles(amountRubles * 100)}.`,
      );
    } catch (cause) {
      setError(requestError(cause));
    } finally {
      setBalanceSavingId(null);
    }
  };

  const handleUpdateAdminUser = async (
    user: AdminUser,
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    const edit = userEdits[user.id] ?? { email: user.email, password: "" };
    const changes: { email?: string; password?: string } = {};
    if (edit.email.trim().toLowerCase() !== user.email.toLowerCase()) {
      changes.email = edit.email.trim();
    }
    if (edit.password) changes.password = edit.password;
    if (!changes.email && !changes.password) {
      setError("Изменений нет. Введите новый email или пароль.");
      return;
    }

    setError("");
    setNotice("");
    setUserSavingId(user.id);
    try {
      const updatedUser = await updateAdminUser(user.id, changes);
      setAdminUsers((current) =>
        current.map((item) => (item.id === user.id ? updatedUser : item)),
      );
      setUserEdits((current) => ({
        ...current,
        [user.id]: { email: updatedUser.email, password: "" },
      }));
      setNotice(`Данные аккаунта ${updatedUser.name} обновлены.`);
    } catch (cause) {
      setError(requestError(cause));
    } finally {
      setUserSavingId(null);
    }
  };

  const handleCreateBot = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await createAdminBot(botName.trim());
      setBotName("");
      setBots(await getAdminBots());
      setNotice("Бот добавлен и сразу доступен для торгов.");
    } catch (cause) {
      setError(requestError(cause));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteBot = async (bot: AdminBot) => {
    if (!window.confirm(`Удалить бота «${bot.name}»?`)) return;
    setError("");
    setNotice("");
    try {
      await deleteAdminBot(bot.id);
      setBots((current) => current.filter((item) => item.id !== bot.id));
      setNotice("Бот удалён.");
    } catch (cause) {
      setError(requestError(cause));
    }
  };

  if (loading)
    return (
      <main className={styles.page}>
        <div className={styles.state}>Загружаем панель управления…</div>
      </main>
    );

  if (error && !lots.length && !bots.length) {
    return (
      <main className={styles.page}>
        <section className={styles.accessCard}>
          <span className={styles.accessIcon}>🔒</span>
          <h1>Панель администратора</h1>
          <p>
            {error.includes("401") || error.includes("403")
              ? "У этого аккаунта нет доступа. Проверьте адрес в ADMIN_USER в backend .env."
              : error}
          </p>
          {!userStore.isAuthenticated && (
            <Link href="/login" className={styles.primaryButton}>
              Войти
            </Link>
          )}
        </section>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>GoldenDay · управление</span>
          <h1>Панель администратора</h1>
          <p>Лоты, купюры и пул ботов</p>
        </div>
        <div className={styles.headerActions}>
          <span className={styles.adminEmail}>{userStore.user?.email}</span>
          <Link href="/" className={styles.backLink}>
            На сайт ↗
          </Link>
        </div>
      </header>

      {(error || notice) && (
        <div
          className={error ? styles.alertError : styles.alertSuccess}
          role={error ? "alert" : "status"}
        >
          {error || notice}
          <button
            onClick={() => {
              setError("");
              setNotice("");
            }}
            aria-label="Закрыть"
          >
            ×
          </button>
        </div>
      )}

      <nav className={styles.tabs} aria-label="Разделы панели">
        <button
          className={tab === "lots" ? styles.activeTab : styles.tab}
          onClick={() => setTab("lots")}
        >
          Лоты <span>{lots.length}</span>
        </button>
        <button
          className={tab === "bots" ? styles.activeTab : styles.tab}
          onClick={() => setTab("bots")}
        >
          Боты <span>{bots.length}</span>
        </button>
        <button
          className={tab === "users" ? styles.activeTab : styles.tab}
          onClick={() => setTab("users")}
        >
          Пользователи <span>{adminUsers.length}</span>
        </button>
      </nav>

      {tab === "lots" ? (
        <div className={styles.layout}>
          <section className={styles.formCard}>
            <div className={styles.cardHeading}>
              <div>
                <span className={styles.eyebrow}>
                  {editingId ? "Редактирование" : "Новый объект"}
                </span>
                <h2>{editingId ? "Изменить лот" : "Создать лот"}</h2>
              </div>
              {editingId && (
                <button className={styles.textButton} onClick={resetLotForm}>
                  Отмена
                </button>
              )}
            </div>
            <form className={styles.form} onSubmit={handleLotSubmit}>
              <label>
                Описание
                <textarea
                  value={draft.description}
                  onChange={(e) => setField("description", e.target.value)}
                  rows={4}
                  maxLength={3000}
                />
              </label>
              <div className={styles.fields2}>
                <label>
                  Номинал банкноты
                  <select
                    value={draft.basePrice}
                    onChange={(e) => setField("basePrice", e.target.value)}
                    required
                  >
                    <option value="500">500 ₽</option>
                    <option value="1000">1 000 ₽</option>
                    <option value="2000">2 000 ₽</option>
                    <option value="5000">5 000 ₽</option>
                  </select>
                </label>
                <label>
                  Длительность раунда, сек.
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={draft.periodSeconds}
                    onChange={(e) => setField("periodSeconds", e.target.value)}
                    required
                  />
                </label>
              </div>
              <label>
                Завершать после бездействия, сек.
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={draft.inactivitySeconds}
                  onChange={(e) =>
                    setField("inactivitySeconds", e.target.value)
                  }
                  required
                />
                <span className={styles.fieldHint}>
                  Ставка сбрасывает этот таймер.
                </span>
              </label>
              <div className={styles.imagePreview}>
                <img
                  src={`/${draft.basePrice}.svg`}
                  alt={`Банкнота ${draft.basePrice} рублей`}
                />
                <span className={styles.fieldHint}>
                  Изображение выбирается автоматически по номиналу.
                </span>
              </div>
              <label className={styles.checkbox}>
                <input
                  type="checkbox"
                  checked={draft.isActive}
                  onChange={(e) => setField("isActive", e.target.checked)}
                />
                Лот активен сразу после сохранения
              </label>
              <button
                className={styles.primaryButton}
                type="submit"
                disabled={saving}
              >
                {saving
                  ? "Сохраняем…"
                  : editingId
                    ? "Сохранить изменения"
                    : "Создать лот"}
              </button>
            </form>
          </section>

          <section className={styles.listCard}>
            <div className={styles.cardHeading}>
              <div>
                <span className={styles.eyebrow}>Каталог</span>
                <h2>
                  Все лоты <small>{lots.length}</small>
                </h2>
              </div>
              <button
                className={styles.refreshButton}
                onClick={() =>
                  loadData().catch((cause) => setError(requestError(cause)))
                }
              >
                Обновить
              </button>
            </div>
            {lots.length === 0 ? (
              <p className={styles.empty}>
                Лотов пока нет. Создайте первый в форме слева.
              </p>
            ) : (
              <div className={styles.lotList}>
                {lots.map((lot) => (
                  <article className={styles.lotRow} key={lot.id}>
                    <div className={styles.thumb}>
                      {lot.image ? (
                        <img src={backendAssetUrl(lot.image)} alt="" />
                      ) : (
                        <span>Без фото</span>
                      )}
                    </div>
                    <div className={styles.lotDetails}>
                      <div className={styles.lotNameLine}>
                        <h3>{lot.title}</h3>
                        <span
                          className={
                            lot.isActive
                              ? styles.statusActive
                              : styles.statusInactive
                          }
                        >
                          {lot.isFinished ? "Завершён" : lot.isActive ? "Активен" : "Остановлен"}
                        </span>
                      </div>
                      <p>
                        {rubles(lot.basePrice)} <i>·</i> Раунд{" "}
                        {humanDuration(lot.periodSeconds)}
                      </p>
                      <small>
                        Создан{" "}
                        {new Intl.DateTimeFormat("ru-RU", {
                          dateStyle: "medium",
                        }).format(new Date(lot.createdAt))}
                      </small>
                    </div>
                    <div className={styles.rowActions}>
                      {!lot.isFinished && <>
                        <button onClick={() => beginEdit(lot)}>Изменить</button>
                        <button onClick={() => handleToggle(lot)}>
                          {lot.isActive ? "Остановить" : "Запустить"}
                        </button>
                        <button onClick={() => handleToggleBots(lot)}>
                          {lot.botsEnabled ? "Отключить ботов" : "Включить ботов"}
                        </button>
                        <button
                          className={styles.dangerText}
                          onClick={() => handleDeleteLot(lot)}
                        >
                          Удалить
                        </button>
                      </>}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      ) : tab === "bots" ? (
        <section className={styles.botPanel}>
          <div className={styles.botIntro}>
            <span className={styles.botIcon}>✦</span>
            <div>
              <span className={styles.eyebrow}>Участники аукциона</span>
              <h2>Пул ботов</h2>
              <p>
                Боты участвуют в торгах активных лотов. Изменения применяются
                сразу.
              </p>
            </div>
          </div>
          <form className={styles.botForm} onSubmit={handleCreateBot}>
            <label htmlFor="botName">Имя бота</label>
            <input
              id="botName"
              value={botName}
              onChange={(e) => setBotName(e.target.value)}
              minLength={2}
              maxLength={60}
              required
              placeholder="Например, Алексей"
            />
            <button className={styles.primaryButton} disabled={saving}>
              {saving ? "Добавляем…" : "Добавить бота"}
            </button>
          </form>
          <div className={styles.botListHeading}>
            <h3>Добавленные боты</h3>
            <span>{bots.length} / 200</span>
          </div>
          {bots.length === 0 ? (
            <p className={styles.empty}>Список пуст. Добавьте первого бота.</p>
          ) : (
            <div className={styles.botGrid}>
              {bots.map((bot) => (
                <div className={styles.botItem} key={bot.id}>
                  <span className={styles.botAvatar}>
                    {bot.name.trim().charAt(0).toLocaleUpperCase("ru-RU")}
                  </span>
                  <span>{bot.name}</span>
                  <button
                    onClick={() => handleDeleteBot(bot)}
                    aria-label={`Удалить бота ${bot.name}`}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : (
        <section className={styles.usersPanel}>
          <div className={styles.botIntro}>
            <span className={styles.botIcon}>♙</span>
            <div>
              <span className={styles.eyebrow}>Аккаунты</span>
              <h2>Пользователи</h2>
              <p>Откройте карточку, чтобы пополнить баланс или изменить данные аккаунта.</p>
            </div>
          </div>
          <form className={styles.userSearch} onSubmit={handleSearchUsers}>
            <input
              type="search"
              value={userSearch}
              onChange={(event) => setUserSearch(event.target.value)}
              placeholder="Имя или email"
              aria-label="Поиск пользователя по имени или email"
              maxLength={100}
            />
            <button
              className={styles.primaryButton}
              type="submit"
              disabled={usersLoading}
            >
              {usersLoading ? "Ищем…" : "Найти"}
            </button>
          </form>
          <div className={styles.botListHeading}>
            <h3>Результаты поиска</h3>
            <span>{adminUsers.length} / 100</span>
          </div>
          {usersLoading ? (
            <p className={styles.empty}>Загружаем пользователей…</p>
          ) : adminUsers.length === 0 ? (
            <p className={styles.empty}>Пользователи не найдены.</p>
          ) : (
            <div className={styles.usersList}>
              {adminUsers.map((user) => {
                const isExpanded = expandedUserId === user.id;
                const edit = userEdits[user.id] ?? {
                  email: user.email,
                  password: "",
                };
                return (
                  <article className={styles.userCard} key={user.id}>
                    <button
                      className={styles.userSummary}
                      type="button"
                      aria-expanded={isExpanded}
                      onClick={() => {
                        setExpandedUserId(isExpanded ? null : user.id);
                        setUserEdits((current) => ({
                          ...current,
                          [user.id]: current[user.id] ?? {
                            email: user.email,
                            password: "",
                          },
                        }));
                      }}
                    >
                      <span className={styles.userDetails}>
                        <strong>{user.name}</strong>
                        <span>{user.email}</span>
                        <small>
                          {user.role === "ADMIN" ? "Администратор" : "Пользователь"}
                        </small>
                      </span>
                      <span className={styles.userBalance}>
                        <span>Баланс</span>
                        <strong>{rubles(user.balance)}</strong>
                      </span>
                      <span className={styles.expandIcon} aria-hidden="true">
                        {isExpanded ? "−" : "+"}
                      </span>
                    </button>
                    {isExpanded && (
                      <div className={styles.userEditor}>
                        <form
                          className={styles.balanceForm}
                          onSubmit={(event) => handleAddUserBalance(user, event)}
                        >
                          <label htmlFor={`balance-${user.id}`}>Пополнить баланс, ₽</label>
                          <input
                            id={`balance-${user.id}`}
                            type="number"
                            min="1"
                            max="1000000"
                            step="1"
                            required
                            value={balanceDrafts[user.id] ?? ""}
                            onChange={(event) =>
                              setBalanceDrafts((current) => ({
                                ...current,
                                [user.id]: event.target.value,
                              }))
                            }
                            placeholder="Сумма в рублях"
                          />
                          <button
                            className={styles.primaryButton}
                            disabled={balanceSavingId === user.id}
                          >
                            {balanceSavingId === user.id ? "Пополняем…" : "Добавить"}
                          </button>
                        </form>
                        <form
                          className={styles.userCredentials}
                          onSubmit={(event) => handleUpdateAdminUser(user, event)}
                        >
                          <label>
                            Email
                            <input
                              type="email"
                              required
                              maxLength={254}
                              value={edit.email}
                              onChange={(event) =>
                                setUserEdits((current) => ({
                                  ...current,
                                  [user.id]: { ...edit, email: event.target.value },
                                }))
                              }
                            />
                          </label>
                          <label>
                            Новый пароль
                            <input
                              type="password"
                              minLength={8}
                              maxLength={128}
                              autoComplete="new-password"
                              value={edit.password}
                              onChange={(event) =>
                                setUserEdits((current) => ({
                                  ...current,
                                  [user.id]: { ...edit, password: event.target.value },
                                }))
                              }
                              placeholder="Оставьте пустым, чтобы не менять"
                            />
                          </label>
                          <button
                            className={styles.primaryButton}
                            disabled={userSavingId === user.id}
                          >
                            {userSavingId === user.id ? "Сохраняем…" : "Сохранить данные"}
                          </button>
                        </form>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}
    </main>
  );
}
