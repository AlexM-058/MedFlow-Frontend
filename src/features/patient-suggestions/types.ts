export interface PatientSuggestion {
  id: string;
  doctorName: string;
  text: string;
  /** ISO 8601 timestamp for this synthetic example. */
  createdAt: string;
}

export interface PatientSuggestionPanelProps {
  suggestion: PatientSuggestion;
  onClose: () => void;
}
