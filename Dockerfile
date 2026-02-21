FROM oven/bun:1.3.5

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --production

COPY . .

ENV NODE_ENV=production

CMD ["bun", "run", "dev"]