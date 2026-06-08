interface Agent {
  id: string
  role: string
  level: 'L1' | 'L2' | 'L3'
  model: string
  status: string
}

const levelColors = {
  L1: { bg: 'bg-amber-900/30', border: 'border-amber-500', text: 'text-amber-400', dot: 'bg-amber-400' },
  L2: { bg: 'bg-blue-900/30', border: 'border-blue-500', text: 'text-blue-400', dot: 'bg-blue-400' },
  L3: { bg: 'bg-emerald-900/30', border: 'border-emerald-500', text: 'text-emerald-400', dot: 'bg-emerald-400' },
}

const levelLabels = { L1: 'Strategic', L2: 'Management', L3: 'Execution' }

function AgentCard({ agent }: { agent: Agent }) {
  const colors = levelColors[agent.level]
  return (
    <div className={`${colors.bg} border ${colors.border} rounded-lg p-4 min-w-[200px]`}>
      <div className="flex items-center justify-between mb-2">
        <span className={`text-xs font-bold ${colors.text}`}>{agent.level}</span>
        <span className={`w-2.5 h-2.5 rounded-full ${agent.status === 'idle' ? 'bg-green-400' : agent.status === 'thinking' ? 'bg-yellow-400 animate-pulse' : 'bg-red-400'}`}></span>
      </div>
      <h3 className="text-white font-semibold text-sm">{agent.role}</h3>
      <p className="text-slate-400 text-xs mt-1">{agent.model}</p>
      <p className="text-slate-500 text-xs mt-0.5 capitalize">{agent.status}</p>
    </div>
  )
}

export default function OrgChart({ agents }: { agents: Agent[] }) {
  const l1 = agents.filter(a => a.level === 'L1')
  const l2 = agents.filter(a => a.level === 'L2')
  const l3 = agents.filter(a => a.level === 'L3')

  return (
    <div className="flex flex-col items-center gap-8">
      {/* L1 */}
      <div className="text-center">
        <p className="text-amber-400 text-xs font-bold mb-3 uppercase tracking-wider">{levelLabels.L1}</p>
        <div className="flex justify-center gap-4">
          {l1.map(a => <AgentCard key={a.id} agent={a} />)}
        </div>
      </div>

      {/* Connector */}
      <div className="w-px h-8 bg-slate-600"></div>

      {/* L2 */}
      <div className="text-center">
        <p className="text-blue-400 text-xs font-bold mb-3 uppercase tracking-wider">{levelLabels.L2}</p>
        <div className="flex justify-center gap-4">
          {l2.map(a => <AgentCard key={a.id} agent={a} />)}
        </div>
      </div>

      {/* Connector */}
      <div className="w-px h-8 bg-slate-600"></div>

      {/* L3 */}
      <div className="text-center">
        <p className="text-emerald-400 text-xs font-bold mb-3 uppercase tracking-wider">{levelLabels.L3}</p>
        <div className="flex justify-center gap-4 flex-wrap">
          {l3.map(a => <AgentCard key={a.id} agent={a} />)}
        </div>
      </div>

      {/* Legend */}
      <div className="mt-8 flex gap-6 text-xs text-slate-400">
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-400"></span> Idle</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-yellow-400"></span> Thinking</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-400"></span> Error</span>
      </div>
    </div>
  )
}
