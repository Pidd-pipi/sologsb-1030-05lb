import { useCallback, useEffect, useState } from 'react';
import type { ChecklistProject, ChecklistRevision, ChecklistRun, RunEntryStatus, RunState } from './types';

const RUNS_KEY = 'sologsb-1030-runs-v1';
const now = () => new Date().toISOString();

export const runKey = (projectId: string, revisionId: string) => `${projectId}::${revisionId}`;

function loadRuns(): RunState {
  try {
    const saved = localStorage.getItem(RUNS_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as RunState;
      if (parsed.schemaVersion === 1 && parsed.runs) return parsed;
    }
  } catch {
    // Corrupted run log starts empty; frozen checklists themselves are untouched.
  }
  return { schemaVersion: 1, runs: {} };
}

export function useRunStore() {
  const [runState, setRunState] = useState<RunState>(loadRuns);

  useEffect(() => {
    localStorage.setItem(RUNS_KEY, JSON.stringify(runState));
  }, [runState]);

  const recordEntry = useCallback((project: ChecklistProject, revision: ChecklistRevision, itemId: string, status: RunEntryStatus, note: string) => {
    setRunState((current) => {
      const key = runKey(project.id, revision.id);
      const existing = current.runs[key];
      const run: ChecklistRun = existing ? structuredClone(existing) : {
        key,
        projectId: project.id,
        revisionId: revision.id,
        revision: revision.revision,
        startedAt: now(),
        updatedAt: now(),
        entries: {},
        sequence: []
      };
      if (run.entries[itemId]) return current;
      run.entries[itemId] = { status, note: note.trim(), at: now() };
      run.sequence.push(itemId);
      run.updatedAt = now();
      return { ...current, runs: { ...current.runs, [key]: run } };
    });
  }, []);

  const undoLast = useCallback((key: string) => {
    setRunState((current) => {
      const existing = current.runs[key];
      if (!existing || !existing.sequence.length) return current;
      const run = structuredClone(existing);
      const lastId = run.sequence.pop() as string;
      delete run.entries[lastId];
      run.updatedAt = now();
      return { ...current, runs: { ...current.runs, [key]: run } };
    });
  }, []);

  const resetRun = useCallback((key: string) => {
    setRunState((current) => {
      if (!current.runs[key]) return current;
      const runs = { ...current.runs };
      delete runs[key];
      return { ...current, runs };
    });
  }, []);

  return { runState, recordEntry, undoLast, resetRun };
}
