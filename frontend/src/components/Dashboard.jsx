import React, { useState, useEffect, useCallback } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Activity, Sliders, Settings2, BarChart2, Play, HeartPulse } from 'lucide-react';

const Dashboard = () => {
  const [params, setParams] = useState({
    fs: 2000.0,
    duration: 2.0,
    K: 1000.0,
    a: 50.0,
    b: 200.0,
    delay_T: 0.005,
    dist_freq: 20.0,
    noise_amp: 0.05,
    controller_type: 'Hybrid',
    Kp: -1.5,
    Ki: -40.0,
    Kd: -0.001,
    filter_length: 64,
    mu_0: 0.01,
    gamma: 0.0001,
    epsilon: 0.000001
  });

  const [data, setData] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchSimulation = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('http://127.0.0.1:8001/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
      });
      const result = await response.json();
      
      const chartData = result.time.map((t, i) => ({
        time: t,
        disturbance: result.disturbance[i],
        residual: result.residual[i],
        control: result.control_signal[i],
        pid: result.pid_component[i],
        adapt: result.adapt_component[i]
      }));
      
      const maxPoints = 500;
      const step = Math.ceil(chartData.length / maxPoints);
      const decimatedData = chartData.filter((_, i) => i % step === 0);
      
      setData(decimatedData);
      setMetrics(result.metrics);
    } catch (error) {
      console.error("Simulation failed:", error);
    }
    setLoading(false);
  }, [params]);

  useEffect(() => {
    fetchSimulation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); 

  const handleChange = (e) => {
    const { name, value, type } = e.target;
    if (value === '') {
      setParams(prev => ({ ...prev, [name]: '' }));
      return;
    }
    setParams(prev => ({
      ...prev,
      [name]: type === 'number' || type === 'range' ? parseFloat(value) : value
    }));
  };

  const InputGroup = ({ label, name, min, max, step }) => {
    // Basic danger logic for specific sliders
    let isDanger = false;
    if (name === 'dist_freq' && params[name] > 40) isDanger = true;
    if (name === 'delay_T' && params[name] > 0.015) isDanger = true;
    if (name === 'mu_0' && params[name] > 1.0) isDanger = true;

    return (
      <div className="mb-5">
        <div className="flex justify-between items-center mb-2">
          <label className={`text-sm font-semibold ${isDanger ? 'text-red-500' : 'text-slate-600'}`}>
            {label} {isDanger && <span className="text-xs ml-1">⚠️</span>}
          </label>
          <input
            type="number"
            name={name}
            min={min}
            max={max}
            step={step}
            value={params[name]}
            onChange={handleChange}
            className={`w-24 text-right bg-white border ${isDanger ? 'border-red-400 text-red-600' : 'border-slate-300 text-blue-600'} rounded px-2 py-1 text-sm font-mono focus:ring-2 focus:ring-blue-500 outline-none shadow-sm`}
          />
        </div>
        <input
          type="range"
          name={name}
          min={min}
          max={max}
          step={step}
          value={params[name] === '' ? 0 : params[name]}
          onChange={handleChange}
          className={`w-full h-2 rounded-lg appearance-none cursor-pointer ${isDanger ? 'bg-red-200 accent-red-500' : 'bg-slate-200 accent-blue-600'}`}
        />
      </div>
    );
  };

  // Determine Health Status
  let health = { text: 'Unknown', color: 'text-slate-500', bg: 'bg-white', border: 'border-slate-200', icon: '❓' };
  if (metrics) {
    if (metrics.noise_reduction_db > 5) {
      health = { text: 'Good', color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200', icon: '🟢' };
    } else if (metrics.noise_reduction_db > 0) {
      health = { text: 'Moderate', color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200', icon: '🟡' };
    } else {
      health = { text: 'Bad', color: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200', icon: '🔴' };
    }
  }

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 overflow-hidden font-sans">
      <div className="w-[22rem] bg-white border-r border-slate-200 overflow-y-auto flex-shrink-0 p-6 custom-scrollbar shadow-sm z-10 flex flex-col">
        <div className="flex items-center gap-3 mb-8">
          <Activity className="text-blue-600" size={28} />
          <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-cyan-500">ANC Lab</h1>
        </div>

        <button
          onClick={fetchSimulation}
          disabled={loading}
          className="w-full mb-8 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-xl shadow-md flex items-center justify-center gap-2 transition-all disabled:opacity-60 active:scale-95"
        >
          <Play size={18} fill="currentColor" />
          {loading ? 'Simulating...' : 'Run Simulation'}
        </button>

        <div className="space-y-8 flex-1">
          <section>
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-500 mb-4">
              <Settings2 size={16} /> Global Settings
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">Fs (Hz)</label>
                <input type="number" name="fs" min="500" max="5000" step="100" value={params.fs} onChange={handleChange} className="w-full bg-slate-50 border border-slate-200 rounded px-3 py-1.5 text-sm font-mono focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">Time (s)</label>
                <input type="number" name="duration" min="1" max="5" step="0.5" value={params.duration} onChange={handleChange} className="w-full bg-slate-50 border border-slate-200 rounded px-3 py-1.5 text-sm font-mono focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
            </div>
          </section>

          <section>
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-500 mb-4">
              <Sliders size={16} /> Plant Dynamics
            </h2>
            <InputGroup label="Gain (K)" name="K" min="100" max="5000" step="10" />
            <InputGroup label="Pole (a)" name="a" min="10" max="200" step="1" />
            <InputGroup label="Pole (b)" name="b" min="50" max="500" step="1" />
            <InputGroup label="Delay (T) sec" name="delay_T" min="0" max="0.02" step="0.001" />
          </section>

          <section>
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-500 mb-4">
              <Activity size={16} /> Disturbance
            </h2>
            <InputGroup label="Frequency (Hz)" name="dist_freq" min="1" max="50" step="1" />
            <InputGroup label="Noise Amp" name="noise_amp" min="0.01" max="0.2" step="0.01" />
          </section>

          <section className="pb-8">
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-500 mb-4">
              <Settings2 size={16} /> Controller
            </h2>
            <select
              name="controller_type"
              value={params.controller_type}
              onChange={handleChange}
              className="w-full bg-white border border-slate-300 text-sm font-medium text-slate-700 rounded-lg px-4 py-2 mb-6 focus:ring-2 focus:ring-blue-500 outline-none shadow-sm"
            >
              <option value="PID">PID Only</option>
              <option value="FxLMS">FxLMS Adaptive</option>
              <option value="Hybrid">Hybrid (PID + FxLMS)</option>
            </select>

            {(params.controller_type === 'PID' || params.controller_type === 'Hybrid') && (
              <div className="p-4 bg-slate-50/80 rounded-xl border border-slate-200 mb-4 shadow-sm">
                <h3 className="text-xs font-bold text-slate-700 mb-4">PID Tuning</h3>
                <InputGroup label="Proportional (Kp)" name="Kp" min="-5" max="0" step="0.01" />
                <InputGroup label="Integral (Ki)" name="Ki" min="-100" max="0" step="0.1" />
                <InputGroup label="Derivative (Kd)" name="Kd" min="-0.01" max="0" step="0.001" />
              </div>
            )}

            {(params.controller_type === 'FxLMS' || params.controller_type === 'Hybrid') && (
              <div className="p-4 bg-slate-50/80 rounded-xl border border-slate-200 shadow-sm">
                <h3 className="text-xs font-bold text-slate-700 mb-4">Adaptive Tuning</h3>
                <InputGroup label="Filter Length (M)" name="filter_length" min="16" max="128" step="1" />
                <InputGroup label="Step Size (μ₀)" name="mu_0" min="0.01" max="1.0" step="0.01" />
                <InputGroup label="Leakage (γ)" name="gamma" min="0" max="0.001" step="0.0001" />
              </div>
            )}
          </section>
        </div>
      </div>

      <div className="flex-1 flex flex-col min-w-0 bg-slate-50/50 overflow-y-auto">
        <header className="px-8 py-6 border-b border-slate-200 bg-white/80 backdrop-blur sticky top-0 z-10 shadow-sm">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-semibold text-slate-800 tracking-tight">Simulation Dashboard</h2>
            {loading && <div className="animate-pulse text-blue-600 font-medium text-sm">Computing...</div>}
          </div>
          
          <div className="grid grid-cols-4 gap-4">
            <div className={`p-4 rounded-xl border ${health.border} ${health.bg} shadow-sm relative overflow-hidden flex flex-col justify-center transition-colors`}>
               <div className="absolute top-0 right-0 p-3 opacity-10"><HeartPulse size={40} className={health.color} /></div>
               <p className="text-xs text-slate-500 font-semibold mb-1">System Health</p>
               <div className={`text-xl font-bold ${health.color}`}>
                 {health.icon} {health.text}
               </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-3 opacity-5 text-emerald-600"><BarChart2 size={40} /></div>
              <p className="text-xs text-slate-500 font-semibold mb-1">Noise Reduction</p>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold text-emerald-600">
                  {metrics?.noise_reduction_db ? Math.abs(metrics.noise_reduction_db).toFixed(2) : '--'}
                </span>
                <span className="text-xs font-semibold text-slate-400">dB</span>
              </div>
            </div>
            
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-3 opacity-5 text-blue-600"><Activity size={40} /></div>
              <p className="text-xs text-slate-500 font-semibold mb-1">Weight Norm</p>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold text-blue-600">
                  {metrics?.final_weight_norm ? metrics.final_weight_norm.toFixed(4) : '--'}
                </span>
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden group">
               <p className="text-xs text-slate-500 font-semibold mb-1">Active Controller</p>
               <div className="text-xl font-bold text-slate-800 mt-1">
                 {params.controller_type}
               </div>
            </div>
          </div>
        </header>

        <div className="p-8 space-y-8 flex-1">
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-800 mb-6">Time Domain: Disturbance vs Residual</h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="time" stroke="#94a3b8" tick={{fill: '#64748b', fontSize: 12, fontWeight: 500}} 
                         tickFormatter={(val) => val.toFixed(2)} axisLine={{stroke: '#cbd5e1'}} />
                  <YAxis stroke="#94a3b8" tick={{fill: '#64748b', fontSize: 12, fontWeight: 500}} axisLine={{stroke: '#cbd5e1'}} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    itemStyle={{ color: '#1e293b', fontWeight: 500 }}
                    labelStyle={{ color: '#64748b', fontWeight: 600, marginBottom: '4px' }}
                    labelFormatter={(val) => `Time: ${val.toFixed(3)}s`}
                  />
                  <Legend wrapperStyle={{ fontWeight: 500, color: '#475569' }} />
                  <Line type="monotone" dataKey="disturbance" name="Original Disturbance" stroke="#94a3b8" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="residual" name="Residual Error e(n)" stroke="#f43f5e" strokeWidth={2.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-800 mb-6">Control Signal Contributions</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="time" stroke="#94a3b8" tick={{fill: '#64748b', fontSize: 12, fontWeight: 500}} 
                         tickFormatter={(val) => val.toFixed(2)} axisLine={{stroke: '#cbd5e1'}} />
                  <YAxis stroke="#94a3b8" tick={{fill: '#64748b', fontSize: 12, fontWeight: 500}} axisLine={{stroke: '#cbd5e1'}} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    itemStyle={{ color: '#1e293b', fontWeight: 500 }}
                    labelStyle={{ color: '#64748b', fontWeight: 600, marginBottom: '4px' }}
                  />
                  <Legend wrapperStyle={{ fontWeight: 500, color: '#475569' }} />
                  <Line type="monotone" dataKey="control" name="Total u(n)" stroke="#3b82f6" strokeWidth={2.5} dot={false} />
                  {(params.controller_type === 'Hybrid' || params.controller_type === 'PID') && (
                    <Line type="monotone" dataKey="pid" name="PID" stroke="#10b981" strokeWidth={2} strokeDasharray="5 5" dot={false} />
                  )}
                  {(params.controller_type === 'Hybrid' || params.controller_type === 'FxLMS') && (
                    <Line type="monotone" dataKey="adapt" name="Adaptive" stroke="#a855f7" strokeWidth={2} strokeDasharray="5 5" dot={false} />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
