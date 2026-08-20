const SAFE_EXTERNAL_PROTOCOL_REGEX = /^(https?:|mailto:|tel:)/i;

function getGithubReleaseContext(releaseUrl: string): {
  origin: string;
  owner: string;
  repo: string;
  tag?: string;
} | null {
  try {
    const parsed = new URL(releaseUrl);
    if (parsed.hostname !== "github.com") {
      return null;
    }

    const [, owner, repo, ...rest] = parsed.pathname.split("/");
    if (!owner || !repo) {
      return null;
    }

    const releaseTag =
      rest[0] === "releases" && rest[1] === "tag" ? rest[2] : undefined;
    return {
      origin: parsed.origin,
      owner,
      repo,
      tag: releaseTag,
    };
  } catch {
    return null;
  }
}

export function transformReleaseNotesUrl(
  url: string,
  releaseUrl?: string,
): string {
  const normalized = url.trim();
  if (!normalized) {
    return "";
  }

  if (normalized.startsWith("#")) {
    return normalized;
  }

  if (SAFE_EXTERNAL_PROTOCOL_REGEX.test(normalized)) {
    return normalized;
  }

  const githubContext = releaseUrl ? getGithubReleaseContext(releaseUrl) : null;
  if (githubContext) {
    if (normalized.startsWith("/")) {
      return `${githubContext.origin}${normalized}`;
    }

    const repoBase = githubContext.tag
      ? `${githubContext.origin}/${githubContext.owner}/${githubContext.repo}/blob/${githubContext.tag}/`
      : `${githubContext.origin}/${githubContext.owner}/${githubContext.repo}/`;

    try {
      return new URL(normalized, repoBase).toString();
    } catch {
      return "";
    }
  }

  if (!releaseUrl) {
    return "";
  }

  if (normalized.startsWith("/")) {
    try {
      return new URL(normalized, releaseUrl).toString();
    } catch {
      return "";
    }
  }

  try {
    return new URL(normalized, releaseUrl).toString();
  } catch {
    return "";
  }
}
