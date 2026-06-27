<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Extend grade_items table with calculated item support
        Schema::table('grade_items', function (Blueprint $table) {
            $table->text('calculation_formula')->nullable()->after('itemtype');
            $table->enum('aggregation_method', ['mean', 'weighted_mean', 'median', 'mode', 'sum', 'highest', 'lowest'])->nullable()->after('calculation_formula');
            $table->decimal('weight', 8, 2)->default(1)->after('aggregation_method');
        });

        // Extend activities table with availability rules
        Schema::table('activities', function (Blueprint $table) {
            $table->dateTime('available_from')->nullable()->after('content');
            $table->dateTime('available_until')->nullable()->after('available_from');
            $table->json('completion_data')->nullable()->after('available_until');
            $table->json('grade_restrictions_data')->nullable()->after('completion_data');
            $table->unsignedInteger('time_limit_seconds')->nullable()->after('grade_restrictions_data');
            $table->uuid('grade_item_id')->nullable()->after('time_limit_seconds');
        });
    }

    public function down(): void
    {
        Schema::table('grade_items', function (Blueprint $table) {
            $table->dropColumn(['calculation_formula', 'aggregation_method', 'weight']);
        });

        Schema::table('activities', function (Blueprint $table) {
            $table->dropColumn([
                'available_from',
                'available_until',
                'completion_data',
                'grade_restrictions_data',
                'time_limit_seconds',
                'grade_item_id',
            ]);
        });
    }
};
