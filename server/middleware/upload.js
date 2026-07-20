import multer from "multer";

const SUPPORTED_AUDIO_MIME_TYPES = new Set([
    "audio/webm",
    "audio/ogg",
    "audio/wav",
    "audio/x-wav",
    "audio/wave",
    "audio/mpeg",
    "audio/mp3",
    "audio/mp4",
    "audio/x-m4a",
    "audio/aac",
    "audio/flac",
    "audio/x-flac"
]);

export const MAX_AUDIO_UPLOAD_BYTES = 10 * 1024 * 1024;

export function normalizeAudioUploadMimeType(mimetype) {
    return String(mimetype || "").toLowerCase().split(";")[0].trim();
}

export function isSupportedAudioUploadMimeType(mimetype) {
    return SUPPORTED_AUDIO_MIME_TYPES.has(normalizeAudioUploadMimeType(mimetype));
}

export function isLikelySupportedAudioBuffer(buffer, mimetype) {
    if (!Buffer.isBuffer(buffer) || buffer.length < 4) {
        return false;
    }

    const normalized = normalizeAudioUploadMimeType(mimetype);
    const header = buffer.subarray(0, Math.min(buffer.length, 16));
    const ascii = header.toString("ascii");

    if (normalized === "audio/webm") {
        return buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3;
    }
    if (normalized === "audio/ogg") {
        return ascii.startsWith("OggS");
    }
    if (["audio/wav", "audio/x-wav", "audio/wave"].includes(normalized)) {
        return ascii.startsWith("RIFF") && buffer.subarray(8, 12).toString("ascii") === "WAVE";
    }
    if (["audio/mpeg", "audio/mp3"].includes(normalized)) {
        return ascii.startsWith("ID3") || (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0);
    }
    if (["audio/mp4", "audio/x-m4a"].includes(normalized)) {
        return buffer.length >= 12 && buffer.subarray(4, 8).toString("ascii") === "ftyp";
    }
    if (["audio/flac", "audio/x-flac"].includes(normalized)) {
        return ascii.startsWith("fLaC");
    }
    if (normalized === "audio/aac") {
        return buffer[0] === 0xff && (buffer[1] & 0xf6) === 0xf0;
    }

    return false;
}

export const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_AUDIO_UPLOAD_BYTES }, // NOSONAR -- fixed 10 MiB, upload.single, byte validation.
    fileFilter: (_req, file, cb) => {
        if (!isSupportedAudioUploadMimeType(file?.mimetype)) {
            const error = new Error("Only audio uploads are supported");
            error.status = 400;
            error.code = "UNSUPPORTED_MEDIA_TYPE";
            cb(error);
            return;
        }
        cb(null, true);
    }
});
