const express = require("express");
const cors = require("cors");
const mysql = require("mysql2");

const app = express();
const PORT = 5004;


app.use(cors());
app.use(express.json()); // Allows Express to handle JSON requests

// MySQL Connection
/*const db = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "Yashwan@135790",
    database: "CollegeTimetable"
});*/
const db = mysql.createConnection({
    host: "hopper.proxy.rlwy.net",   // Public MySQL Host from Railway
    port: 26036,                      // Correct Port from Railway
    user: "root",                     // Your MySQL user (root)
    password: "NFgBQAasPKmFSqJEiPOkKvdnOMVsMMGo",   // Copy from Railway MYSQLPASSWORD
    database: "railway"     // Copy from Railway MYSQLDATABASE
});
db.connect(err => {
    if (err) {
        console.error("❌ Database connection failed:", err);
    } else {
        console.log("✅ Connected to MySQL");
    }
});

app.post("/api/staff-login", (req, res) => {
    const { passcode } = req.body;

    const sql = "SELECT * FROM staff WHERE passcode = ?";
    db.query(sql, [passcode], (err, results) => {
        if (err) {
            console.error("❌ Database error:", err);
            return res.status(500).json({ error: "Database query failed" });
        }

        if (results.length > 0) {
            res.json({ success: true });
        } else {
            res.json({ success: false });
        }
    });
});


app.post("/api/admin-login", (req, res) => {
    const { passcode } = req.body;

    if (!passcode) {
        return res.status(400).json({ error: "Passcode is required" });
    }

    const sql = "SELECT * FROM admin WHERE passcode = ?";
    db.query(sql, [passcode], (err, results) => {
        if (err) {
            console.error("❌ Database error:", err);
            res.status(500).json({ error: "Database query failed" });
            return;
        }

        if (results.length > 0) {
            res.json({ success: true });
        } else {
            res.json({ success: false });
        }
    });
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

    const sql = "SELECT * FROM daily_timetable WHERE day = ?";

    db.query(sql, [currentDay], (err, results) => {
        if (err) {
            console.error("❌ Database error:", err);
            res.status(500).json({ error: "Database query failed" });
        } else {
            res.json(results);
        }
    });
});

// ✅ Function to reset daily_timetable from master_timetable
function resetDailyTimetable() {
    const today = new Date().toISOString().split("T")[0];

    console.log("🔄 Checking if daily timetable needs reset...");

    // Step 0: Check if we already reset today
    db.query("SELECT value FROM system_settings WHERE name = 'last_timetable_reset'", (err, result) => {
        if (err) {
            console.error("❌ Error checking last_timetable_reset:", err);
            return;
        }

        const lastReset = result.length > 0 ? result[0].value : null;

        if (lastReset === today) {
            console.log("✅ Already reset today. Skipping...");
            return;
        }

        // Step 1: Clear daily_timetable
        db.query("DELETE FROM daily_timetable", (err) => {
            if (err) {
                console.error("❌ Error clearing daily_timetable:", err);
                return;
            }
            console.log("✅ daily_timetable cleared!");

            // Step 2: Copy data from master_timetable
            const copySql = `
                INSERT INTO daily_timetable (course, day, 8_9_AM, 9_10_AM, 10_11_AM, 11_30_12_30_PM, 12_30_1_30_PM, 1_30_2_30_PM)
                SELECT course, day, 8_9_AM, 9_10_AM, 10_11_AM, 11_30_12_30_PM, 12_30_1_30_PM, 1_30_2_30_PM FROM master_timetable
            `;

            db.query(copySql, (err) => {
                if (err) {
                    console.error("❌ Error copying from master_timetable:", err);
                } else {
                    console.log("✅ Copied from master_timetable!");

                    // Step 3: Update the reset flag
                    db.query(`
                        INSERT INTO system_settings (name, value)
                        VALUES ('last_timetable_reset', ?)
                        ON DUPLICATE KEY UPDATE value = ?
                    `, [today, today], (err) => {
                        if (err) {
                            console.error("❌ Failed to update last_timetable_reset:", err);
                        } else {
                            console.log("📅 Updated last_timetable_reset to", today);
                        }
                    });
                }
            });
        });
    });
}

// ✅ Run reset once on server start
resetDailyTimetable();

// ✅ Check every minute (only resets once per day)
setInterval(resetDailyTimetable, 60000);


// **Update Timetable Data**
app.put("/api/timetable", (req, res) => {
    console.log("📩 Received Data:", JSON.stringify(req.body, null, 2)); // Debug

    const updatedTimetable = req.body;

    updatedTimetable.forEach(row => {
        const { id, ...columns } = row;
        const columnNames = Object.keys(columns);
        const columnValues = Object.values(columns);

        let query = `UPDATE daily_timetable SET ${columnNames.map(col => `${col} = ?`).join(", ")} WHERE id = ?`;
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

    const sql = "SELECT * FROM daily_timetable WHERE course = ? AND day = ?";

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
