import { describe, expect, test } from "bun:test";
import {
  type AgentEntry,
  age,
  bucketOf,
  buildRoster,
  childCounts,
  type GroupOptions,
  groupByProject,
  indexProjects,
  type MonitorDirectory,
  matches,
  PARENT_AGENT_ID_LABEL,
  placement,
  shouldCollapseWorkspace,
  stateLabel,
  title,
  type WorkspaceSummary,
  waitingSince,
} from "../src/lib/monitor.shared";

const TRIAGE: GroupOptions = { floatPinned: true, agentSort: "triage" };

function directory(
  workspaces: readonly WorkspaceSummary[] = [],
  projects: readonly { id: string; key?: string | null; name: string }[] = [],
): MonitorDirectory {
  return {
    workspaces: new Map(workspaces.map((workspace) => [workspace.id, workspace])),
    projects: indexProjects(projects),
  };
}

type AgentOverrides = Partial<AgentEntry["agent"]>;
type ProjectOverrides = Partial<AgentEntry["project"]>;
const permission = { id: "permission-1", provider: "codex", name: "run", kind: "tool" } as const;

function entry(agent: AgentOverrides = {}, project: ProjectOverrides = {}): AgentEntry {
  return {
    agent: {
      id: "agent-123456",
      provider: "codex",
      cwd: "/work/project",
      workspaceId: "workspace-1",
      model: "gpt-5",
      createdAt: "2026-08-25T10:00:00.000Z",
      updatedAt: "2026-08-25T11:00:00.000Z",
      lastUserMessageAt: null,
      status: "idle",
      capabilities: {},
      currentModeId: null,
      availableModes: [],
      pendingPermissions: [],
      persistence: null,
      title: "Agent title",
      labels: {},
      requiresAttention: false,
      attentionReason: null,
      attentionTimestamp: null,
      ...agent,
    },
    project: {
      projectKey: "project-1",
      projectName: "Project",
      workspaceName: "Workspace",
      checkout: {
        cwd: "/work/project",
        isGit: false,
        currentBranch: null,
        remoteUrl: null,
        worktreeRoot: null,
        isPaseoOwnedWorktree: false,
        mainRepoRoot: null,
      },
      ...project,
    },
  } as AgentEntry;
}

describe("agent triage", () => {
  test("prioritizes closed, attention, running, and idle states correctly", () => {
    expect(bucketOf(entry({ status: "closed" }).agent)).toBe("closed");
    expect(bucketOf(entry({ status: "error" }).agent)).toBe("attention");
    expect(bucketOf(entry({ requiresAttention: true }).agent)).toBe("attention");
    expect(bucketOf(entry({ pendingPermissions: [permission] }).agent)).toBe("attention");
    expect(bucketOf(entry({ status: "initializing" }).agent)).toBe("running");
    expect(bucketOf(entry({ status: "running" }).agent)).toBe("running");
    expect(bucketOf(entry().agent)).toBe("idle");
  });

  test("reports an explicit state and the most actionable attention reason", () => {
    expect(stateLabel(entry({ pendingPermissions: [permission], status: "error" }).agent)).toBe(
      "permission",
    );
    expect(
      stateLabel(entry({ pendingPermissions: [permission, permission], status: "error" }).agent),
    ).toBe("2 permissions");
    expect(stateLabel(entry({ status: "error" }).agent)).toBe("error");
    expect(stateLabel(entry({ requiresAttention: true, attentionReason: "finished" }).agent)).toBe(
      "finished",
    );
    expect(stateLabel(entry({ requiresAttention: true, attentionReason: null }).agent)).toBe(
      "attention",
    );
    expect(stateLabel(entry({ status: "initializing" }).agent)).toBe("starting");
    expect(stateLabel(entry().agent)).toBe("idle");
  });
});

