import type { PaseoAgentListResult } from "@getpaseo/client";
import type { AgentSort, MonitorSettings } from "./monitor-settings";

export type AgentEntry = PaseoAgentListResult["entries"][number];
type AgentSnapshot = AgentEntry["agent"];
export type WorkspaceSummary = {
  id: string;
  navigationId?: string;
  name: string;
  projectId: string;
  projectName: string;
  pinned: boolean;
  labels: readonly string[];
  additions: number;
  deletions: number;
};

/** A project registered on the daemon, named by its owner rather than by a workspace row. */
export type ProjectSummary = {
  id: string;
  name: string;
};

/** Registered projects indexed by project id and by the project key agents report. */
export type ProjectIndex = ReadonlyMap<string, ProjectSummary>;

/** Everything the roster needs beyond the agents themselves. */
export type MonitorDirectory = {
  workspaces: ReadonlyMap<string, WorkspaceSummary>;
  projects: ProjectIndex;
};

/**
 * Indexes each project under its id and its key so either identifier resolves it. A project whose
 * key collides with another project's id overwrites that entry, so the last one listed wins.
 */
export function indexProjects(
  projects: readonly { id: string; key?: string | null; name: string }[],
): ProjectIndex {
  const index = new Map<string, ProjectSummary>();
  for (const project of projects) {
    const summary: ProjectSummary = { id: project.id, name: project.name };
    index.set(project.id, summary);
    if (project.key) index.set(project.key, summary);
  }
  return index;
}

export type WorkspaceGroup = { workspace: WorkspaceSummary; entries: AgentEntry[] };

export type ProjectGroup = {
  id: string;
  name: string;
  pinned: boolean;
  workspaces: WorkspaceGroup[];
};

export type Roster =
  | { kind: "compact"; entries: AgentEntry[] }
  | { kind: "workspace"; groups: WorkspaceGroup[] }
  | { kind: "project"; projects: ProjectGroup[] };

export const PARENT_AGENT_ID_LABEL = "paseo.parent-agent-id";

export type Bucket = "attention" | "running" | "idle" | "closed";

export const BUCKETS: readonly Bucket[] = ["attention", "running", "idle", "closed"];
export const BUCKET_TITLES: Record<Bucket, string> = {
  attention: "Attention",
  running: "Running",
  idle: "Idle",
  closed: "Closed",
};

const BUCKET_ORDER: Record<Bucket, number> = { attention: 0, running: 1, idle: 2, closed: 3 };

export type GroupOptions = Pick<MonitorSettings, "floatPinned" | "agentSort">;

export function bucketOf(agent: AgentSnapshot): Bucket {
  if (agent.status === "closed") return "closed";
  if (agent.requiresAttention || agent.status === "error" || agent.pendingPermissions.length > 0) {
    return "attention";
  }
  if (agent.status === "running" || agent.status === "initializing") return "running";
  return "idle";
}

export function stateLabel(agent: AgentSnapshot): string {
  const permissionCount = agent.pendingPermissions.length;
  if (permissionCount > 0) {
    return permissionCount === 1 ? "permission" : `${permissionCount} permissions`;
  }
  if (agent.status === "error") return "error";
  if (agent.requiresAttention) return agent.attentionReason ?? "attention";
  return agent.status === "initializing" ? "starting" : agent.status;
}

/** Attention timestamp is when the agent started waiting; updatedAt is the fallback heartbeat. */
export function waitingSince(agent: AgentSnapshot): number {
  return Date.parse(agent.attentionTimestamp ?? agent.updatedAt);
}

