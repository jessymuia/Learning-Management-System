<?php

namespace App\Listeners;

use App\Mail\ForumReplyNotification;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;

class ForumPostCreated
{
    public function handle($event)
    {
        $post = $event->post;

        // Get discussion and subscribers
        $discussion = DB::selectOne(
            'SELECT d.id, d.title, f.id as forum_id, f.name
             FROM discussions d
             JOIN forums f ON f.id = d.forum_id
             WHERE d.id = ?',
            [$post->discussion_id]
        );

        if (!$discussion) return;

        // Get parent post author (if reply)
        if ($post->parent_id) {
            $parentAuthor = DB::selectOne(
                'SELECT user_id FROM posts WHERE id = ?',
                [$post->parent_id]
            );
            if ($parentAuthor) {
                $user = DB::selectOne('SELECT email FROM users WHERE id = ?', [$parentAuthor->user_id]);
                if ($user) {
                    Mail::queue(new ForumReplyNotification(
                        $post->user_id,
                        $discussion->name,
                        $discussion->title,
                        $post->content,
                        "#"
                    ));
                }
            }
        }

        // Notify discussion subscribers
        $subscribers = DB::select(
            'SELECT DISTINCT u.email FROM discussion_subscriptions ds
             JOIN users u ON u.id = ds.user_id
             WHERE ds.discussion_id = ? AND ds.user_id != ?',
            [$post->discussion_id, $post->user_id]
        );

        foreach ($subscribers as $subscriber) {
            Mail::queue(new ForumReplyNotification(
                $subscriber->email,
                $discussion->name,
                $discussion->title,
                $post->content,
                "#"
            ));
        }
    }
}
