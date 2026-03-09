-- player table
CREATE TABLE players (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    age INTEGER,
    ranking INTEGER,
    seed INTEGER 
);

-- tournament table
CREATE TABLE tournaments (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    start_date DATE
);

-- round table
CREATE TABLE rounds (
    id SERIAL PRIMARY KEY,
    tournament_id INTEGER NOT NULL,
    round_number INTEGER NOT NULL,

    FOREIGN KEY (tournament_id) REFERENCES tournaments(id)
);

-- match table
CREATE TABLE matches (
    id SERIAL PRIMARY KEY,
    round_id INTEGER NOT NULL,
    player1_id INTEGER NOT NULL,
    player2_id INTEGER NOT NULL,
    winner_id INTEGER,
    match_time TIMESTAMP,
    score VARCHAR(50),

    FOREIGN KEY (round_id) REFERENCES rounds(id),
    FOREIGN KEY (player1_id) REFERENCES players(id),
    FOREIGN KEY (player2_id) REFERENCES players(id),
    FOREIGN KEY (winner_id) REFERENCES players(id),

    CHECK (player1_id <> player2_id),
    CHECK (winner_id IS NULL OR winner_id IN (player1_id, player2_id))
);

-- data for player table
INSERT INTO players (name, age, ranking, seed) VALUES
('Alex Turner', 17, 102, 1),
('Jordan Lee', 16, 145, 2),
('Chris Patel', 17, 160, 3),
('Mia Johnson', 15, 175, 4),
('Ethan Brooks', 16, 190, 5),
('Sofia Ramirez', 17, 205, 6);

-- data for tournament table
INSERT INTO tournaments (name, start_date) VALUES
('Spring Invitational', '2026-03-15'),
('Midwest Junior Open', '2026-04-02'),
('City Championships', '2026-05-10'),
('Summer Regional Qualifier', '2026-06-01'),
('Fall Youth Classic', '2026-09-20');

-- data for round table (3 rounds per tournament)
INSERT INTO rounds (tournament_id, round_number) VALUES
(1, 1), (1, 2), (1, 3), 
(2, 1), (2, 2), (2, 3), 
(3, 1), (3, 2), (3, 3), 
(4, 1), (4, 2), (4, 3), 
(5, 1), (5, 2), (5, 3);

-- data for match table (bracket format)
INSERT INTO matches (round_id, player1_id, player2_id, match_time) VALUES
(1, 1, 2, '2026-03-15 10:00'),
(1, 3, 4, '2026-03-15 11:00'),
(2, 1, 3, '2026-03-16 09:00'),
(3, 1, 5, '2026-03-17 12:00'),
(3, 4, 6, '2026-03-17 14:00'),

(4, 2, 3, '2026-04-02 10:30'),
(4, 1, 6, '2026-04-02 12:00'),
(5, 2, 6, '2026-04-03 10:00'),
(6, 2, 4, '2026-04-04 13:00'),
(6, 5, 1, '2026-04-04 15:00');