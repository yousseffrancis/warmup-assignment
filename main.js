const fs = require("fs");

// Converts a time string in format "hh:mm:ss am/pm" to total seconds
// Used to make time calculations easier for shift duration and idle time

function parseTimeToSeconds(timeStr) {
    timeStr = timeStr.trim().toLowerCase();
    const parts = timeStr.split(" ");
    const period = parts[1];
    const timeParts = parts[0].split(":");

    let h = parseInt(timeParts[0]);
    const m = parseInt(timeParts[1]);
    const s = parseInt(timeParts[2]);

    if (period === "am") {
        if (h === 12) h = 0;
    } else {
        if (h !== 12) h += 12;
    }

    return h * 3600 + m * 60 + s;
}

// Converts a duration string "h:mm:ss" to seconds
// Helps perform calculations between shift duration and idle time

function parseDurationToSeconds(dur) {
    const parts = dur.trim().split(":");
    return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2]);
}

// Converts seconds back to time format "h:mm:ss"
// Used to display results like shift duration and active time

function secondsToHMS(sec) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return h + ":" + String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
}

// Converts seconds to "hhh:mm:ss" format for monthly totals
// Ensures total hours can exceed 24 hours when summing many shifts

function secondsToHHHMS(sec) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return h + ":" + String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
}

// Calculates the total shift duration between start and end time
// Returns the duration of the shift formatted as h:mm:ss
// Function 1

function getShiftDuration(startTime, endTime) {
    const start = parseTimeToSeconds(startTime);
    const end = parseTimeToSeconds(endTime);
    return secondsToHMS(end - start);
}

// Calculates the idle time outside delivery hours (8 AM – 10 PM)
// Returns how much time of the shift is considered idle
// Function 2

function getIdleTime(startTime, endTime) {
    const start = parseTimeToSeconds(startTime);
    const end = parseTimeToSeconds(endTime);

    const deliveryStart = 8 * 3600;
    const deliveryEnd = 22 * 3600;

    let idle = 0;

    if (start < deliveryStart) {
        idle += Math.min(end, deliveryStart) - start;
    }

    if (end > deliveryEnd) {
        idle += end - Math.max(start, deliveryEnd);
    }

    return secondsToHMS(idle);
}
// Calculates active delivery time during the shift
// Active time = shift duration minus idle time
// Function 3

function getActiveTime(shiftDuration, idleTime) {
    const shift = parseDurationToSeconds(shiftDuration);
    const idle = parseDurationToSeconds(idleTime);
    return secondsToHMS(shift - idle);
}

// Checks whether a driver met the required daily working quota
// Uses 8h24m normally or 6h during the Eid period
// Function 4
function metQuota(date, activeTime) {
    const eidStart = new Date("2025-04-10");
    const eidEnd = new Date("2025-04-30");

    const d = new Date(date);

    let quota = 8 * 3600 + 24 * 60;

    if (d >= eidStart && d <= eidEnd) {
        quota = 6 * 3600;
    }

    return parseDurationToSeconds(activeTime) >= quota;
}

// Adds a new shift record to the shifts file if it does not already exist
// Returns the created record object or an empty object if duplicate
// Function 5
function addShiftRecord(textFile, shiftObj) {

    const { driverID, driverName, date, startTime, endTime } = shiftObj;

    let lines = [];

    try {
        const content = fs.readFileSync(textFile, "utf8");
        lines = content.split("\n").filter(l => l.trim() !== "");
    } catch {
        lines = [];
    }

    for (let line of lines) {
        const cols = line.split(",");
        if (cols[0].trim() === driverID.trim() && cols[2].trim() === date.trim()) {
            return {};
        }
    }

    const shiftDuration = getShiftDuration(startTime, endTime);
    const idleTime = getIdleTime(startTime, endTime);
    const activeTime = getActiveTime(shiftDuration, idleTime);
    const quota = metQuota(date, activeTime);

    const newRecord = {
        driverID: driverID.trim(),
        driverName: driverName.trim(),
        date: date.trim(),
        startTime: startTime.trim(),
        endTime: endTime.trim(),
        shiftDuration,
        idleTime,
        activeTime,
        metQuota: quota,
        hasBonus: false
    };

    const newLine = [
        newRecord.driverID,
        newRecord.driverName,
        newRecord.date,
        newRecord.startTime,
        newRecord.endTime,
        newRecord.shiftDuration,
        newRecord.idleTime,
        newRecord.activeTime,
        newRecord.metQuota,
        newRecord.hasBonus
    ].join(",");

    lines.push(newLine);

    fs.writeFileSync(textFile, lines.join("\n") + "\n");

    return newRecord;
}

