export type TimelineSegmentInput = { number: number; timestamp: string; speakerName: string; text: string };

export function buildTimelinePrompt(segments: TimelineSegmentInput[]) {
  const numbered = segments.map((segment) => `${segment.number}. [${segment.timestamp}] ${segment.speakerName}: ${segment.text}`).join("\n");

  return `Below is a numbered, timestamped meeting transcript (one entry per spoken segment). Identify the points where the topic of conversation clearly changes, and give each a short topic label.

Return valid JSON only, no markdown, no code fences.

JSON shape:
{
  "topics": [
    { "segmentNumber": 1, "label": "short topic name" }
  ]
}

Rules:
- "segmentNumber" must be the exact number of an entry below where that topic starts - never invent a number outside the list.
- Only mark a new topic where the conversation genuinely shifts to a different subject. Do not create a topic for every segment.
- Return at most 12 topics, ordered by segmentNumber ascending.
- The first topic should normally start at segment 1.
- Keep each label under 6 words, in the same language as the transcript.
- If the transcript is too short or unclear to identify real topic changes, return {"topics":[]}.

Transcript:
${numbered}`;
}
