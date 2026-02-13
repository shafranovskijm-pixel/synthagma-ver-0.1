ALTER TABLE courses ADD COLUMN notify_on_completion boolean NOT NULL DEFAULT false;
ALTER TABLE courses ADD COLUMN completion_notify_emails text;