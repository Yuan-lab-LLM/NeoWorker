export interface YouTubeVideoMetadata {
  videoId: string;
  url: string;
  title?: string;
  channel?: string;
  durationSeconds?: number;
  thumbnailUrl?: string;
  uploadDate?: string;
  description?: string;
  chapters?: YouTubeChapter[];
  fetchedAt: number;
  raw?: unknown;
}

export interface YouTubeChapter {
  title: string;
  startMs: number;
  endMs?: number;
}

export interface YouTubeTranscriptSegment {
  videoId: string;
  startMs: number;
  endMs?: number;
  text: string;
  source: "manual" | "auto" | "youtube-transcript-api" | "unknown";
  language?: string;
}

export interface YouTubeIngestResult {
  ok: boolean;
  video?: YouTubeVideoMetadata;
  segments: YouTubeTranscriptSegment[];
  warnings: string[];
  error?: string;
}

export interface YouTubeSearchHit {
  videoId: string;
  title?: string;
  channel?: string;
  startMs: number;
  endMs?: number;
  text: string;
  url: string;
  score?: number;
}

export interface YouTubeAskResult {
  ok: boolean;
  question: string;
  answer: string;
  sources: YouTubeSearchHit[];
  suggestedFollowUps: string[];
  error?: string;
  warnings?: string[];
}
