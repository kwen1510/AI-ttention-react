// Session state management
export const activeSessions = new Map(); // sessionCode -> { id, code, active, interval, startTime }
export const sessionTimers = new Map();  // sessionCode -> timer
