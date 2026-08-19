import { describe, expect, it } from "vitest";

import { retainSelectedThreadInUnreadList } from "../InboxAgentPanel";
import type { MailboxThreadListItem } from "../../../shared/mailbox";

function makeThread(id: string, unreadCount: number): MailboxThreadListItem {
  return {
    id,
    accountId: "account-1",
    provider: "imap",
    providerThreadId: id,
    subject: `Subject ${id}`,
    snippet: "Snippet",
    participants: [{ email: `${id}@example.com` }],
    labels: [],
    category: "updates",
    todayBucket: "good_to_know",
    domainCategory: "ops",
    priorityBand: "low",
    priorityScore: 0,
    urgencyScore: 0,
    needsReply: false,
    staleFollowup: false,
    cleanupCandidate: false,
    handled: false,
    unreadCount,
    messageCount: 1,
    lastMessageAt: 1,
  };
}

describe("retainSelectedThreadInUnreadList", () => {
  it("keeps the selected just-read thread visible in the unread filter", () => {
    const retainedThread = makeThread("thread-1", 2);
    const nextThreads = retainSelectedThreadInUnreadList(
      [makeThread("thread-2", 1)],
      retainedThread,
      "thread-1",
      "unread",
    );

    expect(nextThreads.map((thread) => thread.id)).toEqual([
      "thread-1",
      "thread-2",
    ]);
    expect(nextThreads[0]?.unreadCount).toBe(0);
  });

  it("does not retain the read thread after selection moves away", () => {
    const nextThreads = retainSelectedThreadInUnreadList(
      [makeThread("thread-2", 1)],
      makeThread("thread-1", 2),
      "thread-2",
      "unread",
    );

    expect(nextThreads.map((thread) => thread.id)).toEqual(["thread-2"]);
  });

  it("does not retain threads outside the unread filter", () => {
    const nextThreads = retainSelectedThreadInUnreadList(
      [makeThread("thread-2", 1)],
      makeThread("thread-1", 2),
      "thread-1",
      null,
    );

    expect(nextThreads.map((thread) => thread.id)).toEqual(["thread-2"]);
  });
});
