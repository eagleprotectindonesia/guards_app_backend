interface EventFormActionsProps {
  loading: boolean;
  isEdit: boolean;
  onCancel: () => void;
}

export function EventFormActions({ loading, isEdit, onCancel }: EventFormActionsProps) {
  return (
    <div className="flex gap-2 pt-2">
      <button
        type="button"
        onClick={onCancel}
        className="flex-1 rounded-lg border border-input py-2 text-sm font-medium text-foreground hover:bg-muted"
      >
        Cancel
      </button>
      <button
        type="submit"
        disabled={loading}
        className="flex-1 rounded-lg bg-red-600 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
      >
        {loading ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Event'}
      </button>
    </div>
  );
}
