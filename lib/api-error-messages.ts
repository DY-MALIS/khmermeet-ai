import { GeminiApiError } from "@/lib/ai/gemini";

export function publicGeminiTranscriptionError(error: unknown) {
  if (error instanceof GeminiApiError) {
    const detail = error.safeDetail.toLowerCase();

    if (error.status === 403 && detail.includes("denied access")) {
      return {
        message:
          "Gemini API project access is still denied by Google. Audio is saved, but automatic transcription cannot run until Trust & Safety restores the project or a working API key is added.",
        status: 503
      };
    }

    if (error.status === 403 && detail.includes("suspended")) {
      return {
        message:
          "Gemini API key or project is suspended. Audio is saved, but transcription needs a restored project or a new working GEMINI_API_KEY.",
        status: 503
      };
    }

    if (error.status === 429 || detail.includes("quota") || detail.includes("resource_exhausted")) {
      return {
        message:
          "Gemini quota or billing is not available right now. Audio is saved; please add quota/billing or try again later.",
        status: 503
      };
    }

    return {
      message: error.message || "Gemini could not transcribe this audio.",
      status: error.status >= 400 && error.status < 600 ? error.status : 500
    };
  }

  if (error instanceof Error && error.message.toLowerCase().includes("timed out")) {
    return {
      message:
        "The transcription request timed out. Audio is saved; try a shorter recording or transcribe from the meeting detail page after deployment settings are increased.",
      status: 504
    };
  }

  return {
    message: error instanceof Error ? error.message : "Could not transcribe audio.",
    status: 500
  };
}
