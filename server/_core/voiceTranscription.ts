/**
 * Voice transcription helper using Gemini API
 *
 * NOTE: This module is scaffolded but not yet wired into any tRPC router.
 * The Gemini API does not natively support Whisper-style audio transcription.
 * This is a placeholder that returns a "not configured" error until a
 * transcription service is integrated.
 */
export type TranscribeOptions = {
  audioUrl: string;
  language?: string;
  prompt?: string;
};

export type WhisperSegment = {
  id: number;
  seek: number;
  start: number;
  end: number;
  text: string;
  tokens: number[];
  temperature: number;
  avg_logprob: number;
  compression_ratio: number;
  no_speech_prob: number;
};

export type WhisperResponse = {
  task: "transcribe";
  language: string;
  duration: number;
  text: string;
  segments: WhisperSegment[];
};

export type TranscriptionResponse = WhisperResponse;

export type TranscriptionError = {
  error: string;
  code: "FILE_TOO_LARGE" | "INVALID_FORMAT" | "TRANSCRIPTION_FAILED" | "UPLOAD_FAILED" | "SERVICE_ERROR";
  details?: string;
};

/**
 * Transcribe audio to text.
 * Currently returns a "not configured" error — no transcription backend is wired up.
 */
export async function transcribeAudio(
  _options: TranscribeOptions
): Promise<TranscriptionResponse | TranscriptionError> {
  return {
    error: "Voice transcription is not configured",
    code: "SERVICE_ERROR",
    details: "No transcription service is currently available. Configure an external STT provider to enable this feature.",
  };
}
