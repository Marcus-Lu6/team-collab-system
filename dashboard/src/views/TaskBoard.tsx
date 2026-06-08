import { useState, useEffect } from 'react'

const API_URL = 'http://localhost:3000'

interface Task {
  id: string; title: string; description: string; status: string
  assignedTo: string; priority: string; createdAt: string
}

const priorityColors: Record<string, string> = {
  critical: 'text-red-400 bg-red-900/30',
  high: 'text-amber-400 bg-amber-900/30',
  medium: 'text-blue-400 bg-blue-900/30',
  low: 'text-slate-400 bg-slate-700/50',
}

export default function TaskBoard() {
  const [tasks, setTasks] = useState<Task[]>([])

  useEffect(() => {
    fetch(`${API_URL}/api/tasks`).then(r => r.json()).then(setTasks).catch(() => {})
    const interval = setInterval(() => {
      fetch(`${API_URL}/api/tasks`).then(r => r.json()).then(setTasks).catch(() => {})
    }, 5000)
    return () => clearInterval(interval)
  }, [])

  const columns = [
    { status: 'pending', label: 'Pending', color: 'border-slate-500' },
    { status: 'in_progress', label: 'In Progress', color: 'border-blue-500' },
    { status: 'completed', label: 'Completed', color: 'border-green-500' },
  ]

  return (
    <div className="grid grid-cols-3 gap-4 h-[calc(100vh-180px)]">
      {columns.map(col => (
        <div key={col.status} className={`border-t-2 ${col.color} bg-slate-800/30 rounded-lg p-4 overflow-y-auto`}>
          <h3 className="text-sm font-bold text-white mb-3">
            {col.label}
            <span className="ml-2 text-slate-500 font-normal">
              ({tasks.filter(t => t.status === col.status).length})
            </span>
          </h3>
          <div className="space-y-2">
            {tasks.filter(t => t.status === col.status).map(task => (
              <div key={task.id} className="bg-slate-800 border border-slate-700 rounded p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${priorityColors[task.priority] || priorityColors.medium}`}>
                    {task.priority.toUpperCase()}
                  </span>
                  <span className="text-[10px] text-slate-500">{task.assignedTo}</span>
                </div>
                <p className="text-xs text-white font-medium">{task.title}</p>
                {task.description !== task.title && (
                  <p className="text-[11px] text-slate-400 mt-1">{task.description.slice(0, 80)}</p>
                )}
              </div>
            ))}
            {tasks.filter(t => t.status === col.status).length === 0 && (
              <p className="text-xs text-slate-500 text-center py-4">No tasks</p>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
