import type {
  CommandResult,
  CommandService,
  CurrentAgentTarget,
  OutputPreview,
  PaneRecord,
  SessionStore,
  HerdrTransport,
} from '@/contracts';
import type { GitEnricher } from '@/git/git-enricher';
import { sanitizeTerminalText } from '@/safety/sanitize-terminal';

/** Safe read-only commands used by the board UI and plugin host. */
export class DefaultCommandService implements CommandService {
  /** Create commands over the current session, transport, and Git cache. */
  public constructor(
    private readonly session: SessionStore,
    private readonly transport: HerdrTransport,
    private readonly git: GitEnricher,
    private readonly options: {
      readonly previewLines?: number;
      readonly previewMaxBytes?: number;
      readonly popup?: boolean;
    } = {},
  ) {}

  /** Focus a stable agent, re-resolving once when Herdr reports a stale target. */
  public async focusAgent(stableAgentId: string): Promise<CommandResult> {
    let target = this.session.resolveCurrentTarget(stableAgentId);
    if (target === undefined)
      return { ok: false, message: 'The selected agent is no longer available' };
    try {
      await this.focus(target);
      const closeMessage = await this.closePopup();
      if (closeMessage !== undefined)
        return { ok: false, message: `Focused ${stableAgentId}; ${closeMessage}` };
      return { ok: true, message: `Focused ${stableAgentId}` };
    } catch (error) {
      if (!isNotFound(error)) return { ok: false, message: errorMessage(error) };
      try {
        await this.session.refresh();
      } catch (refreshError) {
        return {
          ok: false,
          message: `Unable to refresh before retry: ${errorMessage(refreshError)}`,
        };
      }
      target = this.session.resolveCurrentTarget(stableAgentId);
      if (target === undefined)
        return { ok: false, message: 'The agent moved or closed before focus was acknowledged' };
      try {
        await this.focus(target);
        const closeMessage = await this.closePopup();
        if (closeMessage !== undefined)
          return { ok: false, message: `Focused ${stableAgentId}; ${closeMessage}` };
        return { ok: true, message: `Focused ${stableAgentId}` };
      } catch (retryError) {
        return { ok: false, message: errorMessage(retryError) };
      }
    }
  }

  /** Resnapshot Herdr and invalidate all known Git entries. */
  public async refreshAll(): Promise<CommandResult> {
    try {
      await this.session.refresh();
      for (const pane of this.session.getSnapshot().panes.values()) {
        const cwd = pane.foregroundCwd ?? pane.cwd;
        if (cwd !== undefined) this.git.invalidate(cwd, 'manual');
      }
      return { ok: true, message: 'Board refreshed' };
    } catch (error) {
      return { ok: false, message: errorMessage(error) };
    }
  }

  /** Invalidate and immediately refresh the selected agent's Git context. */
  public async refreshGit(stableAgentId: string): Promise<CommandResult> {
    const pane = this.findPane(stableAgentId);
    const cwd = pane?.foregroundCwd ?? pane?.cwd;
    if (cwd === undefined)
      return { ok: false, message: 'The selected agent has no working directory' };
    try {
      this.git.invalidate(cwd, 'manual');
      await this.git.ensure(cwd, 'manual');
      return { ok: true, message: 'Git context refreshed' };
    } catch (error) {
      return { ok: false, message: errorMessage(error) };
    }
  }

  /** Read bounded, sanitized terminal output only after explicit user action. */
  public async loadRecentOutput(stableAgentId: string): Promise<CommandResult<OutputPreview>> {
    const target = this.session.resolveCurrentTarget(stableAgentId);
    if (target === undefined)
      return { ok: false, message: 'The selected agent is no longer available' };
    try {
      const result = await this.transport.request<unknown>('pane.read', {
        pane_id: target.paneId,
        source: 'recent-unwrapped',
        lines: this.options.previewLines ?? 30,
      });
      const raw = extractText(result);
      const safe = sanitizeTerminalText(raw, this.options.previewMaxBytes ?? 8_192);
      const preview: OutputPreview = {
        text: safe.text,
        lines: safe.text.length === 0 ? 0 : safe.text.split('\n').length,
        bytes: new TextEncoder().encode(safe.text).byteLength,
        truncated: safe.truncated,
      };
      return { ok: true, message: 'Recent terminal output loaded in memory', value: preview };
    } catch (error) {
      return { ok: false, message: errorMessage(error) };
    }
  }

  /** Request popup closure through Herdr and never mutate tiled layout state. */
  public async close(): Promise<void> {
    const closeMessage = await this.closePopup();
    if (closeMessage !== undefined) throw new Error(closeMessage);
  }

  private async focus(target: CurrentAgentTarget): Promise<void> {
    const agentTarget = target.terminalId ?? target.paneId;
    await this.transport.request('agent.focus', {
      target: agentTarget,
    });
  }

  private async closePopup(): Promise<string | undefined> {
    if (this.options.popup !== true) return undefined;
    try {
      await this.transport.request('popup.close');
      return undefined;
    } catch (error) {
      return `popup close failed: ${errorMessage(error)}`;
    }
  }

  private findPane(stableAgentId: string): PaneRecord | undefined {
    return [...this.session.getSnapshot().panes.values()].find(
      (pane) =>
        (pane.agentId ?? pane.terminalId ?? pane.id) === stableAgentId ||
        pane.terminalId === stableAgentId,
    );
  }
}

function extractText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    const text = record.text ?? record.output ?? record.content;
    if (typeof text === 'string') return text;
  }
  return '';
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && 'code' in error && error.code === 'not_found'
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 400) : 'Command failed';
}
