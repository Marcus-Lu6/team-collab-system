interface Message {
  id: string; timestamp: string
  from: { agentId: string; roleId: string; level: string }
  to: { agentId: string; roleId: string; level: string }
  type: string; content: string; crossLayer: boolean
}

export default function DecisionLog({ messages }: { messages: Message[] }) {
  if (messages.length === 0) {
    return (
      <div className="text-center py-16 text-slate-500">
        <p className="text-4xl mb-4">⚖️</p>
        <p>No decisions recorded yet.</p>
        <p className="text-xs mt-2">Decisions are created when L1 resolves escalations or makes strategic choices.</p>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <h2 className="text-lg font-bold text-white mb-4">Decision History</h2>
      {messages.map(msg => (
        <div key={msg.id} className="bg-amber-950/20 border border-amber-700/50 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-amber-400 font-bold text-xs">DECISION</span>
              <span className="text-slate-400 text-xs">by {msg.from.roleId} ({msg.from.level})</span>
            </div>
            <span className="text-slate-500 text-xs">{new Date(msg.timestamp).toLocaleString()}</span>
          </div>
          <p className="text-sm text-slate-200">{msg.content}</p>
          <p className="text-xs text-slate-500 mt-2">Directed to: {msg.to.roleId}</p>
        </div>
      ))}
    </div>
  )
}
