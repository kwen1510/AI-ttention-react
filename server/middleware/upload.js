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

export function isSupportedAudioUploadMimeType(mimetype) {
    const normalized = String(mimetype || "").toLowerCase();
    return Boolean(normalized) && (normalized.startsWith("audio/") || SUPPORTED_AUDIO_MIME_TYPES.has(normalized));
}

export const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_AUDIO_UPLOAD_BYTES }, // 10MB limit
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
