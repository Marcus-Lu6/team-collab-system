/**
 * Demo: Multi-Agent Team Collaboration
 *
 * Simulates a full L1 → L2 → L3 conversation flow:
 * 1. Strategic Director issues a directive to PM
 * 2. PM decomposes and delegates to Developer
 * 3. Developer executes and reports back
 * 4. PM consolidates and reports to Director
 */

import { Orchestrator } from './core/orchestrator.js';
import { StrategicAgent } from './agents/strategic.js';
import { ManagerAgent } from './agents/manager.js';
import { ExecutorAgent } from './agents/executor.js';

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Multi-Agent Team Collaboration System - Phase 1 Demo');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Initialize the system
  const orchestrator = new Orchestrator();
  orchestrator.initialize();

  console.log('\n───────────────────────────────────────────────────────────');
  console.log('  Step 1: Strategic Director issues directive to PM');
  console.log('───────────────────────────────────────────────────────────\n');

  // L1 → L2: Strategic directive
  const directive = orchestrator.sendMessage(
    'strategic-director',
    'project-manager',
    'task',
    'Build a real-time monitoring dashboard for our agent system. Priority: high. Deadline: 2 weeks.',
    { priority: 'high', tags: ['dashboard', 'monitoring'] }
  );

  if ('error' in directive) {
    console.error('Failed to send directive:', directive.error);
    return;
  }
  console.log(`✉️ Directive sent: ${directive.id}`);

  // Process: PM receives and delegates to L3
  console.log('\n───────────────────────────────────────────────────────────');
  console.log('  Step 2: PM processes directive and delegates to Developer');
  console.log('───────────────────────────────────────────────────────────\n');

  await orchestrator.runUntilIdle(3);

  console.log('\n───────────────────────────────────────────────────────────');
  console.log('  Step 3: Developer executes task');
  console.log('───────────────────────────────────────────────────────────\n');

  await orchestrator.runUntilIdle(3);

  // Simulate a cross-layer query: L3 → L1 (will be logged)
  console.log('\n───────────────────────────────────────────────────────────');
  console.log('  Step 4: Developer escalates a blocker (L3 → L2 → L1)');
  console.log('───────────────────────────────────────────────────────────\n');

  const escalation = orchestrator.sendMessage(
    'developer',
    'project-manager',
    'escalation',
    'Need strategic decision: Should we use WebSocket or SSE for real-time updates? Both have trade-offs for our scale.',
    { priority: 'high', tags: ['architecture-decision'] }
  );

  if (!('error' in escalation)) {
    console.log(`⚡ Escalation sent: ${escalation.id}`);
  }

  await orchestrator.runUntilIdle(5);

  // Simulate peer communication: L3 → L3
  console.log('\n───────────────────────────────────────────────────────────');
  console.log('  Step 5: Developer queries Data Analyst (peer L3 → L3)');
  console.log('───────────────────────────────────────────────────────────\n');

  const peerQuery = orchestrator.sendMessage(
    'developer',
    'data-analyst',
    'query',
    'What metrics should the dashboard display? Need top 5 most important KPIs.',
  );

  if (!('error' in peerQuery)) {
    console.log(`🔄 Peer query sent: ${peerQuery.id}`);
  }

  await orchestrator.runUntilIdle(3);

  // Print final stats
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  Final System Stats');
  console.log('═══════════════════════════════════════════════════════════\n');

  const stats = orchestrator.getStats();
  console.log(`  Agents:              ${stats.agents}`);
  console.log(`  Total Messages:      ${stats.dbStats.totalMessages}`);
  console.log(`  Cross-Layer Messages: ${stats.dbStats.crossLayerMessages}`);
  console.log(`  Tasks Created:       ${stats.dbStats.totalTasks}`);
  console.log(`  Tasks Completed:     ${stats.dbStats.completedTasks}`);
  console.log(`  GitHub Buffer:       ${stats.githubBuffer} pending`);

  // Show message history
  console.log('\n───────────────────────────────────────────────────────────');
  console.log('  Message Flow Summary');
  console.log('───────────────────────────────────────────────────────────\n');

  const history = orchestrator.getMessageHistory(20);
  for (const msg of history) {
    const cross = msg.crossLayer ? '🔴' : '🟢';
    const time = new Date(msg.timestamp).toLocaleTimeString();
    console.log(`  ${cross} ${time} [${msg.type.padEnd(10)}] ${msg.from.roleId} → ${msg.to.roleId}`);
    console.log(`     ${msg.content.slice(0, 80)}${msg.content.length > 80 ? '...' : ''}`);
    console.log();
  }

  // Cleanup
  await orchestrator.shutdown();
  console.log('\n✅ Demo complete!');
}

main().catch(console.error);