describe("project grouping", () => {
  const pinnedWorkspace: WorkspaceSummary = {
    id: "workspace-pinned",
    navigationId: "workspace-pinned",
    name: "Pinned workspace",
    projectId: "project-1",
    projectName: "Alpha",
    pinned: true,
    labels: ["priority"],
    additions: 12,
    deletions: 3,
  };

  const siblingWorkspace: WorkspaceSummary = {
    id: "workspace-sibling",
    navigationId: "workspace-sibling",
    name: "Sibling workspace",
    projectId: "project-1",
    projectName: "Alpha",
    pinned: false,
    labels: [],
    additions: 0,
    deletions: 0,
  };

  test("nests workspaces under projects and puts pinned projects first", () => {
    const parent = entry(
      { id: "parent", workspaceId: "workspace-pinned", status: "idle" },
      { projectKey: "project-1", projectName: "Alpha", workspaceName: "Pinned workspace" },
    );
    const child = entry(
      {
        id: "child",
        workspaceId: "workspace-pinned",
        status: "running",
        labels: { [PARENT_AGENT_ID_LABEL]: "parent" },
      },
      { projectKey: "project-1", projectName: "Alpha", workspaceName: "Pinned workspace" },
    );
    const sibling = entry(
      { id: "sibling", workspaceId: "workspace-sibling", status: "running" },
      { projectKey: "project-1", projectName: "Alpha", workspaceName: "Sibling workspace" },
    );
    const unpinned = entry(
      { id: "attention", requiresAttention: true, workspaceId: "workspace-other" },
      { projectKey: "project-2", projectName: "Beta", workspaceName: "Other" },
    );
    const projects = groupByProject(
      [child, unpinned, sibling, parent],
      directory([pinnedWorkspace, siblingWorkspace]),
      TRIAGE,
    );

    expect(projects.map((project) => project.id)).toEqual(["project-1", "project-2"]);
    expect(projects[0]?.pinned).toBe(true);
    expect(projects[0]?.workspaces.map((group) => group.workspace.id)).toEqual([
      "workspace-pinned",
      "workspace-sibling",
    ]);
    expect(projects[0]?.workspaces[0]?.entries.map((item) => item.agent.id)).toEqual([
      "parent",
      "child",
    ]);
  });

  test("orders unpinned projects by triage and then name", () => {
    const attention = entry(
      { id: "attention", workspaceId: "workspace-a", requiresAttention: true },
      { projectKey: "project-a", projectName: "Attention", workspaceName: "A" },
    );
    const idleB = entry(
      { id: "idle-b", workspaceId: "workspace-b" },
      { projectKey: "project-b", projectName: "Beta", workspaceName: "Beta" },
    );
    const idleC = entry(
      { id: "idle-c", workspaceId: "workspace-c" },
      { projectKey: "project-c", projectName: "Charlie", workspaceName: "Charlie" },
    );
    const projects = groupByProject([idleC, idleB, attention], directory(), TRIAGE);

    expect(projects.map((project) => project.id)).toEqual(["project-a", "project-b", "project-c"]);
  });

  test("orders peer agents by triage and wait time", () => {
    const olderIdle = entry({ id: "older", updatedAt: "2026-08-25T10:00:00.000Z" });
    const newerIdle = entry({ id: "newer", updatedAt: "2026-08-25T11:00:00.000Z" });
    const running = entry({ id: "running", status: "running" });
    const [project] = groupByProject([olderIdle, newerIdle, running], directory(), TRIAGE);

    expect(project?.workspaces[0]?.entries.map((item) => item.agent.id)).toEqual([
      "running",
      "newer",
      "older",
    ]);
  });

  test("collapses a sole workspace that repeats the project name", () => {
    const item = entry(
      { id: "solo", workspaceId: "workspace-solo" },
      { projectKey: "project-solo", projectName: "Solo", workspaceName: "Solo" },
    );
    const [project] = groupByProject([item], directory(), TRIAGE);
    expect(project).toBeDefined();
    if (!project) throw new Error("expected project group");
    const [workspaceGroup] = project.workspaces;
    expect(workspaceGroup).toBeDefined();
    if (!workspaceGroup) throw new Error("expected workspace group");
    expect(shouldCollapseWorkspace(project, workspaceGroup.workspace)).toBe(true);
    expect(
      shouldCollapseWorkspace(
        {
          id: "project-1",
          name: "Alpha",
          pinned: false,
          workspaces: [
            { workspace: pinnedWorkspace, entries: [] },
            { workspace: siblingWorkspace, entries: [] },
          ],
        },
        pinnedWorkspace,
      ),
    ).toBe(false);
  });

  test("counts children by parent", () => {
    const children = [
      entry({ id: "child-1", labels: { [PARENT_AGENT_ID_LABEL]: "parent" } }),
      entry({ id: "child-2", labels: { [PARENT_AGENT_ID_LABEL]: "parent" } }),
    ];
    expect(childCounts(children).get("parent")).toBe(2);
  });

  test("floatPinned false does not put pinned projects first", () => {
    const pinned = entry(
      { id: "pinned", workspaceId: "workspace-pinned", status: "idle" },
      { projectKey: "project-1", projectName: "Alpha", workspaceName: "Pinned workspace" },
    );
    const attention = entry(
      { id: "attention", requiresAttention: true, workspaceId: "workspace-other" },
      { projectKey: "project-2", projectName: "Beta", workspaceName: "Other" },
    );
    const projects = groupByProject([pinned, attention], directory([pinnedWorkspace]), {
      floatPinned: false,
      agentSort: "triage",
    });

    expect(projects.map((project) => project.id)).toEqual(["project-2", "project-1"]);
  });

  test("agentSort title orders projects alphabetically", () => {
    const zebra = entry(
      { id: "z", workspaceId: "ws-z", requiresAttention: true },
      { projectKey: "project-z", projectName: "Zebra", workspaceName: "Z" },
    );
    const alpha = entry(
      { id: "a", workspaceId: "ws-a" },
      { projectKey: "project-a", projectName: "Alpha", workspaceName: "A" },
    );
    const projects = groupByProject([zebra, alpha], directory(), {
      floatPinned: true,
      agentSort: "title",
    });

    expect(projects.map((project) => project.name)).toEqual(["Alpha", "Zebra"]);
  });

  test("shouldCollapseWorkspace respects enabled false", () => {
    const item = entry(
      { id: "solo", workspaceId: "workspace-solo" },
      { projectKey: "project-solo", projectName: "Solo", workspaceName: "Solo" },
    );
    const [project] = groupByProject([item], directory(), TRIAGE);
    expect(project).toBeDefined();
    if (!project) throw new Error("expected project group");
    const [workspaceGroup] = project.workspaces;
    expect(workspaceGroup).toBeDefined();
    if (!workspaceGroup) throw new Error("expected workspace group");
    expect(shouldCollapseWorkspace(project, workspaceGroup.workspace, false)).toBe(false);
  });

  test("names projects from the registry, including a custom rename", () => {
    const item = entry(
      { id: "renamed", workspaceId: pinnedWorkspace.id },
      { projectKey: "key-1", projectName: "Alpha", workspaceName: "Pinned workspace" },
    );
    const projects = groupByProject(
      [item],
      directory([pinnedWorkspace], [{ id: "project-1", key: "key-1", name: "Alpha Renamed" }]),
      TRIAGE,
    );

    expect(projects.map((project) => project.name)).toEqual(["Alpha Renamed"]);
  });

  test("keeps an agent whose workspace is unlisted inside its registered project", () => {
    const listed = entry(
      { id: "listed", workspaceId: pinnedWorkspace.id },
      { projectKey: "key-1", projectName: "Alpha", workspaceName: "Pinned workspace" },
    );
    const unlisted = entry(
      { id: "unlisted", workspaceId: "workspace-unlisted" },
      { projectKey: "key-1", projectName: "Alpha", workspaceName: "Unlisted workspace" },
    );
    const projects = groupByProject(
      [listed, unlisted],
      directory([pinnedWorkspace], [{ id: "project-1", key: "key-1", name: "Alpha" }]),
      TRIAGE,
    );

    expect(projects.map((project) => project.id)).toEqual(["project-1"]);
    expect(projects[0]?.workspaces.map((group) => group.workspace.id)).toEqual([
      "workspace-pinned",
      "workspace-unlisted",
    ]);
    expect(projects[0]?.workspaces.map((group) => group.workspace.navigationId)).toEqual([
      "workspace-pinned",
      "workspace-unlisted",
    ]);
  });

  test("merges a listed and an unlisted workspace even with no registry", () => {
    const listed = entry(
      { id: "listed", workspaceId: pinnedWorkspace.id },
      { projectKey: "key-1", projectName: "Alpha", workspaceName: "Pinned workspace" },
    );
    const unlisted = entry(
      { id: "unlisted", workspaceId: "workspace-unlisted" },
      { projectKey: "key-1", projectName: "Alpha", workspaceName: "Unlisted workspace" },
    );
    const projects = groupByProject([listed, unlisted], directory([pinnedWorkspace]), TRIAGE);

    expect(projects.map((project) => project.id)).toEqual(["project-1"]);
    expect(projects[0]?.workspaces.map((group) => group.workspace.id)).toEqual([
      "workspace-pinned",
      "workspace-unlisted",
    ]);
  });

  test("keeps a synthetic workspace non-navigable when an agent has no workspace id", () => {
    const orphan = entry(
      { id: "orphan", workspaceId: undefined },
      { projectKey: "project-orphan", projectName: "Orphan", workspaceName: "Orphan" },
    );
    const [project] = groupByProject([orphan], directory(), TRIAGE);

    expect(project?.workspaces[0]?.workspace).toMatchObject({
      id: "agent:orphan",
      navigationId: null,
    });
  });
});