export function age(since: number, now: number): string {
  if (Number.isNaN(since)) return "";
  const seconds = Math.max(0, Math.round((now - since) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

export function placement(entry: AgentEntry): string {
  const { project } = entry;
  const workspace = project.workspaceName?.trim();
  const scope =
    workspace && workspace !== project.projectName
      ? `${project.projectName} / ${workspace}`
      : project.projectName;
  const branch = project.checkout.isGit ? project.checkout.currentBranch : null;
  return branch ? `${scope} · ${branch}` : scope;
}

export function title(entry: AgentEntry): string {
  const explicit = entry.agent.title?.trim();
  return explicit && explicit.length > 0 ? explicit : entry.agent.id.slice(0, 7);
}

export function matches(entry: AgentEntry, needle: string): boolean {
  if (needle.length === 0) return true;
  return [
    entry.agent.title ?? "",
    entry.agent.id,
    entry.agent.provider,
    entry.agent.model ?? "",
    entry.agent.cwd,
    entry.project.projectName,
    entry.project.workspaceName ?? "",
  ]
    .join(" ")
    .toLowerCase()
    .includes(needle);
}

function bestBucket(entries: readonly AgentEntry[]): number {
  if (entries.length === 0) return BUCKET_ORDER.idle;
  return Math.min(...entries.map((entry) => BUCKET_ORDER[bucketOf(entry.agent)]));
}

function compareBySort(left: AgentEntry, right: AgentEntry, agentSort: AgentSort): number {
  if (agentSort === "title") return title(left).localeCompare(title(right));
  if (agentSort === "updated") {
    return Date.parse(right.agent.updatedAt) - Date.parse(left.agent.updatedAt);
  }
  const byBucket = BUCKET_ORDER[bucketOf(left.agent)] - BUCKET_ORDER[bucketOf(right.agent)];
  return byBucket === 0 ? waitingSince(right.agent) - waitingSince(left.agent) : byBucket;
}

export function sortEntries(entries: AgentEntry[], agentSort: AgentSort): void {
  entries.sort((left, right) => {
    const leftChild = PARENT_AGENT_ID_LABEL in left.agent.labels;
    const rightChild = PARENT_AGENT_ID_LABEL in right.agent.labels;
    if (leftChild !== rightChild) return leftChild ? 1 : -1;
    return compareBySort(left, right, agentSort);
  });
}

function sortWorkspaces(workspaces: WorkspaceGroup[], options: GroupOptions): void {
  workspaces.sort((left, right) => {
    if (options.floatPinned && left.workspace.pinned !== right.workspace.pinned) {
      return left.workspace.pinned ? -1 : 1;
    }
    if (options.agentSort === "title") {
      return left.workspace.name.localeCompare(right.workspace.name);
    }
    if (options.agentSort === "updated") {
      const leftUpdated = Math.max(
        0,
        ...left.entries.map((entry) => Date.parse(entry.agent.updatedAt)),
      );
      const rightUpdated = Math.max(
        0,
        ...right.entries.map((entry) => Date.parse(entry.agent.updatedAt)),
      );
      if (leftUpdated !== rightUpdated) return rightUpdated - leftUpdated;
    } else {
      const byBucket = bestBucket(left.entries) - bestBucket(right.entries);
      if (byBucket !== 0) return byBucket;
    }
    return left.workspace.name.localeCompare(right.workspace.name);
  });
}

/**
 * A listed workspace per project key, so an agent whose own workspace is unlisted can borrow its
 * sibling's project identity instead of grouping under the raw key. This keeps the project roster
 * correct when the registry is empty or missing that project.
 */
function siblingsByProjectKey(
  entries: readonly AgentEntry[],
  workspaces: ReadonlyMap<string, WorkspaceSummary>,
): ReadonlyMap<string, WorkspaceSummary> {
  const siblings = new Map<string, WorkspaceSummary>();
  for (const entry of entries) {
    const key = entry.project.projectKey;
    if (siblings.has(key)) continue;
    const workspace = entry.agent.workspaceId ? workspaces.get(entry.agent.workspaceId) : undefined;
    if (workspace) siblings.set(key, workspace);
  }
  return siblings;
}

function resolveWorkspace(
  entry: AgentEntry,
  directory: MonitorDirectory,
  siblings: ReadonlyMap<string, WorkspaceSummary>,
): WorkspaceSummary {
  const navigationId = entry.agent.workspaceId ?? undefined;
  const workspaceId = navigationId ?? `agent:${entry.agent.id}`;
  const known = directory.workspaces.get(workspaceId);
  if (known) return known;
  const project = directory.projects.get(entry.project.projectKey);
  const sibling = siblings.get(entry.project.projectKey);
  return {
    id: workspaceId,
    navigationId,
    name: entry.project.workspaceName?.trim() || entry.project.projectName,
    projectId: project?.id ?? sibling?.projectId ?? entry.project.projectKey,
    projectName: project?.name ?? sibling?.projectName ?? entry.project.projectName,
    pinned: false,
    labels: [],
    additions: 0,
    deletions: 0,
  };
}

function workspaceGroups(
  entries: readonly AgentEntry[],
  directory: MonitorDirectory,
  options: GroupOptions,
): WorkspaceGroup[] {
  const siblings = siblingsByProjectKey(entries, directory.workspaces);
  const groups = new Map<string, WorkspaceGroup>();
  for (const entry of entries) {
    const workspace = resolveWorkspace(entry, directory, siblings);
    const group = groups.get(workspace.id);
    if (group) group.entries.push(entry);
    else groups.set(workspace.id, { workspace, entries: [entry] });
  }
  const result = [...groups.values()];
  for (const group of result) sortEntries(group.entries, options.agentSort);
  sortWorkspaces(result, options);
  return result;
}

/** True when the sole workspace repeats the project name, so the UI can collapse that header. */
export function shouldCollapseWorkspace(
  project: ProjectGroup,
  workspace: WorkspaceSummary,
  enabled = true,
): boolean {
  return enabled && project.workspaces.length === 1 && workspace.name === project.name;
}

export function groupByWorkspace(
  entries: readonly AgentEntry[],
  directory: MonitorDirectory,
  options: GroupOptions,
): WorkspaceGroup[] {
  return workspaceGroups(entries, directory, options);
}

export function groupByProject(
  entries: readonly AgentEntry[],
  directory: MonitorDirectory,
  options: GroupOptions,
): ProjectGroup[] {
  const groups = workspaceGroups(entries, directory, options);

  const projects = new Map<string, ProjectGroup>();
  for (const group of groups) {
    const projectId = group.workspace.projectId || group.workspace.projectName;
    const existing = projects.get(projectId);
    if (existing) {
      existing.workspaces.push(group);
      if (group.workspace.pinned) existing.pinned = true;
      continue;
    }
    projects.set(projectId, {
      id: projectId,
      name: directory.projects.get(projectId)?.name ?? group.workspace.projectName,
      pinned: group.workspace.pinned,
      workspaces: [group],
    });
  }

  const result = [...projects.values()];
  for (const project of result) sortWorkspaces(project.workspaces, options);

  return result.sort((left, right) => {
    if (options.floatPinned && left.pinned !== right.pinned) return left.pinned ? -1 : 1;
    if (options.agentSort === "title") return left.name.localeCompare(right.name);
    if (options.agentSort === "updated") {
      const leftUpdated = Math.max(
        0,
        ...left.workspaces.flatMap((group) =>
          group.entries.map((entry) => Date.parse(entry.agent.updatedAt)),
        ),
      );
      const rightUpdated = Math.max(
        0,
        ...right.workspaces.flatMap((group) =>
          group.entries.map((entry) => Date.parse(entry.agent.updatedAt)),
        ),
      );
      if (leftUpdated !== rightUpdated) return rightUpdated - leftUpdated;
    } else {
      const leftBucket = Math.min(...left.workspaces.map((group) => bestBucket(group.entries)));
      const rightBucket = Math.min(...right.workspaces.map((group) => bestBucket(group.entries)));
      if (leftBucket !== rightBucket) return leftBucket - rightBucket;
    }
    return left.name.localeCompare(right.name);
  });
}

export function buildRoster(
  entries: readonly AgentEntry[],
  directory: MonitorDirectory,
  settings: Pick<MonitorSettings, "grouping" | "floatPinned" | "agentSort">,
): Roster {
  const options: GroupOptions = {
    floatPinned: settings.floatPinned,
    agentSort: settings.agentSort,
  };
  if (settings.grouping === "compact") {
    const pinned: AgentEntry[] = [];
    const rest: AgentEntry[] = [];
    for (const entry of entries) {
      if (settings.floatPinned && directory.workspaces.get(entry.agent.workspaceId ?? "")?.pinned) {
        pinned.push(entry);
      } else {
        rest.push(entry);
      }
    }
    sortEntries(pinned, settings.agentSort);
    sortEntries(rest, settings.agentSort);
    return { kind: "compact", entries: [...pinned, ...rest] };
  }
  if (settings.grouping === "workspace") {
    return { kind: "workspace", groups: groupByWorkspace(entries, directory, options) };
  }
  return { kind: "project", projects: groupByProject(entries, directory, options) };
}

export function childCounts(entries: readonly AgentEntry[]): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    const parentId = entry.agent.labels[PARENT_AGENT_ID_LABEL];
    if (parentId) counts.set(parentId, (counts.get(parentId) ?? 0) + 1);
  }
  return counts;
}
