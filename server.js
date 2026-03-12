const express = require('express');
const {Pool} = require('pg');
const cors = require('cors');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// Connecting to PostgreSQL
const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'my-first-project',
    password: 'DMa52808',
    port: 5432
});

async function query(text, params) {
    const client = await pool.connect();
    try {
        const result = await client.query(text, params);
        return result;
    } finally {
        client.release();
    }
}

async function resetMatches() {
    await query("DELETE FROM matches");
    await query("ALTER SEQUENCE matches_id_seq RESTART WITH 1");
}

resetMatches();

// Getting all players
app.get("/players", async (req, res) => {
    try {
        const result = await query(
            "SELECT * FROM players ORDER BY seed ASC"
        );
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({error: "Failed to fetch all players" });
    }
});

// Creating a new player
app.post("/players", async (req, res) => {
    const {name, age, ranking, seed} = req.body;

    try {
        const result = await query(
            "INSERT INTO players (name, age, ranking, seed) VALUES ($1, $2, $3, $4) RETURNING *",
            [name, age, ranking, seed]
        );
        res.json(result.rows[0]);
    } catch (err) {
        if (err.code === "23505") { // Unique violation in PostgreSQL
            return res.status(400).json({ error: "Ranking or Seed must be unique" });
        }
        console.error(err);
        res.status(500).json({error: "Failed to create player"});
    }
});

// Updating an existing player
app.put("/players/:id", async (req, res) => {
    const id = req.params.id;
    const {name, age, ranking, seed} = req.body;

    try {
        const result = await query(
            "UPDATE players SET name=$1, age=$2, ranking=$3, seed=$4 WHERE id=$5 RETURNING *",
            [name, age, ranking, seed, id]
        );
        res.json(result.rows[0]);
    } catch (err) {
        if (err.code === "23505") { // Unique violation in PostgreSQL
            return res.status(400).json({ error: "Ranking or Seed must be unique" });
        }
        console.error(err);
        res.status(500).json({error: "Failed to update player"});
    }
});

// Deleting a player
app.delete("/players/:id", async (req, res) => {
    const id = req.params.id;

    try {
        await query("DELETE FROM players WHERE id=$1", [id]);
        res.json({message: "Player has been deleted"});
    } catch (err) {
        console.error(err);
        res.status(500).json({error: "Failed to delete player"});
    }
});

// Getting all matches in one round
app.get("/rounds/:roundId/matches", async (req, res) => {
    const roundId = req.params.roundId;

    try {
        const result = await query(
            "SELECT m.id, m.player1_id, m.player2_id, p1.name AS player1, p2.name AS player2, w.name AS winner, m.match_time, m.score FROM matches m LEFT JOIN players p1 ON m.player1_id = p1.id LEFT JOIN players p2 ON m.player2_id = p2.id LEFT JOIN players w ON m.winner_id = w.id WHERE m.round_id = $1 ORDER BY m.match_time",
            [roundId]
        );
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({error: "Failed to fetch all matches"});
    }
});

// Creating random matches
app.post("/tournaments/:id/generate-matches", async (req, res) => {
    const tournament_id = req.params.id;

    try {
        // 1. DELETE existing matches for this tournament
        await query(`
            DELETE FROM matches
            WHERE round_id IN (
                SELECT id FROM rounds WHERE tournament_id = $1
            )
        `, [tournament_id]);

        await query("DELETE FROM rounds WHERE tournament_id = $1", [tournament_id]);

        // 2. Count players
        const playersResult = await query(
            "SELECT id FROM players ORDER BY RANDOM()"
        );
        let players = playersResult.rows.map(p => p.id);
        let playerCount = players.length;

        // 3. Create Round 1
        const round1 = await query(
            "INSERT INTO rounds (tournament_id, round_number) VALUES ($1, $2) RETURNING id",
            [tournament_id, 1]
        );
        const round1Id = round1.rows[0].id;

        // 4. Pair players
        let matchPairs = [];

        while (players.length >= 2) {
            let p1 = players.pop();
            let p2 = players.pop() ?? null;
            matchPairs.push([p1, p2]);
        }

        if (players.length === 1) {
            // BYE
            matchPairs.push([players.pop(), null]);
        }

        // 5. Insert matches
        for (const [p1, p2] of matchPairs) {

            if (!p1) continue;

            await query(
                "INSERT INTO matches(round_id, player1_id, player2_id, match_time, winner_id) VALUES ($1, $2, $3, NOW(), $4)",
                [round1Id, p1, p2 ?? null, p2 === null ? p1 : null]
            );
        }

        return res.json({
            message: "Round 1 generated dynamically",
            matchesCreated: matchPairs.length
        });
    
    } catch (err) {
        console.error(err);
        res.status(500).json({error: "Failed to create matches"});
    }
});

