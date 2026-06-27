# ── Stage 1: install ALL dependencies (including devDeps needed to build) ──
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json ./
RUN npm install --no-audit

# ── Stage 2: build the Next.js app ────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
COPY . .
COPY --from=deps /app/node_modules ./node_modules
ENV NEXT_PUBLIC_API_BASE=http://api:8000
ENV NODE_ENV=production
RUN npm run build

# ── Stage 3: lean production image ────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/package.json ./
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/next.config.mjs ./
EXPOSE 3000
CMD ["npm", "start"]