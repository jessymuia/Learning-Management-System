<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // System settings table
        Schema::create('system_settings', function (Blueprint $table) {
            $table->id();
            $table->string('key')->unique();
            $table->longText('value')->nullable();
            $table->timestamps();
        });

        // Integration credentials table (encrypted)
        Schema::create('integration_credentials', function (Blueprint $table) {
            $table->id();
            $table->string('provider'); // stripe, mpesa, sendgrid, etc.
            $table->enum('environment', ['sandbox', 'production'])->default('sandbox');
            $table->longText('credentials'); // JSON, encrypted
            $table->boolean('is_active')->default(true);
            $table->timestamps();
            $table->unique(['provider', 'environment']);
        });

        // Permission overrides table (for explicit deny)
        Schema::create('permission_overrides', function (Blueprint $table) {
            $table->id();
            $table->uuid('tenant_id');
            $table->uuid('user_id')->nullable();
            $table->uuid('role_id')->nullable();
            $table->uuid('context_id')->nullable();
            $table->string('permission');
            $table->integer('effect')->default(0); // 1 = allow, -1000 = prohibit
            $table->string('reason')->nullable();
            $table->timestamps();
            
            $table->foreign('tenant_id')->references('id')->on('tenants');
            $table->index(['tenant_id', 'user_id', 'permission']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('permission_overrides');
        Schema::dropIfExists('integration_credentials');
        Schema::dropIfExists('system_settings');
    }
};
