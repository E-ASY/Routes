import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../index.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import Map from './components/map';
import WorkerSelector from './components/worker_selector';
import MunicipalitySelector from './components/municipality_selector';
import Legend from './components/legend';
import AuthGuard from './components/auth/guard';

console.log('App component initialized');
const App: React.FC = () => {
  console.log('Rendering App component');
  const [municipalities, setMunicipalities] = useState<string[]>([]);
  const [workers, setWorkers] = useState<string[]>([]);

  return (
    <div className="App">
      <AuthGuard>
        <MunicipalitySelector
          onFilterChange={setMunicipalities}
        />
        <WorkerSelector
          onFilterChange={setWorkers}
          municipalities={municipalities}
        />
        <Legend workers={workers} />
        <Map workers={workers} />
      </AuthGuard>
    </div>
  );
};

const container = document.getElementById('root');
const root = createRoot(container!);
root.render(<App />);
