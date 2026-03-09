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

// Creating a match
app.post("/matches", async (req, res) => {
    const {round_id, player1_id, player2_id, match_time} = req.body;

    try {
        const result = await query(
            "INSERT INTO matches (round_id, player1_id, player2_id, match_time) VALUES ($1, $2, $3, $4) RETURNING *",
            [round_id, player1_id, player2_id, match_time]
        );
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({error: "Failed to create match"});
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