// Updating a match after winner is determined
app.put("/matches/:id", async (req, res) => {
    const id = req.params.id;
    const {winner_id, score} = req.body;

    try {
        const result = await query(
            "UPDATE matches SET winner_id=$1, score=$2 WHERE id=$3 RETURNING *",
            [winner_id, score, id]
        );

        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({error: "Failed to update match result"});
    }
});

// Generating next round
app.post("/tournaments/:id/next-round", async (req, res) => {
    const tournament_id = req.params.id;

    try {
        // 1. Load existing rounds
        const roundsResult = await query(
            "SELECT * FROM rounds WHERE tournament_id = $1 ORDER BY round_number ASC",
            [tournament_id]
        );
        const rounds = roundsResult.rows;

        if (rounds.length === 0) {
            return res.status(400).json({error: "Generate matches first"});
        }

        const lastRound = rounds[rounds.length - 1];

        const matchesResult = await query(
            "SELECT * FROM matches WHERE round_id = $1",
            [lastRound.id]
        );
        const matches = matchesResult.rows;

        // 2. Do not generate next round until ALL matches finished
        const allCompleted = matches.every(m =>
            m.winner_id !== null || m.player2_id === null
        );

        if (!allCompleted) {
            return res.json({message: "Round not complete"});
        }

        // 3. Collect winners
        const winners = matches.map(
            m => m.winner_id ?? m.player1_id
        );

        // 4. If only 1 winner → tournament is finished
        if (winners.length === 1) {
            const resultWinner = await query(
                "SELECT name FROM players WHERE id = $1",
                [winners[0]]
            );
            const winnerName = resultWinner.rows[0].name;

            return res.json({
                message: `Tournament winner: ${winnerName}`,
                winnerName
            });
        }

        // 5. Create next round
        const nextRoundNumber = lastRound.round_number + 1;

        const nextRound = await query(
            "INSERT INTO rounds (tournament_id, round_number) VALUES ($1, $2) RETURNING id",
            [tournament_id, nextRoundNumber]
        );
        const nextRoundId = nextRound.rows[0].id;

        // 6. Pair winners
        let shuffled = winners.sort(() => Math.random() - 0.5);
        let matchPairs = [];

        while (shuffled.length >= 2) {
            matchPairs.push([shuffled.pop(), shuffled.pop()]);
        }

        if (shuffled.length === 1) {
            matchPairs.push([shuffled.pop(), null]);
        }

        // 7. Insert matches
        for (const [p1, p2] of matchPairs) {
            await query(
                "INSERT INTO matches(round_id, player1_id, player2_id, match_time, winner_id) VALUES ($1, $2, $3, NOW(), $4)",
                [nextRoundId, p1, p2, p2 === null ? p1 : null]
            );
        }

        res.json({
            message: `Round ${nextRoundNumber} generated`,
            matchesCreated: matchPairs.length
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({error: "Failed to generate next round"});
    }
});

// Deleting a match
app.delete("/matches/:id", async (req, res) => {
    const id = req.params.id;
    try {
        await query(`
            DELETE FROM matches
            WHERE round_id IN (SELECT id FROM rounds WHERE tournament_id = $1)`, [tournament_id]
        );
        await query("DELETE FROM rounds WHERE tournament_id = $1", [tournament_id]);
        res.json({message: "Match has been deleted"});
    } catch (err) {
        console.error(err);
        res.status(500).json({error: "Failed to delete match"});
    }
});

// Creating a tournament
app.post("/tournaments", async (req, res) => {
    const { name, start_date } = req.body;
    try {
        const result = await query(
            "INSERT INTO tournaments (name, start_date) VALUES ($1, $2) RETURNING *",
            [name, start_date]
        );
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to create tournament" });
    }
});

// Getting all tournaments
app.get("/tournaments", async (req, res) => {
    try {
        const result = await query("SELECT * FROM tournaments ORDER BY start_date ASC");
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({error: "Failed to fetch all tournaments"});
    }
});

// Deleting a tournament
app.delete("/tournaments/:id", async (req, res) => {
    const id = req.params.id;

    try {
        await query(
            `DELETE FROM matches WHERE round_id IN (SELECT id FROM rounds WHERE tournament_id = $1)`,[id]
        );

        await query("DELETE FROM rounds WHERE tournament_id = $1",[id]
        );

        await query("DELETE FROM tournaments WHERE id = $1", [id]);

        res.json({message: "Tournament deleted"});
    } catch (err) {
        console.error(err);
        res.status(500).json({error: "Failed to delete tournament"});
    }
});


// Getting all rounds
app.get("/tournaments/:id/rounds", async (req, res) => {
    const id = req.params.id;
    
    try {
        const result = await query(
            "SELECT * FROM rounds WHERE tournament_id=$1 ORDER BY round_number ASC",
            [id]
        );
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({error: "Failed to fetch all rounds"});
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});