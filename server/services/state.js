// Session state management
export const activeSessions = new Map(); // sessionCode -> { id, code, active, interval, startTime }
export const sessionTimers = new Map();  // sessionCode -> timer

// Cache the latest emitted checklist state per session+group so we can reuse it on release
export const latestChecklistState = new Map();
