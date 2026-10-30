export interface EnvironmentVariables {
  // Database
  DATABASE_URL: string;

  // JWT
  JWT_SECRET: string;

  // Redis
  REDIS_HOST?: string;
  REDIS_PORT?: string;
  REDIS_PASSWORD?: string;

  // Server
  PORT?: string;
}

declare global {
  namespace NodeJS {
    interface ProcessEnv extends EnvironmentVariables {}
  }
}
