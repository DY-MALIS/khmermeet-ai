import { OpenRouterApiError } from "@/lib/ai/openrouter";

export function publicAiTranscriptionError(error: unknown) {
  if (error instanceof OpenRouterApiError) {
    const detail = error.safeDetail.toLowerCase();

    if (error.status === 401 || error.status === 403) {
      return {
        message: "OpenRouter API key is invalid or does not have access. Audio is saved; please update OPEN_ROUTER_API_KEY.",
        status: 503
      };
    }

    if (error.status === 402) {
      return {
        message: "OpenRouter credits are not available. Audio is saved; please add credits to the OpenRouter account.",
        status: 503
      };
    }

    if (error.status === 429 || detail.includes("quota") || detail.includes("resource_exhausted")) {
      return {
        message: "OpenRouter rate limit was reached. Audio is saved; please try again shortly.",
        status: 503
      };
    }

    return {
      message: error.message || "OpenRouter could not transcribe this audio.",
      status: error.status >= 400 && error.status < 600 ? error.status : 500
    };
  }

  if (error instanceof Error && error.message.toLowerCase().includes("timed out")) {
    return {
      message:
        "Transcription needs more time. Audio is saved; click Re-transcribe audio again to continue processing the saved recording.",
      status: 504
    };
  }

  return {
    message: error instanceof Error ? error.message : "Could not transcribe audio.",
    status: 500
  };
}
