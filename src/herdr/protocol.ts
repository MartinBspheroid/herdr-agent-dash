import type {
  AgentRecord,
  HerdrEvent,
  NativeSession,
  PaneRecord,
  SessionStoreSnapshot,
  TabRecord,
  WorkspaceRecord,
} from '@/contracts';
import { BoardError } from '@/app/errors';
import { sanitizeTerminalText } from '@/safety/sanitize-terminal';

/** A structured error returned by a Herdr request. */
export interface HerdrProtocolError {
  readonly code: string;
  readonly message: string;
  readonly details?: unknown | undefined;
}

/** Protocol response envelope accepted by the NDJSON client. */
export interface HerdrResponse<T> {
  readonly id: string;
  readonly result?: T;
  readonly error?: HerdrProtocolError;
}

/** A response-shaped line that cannot safely be resolved. */
export interface MalformedHerdrResponse {
  readonly id: string;
  readonly malformed: true;
  readonly reason: string;
}

/** Every valid or diagnosable record accepted from the socket. */
export type ParsedProtocolLine = HerdrResponse<unknown> | MalformedHerdrResponse | HerdrEvent;

/** Parse a JSON line into a response or event envelope. */
export function parseProtocolLine(line: string): ParsedProtocolLine | undefined {
  let value: unknown;
  try {
    value = JSON.parse(line) as unknown;
  } catch {
    return undefined;
  }
  if (!isRecord(value)) {
    return undefined;
  }
  if (typeof value.id === 'string') {
    const hasResult = 'result' in value;
    const hasError = 'error' in value;
    if (hasResult === hasError) {
      return {
        id: value.id,
        malformed: true,
        reason: 'response must contain exactly one result or error',
      };
    }
    if (hasResult) return { id: value.id, result: value.result };
    if (
      !isRecord(value.error) ||
      typeof value.error.code !== 'string' ||
      typeof value.error.message !== 'string'
    ) {
      return { id: value.id, malformed: true, reason: 'response error is malformed' };
    }
    return {
      id: value.id,
      error: { code: value.error.code, message: value.error.message, details: value.error.details },
    };
  }
  const eventName =
    stringValue(value.event) ??
    stringValue(value.method) ??
    (stringValue(value.type)?.includes('.') === true ? stringValue(value.type) : undefined);
  if (eventName === undefined) {
    return undefined;
  }
  return {
    event: eventName,
    payload: value.payload ?? value.params ?? value.data ?? value.snapshot ?? value,
    revision: numberValue(value.revision),
  };
}

/** Normalize a Herdr snapshot while isolating malformed individual records. */
export function normalizeSnapshot(
  value: unknown,
  connection: SessionStoreSnapshot['connection'] = 'live',
): SessionStoreSnapshot {
  const parsed = parseSnapshot(value, connection);
  if (!parsed.ok) throw new BoardError('protocol_malformed', parsed.message);
  return parsed.snapshot;
}

/** Parse a complete snapshot while distinguishing malformed data from valid emptiness. */
export function parseSnapshot(
  value: unknown,
  connection: SessionStoreSnapshot['connection'] = 'live',
):
  | { readonly ok: true; readonly snapshot: SessionStoreSnapshot }
  | { readonly ok: false; readonly message: string } {
  const envelope = isRecord(value) && isRecord(value.result) ? value.result : value;
  const source = isRecord(envelope) && isRecord(envelope.snapshot) ? envelope.snapshot : envelope;
  if (!isRecord(source)) return { ok: false, message: 'Herdr snapshot is not an object' };
  const knownKeys = ['workspaces', 'tabs', 'panes', 'agents', 'version', 'protocol'];
  if (!knownKeys.some((key) => key in source)) {
    return { ok: false, message: 'Herdr snapshot has no recognized fields' };
  }
  const object = source;
  const workspaces = records(object.workspaces, normalizeWorkspace);
  const tabs = records(object.tabs, normalizeTab);
  const panes = records(object.panes, normalizePane);
  const agents = new Map(records(object.agents, normalizeAgent));
  for (const pane of panes.values()) {
    const agentId = pane.agentId ?? pane.terminalId ?? pane.id;
    if (agents.has(agentId)) continue;
    agents.set(agentId, {
      id: agentId,
      name: pane.agent ?? agentId,
      provider: pane.provider,
      status: pane.agentStatus,
      session: pane.agentSession,
      revision: pane.revision,
    });
  }
  return {
    ok: true,
    snapshot: {
      connection,
      serverVersion:
        stringValue(object.server_version) ??
        stringValue(object.serverVersion) ??
        stringValue(object.version),
      protocolVersion:
        numberValue(object.protocol_version) ??
        numberValue(object.protocolVersion) ??
        numberValue(object.protocol),
      workspaces,
      tabs,
      panes,
      agents,
      lastSynchronizedAt: numberValue(object.timestamp) ?? numberValue(object.generated_at),
    },
  };
}

/** Normalize one workspace record from either snake-case or camel-case protocol data. */
export function normalizeWorkspace(value: unknown, fallbackId = ''): WorkspaceRecord | undefined {
  const record = asRecord(value);
  const id = stringValue(record?.id) ?? stringValue(record?.workspace_id) ?? fallbackId;
  if (id.length === 0) return undefined;
  return {
    id,
    label: stringValue(record?.label) ?? stringValue(record?.name) ?? id,
    cwd: stringValue(record?.cwd),
    revision: numberValue(record?.revision),
  };
}

