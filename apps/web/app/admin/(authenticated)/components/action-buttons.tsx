'use client';

import { Pencil, Trash2 } from 'lucide-react';

type EditButtonProps = {
  onClick: () => void;
  title?: string;
  disabled?: boolean;
};

type DeleteButtonProps = {
  onClick: () => void;
  title?: string;
  disabled?: boolean;
};

export function EditButton({ onClick, title = 'Edit', disabled = false }: EditButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
      title={title}
    >
      <Pencil className="w-4 h-4" />
      <span className="sr-only">{title}</span>
    </button>
  );
}

export function DeleteButton({ onClick, title = 'Delete', disabled = false }: DeleteButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
      title={title}
    >
      <Trash2 className="w-4 h-4" />
      <span className="sr-only">{title}</span>
    </button>
  );
}