import React, { useState, useEffect } from 'react';
import Select, { MultiValue } from 'react-select';
import { mapsService } from '../services/map_service';

interface MunicipalityOption {
  label: string;
  value: string;
}

interface MunicipalitySelectorProps {
  onFilterChange: (selectedMunicipalities: string[]) => void;
}

const MunicipalitySelector: React.FC<MunicipalitySelectorProps> = ({ onFilterChange }) => {
  const [selectedOptions, setSelectedOptions] = useState<MultiValue<MunicipalityOption>>([]);
  const [options, setOptions] = useState<MunicipalityOption[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [warning, setWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadMunicipalities = async () => {
      setIsLoading(true);
      setError(null);
      try {
        console.log('Cargando municipios...');
        const municipalities = await mapsService.getMunicipalities();
        console.log('Municipalities loaded:', municipalities);
        const municipalityOptions: MunicipalityOption[] = municipalities.map(muni => ({
          value: muni.id.toString(),
          label: `${muni.name || ''} (${muni.cod_num || ''})`
        }));
        setOptions(municipalityOptions);
      } catch (err) {
        console.error('Error al cargar municipios:', err);
        setError('Error al cargar la lista de municipios');
      } finally {
        setIsLoading(false);
      }
    };

    loadMunicipalities();
  }, []);

  useEffect(() => {
    onFilterChange(selectedOptions.map(option => option.value));
  }, [selectedOptions, onFilterChange]);

  // Manejar cambios en la selección
  const handleSelectChange = (newValue: MultiValue<MunicipalityOption>) => {
    if (newValue.length > 12) {
      setWarning('⚠ Solo puedes seleccionar hasta 12 municipios.');
      return; // No actualiza la selección
    }
    setWarning(null);
    setSelectedOptions(newValue);
  };

  // Personalizar la visualización de cada opción
  const formatOptionLabel = (option: MunicipalityOption) => (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <span>{option.label}</span>
    </div>
  );

  return (
    <div className='MunicipalitySelector-container'>
      <Select
        options={options}
        isMulti
        isLoading={isLoading}
        placeholder={isLoading ? "Cargando municipios..." : "Selecciona municipios..."}
        noOptionsMessage={() => error || "No hay municipios disponibles"}
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

export default MunicipalitySelector;
