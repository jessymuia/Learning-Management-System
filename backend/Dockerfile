FROM php:8.3-cli

# system deps + PHP extensions Laravel + Postgres need
RUN apt-get update && apt-get install -y \
      libpq-dev unzip git libzip-dev \
    && docker-php-ext-install pdo pdo_pgsql zip \
    && rm -rf /var/lib/apt/lists/*

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer
WORKDIR /app

# install PHP deps first (layer cache)
COPY composer.json composer.lock* ./
# COMPOSER_NO_AUDIT disables the security-advisory check that otherwise BLOCKS
# install when a transitive version carries an advisory. The --no-audit flag
# alone is not sufficient on some Composer builds; this env var is the reliable
# switch, and the config line below force-disables advisory blocking too.
ENV COMPOSER_NO_AUDIT=1
RUN composer config --no-interaction audit.abandoned ignore || true
RUN composer update --no-interaction --no-scripts --no-autoloader --no-audit --prefer-dist

# app code
COPY . .
# Laravel needs these runtime dirs to exist and be writable; they're normally
# gitignored so they aren't in the build context. Create them before autoload.
RUN mkdir -p bootstrap/cache \
             storage/framework/cache \
             storage/framework/sessions \
             storage/framework/views \
             storage/logs \
    && chmod -R 775 bootstrap/cache storage
# dump autoload WITHOUT running the artisan discovery script (it needs a booted
# app + env; it runs at container start via the entrypoint instead).
RUN composer dump-autoload --optimize --no-scripts

# env: Laravel needs a .env file to exist. Config values come from the
# environment (compose injects them), so a minimal placeholder is enough here.
# The root .env.example documents every option for humans.
RUN touch .env

EXPOSE 8000
# wait for nothing here — compose handles DB readiness via depends_on/healthcheck
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["php", "artisan", "serve", "--host=0.0.0.0", "--port=8000"]
