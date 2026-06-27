<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class ForumReplyNotification extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public string $userName,
        public string $forumName,
        public string $discussionTitle,
        public string $replyText,
        public string $discussionUrl
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: "New reply in {$this->forumName}: {$this->discussionTitle}",
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.forum-reply-notification',
            with: [
                'userName' => $this->userName,
                'forumName' => $this->forumName,
                'discussionTitle' => $this->discussionTitle,
                'replyText' => $this->replyText,
                'discussionUrl' => $this->discussionUrl,
            ]
        );
    }
}
