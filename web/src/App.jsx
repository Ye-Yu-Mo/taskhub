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

// --- API CONFIGURATION ---
// Set base URL to /new_system to avoid conflicts with FuturesLiveStats API
// axios.defaults.baseURL = '/new_system';

// --- API UTILS ---
const fetcher = url => axios.get(url).then(res => {
  if (typeof res.data === 'string' && res.data.includes('<!doctype html>')) {
    console.error('API received HTML instead of JSON for:', url);
    throw new Error('API Endpoint not found (HTML returned)');
  }
  return res.data;
});

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

// --- REPORT COMPONENTS ---

const CsvCard = ({ runId, fileId, title }) => {
  const [content, setContent] = useState(null);
  const [loading, setLoading] = useState(true);
  const fileUrl = `/api/runs/${runId}/files/${fileId}`;

  useEffect(() => {
    axios.get(fileUrl, { responseType: 'text' })
      .then(res => setContent(res.data))
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, [fileUrl]);

  if (loading) return <div className="h-32 bg-gray-50 animate-pulse rounded border"></div>;
  if (!content) return null;

  const rows = content.trim().split('\n').slice(0, 6).map(r => r.split(',')); // 只显示前6行

  return (
    <div className="bg-white border rounded shadow-sm overflow-hidden flex flex-col">
      <div className="px-3 py-2 border-b bg-gray-50 font-medium text-sm flex justify-between items-center">
        <span className="truncate">{title}</span>
        <a href={fileUrl} target="_blank" download className="text-blue-600 hover:text-blue-800"><Download size={14}/></a>
      </div>
      <div className="overflow-x-auto p-2">
        <table className="min-w-full text-xs text-left text-gray-600">
          <thead>
            <tr className="border-b">
              {rows[0]?.map((h, i) => <th key={i} className="py-1 px-2 font-semibold bg-gray-50">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.slice(1).map((row, i) => (
              <tr key={i} className="border-b last:border-0 hover:bg-gray-50">
                {row.map((c, j) => <td key={j} className="py-1 px-2 truncate max-w-[150px]">{c}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="bg-gray-50 px-3 py-1 text-xs text-gray-400 text-center border-t">
        CSV 预览 (前 {rows.length} 行)
      </div>
    </div>
  );
};

const ReportPage = ({ runId, onBack }) => {
  const { data: artifacts } = useSWR(runId ? `/api/runs/${runId}/artifacts` : null, fetcher);

  if (!artifacts) return <div className="p-8 text-center text-gray-500">正在生成报告...</div>;
  if (artifacts.items.length === 0) return (
    <div className="flex flex-col items-center justify-center h-full text-gray-400">
      <div className="text-4xl mb-4">📭</div>
      <div>暂无产物数据</div>
      <button onClick={onBack} className="mt-4 text-blue-600 hover:underline">返回详情</button>
    </div>
  );

  // 分类
  const images = artifacts.items.filter(a => a.kind === 'image' || a.path?.match(/\.(png|jpg|jpeg|gif|svg|webp)$/i));
  const tables = artifacts.items.filter(a => a.mime === 'text/csv' || a.path?.endsWith('.csv'));
  const htmls = artifacts.items.filter(a => a.path?.endsWith('.html'));
  const others = artifacts.items.filter(a => !images.includes(a) && !tables.includes(a) && !htmls.includes(a));

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4 flex items-center justify-between sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="text-gray-500 hover:text-gray-800 p-1 rounded hover:bg-gray-100">
             <ChevronRight className="rotate-180" size={20} />
          </button>
          <h1 className="text-xl font-bold text-gray-900">运行报告 (Report)</h1>
          <span className="px-2 py-0.5 bg-blue-100 text-blue-800 text-xs rounded-full font-mono">{runId}</span>
        </div>
        <div className="text-sm text-gray-500">
          共 {artifacts.items.length} 个产物
        </div>
      </div>

      <div className="p-8 space-y-8 max-w-7xl mx-auto w-full">
        
        {/* HTML Reports (First Class) */}
        {htmls.length > 0 && (
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2"><FileText size={18}/> 网页报告</h3>
            <div className="grid grid-cols-1 gap-6">
              {htmls.map(h => (
                <div key={h.artifact_id} className="bg-white rounded shadow-sm border overflow-hidden h-[600px]">
                   <div className="bg-gray-50 px-4 py-2 border-b text-sm font-medium flex justify-between">
                     <span>{h.title}</span>
                     <a href={`/api/runs/${runId}/files/${h.file_id}`} target="_blank" className="text-blue-600 hover:underline">全屏打开</a>
                   </div>
                   <iframe 
                     src={`/api/runs/${runId}/files/${h.file_id}`} 
                     className="w-full h-full border-0" 
                     sandbox="allow-scripts allow-same-origin"
                   />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Charts / Images */}
        {images.length > 0 && (
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2"><Layers size={18}/> 图表与图片</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {images.map(img => (
                <div key={img.artifact_id} className="bg-white rounded border shadow-sm p-2 hover:shadow-md transition-shadow">
                  <div className="aspect-video bg-gray-50 rounded mb-2 flex items-center justify-center overflow-hidden cursor-pointer">
                    <img 
                      src={`/api/runs/${runId}/files/${img.file_id}`} 
                      alt={img.title} 
                      className="object-contain w-full h-full hover:scale-105 transition-transform duration-300"
                      onClick={() => window.open(`/api/runs/${runId}/files/${img.file_id}`, '_blank')}
                    />
                  </div>
                  <div className="px-2 pb-1 text-sm font-medium text-gray-700 truncate" title={img.title}>{img.title}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Data Tables */}
        {tables.length > 0 && (
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2"><Database size={18}/> 数据预览</h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {tables.map(t => (
                <CsvCard key={t.artifact_id} runId={runId} fileId={t.file_id} title={t.title} />
              ))}
            </div>
          </div>
        )}

        {/* Other Files */}
        {others.length > 0 && (
          <div className="space-y-4">
             <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2"><FileText size={18}/> 其他文件</h3>
             <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {others.map(o => (
                  <div key={o.artifact_id} className="bg-white border p-3 rounded flex items-center gap-3 shadow-sm hover:shadow-md">
                    <div className="bg-gray-100 p-2 rounded text-gray-500"><Download size={16}/></div>
                    <div className="overflow-hidden">
                      <div className="text-sm font-medium text-gray-900 truncate">{o.title}</div>
                      <a href={`/api/runs/${runId}/files/${o.file_id}`} download className="text-xs text-blue-600 hover:underline">点击下载</a>
                    </div>
                  </div>
                ))}
             </div>
          </div>
        )}
      </div>
    </div>
  );
};

// 2. Page Components

const PreviewPage = ({ runId, fileId, onBack }) => {
  const { data: artifacts } = useSWR(runId ? `/api/runs/${runId}/artifacts` : null, fetcher);
  const [content, setContent] = useState(null);
  const [loading, setLoading] = useState(false);

  // 找到对应的 artifact 元数据
  const artifact = artifacts?.items?.find(a => a.file_id === fileId);
  const fileUrl = `/api/runs/${runId}/files/${fileId}`;

  useEffect(() => {
    if (!artifact) return;
    
    // 如果是文本类(CSV/Log/Text)，预取内容
    if (artifact.mime === 'text/csv' || artifact.kind === 'text') {
      setLoading(true);
      axios.get(fileUrl, { responseType: 'text' })
        .then(res => setContent(res.data))
        .catch(err => console.error(err))
        .finally(() => setLoading(false));
    }
  }, [artifact, fileUrl]);

  if (!artifacts) return <div className="p-8 text-center">加载元数据...</div>;
  if (!artifact) return <div className="p-8 text-center text-red-500">文件不存在</div>;

  const renderContent = () => {
    // 图片
    if (artifact.kind === 'image' || artifact.path?.match(/\.(png|jpg|jpeg|gif|svg|webp)$/i)) {
      return (
        <div className="flex justify-center items-center h-full bg-gray-100 rounded border">
           <img src={fileUrl} alt={artifact.title} className="max-w-full max-h-[80vh] object-contain shadow-lg" />
        </div>
      );
    }
    
    // HTML
    if (artifact.path?.endsWith('.html')) {
       return (
         <iframe 
           src={fileUrl} 
           className="w-full h-[80vh] border rounded bg-white" 
           title="Preview"
           sandbox="allow-scripts" 
         />
       );
    }

    // CSV
    if (artifact.mime === 'text/csv' || artifact.path?.endsWith('.csv')) {
       if (loading) return <div className="text-gray-500 animate-pulse">正在解析 CSV...</div>;
       if (!content) return <div className="text-gray-400">无内容</div>;
       
       const rows = content.trim().split('\n').map(row => row.split(','));
       return (
         <div className="overflow-auto border rounded max-h-[80vh]">
           <table className="min-w-full divide-y divide-gray-200 text-sm">
             <thead className="bg-gray-50 sticky top-0">
               <tr>
                 {rows[0]?.map((header, i) => (
                   <th key={i} className="px-4 py-2 text-left font-medium text-gray-500 uppercase tracking-wider border-r last:border-r-0">
                     {header}
                   </th>
                 ))}
               </tr>
             </thead>
             <tbody className="bg-white divide-y divide-gray-200 font-mono">
               {rows.slice(1).map((row, i) => (
                 <tr key={i} className="hover:bg-blue-50">
                   {row.map((cell, j) => (
                     <td key={j} className="px-4 py-2 whitespace-nowrap border-r last:border-r-0 text-gray-700">
                       {cell}
                     </td>
                   ))}
                 </tr>
               ))}
             </tbody>
           </table>
           <div className="p-2 text-xs text-gray-400 bg-gray-50 border-t">
             显示前 {rows.length} 行
           </div>
         </div>
       );
    }

    // 默认 fallback
    return (
      <div className="flex flex-col items-center justify-center h-64 bg-gray-50 border rounded border-dashed">
        <div className="text-gray-500 mb-4">该文件类型暂不支持预览</div>
        <a 
          href={fileUrl} 
          target="_blank" 
          download 
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center gap-2"
        >
          <Download size={16} /> 下载查看
        </a>
      </div>
    );
  };

  return (
    <div className="space-y-4 h-full flex flex-col">
       <div className="flex items-center gap-4 border-b pb-4">
          <button onClick={onBack} className="text-gray-500 hover:text-gray-800 flex items-center gap-1 text-sm">
            <ChevronRight className="rotate-180" size={16} /> 返回详情
          </button>
          <h1 className="text-xl font-bold text-gray-900">{artifact.title}</h1>
          <div className="ml-auto flex gap-2">
             <a 
               href={fileUrl} 
               target="_blank" 
               download 
               className="px-3 py-1.5 border rounded text-sm hover:bg-gray-50 flex items-center gap-2 text-gray-600"
             >
               <Download size={14} /> 下载原始文件
             </a>
          </div>
       </div>
       <div className="flex-1 overflow-hidden">
          {renderContent()}
       </div>
    </div>
  );
};

const WorkerList = () => {
  const { data: workers, error } = useSWR('/api/workers', fetcher, { refreshInterval: 3000 });

  if (error) return <div className="text-red-500">加载节点失败</div>;
  if (!workers) return <div className="text-gray-500">加载节点中...</div>;

  return (
    <div className="space-y-4">
      <SectionHeader title="计算节点 (Compute Nodes)" rightContent={
        <div className="text-sm text-gray-500">共 {workers.length} 个节点在线</div>
      } />
      
      {workers.length === 0 ? (
        <div className="bg-white border rounded p-8 text-center text-gray-400">
          暂无活跃节点，请检查 Worker 进程是否启动
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {workers.map(w => (
            <div key={w.id} className="bg-white border rounded shadow-sm flex flex-col relative overflow-hidden transition-all hover:shadow-md">
              <div className={`absolute top-0 left-0 w-1.5 h-full ${w.status === 'BUSY' ? 'bg-green-500' : 'bg-gray-300'}`}></div>
              
              <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
                 <div className="font-mono text-xs text-gray-500 truncate max-w-[120px]" title={w.id}>{w.id.split('-').pop()}</div>
                 <span className={`text-xs px-2 py-0.5 rounded font-bold ${w.status === 'BUSY' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                    {w.status}
                 </span>
              </div>
              
              <div className="p-4 flex-1 space-y-3">
                 <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">PID</span>
                    <span className="font-mono">{w.pid}</span>
                 </div>
                 <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">Host</span>
                    <span className="font-mono truncate max-w-[100px]" title={w.hostname}>{w.hostname}</span>
                 </div>
                 <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">Heartbeat</span>
                    <span className="text-xs text-gray-400">{new Date(w.last_heartbeat).toLocaleTimeString()}</span>
                 </div>
                 
                 {w.status === 'BUSY' && (
                   <div className="mt-2 pt-2 border-t">
                     <div className="text-xs text-gray-500 mb-1">正在执行</div>
                     <div className="text-xs font-mono bg-blue-50 text-blue-700 p-1.5 rounded truncate" title={w.run_id}>
                       {w.run_id}
                     </div>
                   </div>
                 )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const Dashboard = ({ runs, tasks, navigate }) => {
  const activeRuns = runs.filter(r => r.status === 'RUNNING').length;
  const successCount = runs.filter(r => r.status === 'SUCCEEDED').length;
  const successRate = runs.length > 0 ? ((successCount / runs.length) * 100).toFixed(1) : '0.0';
  
  // Dashboard 仍然获取 workers 数量用于展示 Stats，但不展示列表
  const { data: workers } = useSWR('/api/workers', fetcher, { refreshInterval: 10000 });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">仪表盘 (Dashboard)</h1>
      
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded border shadow-sm">
          <div className="text-gray-500 text-xs uppercase font-bold tracking-wider">活跃任务 (Active)</div>
          <div className="text-3xl font-mono font-semibold mt-1 text-blue-600">{activeRuns}</div>
        </div>
        <div className="bg-white p-4 rounded border shadow-sm cursor-pointer hover:bg-gray-50 transition-colors" onClick={() => navigate('workers')}>
          <div className="text-gray-500 text-xs uppercase font-bold tracking-wider">计算节点 (Workers)</div>
          <div className="text-3xl font-mono font-semibold mt-1 text-orange-600">{workers?.length || 0}</div>
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

      {/* Worker Nodes */}
      {workers && workers.length > 0 && (
        <div className="bg-white rounded border shadow-sm">
          <div className="px-4 py-3 border-b bg-gray-50 flex justify-between items-center">
            <h3 className="font-semibold text-gray-700">系统节点状态</h3>
            <button onClick={() => navigate('workers')} className="text-xs text-blue-600 hover:underline">查看详细</button>
          </div>
          <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
            {workers.map(w => (
              <div key={w.id} className="border rounded p-2 flex flex-col gap-1 relative overflow-hidden bg-gray-50/50">
                <div className={`absolute top-0 left-0 w-1 h-full ${w.status === 'BUSY' ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                <div className="flex justify-between items-center pl-2">
                  <span className="font-mono text-[10px] text-gray-500 truncate" title={w.id}>{w.id.split('-').pop()}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${w.status === 'BUSY' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                    {w.status}
                  </span>
                </div>
                {w.status === 'BUSY' ? (
                  <div className="pl-2 text-[10px] text-blue-600 font-mono truncate">
                    {w.run_id}
                  </div>
                ) : (
                  <div className="pl-2 text-[10px] text-gray-400 italic">IDLE</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const TaskList = ({ tasks, onRunClick, onScheduleClick }) => {
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
                <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium flex justify-end gap-2">
                  <button 
                    onClick={() => onScheduleClick(task)}
                    className="text-gray-600 hover:text-blue-600 hover:bg-blue-50 border px-3 py-1 rounded-md text-xs transition-colors flex items-center gap-1"
                  >
                    <Clock size={12} /> 定时
                  </button>
                  <button 
                    onClick={() => onRunClick(task)}
                    className="text-white bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded-md text-xs transition-colors flex items-center gap-1"
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

const RunList = ({ tasks, navigate }) => {
  const [filterTask, setFilterTask] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  
  // 构建查询 URL
  const queryParams = new URLSearchParams({ limit: 50 });
  if (filterTask) queryParams.append('task_id', filterTask);
  if (filterStatus) queryParams.append('status', filterStatus);
  
  const { data: runs, error } = useSWR(`/api/runs?${queryParams.toString()}`, fetcher, { refreshInterval: 5000 });

  if (error) return <div className="text-red-500">加载失败</div>;
  if (!runs) return <div className="text-gray-500">加载中...</div>;

  return (
    <div className="space-y-4">
      <SectionHeader 
        title="运行历史 (History)" 
        rightContent={
          <div className="flex gap-2">
            <select 
              className="border text-sm rounded px-2 py-1 bg-white min-w-[120px]"
              value={filterTask}
              onChange={(e) => setFilterTask(e.target.value)}
            >
              <option value="">所有任务</option>
              {tasks.map(t => (
                <option key={t.task_id} value={t.task_id}>{t.name}</option>
              ))}
            </select>
            <select 
              className="border text-sm rounded px-2 py-1 bg-white"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <option value="">所有状态</option>
              <option value="RUNNING">运行中</option>
              <option value="QUEUED">排队中</option>
              <option value="SUCCEEDED">成功</option>
              <option value="FAILED">失败</option>
              <option value="CANCELED">已取消</option>
            </select>
          </div>
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
            {runs.length === 0 ? (
              <tr>
                <td colSpan="5" className="px-4 py-8 text-center text-gray-400 text-sm">
                  没有找到符合条件的记录
                </td>
              </tr>
            ) : (
              runs.map(run => (
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
              ))
            )}
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

const ArtifactsViewer = ({ runId, onPreview }) => {
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
              <div 
                className="font-medium text-sm text-blue-600 hover:underline cursor-pointer flex items-center gap-2" 
                onClick={() => onPreview(art.file_id)}
              >
                {art.title} <span className="text-xs text-gray-400 font-normal no-underline">(点击预览)</span>
              </div>
              <div className="text-xs text-gray-500">
                {art.size_bytes ? `${(art.size_bytes / 1024).toFixed(1)} KB` : '未知大小'} • {art.kind.toUpperCase()}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <button 
              onClick={() => onPreview(art.file_id)}
              className="text-gray-500 hover:text-blue-600 px-2 py-1 border rounded text-xs transition-colors"
            >
              预览
            </button>
            <button 
              onClick={() => handleDownload(art.file_id)}
              className="text-gray-500 hover:text-gray-800 px-2 py-1 border rounded text-xs flex items-center gap-1 transition-colors"
            >
              <Download size={14} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};

const RunDetail = ({ runId, onNavigateBack, onNavigatePreview, onNavigateReport }) => {
  const { data: run, error: runError } = useSWR(runId ? `/api/runs/${runId}` : null, fetcher, { refreshInterval: 1000 });
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

    const timer = setInterval(fetchEvents, 500);
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
            <button 
               onClick={onNavigateReport}
               className="px-3 py-1.5 bg-blue-600 text-white border border-blue-600 rounded text-sm font-medium hover:bg-blue-700 shadow-sm flex items-center gap-2"
            >
               <Layers size={14} /> 查看完整报告
            </button>
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
           <ArtifactsViewer runId={run.run_id} onPreview={onNavigatePreview} />
        )}
      </div>
    </div>
  );
};

const CronList = ({ navigate }) => {
  const { data: crons, error, mutate } = useSWR('/api/cron', fetcher);
  const { data: tasks } = useSWR('/api/tasks', fetcher);

  const handleDelete = async (cronId) => {
    if(!confirm('确定删除该定时任务吗？')) return;
    await axios.delete(`/api/cron/${cronId}`);
    mutate();
  };

  const handleTrigger = async (cronId) => {
    try {
      await axios.post(`/api/cron/${cronId}/trigger`);
      alert('任务已触发，请在运行历史中查看。');
      navigate('runs');
    } catch (e) {
      alert('触发失败: ' + (e.response?.data?.detail || e.message));
    }
  };

  if (error) return <div className="text-red-500">加载失败</div>;
  if (!crons || !tasks) return <div className="text-gray-500">加载中...</div>;

  return (
    <div className="space-y-4">
      <SectionHeader title="定时任务 (Cron Jobs)" />
      <div className="bg-white border rounded shadow-sm overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cron 表达式</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">任务</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">状态</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">下次运行</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {crons.length === 0 ? (
               <tr><td colSpan="5" className="px-4 py-8 text-center text-gray-400 text-sm">暂无定时任务</td></tr>
            ) : crons.map(job => (
              <tr key={job.cron_id} className="hover:bg-gray-50">
                <td className="px-4 py-3 whitespace-nowrap font-mono text-sm text-blue-600 font-bold">
                  {job.cron_expression}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <div className="text-sm font-medium text-gray-900">{tasks.find(t => t.task_id === job.task_id)?.name || job.task_id}</div>
                  <div className="text-xs text-gray-400">{job.cron_id}</div>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                   <span className={`px-2 py-0.5 rounded text-xs font-bold ${job.is_enabled ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'}`}>
                     {job.is_enabled ? 'ACTIVE' : 'DISABLED'}
                   </span>
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                  {job.next_run_at ? new Date(job.next_run_at).toLocaleString() : '-'}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium flex justify-end gap-2">
                  <button onClick={() => handleTrigger(job.cron_id)} className="text-blue-600 hover:text-blue-900 text-xs flex items-center gap-1 border px-2 py-1 rounded hover:bg-blue-50">
                    <Play size={12} /> 立即运行
                  </button>
                  <button onClick={() => handleDelete(job.cron_id)} className="text-red-600 hover:text-red-900 text-xs flex items-center gap-1 border px-2 py-1 rounded hover:bg-red-50">
                    删除
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

const TaskModal = ({ task, isOpen, onClose, onSubmit, mode = 'run' }) => {
  if (!isOpen || !task) return null;

  const [formData, setFormData] = useState({});
  const [cronExpression, setCronExpression] = useState('*/15 * * * *');
  const [cronMode, setCronMode] = useState('simple'); // 'simple' | 'advanced'
  
  // Simple Mode State
  const [simpleType, setSimpleType] = useState('interval'); // 'interval', 'daily', 'weekly'
  const [intervalVal, setIntervalVal] = useState(15);
  const [intervalUnit, setIntervalUnit] = useState('minute'); // 'minute', 'hour'
  const [timeVal, setTimeVal] = useState('09:00');
  const [weekDay, setWeekDay] = useState('1'); // 1=Mon

  const properties = task.params_schema?.properties || {};

  useEffect(() => {
    // Populate defaults
    const defaults = {};
    Object.entries(properties).forEach(([key, conf]) => {
        if (conf.default !== undefined) {
             defaults[key] = conf.default;
        } else if (conf.type === 'boolean') {
             defaults[key] = false;
        } else if (conf.type === 'array') {
             defaults[key] = [];
        }
    });
    setFormData(defaults);
  }, [task]);

  // Cron Generator Logic
  useEffect(() => {
    if (mode !== 'cron' || cronMode !== 'simple') return;

    let expr = '';
    const timeParts = (timeVal || '00:00').split(':');
    const hh = parseInt(timeParts[0], 10) || 0;
    const mm = parseInt(timeParts[1], 10) || 0;
    
    switch (simpleType) {
      case 'interval':
        if (intervalUnit === 'minute') {
           expr = `*/${intervalVal} * * * *`;
        } else {
           expr = `0 */${intervalVal} * * *`;
        }
        break;
      case 'daily':
        expr = `${mm} ${hh} * * *`;
        break;
      case 'weekly':
        expr = `${mm} ${hh} * * ${weekDay}`;
        break;
    }
    setCronExpression(expr);
  }, [simpleType, intervalVal, intervalUnit, timeVal, weekDay, cronMode, mode]);

  const handleChange = (key, val, type) => {
    let finalVal = val;
    if (type === 'integer' || type === 'number') {
        finalVal = val === '' ? 0 : Number(val);
    } else if (type === 'boolean') {
        finalVal = val;
    } else if (type === 'array') {
        if (Array.isArray(val)) {
            finalVal = val;
        } else {
            finalVal = val.split(',').map(s => s.trim()).filter(s => s);
        }
    }
    setFormData(prev => ({ ...prev, [key]: finalVal }));
  };

  const renderInput = (key, config) => {
    // ... (Same input render logic)
    if (config.enum || (config.allOf && config.allOf[0]?.enum)) { 
      const options = config.enum || config.allOf[0].enum;
      return (
        <select 
          className="w-full border rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white"
          value={formData[key] || ''}
          onChange={(e) => handleChange(key, e.target.value, 'string')}
        >
          {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
        </select>
      );
    }
    if (config.type === 'boolean') {
        return (
            <div className="flex items-center h-9">
                <input 
                    type="checkbox"
                    className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                    checked={!!formData[key]}
                    onChange={(e) => handleChange(key, e.target.checked, 'boolean')}
                />
                <span className="ml-2 text-sm text-gray-500">Enable</span>
            </div>
        );
    }
    if (config.type === 'integer' || config.type === 'number') {
        return (
            <input 
              type="number"
              step={config.type === 'integer' ? "1" : "0.01"}
              className="w-full border rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none font-mono"
              value={formData[key] !== undefined ? formData[key] : ''}
              onChange={(e) => handleChange(key, e.target.value, config.type)}
            />
        );
    }
    if (config.type === 'array') {
        const values = Array.isArray(formData[key]) ? formData[key] : [];
        const handleKeyDown = (e) => {
            if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                const val = e.target.value.trim();
                if (val && !values.includes(val)) handleChange(key, [...values, val], 'array');
                e.target.value = '';
            } else if (e.key === 'Backspace' && !e.target.value && values.length > 0) {
                handleChange(key, values.slice(0, -1), 'array');
            }
        };
        const removeTag = (idx) => handleChange(key, values.filter((_, i) => i !== idx), 'array');
        return (
            <div className="w-full border rounded px-2 py-1.5 text-sm focus-within:ring-2 focus-within:ring-blue-500 bg-white min-h-[38px] flex flex-wrap gap-2">
                {values.map((v, i) => (
                    <span key={i} className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full text-xs flex items-center gap-1">
                        {v} <button onClick={() => removeTag(i)} className="hover:text-blue-900 font-bold">×</button>
                    </span>
                ))}
                <input type="text" className="flex-1 outline-none min-w-[60px] bg-transparent" placeholder={values.length===0?"输入后回车...":""} onKeyDown={handleKeyDown} 
                  onBlur={(e) => {
                     const val = e.target.value.trim();
                     if (val && !values.includes(val)) { handleChange(key, [...values, val], 'array'); e.target.value = ''; }
                  }}
                />
            </div>
        );
    }
    return (
        <input 
          type="text"
          className="w-full border rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          value={formData[key] || ''}
          onChange={(e) => handleChange(key, e.target.value, 'string')}
        />
    );
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg overflow-hidden max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b flex justify-between items-center bg-gray-50 flex-none">
          <div>
            <h3 className="text-lg font-bold text-gray-900">{mode === 'cron' ? '新建计划任务' : '运行任务'}: {task.name}</h3>
            <p className="text-xs text-gray-500 font-mono">{task.task_id}</p>
          </div>
          <button onClick={onClose}><XCircle className="text-gray-400 hover:text-gray-600" /></button>
        </div>
        
        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          {mode === 'cron' && (
             <div className="bg-blue-50 p-4 rounded border border-blue-100 mb-4">
               <div className="flex gap-4 mb-3 border-b border-blue-200 pb-2">
                  <button onClick={() => setCronMode('simple')} className={`text-sm font-bold ${cronMode==='simple' ? 'text-blue-800' : 'text-blue-400 hover:text-blue-600'}`}>简易模式</button>
                  <button onClick={() => setCronMode('advanced')} className={`text-sm font-bold ${cronMode==='advanced' ? 'text-blue-800' : 'text-blue-400 hover:text-blue-600'}`}>高级模式 (Cron)</button>
               </div>

               {cronMode === 'simple' ? (
                 <div className="space-y-3">
                    <div className="flex gap-2">
                       {['interval', 'daily', 'weekly'].map(t => (
                          <button 
                            key={t}
                            onClick={() => setSimpleType(t)}
                            className={`flex-1 py-1 text-xs rounded border ${simpleType === t ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-blue-600 border-blue-200'}`}
                          >
                            {{'interval': '间隔循环', 'daily': '每天', 'weekly': '每周'}[t]}
                          </button>
                       ))}
                    </div>
                    
                    {simpleType === 'interval' && (
                       <div className="flex items-center gap-2">
                          <span className="text-sm text-blue-900">每隔</span>
                          <input type="number" min="1" value={intervalVal} onChange={e => setIntervalVal(e.target.value)} className="w-16 border rounded px-2 py-1 text-sm text-center" />
                          <select value={intervalUnit} onChange={e => setIntervalUnit(e.target.value)} className="border rounded px-2 py-1 text-sm bg-white">
                             <option value="minute">分钟</option>
                             <option value="hour">小时</option>
                          </select>
                          <span className="text-sm text-blue-900">执行一次</span>
                       </div>
                    )}
                    
                    {(simpleType === 'daily' || simpleType === 'weekly') && (
                        <div className="flex items-center gap-2">
                           <span className="text-sm text-blue-900">时间:</span>
                           <input type="time" value={timeVal} onChange={e => setTimeVal(e.target.value)} className="border rounded px-2 py-1 text-sm bg-white" />
                        </div>
                    )}

                    {simpleType === 'weekly' && (
                        <div className="flex items-center gap-2">
                           <span className="text-sm text-blue-900">星期:</span>
                           <select value={weekDay} onChange={e => setWeekDay(e.target.value)} className="border rounded px-2 py-1 text-sm bg-white">
                              <option value="1">周一</option>
                              <option value="2">周二</option>
                              <option value="3">周三</option>
                              <option value="4">周四</option>
                              <option value="5">周五</option>
                              <option value="6">周六</option>
                              <option value="0">周日</option>
                           </select>
                        </div>
                    )}

                    <div className="text-xs text-blue-600 font-mono mt-2 pt-2 border-t border-blue-200">
                       预览: {cronExpression}
                    </div>
                 </div>
               ) : (
                 <div>
                   <label className="block text-sm font-bold text-blue-800 mb-1">Cron 表达式</label>
                   <input 
                     type="text" 
                     value={cronExpression}
                     onChange={e => setCronExpression(e.target.value)}
                     className="w-full border rounded px-3 py-2 font-mono text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                     placeholder="* * * * *"
                   />
                   <p className="text-xs text-blue-600 mt-1">格式: 分 时 日 月 周 (例如: */5 * * * *)</p>
                 </div>
               )}
             </div>
          )}

          {Object.entries(properties).map(([key, config]) => (
            <div key={key}>
              <div className="flex justify-between mb-1">
                  <label className="block text-sm font-medium text-gray-700">
                    {config.title || key} 
                  </label>
                  <span className="text-xs text-gray-400 font-mono">
                    {config.type}{config.type === 'array' ? '[]' : ''}
                  </span>
              </div>
              {config.description && <p className="text-xs text-gray-500 mb-2">{config.description}</p>}
              {renderInput(key, config)}
            </div>
          ))}
        </div>

        <div className="bg-gray-50 px-6 py-4 flex justify-end gap-3 border-t flex-none">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">取消</button>
          <button 
            onClick={() => onSubmit(task.task_id, formData, cronExpression)}
            className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 shadow-sm"
          >
            {mode === 'cron' ? '创建计划' : '确认运行'}
          </button>
        </div>
      </div>
    </div>
  );
};

// 3. Main App Layout & Logic

export default function App() {
  const [route, setRoute] = useState('dashboard'); // dashboard, tasks, runs, run_detail, cron
  const [routeParams, setRouteParams] = useState({});
  
  // Data Fetching
  const { data: tasks, error: tasksError } = useSWR('/api/tasks', fetcher);
  const { data: runs, error: runsError, mutate: mutateRuns } = useSWR('/api/runs', fetcher, { refreshInterval: 5000 });
  const { mutate: mutateCrons } = useSWR('/api/cron', fetcher);
  
  // Modal State
  const [isRunModalOpen, setIsRunModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('run'); // 'run' | 'cron'
  const [selectedTask, setSelectedTask] = useState(null);

  // --- NAVIGATION HELPERS ---
  const navigate = (newRoute, params = {}) => {
    setRoute(newRoute);
    setRouteParams(params);
  };

  // --- ACTIONS ---
  const handleOpenRunModal = (task) => {
    setSelectedTask(task);
    setModalMode('run');
    setIsRunModalOpen(true);
  };

  const handleOpenCronModal = (task) => {
    setSelectedTask(task);
    setModalMode('cron');
    setIsRunModalOpen(true);
  };

  const handleModalSubmit = async (taskId, params, cronExpression) => {
    try {
      if (modalMode === 'run') {
        const res = await axios.post(`/api/tasks/${taskId}/runs`, { params });
        mutateRuns(); // refresh list
        setIsRunModalOpen(false);
        navigate('run_detail', { id: res.data.run_id });
      } else {
        // Create Cron
        await axios.post('/api/cron', {
          task_id: taskId,
          cron_expression: cronExpression,
          params: params,
          name: `Cron: ${selectedTask.name}`
        });
        mutateCrons();
        setIsRunModalOpen(false);
        navigate('cron');
      }
    } catch (e) {
      console.error(e);
      alert((modalMode === 'run' ? "启动失败: " : "创建失败: ") + (e.response?.data?.detail || e.message));
    }
  };

  // --- RENDER ---
  
  if (!tasks || !runs) return <div className="p-8 text-gray-500">正在连接 TaskHub API...</div>;

  const renderContent = () => {
    switch(route) {
      case 'dashboard':
        return <Dashboard runs={runs} tasks={tasks} navigate={navigate} />;
      case 'tasks':
        return <TaskList tasks={tasks} onRunClick={handleOpenRunModal} onScheduleClick={handleOpenCronModal} />;
      case 'cron':
        return <CronList navigate={navigate} />;
      case 'runs':
        return <RunList tasks={tasks} navigate={navigate} />;
      case 'workers':
        return <WorkerList />;
      case 'run_detail':
        return <RunDetail 
          runId={routeParams.id} 
          onNavigateBack={() => navigate('runs')} 
          onNavigatePreview={(fileId) => navigate('preview', { runId: routeParams.id, fileId })}
          onNavigateReport={() => navigate('report', { runId: routeParams.id })}
        />;
      case 'report':
        return <ReportPage 
          runId={routeParams.runId} 
          onBack={() => navigate('run_detail', { id: routeParams.runId })} 
        />;
      case 'preview':
        return <PreviewPage 
          runId={routeParams.runId} 
          fileId={routeParams.fileId} 
          onBack={() => navigate('run_detail', { id: routeParams.runId })} 
        />;
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
             onClick={() => navigate('cron')}
             className={`flex items-center w-full px-3 py-2 rounded-md transition-colors ${route === 'cron' ? 'bg-gray-800 text-white' : 'hover:bg-gray-800 hover:text-white'}`}
          >
            <Clock size={18} className="mr-3" /> 定时任务 (Cron)
          </button>
          <button 
             onClick={() => navigate('runs')}
             className={`flex items-center w-full px-3 py-2 rounded-md transition-colors ${['runs', 'run_detail'].includes(route) ? 'bg-gray-800 text-white' : 'hover:bg-gray-800 hover:text-white'}`}
          >
            <Activity size={18} className="mr-3" /> 运行历史 (Runs)
          </button>
          <button 
             onClick={() => navigate('workers')}
             className={`flex items-center w-full px-3 py-2 rounded-md transition-colors ${route === 'workers' ? 'bg-gray-800 text-white' : 'hover:bg-gray-800 hover:text-white'}`}
          >
            <Cpu size={18} className="mr-3" /> 计算节点 (Nodes)
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
      <TaskModal 
        task={selectedTask} 
        isOpen={isRunModalOpen} 
        onClose={() => setIsRunModalOpen(false)}
        onSubmit={handleModalSubmit}
        mode={modalMode}
      />
    </div>
  );
}