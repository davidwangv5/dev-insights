import { describe, expect, it, vi } from "vitest";
import { GitHubClient, parseNextLink } from "@/lib/github";

describe("GitHub pagination", () => {
  it("parses Link rel=next", () => {
    const link =
      '<https://api.github.com/resource?page=2>; rel="next", <https://api.github.com/resource?page=5>; rel="last"';
    expect(parseNextLink(link)).toBe("https://api.github.com/resource?page=2");
    expect(parseNextLink(null)).toBeNull();
  });

  it("fetches every page and does not drop or duplicate items", async () => {
    const page1 = [
      {
        id: 1,
        number: 1,
        title: "one",
        user: { id: 10, login: "alice", type: "User" },
        created_at: "2026-10-01T00:00:00Z",
        merged_at: "2026-10-02T00:00:00Z",
        closed_at: "2026-10-02T00:00:00Z",
        state: "closed",
      },
    ];
    const page2 = [
      {
        id: 2,
        number: 2,
        title: "two",
        user: { id: 11, login: "bob", type: "User" },
        created_at: "2026-10-03T00:00:00Z",
        merged_at: "2026-10-04T00:00:00Z",
        closed_at: "2026-10-04T00:00:00Z",
        state: "closed",
      },
    ];

    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("page=2")) {
        return new Response(JSON.stringify(page2), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            etag: '"p2"',
          },
        });
      }
      return new Response(JSON.stringify(page1), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          etag: '"p1"',
          link: `<${url}&page=2>; rel="next"`,
        },
      });
    }) as unknown as typeof fetch;

    const client = new GitHubClient({
      token: "test",
      fetchImpl,
      baseUrl: "https://api.github.com",
    });

    const { prs } = await client.listPullRequests("acme", "widget");
    expect(prs.map((p) => p.number).sort()).toEqual([1, 2]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("treats 304 as not-modified without inventing items", async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(null, {
        status: 304,
        headers: { etag: '"same"' },
      });
    }) as unknown as typeof fetch;

    const client = new GitHubClient({ token: "test", fetchImpl });
    const result = await client.listPullRequests("acme", "widget", '"same"');
    expect(result.notModified).toBe(true);
    expect(result.prs).toEqual([]);
  });
});
