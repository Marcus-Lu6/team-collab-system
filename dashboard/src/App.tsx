import { useState, useEffect, useCallback } from 'react'
import { io, Socket } from 'socket.io-client'
import OrgChart from './views/OrgChart'
import MessageStream from './views/MessageStream'
import TaskBoard from './views/TaskBoard'
import DecisionLog from './views/DecisionLog'

const API_URL = 'http://localhost:3000'

interface Agent {
  id: string
  role: string
  level: 'L1' | 'L2' | 'L3'
  model: string
  status: string
}

interface Message {
  id: string
  timestamp: string
  from: { agentId: string; roleId: string; level: string }
  to: { agentId: string; roleId: string; level: string }
  type: string
  content: string
  crossLayer: boolean
  metadata?: Record<string, unknown>
}

interface Stats {
  agents: number
  dbStats: { totalMessages: number; crossLayerMessages: number; totalTasks: number; completedTasks: number }
  githubBuffer: number
  githubCommits: number
  activeTasks: number
}

type Tab = 'org' | 'messages' | 'tasks' | 'decisions'

export default function App() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>('org')
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    const s: Socket = io(API_URL)

    s.on('connect', () => setConnected(true))
    s.on('disconnect', () => setConnected(false))
    s.on('init', (data: { agents: Agent[]; stats: Stats }) => {
      setAgents(data.agents)
      setStats(data.stats)
    })
    s.on('message:sent', (event: { payload: Message }) => {
      setMessages(prev => [event.payload, ...prev].slice(0, 200))
    })

    return () => { s.disconnect() }
  }, [])

  useEffect(() => {
    fetch(`${API_URL}/api/agents`).then(r => r.json()).then(setAgents).catch(() => {})
    fetch(`${API_URL}/api/messages?limit=50`).then(r => r.json()).then(setMessages).catch(() => {})
    fetch(`${API_URL}/api/stats`).then(r => r.json()).then(setStats).catch(() => {})
  }, [])

  useEffect(() => {
    const interval = setInterval(() => {
      fetch(`${API_URL}/api/stats`).then(r => r.json()).then(setStats).catch(() => {})
    }, 5000)
    return () => clearInterval(interval)
  }, [])

  const sendMessage = useCallback(async (from: string, to: string, type: string, content: string) => {
    await fetch(`${API_URL}/api/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, type, content }),
    })
    const msgs = await fetch(`${API_URL}/api/messages?limit=50`).then(r => r.json())
    setMessages(msgs)
    const s = await fetch(`${API_URL}/api/stats`).then(r => r.json())
    setStats(s)
  }, [])

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'org', label: 'Org Chart', icon: '🏢' },
    { id: 'messages', label: 'Messages', icon: '💬' },
    { id: 'tasks', label: 'Tasks', icon: '📋' },
    { id: 'decisions', label: 'Decisions', icon: '⚖️' },
  ]

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-[#1e293b] border-b border-[#475569] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold text-white">Multi-Agent Team</h1>
          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium ${connected ? 'bg-green-900/50 text-green-300' : 'bg-red-900/50 text-red-300'}`}>
            <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`}></span>
            {connected ? 'Live' : 'Offline'}
          </span>
        </div>
        {stats && (
          <div className="flex gap-6 text-sm text-slate-400">
            <span>Agents: <strong className="text-white">{stats.agents}</strong></span>
            <span>Messages: <strong className="text-white">{stats.dbStats.totalMessages}</strong></span>
            <span>Cross-layer: <strong className="text-amber-400">{stats.dbStats.crossLayerMessages}</strong></span>
            <span>Commits: <strong className="text-white">{stats.githubCommits}</strong></span>
          </div>
        )}
      </header>

      {/* Tabs */}
      <nav className="bg-[#1e293b] border-b border-[#475569] px-6">
        <div className="flex gap-1">
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2.5 text-sm font-medium rounded-t transition-colors ${activeTab === tab.id ? 'bg-[#0f172a] text-white border-t border-x border-[#475569]' : 'text-slate-400 hover:text-white'}`}>
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>
      </nav>

      {/* Content */}
      <main className="flex-1 p-6 overflow-auto">
        {activeTab === 'org' && <OrgChart agents={agents} />}
        {activeTab === 'messages' && <MessageStream messages={messages} onSend={sendMessage} agents={agents} />}
        {activeTab === 'tasks' && <TaskBoard />}
        {activeTab === 'decisions' && <DecisionLog messages={messages.filter(m => m.type === 'decision')} />}
      </main>
    </div>
  )
}
