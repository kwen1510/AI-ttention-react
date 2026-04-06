import { supabase } from "../db/supabaseClient.js";

function createAuthError(message, status = 401) {
    const error = new Error(message);
    error.status = status;
    return error;
}

function parseCsvValues(...sources) {
    return sources
        .filter(Boolean)
        .flatMap((source) => String(source).split(','))
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean);
}

export function getTeacherAccessConfig() {
    const allowedDomains = parseCsvValues(
        process.env.ADMIN_ALLOWED_DOMAINS,
        process.env.VITE_ADMIN_ALLOWED_DOMAINS
    );

    const allowedEmails = parseCsvValues(
        process.env.ADMIN_ALLOWED_EMAILS,
        process.env.VITE_ADMIN_ALLOWED_EMAILS
    );

    return {
        allowedDomains: allowedDomains.length ? allowedDomains : ['ri.edu.sg'],
        allowedEmails
    };
}

export function isTeacherUser(user, config = getTeacherAccessConfig()) {
    const email = user?.email ? String(user.email).trim().toLowerCase() : '';
    if (!email) {
        return false;
    }

    if (config.allowedEmails.includes(email)) {
        return true;
    }

    return config.allowedDomains.some((domain) => email.endsWith(`@${domain}`));
}

export async function authenticateUserFromToken(token) {
    if (!token) {
        throw createAuthError('Missing bearer token', 401);
    }

    const { data, error } = await supabase.auth.getUser(token);
    if (error) {
        throw createAuthError(error.message || 'Invalid token', 401);
    }
    if (!data?.user) {
        throw createAuthError('User not found for token', 401);
    }
    return data.user;
}

export async function authenticateTeacher(req) {
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
        throw createAuthError('Missing bearer token', 401);
    }
    const token = authHeader.replace('Bearer', '').trim();
    const user = await authenticateUserFromToken(token);

    if (!isTeacherUser(user)) {
        throw createAuthError('Teacher access required', 403);
    }

    return user;
}

export async function primeSocketTeacher(socket) {
    const token =
        socket.handshake?.auth?.token ||
        socket.handshake?.auth?.accessToken ||
        null;

    socket.data.teacher = null;
    socket.data.teacherAuthError = null;

    if (!token) {
        return null;
    }

    try {
        const user = await authenticateUserFromToken(token);
        if (!isTeacherUser(user)) {
            socket.data.teacherAuthError = createAuthError('Teacher access required', 403);
            return null;
        }
        socket.data.teacher = user;
        return user;
    } catch (error) {
        socket.data.teacherAuthError = error;
        return null;
    }
}

export function getSocketTeacher(socket) {
    return socket?.data?.teacher ?? null;
}

export function emitSocketAuthError(socket) {
    const error = socket?.data?.teacherAuthError;
    socket.emit('error', error?.status === 403 ? 'Forbidden' : 'Unauthorized');
}

export async function requireTeacher(req, res, next) {
    try {
        const user = await authenticateTeacher(req);
        req.teacher = user;
        if (next) next();
        return user;
    } catch (err) {
        console.warn(`🔒 Teacher authentication failed: ${err.message}`);
        const status = Number.isInteger(err.status) ? err.status : 401;
        res.status(status).json({ error: status === 403 ? "Forbidden" : "Unauthorized" });
        return null;
    }
}
