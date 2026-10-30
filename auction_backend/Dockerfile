FROM node:22-alpine AS build

WORKDIR /app
RUN apk add --no-cache openssl

COPY package*.json ./
COPY prisma ./prisma
RUN npm ci
RUN npx prisma generate

COPY . .
RUN npm run build

FROM node:22-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4200
RUN apk add --no-cache openssl libstdc++ \
    && mkdir -p /app/uploads

COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma

EXPOSE 4200
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