describe("buildRoster", () => {
  test("compact returns flat entries", () => {
    const older = entry({ id: "older", updatedAt: "2026-08-25T10:00:00.000Z" });
    const newer = entry({ id: "newer", updatedAt: "2026-08-25T11:00:00.000Z", status: "running" });
    const roster = buildRoster([older, newer], directory(), {
      grouping: "compact",
      floatPinned: true,
      agentSort: "triage",
    });

    expect(roster.kind).toBe("compact");
    if (roster.kind !== "compact") throw new Error("expected compact roster");
    expect(roster.entries.map((item) => item.agent.id)).toEqual(["newer", "older"]);
  });

  test("workspace returns kind workspace", () => {
    const first = entry(
      { id: "a", workspaceId: "workspace-a" },
      { projectKey: "project-1", projectName: "Alpha", workspaceName: "A" },
    );
    const second = entry(
      { id: "b", workspaceId: "workspace-b" },
      { projectKey: "project-1", projectName: "Alpha", workspaceName: "B" },
    );
    const roster = buildRoster(
      [first, second],
      directory([
        {
          id: "workspace-a",
          navigationId: "workspace-a",
          name: "A",
          projectId: "project-1",
          projectName: "Alpha",
          pinned: false,
          labels: [],
          additions: 0,
          deletions: 0,
        },
        {
          id: "workspace-b",
          navigationId: "workspace-b",
          name: "B",
          projectId: "project-1",
          projectName: "Alpha",
          pinned: false,
          labels: [],
          additions: 0,
          deletions: 0,
        },
      ]),
      { grouping: "workspace", floatPinned: true, agentSort: "title" },
    );

    expect(roster.kind).toBe("workspace");
    if (roster.kind !== "workspace") throw new Error("expected workspace roster");
    expect(roster.groups.map((group) => group.workspace.id)).toEqual([
      "workspace-a",
      "workspace-b",
    ]);
  });
});