/** Normalize one tab record from either snake-case or camel-case protocol data. */
export function normalizeTab(value: unknown, fallbackId = ''): TabRecord | undefined {
  const record = asRecord(value);
  const id = stringValue(record?.id) ?? stringValue(record?.tab_id) ?? fallbackId;
  const workspaceId = stringValue(record?.workspace_id) ?? stringValue(record?.workspaceId) ?? '';
  if (id.length === 0 || workspaceId.length === 0) return undefined;
  return {
    id,
    workspaceId,
    label: stringValue(record?.label) ?? stringValue(record?.name) ?? id,
    revision: numberValue(record?.revision),
  };
}

/** Normalize one pane record and retain only bounded display metadata. */
export function normalizePane(value: unknown, fallbackId = ''): PaneRecord | undefined {
  const record = asRecord(value);
  const id = stringValue(record?.id) ?? stringValue(record?.pane_id) ?? fallbackId;
  const tabId = stringValue(record?.tab_id) ?? stringValue(record?.tabId) ?? '';
  const workspaceId = stringValue(record?.workspace_id) ?? stringValue(record?.workspaceId) ?? '';
  if (id.length === 0 || tabId.length === 0 || workspaceId.length === 0) return undefined;
  const session = normalizeSession(record?.agent_session ?? record?.agentSession);
  return {
    id,
    terminalId: stringValue(record?.terminal_id) ?? stringValue(record?.terminalId),
    tabId,
    workspaceId,
    agentId: stringValue(record?.agent_id) ?? stringValue(record?.agentId),
    agent: stringValue(record?.agent) ?? stringValue(record?.display_agent),
    provider: stringValue(record?.provider),
    agentSession: session,
    agentStatus:
      stringValue(record?.agent_status) ??
      stringValue(record?.agentStatus) ??
      stringValue(record?.status) ??
      stringValue(record?.state),
    cwd: stringValue(record?.cwd),
    foregroundCwd: stringValue(record?.foreground_cwd) ?? stringValue(record?.foregroundCwd),
    terminalTitle: stringValue(record?.terminal_title) ?? stringValue(record?.terminalTitle),
    terminalTitleStripped:
      stringValue(record?.terminal_title_stripped) ?? stringValue(record?.terminalTitleStripped),
    metadata: normalizeMetadata(
      record?.metadata ??
        record?.presentation ??
        record?.tokens ?? {
          custom_status: record?.custom_status,
          state_message: record?.state_message,
        },
    ),
    focused: booleanValue(record?.focused) ?? false,
    revision: numberValue(record?.revision),
  };
}

/** Normalize one agent record and leave unknown provider fields untouched upstream. */
export function normalizeAgent(value: unknown, fallbackId = ''): AgentRecord | undefined {
  const record = asRecord(value);
  const id =
    stringValue(record?.id) ??
    stringValue(record?.agent_id) ??
    stringValue(record?.terminal_id) ??
    stringValue(record?.terminalId) ??
    fallbackId;
  if (id.length === 0) return undefined;
  return {
    id,
    name:
      stringValue(record?.name) ??
      stringValue(record?.display_agent) ??
      stringValue(record?.agent) ??
      id,
    provider: stringValue(record?.provider),
    status:
      stringValue(record?.status) ??
      stringValue(record?.agent_status) ??
      stringValue(record?.state),
    session: normalizeSession(record?.agent_session ?? record?.agentSession),
    revision: numberValue(record?.revision),
  };
}
function normalizeSession(value: unknown): NativeSession | undefined {
  const record = asRecord(value);
  if (record === undefined) return undefined;
  const source = stringValue(record.source);
  const agent = stringValue(record.agent);
  const kind = stringValue(record.kind);
  const sessionValue = stringValue(record.value);
  if (
    source === undefined ||
    agent === undefined ||
    kind === undefined ||
    sessionValue === undefined
  )
    return undefined;
  return { source, agent, kind, value: sessionValue };
}
function normalizeMetadata(value: unknown): Readonly<Record<string, string>> {
  if (!isRecord(value)) return {};
  const entries = Object.entries(value).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string',
  );
  const result: Record<string, string> = {};
  let bytes = 0;
  for (const [key, item] of entries.slice(0, 32)) {
    const safe = sanitizeTerminalText(item, 512).text;
    const nextBytes =
      bytes + new TextEncoder().encode(key).byteLength + new TextEncoder().encode(safe).byteLength;
    if (nextBytes > 16_384) break;
    result[key.slice(0, 128)] = safe;
    bytes = nextBytes;
  }
  return result;
}

function records<T extends { readonly id: string }>(
  value: unknown,
  normalizer: (value: unknown, fallbackId: string) => T | undefined,
): ReadonlyMap<string, T> {
  const result = new Map<string, T>();
  if (Array.isArray(value)) {
    for (const item of value) {
      const normalized = normalizer(item, '');
      if (normalized !== undefined) result.set(normalized.id, normalized);
    }
    return result;
  }
  if (!isRecord(value)) return result;
  for (const [id, item] of Object.entries(value)) {
    const normalized = normalizer(item, id);
    if (normalized !== undefined) result.set(normalized.id, normalized);
  }
  return result;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value.slice(0, 1024) : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

const booleanValue = (value: unknown): boolean | undefined =>
  typeof value === 'boolean' ? value : undefined;
