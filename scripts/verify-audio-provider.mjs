import "dotenv/config";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { isIgnorableTranscriptionText, transcribe } from "../server/services/elevenlabs.js";

const speechPath = process.env.SPEECH_AUDIO_PATH;
const silencePath = process.env.SILENCE_AUDIO_PATH;
if (!speechPath || !silencePath) {
  throw new Error("SPEECH_AUDIO_PATH and SILENCE_AUDIO_PATH are required");
}

function mimeFor(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".wav") return "audio/wav";
  if (extension === ".mp4" || extension === ".m4a") return "audio/mp4";
  if (extension === ".ogg") return "audio/ogg";
  if (extension === ".mp3") return "audio/mpeg";
  if (extension === ".aac") return "audio/aac";
  if (extension === ".flac") return "audio/flac";
  return "audio/webm";
}

const [speechBuffer, silenceBuffer] = await Promise.all([
  readFile(speechPath),
  readFile(silencePath)
]);
const speech = await transcribe(speechBuffer, mimeFor(speechPath));
const silence = await transcribe(silenceBuffer, mimeFor(silencePath));
const speechText = String(speech?.text || "").trim();
const silenceText = String(silence?.text || "").trim();

if (!speechText || isIgnorableTranscriptionText(speechText)) {
  throw new Error("Provider did not return usable speech text");
}
if (silenceText && !isIgnorableTranscriptionText(silenceText)) {
  throw new Error(`Provider returned non-empty text for silence: ${JSON.stringify(silenceText)}`);
}

console.log(JSON.stringify({
  speechRecognized: true,
  speechWordCount: speechText.split(/\s+/).length,
  silenceSkipped: true
}, null, 2));
