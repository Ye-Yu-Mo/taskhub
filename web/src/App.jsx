import React, { useState, useEffect, useRef } from 'react';
import useSWR, { mutate } from 'swr';
import axios from 'axios';
import { 
  Activity, 
  Play, 
  Clock, 
  CheckCircle, 
  XCircle, 
  Terminal, 
  Download, 
  Layers, 
  RefreshCw,
  Cpu,
  Database,
  ChevronRight,
  Home,
  List,
  FileText
} from 'lucide-react';

// --- API UTILS ---
const fetcher = url => axios.get(url).then(res => res.data);

// --- COMPONENTS ---

const StatusBadge = ({ status }) => {
  const colors = {
    RUNNING: 'bg-blue-100 text-blue-800 border-blue-200',
    QUEUED: 'bg-gray-100 text-gray-800 border-gray-200',
    SUCCEEDED: 'bg-green-100 text-green-800 border-green-200',
    FAILED: 'bg-red-100 text-red-800 border-red-200',
    CANCELED: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  };
  
  const labels = {
    RUNNING: '运行中',
    QUEUED: '排队中',
    SUCCEEDED: '成功',
    FAILED: '失败',
    CANCELED: '已取消',
  };

  const icons = {
    RUNNING: <RefreshCw className="w-3 h-3 animate-spin mr-1" />,
    QUEUED: <Clock className="w-3 h-3 mr-1" />,
    SUCCEEDED: <CheckCircle className="w-3 h-3 mr-1" />,
    FAILED: <XCircle className="w-3 h-3 mr-1" />,
    CANCELED: <XCircle className="w-3 h-3 mr-1" />,
  };
  
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${colors[status] || 'bg-gray-100'}`}>
      {icons[status]}
      {labels[status] || status}
    </span>
  );
};

const SectionHeader = ({ title, rightContent }) => (
  <div className="flex justify-between items-center mb-4 border-b pb-2">
    <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">{title}</h2>
    <div>{rightContent}</div>
  </div>
);

// 2. Page Components

const Dashboard = ({ runs, tasks, navigate }) => {
  const activeRuns = runs.filter(r => r.status === 'RUNNING').length;
  const successCount = runs.filter(r => r.status === 'SUCCEEDED').length;
  const successRate = runs.length > 0 ? ((successCount / runs.length) * 100).toFixed(1) : '0.0';
  
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">仪表盘 (Dashboard)</h1>
      
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded border shadow-sm">
          <div className="text-gray-500 text-xs uppercase font-bold tracking-wider">活跃任务 (Active)</div>
          <div className="text-3xl font-mono font-semibold mt-1 text-blue-600">{activeRuns}</div>
        </div>
        <div className="bg-white p-4 rounded border shadow-sm">
          <div className="text-gray-500 text-xs uppercase font-bold tracking-wider">任务总数 (Total)</div>
          <div className="text-3xl font-mono font-semibold mt-1">{tasks.length}</div>
        </div>
        <div className="bg-white p-4 rounded border shadow-sm">
          <div className="text-gray-500 text-xs uppercase font-bold tracking-wider">成功率 (Success Rate)</div>
          <div className="text-3xl font-mono font-semibold mt-1 text-green-600">{successRate}%</div>
        </div>
        <div className="bg-white p-4 rounded border shadow-sm">
          <div className="text-gray-500 text-xs uppercase font-bold tracking-wider">运行总数 (Runs)</div>
          <div className="text-3xl font-mono font-semibold mt-1 text-purple-600">{runs.length}</div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-white rounded border shadow-sm">
        <div className="px-4 py-3 border-b bg-gray-50 flex justify-between items-center">
          <h3 className="font-semibold text-gray-700">近期活动</h3>
          <button onClick={() => navigate('runs')} className="text-xs text-blue-600 hover:underline">查看全部</button>
        </div>
        <div className="divide-y">
          {runs.slice(0, 5).map(run => (
            <div key={run.run_id} onClick={() => navigate('run_detail', { id: run.run_id })} className="px-4 py-2 hover:bg-blue-50 cursor-pointer flex items-center justify-between text-sm">
              <div className="flex items-center gap-3">
                <StatusBadge status={run.status} />
                <span className="font-mono text-gray-600">{run.run_id}</span>
                <span className="font-medium text-gray-900">{tasks.find(t => t.task_id === run.task_id)?.name || run.task_id}</span>
              </div>
              <div className="text-gray-400 text-xs">
                {new Date(run.created_at).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const TaskList = ({ tasks, onRunClick }) => {
  return (
    <div className="space-y-4">
      <SectionHeader title="任务列表 (Task Registry)" />
      <div className="bg-white border rounded shadow-sm overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">任务名称 / ID</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">版本</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">状态</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">并发限制</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {tasks.map(task => (
              <tr key={task.task_id} className="hover:bg-gray-50">
                <td className="px-4 py-3 whitespace-nowrap">
                  <div className="text-sm font-medium text-gray-900">{task.name}</div>
                  <div className="text-xs font-mono text-gray-500">{task.task_id}</div>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">
                    {task.version}
                  </span>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <div className={`text-sm ${task.is_enabled ? 'text-green-600' : 'text-gray-400'}`}>
                     {task.is_enabled ? '● 已启用' : '○ 已禁用'}
                  </div>
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 font-mono">
                  {task.concurrency_limit || '∞'}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium">
                  <button 
                    onClick={() => onRunClick(task)}
                    className="text-white bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded-md text-xs transition-colors flex items-center ml-auto gap-1"
                  >
                    <Play size={12} /> 运行
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const RunList = ({ runs, tasks, navigate }) => {
  const [filterStatus, setFilterStatus] = useState('ALL');
  
  const filteredRuns = runs.filter(r => filterStatus === 'ALL' || r.status === filterStatus);

  return (
    <div className="space-y-4">
      <SectionHeader 
        title="运行历史 (History)" 
        rightContent={
          <select 
            className="border text-sm rounded px-2 py-1 bg-white"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <option value="ALL">所有状态</option>
            <option value="RUNNING">运行中</option>
            <option value="QUEUED">排队中</option>
            <option value="SUCCEEDED">成功</option>
            <option value="FAILED">失败</option>
          </select>
        }
      />
      
      <div className="bg-white border rounded shadow-sm overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200 table-fixed">
          <thead className="bg-gray-50">
            <tr>
              <th className="w-32 px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">运行 ID</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">任务</th>
              <th className="w-24 px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">状态</th>
              <th className="w-24 px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">耗时</th>
              <th className="w-32 px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">创建时间</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredRuns.map(run => (
              <tr 
                key={run.run_id} 
                className="hover:bg-blue-50 cursor-pointer transition-colors"
                onClick={() => navigate('run_detail', { id: run.run_id })}
              >
                <td className="px-4 py-2 whitespace-nowrap text-xs font-mono text-blue-600 font-medium">
                  {run.run_id}
                </td>
                <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900 truncate">
                  {tasks.find(t => t.task_id === run.task_id)?.name || run.task_id}
                </td>
                <td className="px-4 py-2 whitespace-nowrap">
                  <StatusBadge status={run.status} />
                </td>
                <td className="px-4 py-2 whitespace-nowrap text-xs text-gray-500 font-mono">
                  {run.duration || '-'}
                </td>
                <td className="px-4 py-2 whitespace-nowrap text-right text-xs text-gray-400">
                  {new Date(run.created_at).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const LogViewer = ({ runId, status }) => {
  const bottomRef = useRef(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [logs, setLogs] = useState([]);

  // Fetch logs logic needs to be implemented in backend first (GET /api/runs/:id/events)
  // For now, we just show a placeholder or basic stream simulation if you had SSE
  // We'll leave it as a placeholder for "Events/Logs" since we haven't implemented log streaming API fully in schemas.py yet (only EventsRead)
  
  return (
    <div className="flex flex-col h-full bg-gray-900 text-gray-200 font-mono text-xs rounded-lg overflow-hidden border border-gray-700">
      <div className="flex items-center justify-between px-3 py-1 bg-gray-800 border-b border-gray-700 text-xs">
        <span className="flex items-center gap-2">
          <Terminal size={12} /> 日志输出 (Logs) - [WIP: Backend Log Stream]
        </span>
        <div className="flex gap-2">
          <label className="flex items-center gap-1 cursor-pointer select-none">
            <input 
              type="checkbox" 
              checked={autoScroll} 
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="rounded bg-gray-700 border-gray-600 text-blue-500 focus:ring-0 w-3 h-3"
            />
            <span className="text-gray-400 text-[10px] uppercase">自动滚动</span>
          </label>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-1">
        <div className="text-gray-500 italic">日志流功能正在开发中...</div>
        {status === 'RUNNING' && <div className="animate-pulse text-gray-500">_</div>}
        <div ref={bottomRef} />
      </div>
    </div>
  );
};

const ArtifactsViewer = ({ runId }) => {
  const { data: artifacts, error } = useSWR(runId ? `/api/runs/${runId}/artifacts` : null, fetcher);

  if (error) return <div className="text-red-500">加载产物失败</div>;
  if (!artifacts) return <div className="text-gray-500">加载中...</div>;
  if (artifacts.items.length === 0) return <div className="text-gray-500 italic">暂无产物</div>;

  const handleDownload = (fileId) => {
    window.open(`/api/runs/${runId}/files/${fileId}`, '_blank');
  };

  return (
    <div className="grid grid-cols-1 gap-4">
      {artifacts.items.map((art) => (
        <div key={art.artifact_id} className="border rounded p-4 flex items-center justify-between bg-white hover:bg-gray-50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gray-100 rounded text-gray-500">
              {art.kind === 'image' ? <Layers size={16} /> : 
               art.kind === 'table' || art.mime === 'text/csv' ? <Database size={16} /> :
               <FileText size={16} />}
            </div>
            <div>
              <div className="font-medium text-sm text-blue-600 hover:underline cursor-pointer" onClick={() => handleDownload(art.file_id)}>
                {art.title}
              </div>
              <div className="text-xs text-gray-500">
                {art.size_bytes ? `${(art.size_bytes / 1024).toFixed(1)} KB` : '未知大小'} • {art.kind.toUpperCase()}
              </div>
            </div>
          </div>
          <button 
            onClick={() => handleDownload(art.file_id)}
            className="text-gray-400 hover:text-gray-600 flex items-center gap-1 text-xs"
          >
            <Download size={14} /> 下载
          </button>
        </div>
      ))}
    </div>
  );
};

const RunDetail = ({ runId, onNavigateBack }) => {
  const { data: run, error: runError } = useSWR(runId ? `/api/runs/${runId}` : null, fetcher, { refreshInterval: 2000 });
  const { data: tasks } = useSWR('/api/tasks', fetcher);
  
  const [activeTab, setActiveTab] = useState('overview');
  const [events, setEvents] = useState([]);
  const [cursor, setCursor] = useState(0);

  // 增量获取事件
  useEffect(() => {
    if (!runId || (run && run.status !== 'RUNNING' && run.status !== 'QUEUED' && events.length > 0)) {
        return;
    }

    const fetchEvents = async () => {
      try {
        const res = await axios.get(`/api/runs/${runId}/events?cursor=${cursor}`);
        if (res.data.items.length > 0) {
          setEvents(prev => [...prev, ...res.data.items]);
          setCursor(res.data.next_cursor);
        }
      } catch (e) {
        console.error("Fetch events failed", e);
      }
    };

    const timer = setInterval(fetchEvents, 1000);
    return () => clearInterval(timer);
  }, [runId, cursor, run?.status]);

  if (runError) return <div>加载失败</div>;
  if (!run) return <div>加载中...</div>;

  const task = tasks?.find(t => t.task_id === run.task_id) || { name: run.task_id };
  
  // 计算当前进度
  const latestProgress = [...events].reverse().find(e => e.type === 'progress');
  const progressPct = latestProgress ? latestProgress.data.pct : (run.status === 'SUCCEEDED' ? 100 : 0);

  const tabNames = {
    logs: '日志',
    overview: '概览',
    artifacts: '产物'
  };

  const handleCancel = async () => {
    try {
      await axios.post(`/api/runs/${run.run_id}/cancel`);
      mutate(`/api/runs/${run.run_id}`);
    } catch (e) {
      alert('取消失败');
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex-none bg-white border-b px-6 py-4">
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
          <span onClick={onNavigateBack} className="hover:text-blue-600 cursor-pointer">运行列表</span>
          <ChevronRight size={14} />
          <span>{run.run_id}</span>
        </div>
        <div className="flex justify-between items-start">
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
              {task.name}
              <StatusBadge status={run.status} />
            </h1>
            <div className="text-sm text-gray-500 mt-1 font-mono flex gap-4">
              <span>ID: {run.run_id}</span>
              <span>耗时: {run.duration || '-'}</span>
            </div>
            
            {/* 进度条 */}
            {(run.status === 'RUNNING' || progressPct > 0) && (
              <div className="mt-4 w-full max-w-md bg-gray-200 rounded-full h-1.5 overflow-hidden">
                <div 
                  className="bg-blue-600 h-full transition-all duration-500" 
                  style={{ width: `${progressPct}%` }}
                ></div>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            {(run.status === 'RUNNING' || run.status === 'QUEUED') && (
              <button 
                onClick={handleCancel}
                className="px-3 py-1.5 bg-red-50 text-red-600 border border-red-200 rounded text-sm font-medium hover:bg-red-100"
              >
                取消执行
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex-none bg-white border-b px-6">
        <div className="flex gap-6">
          {['overview', 'logs', 'artifacts'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab 
                  ? 'border-blue-500 text-blue-600' 
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tabNames[tab]}
            </button>
          ))}
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-hidden p-6 bg-gray-50">
        {activeTab === 'logs' && (
           <div className="flex flex-col h-full bg-gray-900 text-gray-200 font-mono text-xs rounded-lg overflow-hidden border border-gray-700">
             <div className="px-3 py-1 bg-gray-800 border-b border-gray-700 flex justify-between">
               <span>事件日志 (Events)</span>
               <span className="text-gray-500">Count: {events.length}</span>
             </div>
             <div className="flex-1 overflow-y-auto p-3 space-y-1">
               {events.map((evt, idx) => (
                 <div key={idx} className="break-all">
                   <span className="text-gray-500 mr-2">[{new Date(evt.ts).toLocaleTimeString()}]</span>
                   <span className="text-blue-400 mr-2">[{evt.type}]</span>
                   <span>{JSON.stringify(evt.data)}</span>
                 </div>
               ))}
               {run.status === 'RUNNING' && <div className="animate-pulse text-gray-500">_</div>}
             </div>
           </div>
        )}
        {activeTab === 'overview' && (
          <div className="bg-white border rounded p-6 max-w-3xl overflow-auto h-full">
             <h3 className="font-bold text-gray-800 mb-4">运行参数 (Run Parameters)</h3>
             <pre className="bg-gray-50 p-4 rounded text-sm font-mono border">
               {JSON.stringify(run.params, null, 2)}
             </pre>
             <h3 className="font-bold text-gray-800 mt-6 mb-4">系统信息 (System Info)</h3>
             <div className="grid grid-cols-1 gap-2 text-sm">
                <div className="flex justify-between border-b py-2">
                    <span className="text-gray-500">Worker ID</span>
                    <span className="font-mono">{run.lease_owner || '-'}</span>
                </div>
                <div className="flex justify-between border-b py-2">
                    <span className="text-gray-500">Exit Code</span>
                    <span className="font-mono">{run.exit_code}</span>
                </div>
                <div className="flex justify-between border-b py-2">
                    <span className="text-gray-500">Error</span>
                    <span className="font-mono text-red-500">{run.error || '-'}</span>
                </div>
             </div>
          </div>
        )}
        {activeTab === 'artifacts' && (
           <ArtifactsViewer runId={run.run_id} />
        )}
      </div>
    </div>
  );
};

const RunModal = ({ task, isOpen, onClose, onSubmit }) => {
  if (!isOpen || !task) return null;

  const [formData, setFormData] = useState({});
  const properties = task.params_schema?.properties || {};

  useEffect(() => {
    // Populate defaults
    const defaults = {};
    Object.entries(properties).forEach(([key, conf]) => {
        defaults[key] = conf.default;
    });
    setFormData(defaults);
  }, [task]);

  const handleChange = (key, val) => {
    // Basic type conversion
    const conf = properties[key];
    if (conf.type === 'integer' || conf.type === 'number') {
        setFormData(prev => ({ ...prev, [key]: Number(val) }));
    } else {
        setFormData(prev => ({ ...prev, [key]: val }));
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg overflow-hidden">
        <div className="px-6 py-4 border-b flex justify-between items-center bg-gray-50">
          <div>
            <h3 className="text-lg font-bold text-gray-900">运行: {task.name}</h3>
            <p className="text-xs text-gray-500 font-mono">{task.task_id}</p>
          </div>
          <button onClick={onClose}><XCircle className="text-gray-400 hover:text-gray-600" /></button>
        </div>
        
        <div className="p-6 space-y-4">
          {Object.entries(properties).map(([key, config]) => (
            <div key={key}>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {key} <span className="text-gray-400 font-normal">({config.type})</span>
              </label>
              {config.enum ? (
                <select 
                  className="w-full border rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  value={formData[key] || ''}
                  onChange={(e) => handleChange(key, e.target.value)}
                >
                  {config.enum.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              ) : (
                <input 
                  type={(config.type === 'integer' || config.type === 'number') ? 'number' : 'text'}
                  className="w-full border rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none font-mono"
                  value={formData[key] || ''}
                  onChange={(e) => handleChange(key, e.target.value)}
                />
              )}
            </div>
          ))}
          
          <div className="mt-4 pt-4 border-t">
            <label className="block text-xs font-bold text-gray-500 uppercase mb-2">JSON 预览</label>
            <div className="bg-gray-800 text-green-400 p-3 rounded text-xs font-mono">
              {JSON.stringify(formData, null, 2)}
            </div>
          </div>
        </div>

        <div className="bg-gray-50 px-6 py-4 flex justify-end gap-3 border-t">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">取消</button>
          <button 
            onClick={() => onSubmit(task.task_id, formData)}
            className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 shadow-sm"
          >
            确认运行
          </button>
        </div>
      </div>
    </div>
  );
};

// 3. Main App Layout & Logic

export default function App() {
  const [route, setRoute] = useState('dashboard'); // dashboard, tasks, runs, run_detail
  const [routeParams, setRouteParams] = useState({});
  
  // Data Fetching
  const { data: tasks, error: tasksError } = useSWR('/api/tasks', fetcher);
  const { data: runs, error: runsError, mutate: mutateRuns } = useSWR('/api/runs', fetcher, { refreshInterval: 5000 });
  
  // Modal State
  const [isRunModalOpen, setIsRunModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);

  // --- NAVIGATION HELPERS ---
  const navigate = (newRoute, params = {}) => {
    setRoute(newRoute);
    setRouteParams(params);
  };

  // --- ACTIONS ---
  const handleOpenRunModal = (task) => {
    setSelectedTask(task);
    setIsRunModalOpen(true);
  };

  const handleSubmitRun = async (taskId, params) => {
    try {
      const res = await axios.post(`/api/tasks/${taskId}/runs`, { params });
      mutateRuns(); // refresh list
      setIsRunModalOpen(false);
      navigate('run_detail', { id: res.data.run_id });
    } catch (e) {
      console.error(e);
      alert("启动失败: " + e.message);
    }
  };

  // --- RENDER ---
  
  if (!tasks || !runs) return <div className="p-8 text-gray-500">正在连接 TaskHub API...</div>;

  const renderContent = () => {
    switch(route) {
      case 'dashboard':
        return <Dashboard runs={runs} tasks={tasks} navigate={navigate} />;
      case 'tasks':
        return <TaskList tasks={tasks} onRunClick={handleOpenRunModal} />;
      case 'runs':
        return <RunList runs={runs} tasks={tasks} navigate={navigate} />;
      case 'run_detail':
        return <RunDetail runId={routeParams.id} onNavigateBack={() => navigate('runs')} />;
      default:
        return <div>Not Found</div>;
    }
  };

  return (
    <div className="flex h-screen bg-gray-100 font-sans text-gray-900">
      {/* Sidebar */}
      <div className="w-64 bg-gray-900 text-gray-400 flex flex-col flex-none">
        <div className="h-16 flex items-center px-6 text-white font-bold text-xl tracking-tight border-b border-gray-800">
          <Cpu className="mr-2 text-blue-500" /> TaskHub
        </div>
        
        <nav className="flex-1 p-4 space-y-1">
          <button 
            onClick={() => navigate('dashboard')}
            className={`flex items-center w-full px-3 py-2 rounded-md transition-colors ${route === 'dashboard' ? 'bg-gray-800 text-white' : 'hover:bg-gray-800 hover:text-white'}`}
          >
            <Home size={18} className="mr-3" /> 仪表盘 (Dashboard)
          </button>
          <button 
             onClick={() => navigate('tasks')}
             className={`flex items-center w-full px-3 py-2 rounded-md transition-colors ${route === 'tasks' ? 'bg-gray-800 text-white' : 'hover:bg-gray-800 hover:text-white'}`}
          >
            <List size={18} className="mr-3" /> 任务列表 (Tasks)
          </button>
          <button 
             onClick={() => navigate('runs')}
             className={`flex items-center w-full px-3 py-2 rounded-md transition-colors ${['runs', 'run_detail'].includes(route) ? 'bg-gray-800 text-white' : 'hover:bg-gray-800 hover:text-white'}`}
          >
            <Activity size={18} className="mr-3" /> 运行历史 (Runs)
          </button>
        </nav>

        <div className="p-4 border-t border-gray-800 text-xs">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
            系统在线
          </div>
          <div className="text-gray-600">v0.1.0-alpha</div>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className="flex-1 overflow-auto p-8">
           {renderContent()}
        </div>
      </main>

      {/* Modals */}
      <RunModal 
        task={selectedTask} 
        isOpen={isRunModalOpen} 
        onClose={() => setIsRunModalOpen(false)}
        onSubmit={handleSubmitRun}
      />
    </div>
  );
}