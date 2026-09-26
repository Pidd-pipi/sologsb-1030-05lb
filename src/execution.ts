import { useCallback, useEffect, useState } from 'react';
import type { ExecutionEntryStatus, ExecutionRun, ExecutionWorkspace } from './types';

const STORAGE_KEY = 'sologsb-1030-executions-v1';

export const executionRunKey = (projectId: string, revision: number) => `${projectId}:r${revision}`;

function loadExecutionState(): ExecutionWorkspace {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as ExecutionWorkspace;
      if (parsed.schemaVersion === 1 && parsed.runs) return parsed;
    }
  } catch {
    // Corrupted execution log falls back to an empty record set.
  }
  return { schemaVersion: 1, runs: {} };
}

export function useExecutionStore() {
  const [state, setState] = useState<ExecutionWorkspace>(loadExecutionState);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const mutateRun = useCallback((runKey: string, projectId: string, revision: number, mutator: (run: ExecutionRun) => void) => {
    setState((current) => {
      const existing = current.runs[runKey];
      const run: ExecutionRun = existing
        ? { ...existing, entries: { ...existing.entries } }
        : { projectId, revision, startedAt: new Date().toISOString(), updatedAt: '', entries: {} };
      mutator(run);
      run.updatedAt = new Date().toISOString();
      return { ...current, runs: { ...current.runs, [runKey]: run } };
    });
  }, []);

  const markItem = useCallback((runKey: string, projectId: string, revision: number, itemId: string, status: ExecutionEntryStatus, reason = '') => {
    mutateRun(runKey, projectId, revision, (run) => {
      run.entries[itemId] = { status, reason, at: new Date().toISOString() };
    });
  }, [mutateRun]);

  const clearEntry = useCallback((runKey: string, projectId: string, revision: number, itemId: string) => {
    mutateRun(runKey, projectId, revision, (run) => {
      delete run.entries[itemId];
    });
  }, [mutateRun]);

  const restartRun = useCallback((runKey: string) => {
    setState((current) => {
      if (!current.runs[runKey]) return current;
      const runs = { ...current.runs };
      delete runs[runKey];
      return { ...current, runs };
    });
  }, []);

  return { executions: state, markItem, clearEntry, restartRun };
}
