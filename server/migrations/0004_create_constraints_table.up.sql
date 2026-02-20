CREATE TABLE constraints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(128) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    week_start DATE NOT NULL,
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP NOT NULL,
    priority VARCHAR(10) NOT NULL CHECK (priority IN ('HARD', 'SOFT')),
    reason TEXT,
    source_message TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);
