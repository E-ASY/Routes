import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import Map from './components/map';
import WorkerSelector from './components/worker_selector';
import Legend from './components/legend';
import AuthGuard from './components/auth/guard';

const App: React.FC = () => {
  const [workers, setWorkers] = useState<string[]>([]);

  return (
    <div className="App">
      <AuthGuard >
        <WorkerSelector onFilterChange={setWorkers} />
        <Legend workers={workers} />
        <Map workers={workers} />
      </AuthGuard>
    </div>
  );
};

const container = document.getElementById('root');
const root = createRoot(container!);
root.render(<App />);