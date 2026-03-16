FROM node:20-slim

WORKDIR /app

# Copy package files first for better caching
COPY package.json pnpm-lock.yaml* package-lock.json* ./

# Install dependencies
RUN corepack enable && corepack prepare pnpm@latest --activate \
    && pnpm install --frozen-lockfile 2>/dev/null || npm install

# Copy application code
COPY . .

# Build the Next.js app
RUN npm run build

EXPOSE 3141

CMD ["npm", "start"]
