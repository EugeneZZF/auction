"use client";

import { useEffect } from "react";
import { observer } from "mobx-react-lite";
import { usePathname } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { userStore } from "@/stores/userStore";
import Logo from "../Logo/Logo";
import styles from "./Header.module.css";

function getPageTitle(pathname: string) {
  if (pathname === "/") return "Главная страница";
  if (pathname === "/register") return "Регистрация";
  if (pathname === "/login") return "Вход в аккаунт";
  if (pathname.startsWith("/profile")) return "Личный кабинет";
  if (pathname.startsWith("/lot/")) return "Аукцион";
  return "GoldenDay";
}

const Header = observer(() => {
  const pathname = usePathname();

  useEffect(() => {
    userStore.loadFromStorage();
  }, []);

  return (
    <header className={styles.header}>
      {/* <div className={styles.pageBar}>
        <span>{getPageTitle(pathname)}</span>
      </div> */}

      <div className={styles.top}>
        <div className={styles.topInner}>
          <nav className={styles.spc} aria-label="Аккаунт">
            {userStore.isAuthenticated ? (
              <Link href="/profile" className={styles.userLink}>
                <span>{userStore.user?.name}</span>
                <span className={styles.divider} aria-hidden="true">
                  |
                </span>
                <span className={styles.userInfo}>
                  <span>{(userStore.user?.balance || 0) / 100} ₽</span>
                  <span className={styles.centerise}>
                    <Image
                      src="/bids_icon.svg"
                      alt="Ставки"
                      width={14}
                      height={14}
                    />
                    <span>{userStore.user?.bids}</span>
                  </span>
                </span>
              </Link>
            ) : (
              <span className={styles.authLinks}>
                <Link href="/register">Регистрация</Link>
                <span>или</span>
                <Link href="/login">войти</Link>
              </span>
            )}
          </nav>

          <nav className={styles.spc} aria-label="Информация">
            <Link href="/how-it-works">Как это работает</Link>
            <Link href="/feedback">Обратная связь</Link>
          </nav>
        </div>
      </div>

      <div className={styles.bottom}>
        <div className={styles.bottomInner}>
          <Link
            className={styles.brand}
            href="/"
            aria-label="GoldenDay — главная"
          >
            <Logo />
          </Link>
          <form
            className={styles.search}
            action="/lot"
            method="get"
            role="search"
          >
            <input
              aria-label="Поиск по аукциону"
              name="search"
              placeholder="Найти всё!"
            />
            <button type="submit">Найти</button>
          </form>
        </div>
      </div>
    </header>
  );
});

export default Header;
