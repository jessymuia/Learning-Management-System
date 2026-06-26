#!/bin/sh
# Ensures the app is bootable before running the given command.
set -e

# Materialize a .env from the container environment. Laravel's env() reads from
# the .env file; an empty .env makes DB_HOST etc. fall back to defaults like
# 127.0.0.1, which breaks DB connectivity inside Docker. Write the real values.
cat > .env <<ENVEOF
APP_NAME=LMS
APP_ENV=${APP_ENV:-local}
APP_KEY=${APP_KEY}
APP_DEBUG=${APP_DEBUG:-true}
APP_URL=${APP_URL:-http://localhost:8000}

DB_CONNECTION=${DB_CONNECTION:-pgsql}
DB_HOST=${DB_HOST:-postgres}
DB_PORT=${DB_PORT:-5432}
DB_DATABASE=${DB_DATABASE:-lms_full}
DB_USERNAME=${DB_USERNAME:-lms_app}
DB_PASSWORD=${DB_PASSWORD:-lms_app_password}

REDIS_CLIENT=${REDIS_CLIENT:-predis}
REDIS_HOST=${REDIS_HOST:-redis}
REDIS_PORT=${REDIS_PORT:-6379}

# Session + cache: this app is stateless (JWT) and uses NO server sessions, so
# the 'array' session driver (in-memory, no table, no Redis) is safest — it
# can't fail. Without this, Laravel defaults SESSION_DRIVER to 'database' and
# looks for a non-existent "sessions" table.
SESSION_DRIVER=${SESSION_DRIVER:-array}
CACHE_STORE=${CACHE_STORE:-file}
QUEUE_CONNECTION=${QUEUE_CONNECTION:-redis}

JWT_SECRET=${JWT_SECRET}
FRONTEND_ORIGIN=${FRONTEND_ORIGIN:-http://localhost:3000}
ENVEOF

# Ensure Laravel's writable runtime directories exist (safety net at runtime).
mkdir -p bootstrap/cache storage/framework/cache storage/framework/sessions \
         storage/framework/views storage/logs
chmod -R 775 bootstrap/cache storage 2>/dev/null || true

# Generate an APP_KEY only if one isn't already provided via env or .env.
if [ -z "$APP_KEY" ] && ! grep -q "^APP_KEY=base64:" .env 2>/dev/null; then
  php artisan key:generate --force || true
fi

# Clear any stale cached config so the fresh .env above is what's used.
php artisan config:clear || true

# Discover packages now that the app can boot (skipped during build).
php artisan package:discover --ansi || true

# Run whatever command was passed (serve, queue:work, etc.)
exec "$@"
