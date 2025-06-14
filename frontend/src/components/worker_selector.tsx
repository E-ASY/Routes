import React, { useState, useEffect } from 'react';
import Select, { MultiValue } from 'react-select';
import { mapsService } from '../services/map_service';

// Interfaz para las opciones de trabajador
interface WorkerOption {
  label: string;     // Nombre completo + CIF para mostrar
  value: string;     // ID del trabajador para enviar a otros componentes
}

interface WorkerSelectorProps {
  onFilterChange: (selectedWorkers: string[]) => void;
  municipalities: string[];
}

const WorkerSelector: React.FC<WorkerSelectorProps> = ({ onFilterChange, municipalities }) => {
  const [selectedOptions, setSelectedOptions] = useState<MultiValue<WorkerOption>>([]);
  const [options, setOptions] = useState<WorkerOption[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [warning, setWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Cargar los trabajadores desde el backend
  useEffect(() => {
    const loadWorkers = async () => {
      if (municipalities.length === 0) {
        setOptions([]);
        setSelectedOptions([]);
        return;
      }

      console.log('Cargando trabajadores para municipios:', municipalities);
      setIsLoading(true);
      setError(null);

      try {
        const workers = await mapsService.getWorkersByMunicipalities(municipalities);
        console.log('Trabajadores filtrados:', workers);

        const workerOptions: WorkerOption[] = workers.map(worker => ({
          value: worker.id.toString(),
          label: `${worker.name || ''} ${worker.ape_1 || ''} ${worker.ape_2 || ''} (${worker.cif || ''})`
        }));

        setOptions(workerOptions);
      } catch (err) {
        console.error('Error al cargar trabajadores:', err);
        setError('Error al cargar la lista de trabajadores');
      } finally {
        setIsLoading(false);
      }
    };

    loadWorkers();
  }, [municipalities]);


  // Pasar los IDs de trabajadores seleccionados al componente padre
  useEffect(() => {
    onFilterChange(selectedOptions.map(option => option.value));
  }, [selectedOptions, onFilterChange]);

  // Manejar cambios en la selección
  const handleSelectChange = (newValue: MultiValue<WorkerOption>) => {
    if (newValue.length > 12) {
      setWarning('⚠ Solo puedes seleccionar hasta 12 trabajadores.');
      return; // No actualiza la selección
    }
    setWarning(null);
    setSelectedOptions(newValue);
  };

  // Personalizar la visualización de cada opción
  const formatOptionLabel = (option: WorkerOption) => (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <span>{option.label}</span>
    </div>
  );

  return (
    <div className='WorkerSelector-container'>
      <Select
        isDisabled={municipalities.length === 0}
        options={options}
        isMulti
        isLoading={isLoading}
        placeholder={isLoading ? "Cargando trabajadores..." : "Selecciona trabajadores..."}
        noOptionsMessage={() => error || "No hay trabajadores disponibles"}
        formatOptionLabel={formatOptionLabel}
        className='basic-multi-select'
        classNamePrefix='select'
        onChange={handleSelectChange}
        value={selectedOptions}
      />
      {warning && (
        <p className="warning-message">{warning}</p>
      )}
      {error && (
        <p className="error-message">{error}</p>
      )}
    </div>
  );
};

export default WorkerSelector;