// Updates the bonus status for a specific driver and date
// Writes the updated value directly into the shifts text file
// Function 6
function setBonus(textFile, driverID, date, newValue) {

    const lines = fs.readFileSync(textFile, "utf8").split("\n");

    for (let i = 0; i < lines.length; i++) {

        if (!lines[i].trim()) continue;

        const cols = lines[i].split(",");

        if (cols[0].trim() === driverID.trim() && cols[2].trim() === date.trim()) {
            cols[9] = String(newValue);
            lines[i] = cols.join(",");
        }
    }

    fs.writeFileSync(textFile, lines.join("\n"));
}

// Counts how many bonuses a driver received in a specific month
// Returns the number of bonuses or -1 if the driver does not exist
// Function 7

function countBonusPerMonth(textFile, driverID, month) {

    const lines = fs.readFileSync(textFile, "utf8")
        .split("\n")
        .filter(l => l.trim());

    const targetMonth = parseInt(month);

    let found = false;
    let count = 0;

    for (let line of lines) {

        const cols = line.split(",");

        if (cols[0].trim() === driverID.trim()) {

            found = true;

            const recordMonth = parseInt(cols[2].split("-")[1]);

            if (recordMonth === targetMonth && cols[9].trim().toLowerCase() === "true") {
                count++;
            }
        }
    }

    return found ? count : -1;
}

// Calculates the total active hours worked by a driver in a month
// Returns the sum of active time values in hhh:mm:ss format
// Function 8

function getTotalActiveHoursPerMonth(textFile, driverID, month) {

    const lines = fs.readFileSync(textFile, "utf8")
        .split("\n")
        .filter(l => l.trim());

    let total = 0;

    for (let line of lines) {

        const cols = line.split(",");

        if (cols[0].trim() === driverID.trim()) {

            const recordMonth = parseInt(cols[2].split("-")[1]);

            if (recordMonth === month) {
                total += parseDurationToSeconds(cols[7]);
            }
        }
    }

    return secondsToHHHMS(total);
}

// Calculates the required working hours for a driver in a given month
// Excludes day-off shifts and reduces hours when bonuses exist
// Function 9

function getRequiredHoursPerMonth(textFile, rateFile, bonusCount, driverID, month) {

    const shiftLines = fs.readFileSync(textFile, "utf8")
        .split("\n")
        .filter(l => l.trim());

    const rateLines = fs.readFileSync(rateFile, "utf8")
        .split("\n")
        .filter(l => l.trim());

    let dayOff = null;

    for (let line of rateLines) {
        const cols = line.split(",");
        if (cols[0].trim() === driverID.trim()) {
            dayOff = cols[1].trim().toLowerCase();
        }
    }

    const eidStart = new Date("2025-04-10");
    const eidEnd = new Date("2025-04-30");

    const dayNames = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];

    let total = 0;

    for (let line of shiftLines) {

        const cols = line.split(",");

        if (cols[0].trim() === driverID.trim()) {

            const d = new Date(cols[2]);
            const recordMonth = parseInt(cols[2].split("-")[1]);

            if (recordMonth === month) {

                if (dayNames[d.getDay()] === dayOff) continue;

                let quota = 8 * 3600 + 24 * 60;

                if (d >= eidStart && d <= eidEnd) quota = 6 * 3600;

                total += quota;
            }
        }
    }

    total = Math.max(0, total - bonusCount * 2 * 3600);

    return secondsToHHHMS(total);
}

// Calculates the driver’s final net pay after deductions
// Deducts salary based on missing hours beyond tier allowance
// Function 10

function getNetPay(driverID, actualHours, requiredHours, rateFile) {

    const rateLines = fs.readFileSync(rateFile, "utf8")
        .split("\n")
        .filter(l => l.trim());

    let basePay = 0;
    let tier = 0;

    for (let line of rateLines) {

        const cols = line.split(",");

        if (cols[0].trim() === driverID.trim()) {
            basePay = parseInt(cols[2]);
            tier = parseInt(cols[3]);
        }
    }

    const actual = parseDurationToSeconds(actualHours);
    const required = parseDurationToSeconds(requiredHours);

    if (actual >= required) return basePay;

    const missingHours = Math.floor((required - actual) / 3600);

    const allowance = {1:50,2:20,3:10,4:3};

    const billable = Math.max(0, missingHours - allowance[tier]);

    const deductionRate = Math.floor(basePay / 185);

    return basePay - billable * deductionRate;
}

module.exports = {
    getShiftDuration,
    getIdleTime,
    getActiveTime,
    metQuota,
    addShiftRecord,
    setBonus,
    countBonusPerMonth,
    getTotalActiveHoursPerMonth,
    getRequiredHoursPerMonth,
    getNetPay
};