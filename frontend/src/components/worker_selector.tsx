import React, { useState, useEffect, useMemo } from 'react';
import Select, { MultiValue } from 'react-select';
import { mapsService } from '../services/map_service';

interface WorkerOption {
  label: string;
  value: string;
}

interface WorkerSelectorProps {
  selectedIds: string[];
  onFilterChange: (selectedWorkers: string[]) => void;
}

const WorkerSelector: React.FC<WorkerSelectorProps> = ({ selectedIds, onFilterChange }) => {
  const [options, setOptions] = useState<WorkerOption[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [warning, setWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    mapsService
      .getWorkers()
      .then((workers) => {
        if (cancelled) return;
        const workerOptions: WorkerOption[] = workers.map((worker) => ({
          value: worker.id.toString(),
          label: `${worker.name || ''} ${worker.ape_1 || ''} ${worker.ape_2 || ''} (${worker.cif || ''})`,
        }));
        setOptions(workerOptions);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('Error al cargar trabajadores:', err);
        setError('Error al cargar la lista de trabajadores');
        setOptions([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const selectedOptions = useMemo(
    () => options.filter((option) => selectedIds.includes(option.value)),
    [options, selectedIds]
  );

  const handleSelectChange = (newValue: MultiValue<WorkerOption>) => {
    if (newValue.length > 12) {
      setWarning('Máximo 12 trabajadoras.');
      return;
    }
    setWarning(null);
    onFilterChange(newValue.map((option) => option.value));
  };

  const formatOptionLabel = (option: WorkerOption) => (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <span>{option.label}</span>
    </div>
  );

  return (
    <div className="WorkerSelector-container">
      <Select
        options={options}
        isMulti
        isLoading={isLoading}
        isSearchable
        placeholder={isLoading ? 'Cargando trabajadoras...' : 'Selecciona trabajadoras...'}
        noOptionsMessage={() => error || 'No hay trabajadoras disponibles'}
        formatOptionLabel={formatOptionLabel}
        className="basic-multi-select"
        classNamePrefix="select"
        onChange={handleSelectChange}
        value={selectedOptions}
        menuPortalTarget={typeof document !== 'undefined' ? document.body : null}
        menuPosition="fixed"
        styles={{ menuPortal: (base) => ({ ...base, zIndex: 1500 }) }}
      />
      {warning && <p className="warning-message">{warning}</p>}
      {error && <p className="error-message">{error}</p>}
    </div>
  );
};

export default WorkerSelector;
