# Multi-Agent Team Collaboration System

A hierarchical multi-agent system where different AI models collaborate at different organizational levels (Strategic / Management / Execution) with structured communication protocols, automated GitHub logging, and a real-time web dashboard.

## Architecture

```
L1 Strategic │ Claude Opus 4     │ Director (final decisions, conflict resolution)
L2 Management│ Sonnet 4 + GPT-4o │ PM + Creative Lead (coordination, decomposition)
L3 Execution │ DeepSeek + Gemini │ Developer + Data Analyst + QA (task execution)
             │ + Haiku           │
```

## Quick Start

```bash
# Install dependencies
npm install

# Run the demo (no API keys needed - uses mock responses in Phase 1)
npm run demo

# Start the API server
npm run dev
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/agents` | List all agents with status |
| GET | `/api/messages?limit=50` | Message history |
| GET | `/api/stats` | System statistics |
| POST | `/api/messages` | Send a message between agents |

### POST /api/messages

```json
{
  "from": "strategic-director",
  "to": "project-manager",
  "type": "task",
  "content": "Build the monitoring dashboard",
  "metadata": { "priority": "high" }
}
```

## Communication Rules

- **Same level** → free communication
- **Cross-layer** → automatically logged to GitHub
- **Skip-layer** (L1↔L3 direct) → logged + flagged
- **Conflicts** → escalated up the chain, upper level decides

## Project Status

- [x] Phase 1: Core Engine (MessageBus, RoleRegistry, Agents, SQLite, Demo)
- [ ] Phase 2: GitHub Logger (git commit integration)
- [ ] Phase 3: API Server (full CRUD + WebSocket)
- [ ] Phase 4: Web Dashboard (React + D3.js)
- [ ] Phase 5: Full Model Support (5 providers)
- [ ] Phase 6: Conflict Resolution
- [ ] Phase 7: Plugin System
