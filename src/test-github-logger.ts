/**
 * Phase 2 Test: GitHub Logger with real git commits
 *
 * Generates 20+ cross-layer messages to trigger batch commit,
 * then verifies the log files exist and git history has the commit.
 */

import { resolve } from 'path';
import { existsSync, readFileSync } from 'fs';
import simpleGit from 'simple-git';
import { Orchestrator } from './core/orchestrator.js';

const REPO_ROOT = resolve(import.meta.dirname, '..');

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Phase 2 Test: GitHub Logger with Real Git Commits');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Delete old DB to start fresh
  const dbPath = resolve(REPO_ROOT, 'data/system.db');
  if (existsSync(dbPath)) {
    const { unlinkSync } = await import('fs');
    unlinkSync(dbPath);
    // Also clean WAL/SHM
    if (existsSync(dbPath + '-wal')) unlinkSync(dbPath + '-wal');
    if (existsSync(dbPath + '-shm')) unlinkSync(dbPath + '-shm');
  }

  // Initialize with autoPush disabled (local test only)
  const orchestrator = new Orchestrator(
    resolve(REPO_ROOT, 'config/system.json'),
    { repoRoot: REPO_ROOT, autoPush: false }
  );
  orchestrator.initialize();

  console.log('\n───────────────────────────────────────────────────────────');
  console.log('  Generating 20+ cross-layer messages...');
  console.log('───────────────────────────────────────────────────────────\n');

  // Generate a bunch of cross-layer messages to trigger batch
  const scenarios = [
    { from: 'strategic-director', to: 'project-manager', type: 'task' as const, content: 'Priority 1: Finalize Q3 product roadmap with key milestones' },
    { from: 'strategic-director', to: 'project-manager', type: 'task' as const, content: 'Priority 2: Conduct competitive analysis of market leaders' },
    { from: 'project-manager', to: 'developer', type: 'task' as const, content: 'Implement user authentication module with OAuth2' },
    { from: 'project-manager', to: 'data-analyst', type: 'task' as const, content: 'Build analytics pipeline for user engagement metrics' },
    { from: 'project-manager', to: 'qa-engineer', type: 'task' as const, content: 'Create test plan for authentication module' },
    { from: 'developer', to: 'project-manager', type: 'response' as const, content: 'Auth module complete: JWT + refresh tokens, 95% coverage' },
    { from: 'data-analyst', to: 'project-manager', type: 'response' as const, content: 'Pipeline ready: DAU, WAU, retention, funnel conversion' },
    { from: 'qa-engineer', to: 'project-manager', type: 'response' as const, content: 'Test plan created: 47 test cases, 12 edge cases identified' },
    { from: 'project-manager', to: 'strategic-director', type: 'response' as const, content: 'Sprint 1 complete: auth module shipped, analytics pipeline live' },
    { from: 'developer', to: 'project-manager', type: 'escalation' as const, content: 'Database migration requires 2h downtime - need approval' },
    { from: 'project-manager', to: 'strategic-director', type: 'escalation' as const, content: 'Team requests 2h maintenance window for database migration' },
    { from: 'strategic-director', to: 'project-manager', type: 'decision' as const, content: 'Approved: Schedule migration for Saturday 2AM UTC' },
    { from: 'project-manager', to: 'developer', type: 'decision' as const, content: 'Migration approved for Saturday 2AM UTC. Proceed with prep.' },
    { from: 'creative-lead', to: 'developer', type: 'task' as const, content: 'Implement new design system components: Button, Card, Modal' },
    { from: 'developer', to: 'creative-lead', type: 'response' as const, content: 'Components implemented with Storybook docs' },
    { from: 'creative-lead', to: 'strategic-director', type: 'query' as const, content: 'Should we support dark mode in v1 or defer to v2?' },
    { from: 'strategic-director', to: 'creative-lead', type: 'decision' as const, content: 'Include dark mode in v1 - key differentiator for launch' },
    { from: 'qa-engineer', to: 'project-manager', type: 'escalation' as const, content: 'Critical bug: payment flow fails on Safari iOS 16' },
    { from: 'project-manager', to: 'developer', type: 'task' as const, content: 'HOTFIX: Payment flow broken on Safari iOS 16 - P0' },
    { from: 'developer', to: 'project-manager', type: 'response' as const, content: 'Hotfix deployed: WebKit date parsing issue, all tests green' },
    { from: 'project-manager', to: 'strategic-director', type: 'response' as const, content: 'P0 resolved in 2h. Root cause: Safari date API quirk.' },
  ];

  let crossLayerCount = 0;
  for (const s of scenarios) {
    const result = orchestrator.sendMessage(s.from, s.to, s.type, s.content, {
      priority: s.type === 'escalation' ? 'high' : 'medium',
    });

    if ('error' in result) {
      console.log(`  ❌ ${s.from} → ${s.to}: ${result.error}`);
    } else {
      const icon = result.crossLayer ? '🔴' : '🟢';
      if (result.crossLayer) crossLayerCount++;
      console.log(`  ${icon} ${s.from} → ${s.to} [${s.type}]`);
    }
  }

  console.log(`\n  Total cross-layer messages: ${crossLayerCount}`);

  // Process all pending work
  console.log('\n───────────────────────────────────────────────────────────');
  console.log('  Processing agent responses...');
  console.log('───────────────────────────────────────────────────────────\n');

  await orchestrator.runUntilIdle(5);

  // Force flush to trigger git commit
  console.log('\n───────────────────────────────────────────────────────────');
  console.log('  Flushing logs to git...');
  console.log('───────────────────────────────────────────────────────────\n');

  await orchestrator.flushLogs();

  // Verify results
  console.log('\n───────────────────────────────────────────────────────────');
  console.log('  Verification');
  console.log('───────────────────────────────────────────────────────────\n');

  const stats = orchestrator.getStats();
  console.log(`  Total messages in DB:      ${stats.dbStats.totalMessages}`);
  console.log(`  Cross-layer in DB:         ${stats.dbStats.crossLayerMessages}`);
  console.log(`  GitHub commits this session: ${stats.githubCommits}`);
  console.log(`  GitHub buffer remaining:   ${stats.githubBuffer}`);

  // Check log file exists
  const today = new Date().toISOString().split('T')[0];
  const month = today.slice(0, 7);
  const logFile = resolve(REPO_ROOT, `logs/${month}/${today}.md`);

  if (existsSync(logFile)) {
    const content = readFileSync(logFile, 'utf-8');
    const lineCount = content.split('\n').length;
    console.log(`\n  ✅ Log file created: logs/${month}/${today}.md (${lineCount} lines)`);

    // Show first few entries
    console.log('\n  Preview (first 20 lines):');
    console.log('  ' + content.split('\n').slice(0, 20).join('\n  '));
  } else {
    console.log(`\n  ❌ Log file NOT found: ${logFile}`);
  }

  // Check git log
  const git = simpleGit(REPO_ROOT);
  const log = await git.log({ maxCount: 5 });
  console.log('\n  Recent git commits:');
  for (const entry of log.all) {
    console.log(`    ${entry.date.slice(0, 19)} | ${entry.message}`);
  }

  // Cleanup
  await orchestrator.shutdown();
  console.log('\n✅ Phase 2 test complete!');
}

main().catch(console.error);
