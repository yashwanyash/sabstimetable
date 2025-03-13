const express = require("express");
const cors = require("cors");
const mysql = require("mysql2");

const app = express();
const PORT = 5004;

app.use(cors());
app.use(express.json()); // Allows Express to handle JSON requests

// MySQL Connection
const db = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "Yashwan@135790",
    database: "CollegeTimetable"
});

db.connect(err => {
    if (err) {
        console.error("❌ Database connection failed:", err);
    } else {
        console.log("✅ Connected to MySQL");
    }
});

// **Function to Clear Old Suggestions at Midnight**
function clearOldSuggestions() {
    const now = new Date();
    const currentDate = now.toISOString().split("T")[0]; // Format: YYYY-MM-DD

    console.log(`🔄 Checking if suggestions need to be cleared for ${currentDate}...`);

    // **Step 1: Get last cleared date**
    db.query("SELECT value FROM system_settings WHERE name = 'last_cleared_date'", (err, result) => {
        if (err) {
            console.error("❌ Error checking last cleared date:", err);
            return;
        }

        const lastClearedDate = result.length > 0 ? result[0].value : null;

        if (lastClearedDate !== currentDate) {
            console.log("🗑️ New day detected! Clearing old suggestions...");

            // **Step 2: Delete old suggestions**
            db.query("DELETE FROM suggestions", (deleteErr) => {
                if (deleteErr) {
                    console.error("❌ Error clearing old suggestions:", deleteErr);
                } else {
                    console.log("✅ Old suggestions cleared!");

                    // **Step 3: Update last cleared date**
                    db.query(
                        "INSERT INTO system_settings (name, value) VALUES ('last_cleared_date', ?) ON DUPLICATE KEY UPDATE value = ?",
                        [currentDate, currentDate]
                    );
                }
            });
        } else {
            console.log("✅ Suggestions already cleared for today.");
        }
    });
}

// **Run the function once when the server starts**
clearOldSuggestions();

// **Schedule to clear suggestions every minute (checks for date change)**
setInterval(clearOldSuggestions, 60000);

// **API to Submit a Suggestion**
app.post("/api/suggestions", (req, res) => {
    const { staff_name, message } = req.body;

    if (!staff_name || !message) {
        return res.status(400).json({ error: "Name and message cannot be empty" });
    }

    const sql = "INSERT INTO suggestions (staff_name, message) VALUES (?, ?)";
    db.query(sql, [staff_name, message], (err, result) => {
        if (err) {
            console.error("❌ Error saving suggestion:", err);
            res.status(500).json({ error: "Database insert failed" });
        } else {
            res.json({ message: "✅ Suggestion submitted successfully!" });
        }
    });
});

// **API to Fetch All Suggestions (For Admin)**
app.get("/api/suggestions", (req, res) => {
    db.query("SELECT * FROM suggestions", (err, results) => {
        if (err) {
            console.error("❌ Error fetching suggestions:", err);
            res.status(500).json({ error: "Database query failed" });
        } else {
            res.json(results);
        }
    });
});


// **Fetch timetable for the current day**
app.get("/api/timetable/today", (req, res) => {
    const currentDay = new Date().toLocaleDateString("en-US", { weekday: "long" });

    const sql = "SELECT * FROM timetable_days WHERE day = ?";

    db.query(sql, [currentDay], (err, results) => {
        if (err) {
            console.error("❌ Database error:", err);
            res.status(500).json({ error: "Database query failed" });
        } else {
            res.json(results);
        }
    });
});

// **Update Timetable Data**
app.put("/api/timetable", (req, res) => {
    console.log("📩 Received Data:", JSON.stringify(req.body, null, 2)); // Debug

    const updatedTimetable = req.body;

    updatedTimetable.forEach(row => {
        const { id, ...columns } = row;
        const columnNames = Object.keys(columns);
        const columnValues = Object.values(columns);

        let query = `UPDATE timetable_days SET ${columnNames.map(col => `${col} = ?`).join(", ")} WHERE id = ?`;
        let values = [...columnValues, id];

        db.query(query, values, (err, result) => {
            if (err) {
                console.error("❌ Error updating timetable:", err);
                res.status(500).json({ error: "Database update failed" });
                return;
            }
        });
    });

    res.json({ message: "✅ Timetable updated successfully!" });
});

// **Fetch timetable for a specific course**
app.get("/api/timetable/course/:courseName", (req, res) => {
    const courseName = req.params.courseName.replace(/-/g, " "); // Convert URL format to database format
    const currentDay = new Date().toLocaleDateString("en-US", { weekday: "long" });

    const sql = "SELECT * FROM timetable_days WHERE course = ? AND day = ?";

    db.query(sql, [courseName, currentDay], (err, results) => {
        if (err) {
            console.error("❌ Database error:", err);
            res.status(500).json({ error: "Database query failed" });
        } else {
            res.json(results);
        }
    });
});



// **Start the Server**
app.listen(PORT, () => {
    console.log(`🚀 Server is running on http://localhost:${PORT}`);
});