describe("row presentation", () => {
  test("uses the attention timestamp before the update timestamp", () => {
    const agent = entry({
      attentionTimestamp: "2026-08-25T09:00:00.000Z",
      updatedAt: "2026-08-25T11:00:00.000Z",
    }).agent;

    expect(waitingSince(agent)).toBe(Date.parse("2026-08-25T09:00:00.000Z"));
    expect(age(waitingSince(agent), Date.parse("2026-08-25T10:30:00.000Z"))).toBe("2h");
  });

  test("formats every age boundary and invalid timestamps", () => {
    const now = Date.parse("2026-08-25T12:00:00.000Z");
    expect(age(Number.NaN, now)).toBe("");
    expect(age(now - 30_000, now)).toBe("30s");
    expect(age(now - 30 * 60_000, now)).toBe("30m");
    expect(age(now - 2 * 60 * 60_000, now)).toBe("2h");
    expect(age(now - 2 * 24 * 60 * 60_000, now)).toBe("2d");
  });

  test("uses update time and compact placement when optional details are absent", () => {
    const item = entry(
      { attentionTimestamp: null },
      { projectName: "Project", workspaceName: "Project" },
    );

    expect(waitingSince(item.agent)).toBe(Date.parse(item.agent.updatedAt));
    expect(placement(item)).toBe("Project");
    expect(matches(item, "")).toBe(true);
    expect(title(entry({ title: "Named agent" }))).toBe("Named agent");
  });

  test("formats placement, title fallback, and searchable fields", () => {
    const item = entry(
      { id: "abcdefghi", title: "  ", model: "model-x" },
      {
        projectName: "Project",
        workspaceName: "Feature",
        checkout: {
          cwd: "/work/project",
          isGit: true,
          currentBranch: "feature/pins",
          remoteUrl: null,
          worktreeRoot: "/work/project",
          isPaseoOwnedWorktree: false,
          mainRepoRoot: "/work/project",
        },
      },
    );

    expect(title(item)).toBe("abcdefg");
    expect(placement(item)).toBe("Project / Feature · feature/pins");
    expect(matches(item, "feature")).toBe(true);
    expect(matches(item, "MODEL-X".toLowerCase())).toBe(true);
    expect(matches(item, "missing")).toBe(false);
  });
});
