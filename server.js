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
            "SELECT m.id, m.player1_id, m.player2_id, p1.name AS player1, p2.name AS player2, w.name AS winner, m.match_time, m.score FROM matches m JOIN players p1 ON m.player1_id = p1.id JOIN players p2 ON m.player2_id = p2.id LEFT JOIN players w ON m.winner_id = w.id WHERE m.round_id = $1 ORDER BY m.match_time",
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
        const roundResult = await query(
            "SELECT id FROM rounds WHERE tournament_id = $1 AND round_number = 1",
            [tournament_id]
        );

        if (roundResult.rows.length === 0) {
            return res.status(400).json({error: "Round 1 not found for this tournament"});
        }

        const roundId = roundResult.rows[0].id;

        await query("DELETE FROM matches WHERE round_id = $1", [roundId]);

        const playersResult = await query(
            "SELECT id FROM players ORDER BY RANDOM()"
        );
        let players = playersResult.rows.map(row => row.id);

        let matches = [];

        while (players.length >= 2) {
            let p1 = players.pop();
            let p2 = players.pop();

            matches.push([p1, p2]);
        }

        if (players.length === 1) {
            let byePlayer = players.pop();
            matches.push([byePlayer, null]);
        }

        for (const match of matches) {
            const [p1, p2] = match;

            await query(
                "INSERT INTO matches(round_id, player1_id, player2_id, match_time) VALUES ($1, $2, $3, NOW())",
                [roundId, p1, p2]
            );
        }
        
        return res.json({message: "Matches generated", matchesCreated: matches.length});
    
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
        // Get all rounds for tournament
        const roundsResult = await query(
            "SELECT * FROM rounds WHERE tournament_id = $1 ORDER BY round_number ASC",
            [tournament_id]
        );
        const rounds = roundsResult.rows;
        if (rounds.length === 0) return res.status(400).json({error: "No rounds in tournament"});

        // Find last round with matches
        let lastRoundWithMatches = null;
        for (const r of rounds) {
            const matchResult = await query("SELECT * FROM matches WHERE round_id = $1", [r.id]);
            if (matchResult.rows.length > 0) lastRoundWithMatches = r;
        }

        // If no matches exist yet, generate Round 1
        if (!lastRoundWithMatches) {
            const round1 = rounds[0];
            const playersResult = await query("SELECT id FROM players ORDER BY RANDOM()");
            let players = playersResult.rows.map(p => p.id);

            let matchPairs = [];
            while (players.length >= 2) matchPairs.push([players.pop(), players.pop()]);
            if (players.length === 1) matchPairs.push([players.pop(), null]); // BYE

            for (const [p1, p2] of matchPairs) {
                await query(
                    "INSERT INTO matches(round_id, player1_id, player2_id, match_time, winner_id) VALUES ($1, $2, $3, NOW(), $4)",
                    [round1.id, p1, p2, p2 === null ? p1 : null]
                );
            }
            return res.json({message: `Round 1 generated`, matchesCreated: matchPairs.length});
        }

        // Get matches of last round
        const matchResult = await query("SELECT m.* FROM matches m JOIN rounds r ON m.round_id = r.id WHERE r.tournament_id = $1 AND r.id = $2", [tournament_id, lastRoundWithMatches.id]);
        const matches = matchResult.rows;

        // Check if all matches are completed (or BYE)
        const allCompleted = matches.every(m => m.winner_id !== null || m.player2_id === null);
        if (!allCompleted) return res.json({message: `Current round ${lastRoundWithMatches.round_number} is not yet complete`});

        // Collect winners including BYEs
        const winners = matches.map(m => m.winner_id ?? m.player1_id).filter(Boolean);

        // If only 1 winner and no pending BYE players, declare tournament winner
        const nextRoundNumber = lastRoundWithMatches.round_number + 1;
        if (winners.length === 1 && nextRoundNumber > rounds.length) {
            const winnerId = winners[0];
            const winnerResult = await query(
                "SELECT name FROM players WHERE id = $1",
                [winnerId]
            );
            const winnerName = winnerResult.rows[0].name;

            return res.json({ 
                message: `Tournament winner: ${winnerName}`, 
                winnerName: winnerName,
                winnerId: winnerId
            });
        }

        // Generate next round
        let nextRoundId;

        const nextRoundResult = await query(
            "SELECT id FROM rounds WHERE tournament_id = $1 AND round_number = $2",
            [tournament_id, nextRoundNumber]
        );

        if (nextRoundResult.rows.length === 0) {
            const insertResult = await query(
                "INSERT INTO rounds (tournament_id, round_number) VALUES ($1, $2) RETURNING id",
                [tournament_id, nextRoundNumber]
            );
            nextRoundId = insertResult.rows[0].id;
        } else {
            nextRoundId = nextRoundResult.rows[0].id;
        }

        // Shuffle winners and pair them
        let matchPairs = [];
        const shuffled = winners.sort(() => Math.random() - 0.5);
        while (shuffled.length >= 2) matchPairs.push([shuffled.pop(), shuffled.pop()]);
        if (shuffled.length === 1) matchPairs.push([shuffled.pop(), null]); // BYE

        for (const [p1, p2] of matchPairs) {
            await query(
                "INSERT INTO matches(round_id, player1_id, player2_id, match_time, winner_id) VALUES ($1, $2, $3, NOW(), $4)",
                [nextRoundId, p1, p2, p2 === null ? p1 : null]
            );
        }

        res.json({message: `Round ${nextRoundNumber} generated`, matchesCreated: matchPairs.length});

    } catch (err) {
        console.error(err);
        res.status(500).json({error: "Failed to generate next round"});
    }
});

// Deleting a match
app.delete("/matches/:id", async (req, res) => {
    const id = req.params.id;
    try {
        await query("DELETE FROM matches WHERE id=$1", [id]);
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