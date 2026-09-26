import { useEffect, useMemo, useState } from 'react';
import { Badge, Button, Callout, Card, Flex, Heading, Progress, Select, Text, TextArea } from '@radix-ui/themes';
import { runKey, useRunStore } from './runs';
import type { ChecklistItem, ChecklistProject } from './types';

interface RunPanelProps {
  project: ChecklistProject;
  revisionId: string;
  onRevisionChange: (id: string) => void;
  runStore: ReturnType<typeof useRunStore>;
}

export function RunPanel({ project, revisionId, onRevisionChange, runStore }: RunPanelProps) {
  const revision = project.revisions.find((entry) => entry.id === revisionId) ?? project.revisions[0];
  const [skipOpen, setSkipOpen] = useState(false);
  const [skipReason, setSkipReason] = useState('');

  const grouped = useMemo(() => {
    if (!revision) return [];
    return revision.stages
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((stage) => ({
        stage,
        items: revision.items.filter((item) => item.stageId === stage.id).sort((a, b) => a.order - b.order)
      }));
  }, [revision]);
  const flatItems = useMemo(() => grouped.flatMap((group) => group.items), [grouped]);
  const itemMap = useMemo(() => new Map((revision?.items ?? []).map((item) => [item.id, item])), [revision]);

  const run = revision ? runStore.runState.runs[runKey(project.id, revision.id)] : undefined;
  const entries = run?.entries ?? {};
  const currentItem = flatItems.find((item) => !entries[item.id]);
  const doneCount = flatItems.filter((item) => entries[item.id]?.status === 'done').length;
  const skippedCount = flatItems.filter((item) => entries[item.id]?.status === 'skipped').length;
  const total = flatItems.length;
  const complete = total > 0 && !currentItem;

  useEffect(() => {
    setSkipOpen(false);
    setSkipReason('');
  }, [currentItem?.id, revision?.id]);

  if (!revision) {
    return (
      <div className="content-page">
        <Heading size="7">执行检查单</Heading>
        <Text color="gray" as="p">执行入口只针对冻结版本，记录按版本单独保存。</Text>
        <div className="empty-page">
          <strong>暂无冻结版本</strong>
          <span>请先在“编辑清单”完成校验，提交复核并冻结后再来执行。</span>
        </div>
      </div>
    );
  }

  const blockedBy = (item: ChecklistItem) =>
    item.preconditionIds
      .map((id) => itemMap.get(id))
      .filter((pre): pre is ChecklistItem => Boolean(pre))
      .filter((pre) => entries[pre.id]?.status !== 'done');

  const confirmCurrent = () => {
    if (currentItem && !blockedBy(currentItem).length) runStore.recordEntry(project, revision, currentItem.id, 'done', '');
  };

  const confirmSkip = () => {
    if (!currentItem || !skipReason.trim()) return;
    runStore.recordEntry(project, revision, currentItem.id, 'skipped', skipReason);
  };

  let sequence = 0;

  return (
    <div className="content-page">
      <Heading size="7">执行检查单</Heading>
      <Text color="gray" as="p">按阶段顺序逐项确认；前置条件未完成会挡住当前项，跳过必须填写原因。记录仅属于所选冻结版本，关闭浏览器后可继续。</Text>

      <Card className="run-header">
        <Flex justify="between" align="center" gap="4" wrap="wrap">
          <div>
            <Heading size="4">{project.name} · r{revision.revision}</Heading>
            <Text size="1" color="gray" as="p">
              冻结于 {new Date(revision.createdAt).toLocaleString('zh-CN')} · {revision.note || '无版本说明'} · 执行记录只保存在 r{revision.revision}
            </Text>
          </div>
          <Select.Root value={revision.id} onValueChange={onRevisionChange}>
            <Select.Trigger variant="soft" aria-label="选择要执行的冻结版本" />
            <Select.Content position="popper">
              {project.revisions.map((entry) => (
                <Select.Item key={entry.id} value={entry.id}>
                  r{entry.revision} · {new Date(entry.createdAt).toLocaleDateString('zh-CN')} · {entry.note || '无说明'}
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Root>
        </Flex>
        <Flex align="center" gap="3" mt="3" wrap="wrap">
          <Progress style={{ flex: 1, minWidth: 220 }} value={total ? ((doneCount + skippedCount) / total) * 100 : 100} color={complete ? 'green' : 'blue'} />
          <Text size="2" weight="bold">已完成 {doneCount} / {total}</Text>
          <Badge color="amber" variant="soft">跳过 {skippedCount}</Badge>
          <Badge color="gray" variant="soft">剩余 {total - doneCount - skippedCount}</Badge>
        </Flex>
        <Flex gap="2" mt="3" align="center" wrap="wrap">
          <Button size="1" variant="soft" disabled={!run?.sequence.length} onClick={() => run && runStore.undoLast(run.key)}>回退一步</Button>
          <Button size="1" variant="soft" color="red" disabled={!run} onClick={() => { if (run && window.confirm('清空本版本的执行记录并重新开始？')) runStore.resetRun(run.key); }}>重新开始</Button>
          {run && <Text size="1" color="gray">开始于 {new Date(run.startedAt).toLocaleString('zh-CN')}</Text>}
          {currentItem && <Text size="1" color="gray">当前：第 {flatItems.indexOf(currentItem) + 1} 项 · {currentItem.challenge || '未命名检查项'}</Text>}
        </Flex>
        {complete && (
          <Callout.Root color="green" mt="3">
            <Callout.Text>本次执行已完成：{doneCount} 项确认、{skippedCount} 项跳过（原因均已记录）。</Callout.Text>
          </Callout.Root>
        )}
      </Card>

      <div className="run-list">
        {grouped.map(({ stage, items }, stageIndex) => (
          <Card key={stage.id} className="stage-card">
            <div className="stage-card-head">
              <span className="sequence-chip">{stageIndex + 1}</span>
              <div className="run-stage-title"><strong>{stage.name}</strong><small>{stage.description}</small></div>
              <Text size="1" color="gray">{items.filter((item) => entries[item.id]).length}/{items.length} 项</Text>
            </div>
            <div className="item-table">
              {items.map((item) => {
                sequence += 1;
                const entry = entries[item.id];
                const state = entry ? entry.status : currentItem?.id === item.id ? 'current' : 'locked';
                const blockers = state === 'current' ? blockedBy(item) : [];
                return (
                  <article key={item.id} className={`run-row run-${state}`}>
                    <span className="run-index">{state === 'done' ? '✓' : state === 'skipped' ? '↷' : String(sequence).padStart(2, '0')}</span>
                    <div className="check-item-copy">
                      <Flex gap="2" align="center" wrap="wrap">
                        <strong>{item.challenge || '未命名检查项'}</strong>
                        {item.critical && <Badge color="red" size="1">关键</Badge>}
                        {item.preconditionIds.length > 0 && <Badge color="blue" size="1">{item.preconditionIds.length} 前置</Badge>}
                        {entry && (
                          <Badge size="1" color={entry.status === 'done' ? 'green' : 'amber'}>
                            {entry.status === 'done' ? '已完成' : '已跳过'} · {new Date(entry.at).toLocaleTimeString('zh-CN')}
                          </Badge>
                        )}
                      </Flex>
                      <span className={`response-preview ${!item.response ? 'missing' : ''}`}>{item.response || '缺少预期回应'}</span>
                      {item.abnormalProcedure && <small>异常：{item.abnormalProcedure}</small>}
                      {entry?.status === 'skipped' && <small className="run-skip-note">跳过原因：{entry.note}</small>}
                      {state === 'current' && (
                        <div className="run-actions">
                          {blockers.length > 0 && (
                            <Callout.Root color="red" size="1">
                              <Callout.Text>
                                前置条件未完成：{blockers.map((pre) => `${pre.challenge || '未命名'}（${entries[pre.id]?.status === 'skipped' ? '已跳过' : '未执行'}）`).join('、')}，完成前无法确认本项。
                              </Callout.Text>
                            </Callout.Root>
                          )}
                          <Flex gap="2" align="center" wrap="wrap">
                            <Button color="green" disabled={blockers.length > 0} onClick={confirmCurrent}>确认完成</Button>
                            <Button color="amber" variant="soft" onClick={() => setSkipOpen((open) => !open)}>跳过本项</Button>
                          </Flex>
                          {skipOpen && (
                            <div className="run-skip-form">
                              <TextArea autoFocus value={skipReason} onChange={(event) => setSkipReason(event.target.value)} placeholder="填写跳过原因（必填），如：设备故障、阶段不适用……" />
                              <Flex gap="2" mt="2">
                                <Button size="1" color="amber" disabled={!skipReason.trim()} onClick={confirmSkip}>记录原因并跳过</Button>
                                <Button size="1" variant="soft" onClick={() => { setSkipOpen(false); setSkipReason(''); }}>取消</Button>
                              </Flex>
                            </div>
                          )}
                        </div>
                      )}
                      {state === 'locked' && <small className="run-locked-hint">等待前序项目完成</small>}
                    </div>
                  </article>
                );
              })}
              {!items.length && <div className="run-empty-stage">本阶段暂无检查项</div>}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
