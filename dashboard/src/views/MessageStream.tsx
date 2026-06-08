import { useState } from 'react'

interface Agent { id: string; role: string; level: string; model: string; status: string }
interface Message {
  id: string; timestamp: string
  from: { agentId: string; roleId: string; level: string }
  to: { agentId: string; roleId: string; level: string }
  type: string; content: string; crossLayer: boolean
}

const typeColors: Record<string, string> = {
  task: 'bg-blue-600',
  response: 'bg-green-600',
  escalation: 'bg-red-600',
  decision: 'bg-amber-600',
  query: 'bg-purple-600',
}

export default function MessageStream({ messages, onSend, agents }: { messages: Message[]; onSend: (from: string, to: string, type: string, content: string) => void; agents: Agent[] }) {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [type, setType] = useState('task')
  const [content, setContent] = useState('')

  const roleIds = agents.map(a => a.role).length > 0
    ? ['strategic-director', 'project-manager', 'creative-lead', 'developer', 'data-analyst', 'qa-engineer']
    : []

  const handleSend = () => {
    if (from && to && content.trim()) {
      onSend(from, to, type, content)
      setContent('')
    }
  }

  return (
    <div className="flex gap-6 h-[calc(100vh-180px)]">
      {/* Message list */}
      <div className="flex-1 overflow-y-auto space-y-2">
        {messages.length === 0 && (
          <p className="text-slate-500 text-center py-12">No messages yet. Send one to get started.</p>
        )}
        {messages.map(msg => (
          <div key={msg.id} className={`p-3 rounded-lg border ${msg.crossLayer ? 'border-amber-700/50 bg-amber-950/20' : 'border-slate-700 bg-slate-800/50'}`}>
            <div className="flex items-center gap-2 mb-1">
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold text-white ${typeColors[msg.type] || 'bg-gray-600'}`}>
                {msg.type.toUpperCase()}
              </span>
              <span className="text-xs text-slate-400">
                <strong className="text-slate-200">{msg.from.roleId}</strong>
                <span className="mx-1">→</span>
                <strong className="text-slate-200">{msg.to.roleId}</strong>
              </span>
              {msg.crossLayer && <span className="text-[10px] text-amber-400 font-medium">CROSS-LAYER</span>}
              <span className="ml-auto text-[10px] text-slate-500">
                {new Date(msg.timestamp).toLocaleTimeString()}
              </span>
            </div>
            <p className="text-sm text-slate-300 leading-relaxed">{msg.content.slice(0, 200)}{msg.content.length > 200 ? '...' : ''}</p>
          </div>
        ))}
      </div>

      {/* Send panel */}
      <div className="w-80 bg-slate-800/50 border border-slate-700 rounded-lg p-4 flex flex-col gap-3">
        <h3 className="text-sm font-bold text-white">Send Message</h3>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-slate-400 uppercase">From</label>
            <select value={from} onChange={e => setFrom(e.target.value)} className="w-full bg-slate-700 text-white text-xs rounded px-2 py-1.5 border border-slate-600">
              <option value="">Select...</option>
              {roleIds.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] text-slate-400 uppercase">To</label>
            <select value={to} onChange={e => setTo(e.target.value)} className="w-full bg-slate-700 text-white text-xs rounded px-2 py-1.5 border border-slate-600">
              <option value="">Select...</option>
              {roleIds.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="text-[10px] text-slate-400 uppercase">Type</label>
          <select value={type} onChange={e => setType(e.target.value)} className="w-full bg-slate-700 text-white text-xs rounded px-2 py-1.5 border border-slate-600">
            {['task', 'query', 'response', 'escalation', 'decision'].map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        <div className="flex-1">
          <label className="text-[10px] text-slate-400 uppercase">Content</label>
          <textarea value={content} onChange={e => setContent(e.target.value)} placeholder="Enter message..."
            className="w-full h-24 bg-slate-700 text-white text-xs rounded px-2 py-1.5 border border-slate-600 resize-none" />
        </div>

        <button onClick={handleSend} disabled={!from || !to || !content.trim()}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white text-sm font-medium rounded px-4 py-2 transition-colors">
          Send Message
        </button>
      </div>
    </div>
  )
}
