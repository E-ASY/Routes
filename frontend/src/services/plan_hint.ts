/** Siguiente paso al planificar; lo muestran el panel Plan y la franja sobre el mapa */
export function planHint({
  planningMode,
  workerCount,
  hasPlanWorker,
  hasOrigin,
  originEditable,
  endPending,
  stopsCount,
}: {
  planningMode: boolean;
  workerCount: number;
  hasPlanWorker: boolean;
  hasOrigin: boolean;
  originEditable: boolean;
  /** Acaba "en otro sitio" y aún falta elegirlo */
  endPending: boolean;
  stopsCount: number;
}): string {
  if (!planningMode) return 'Actívalo para preparar la ruta de una trabajadora.';
  if (workerCount === 0) return 'Elige trabajadoras en Filtros.';
  if (!hasPlanWorker) return 'Elige a qué trabajadora planificar.';
  if (!hasOrigin) return 'Toca en el mapa desde dónde sale.';
  if (originEditable || stopsCount === 0) return 'Toca las usuarias que visitará hoy.';
  if (endPending) return 'Toca más usuarias o, al acabar, dónde termina.';
  return 'Toca más usuarias para añadirlas.';
}
