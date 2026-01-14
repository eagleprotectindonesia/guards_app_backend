'use client';

import { Pencil, Trash2 } from 'lucide-react';
import Link from 'next/link';

type EditButtonProps = {
  onClick?: () => void;
  href?: string;
  title?: string;
  disabled?: boolean;
};

type DeleteButtonProps = {
  onClick: () => void;
  title?: string;
  disabled?: boolean;
};

export function EditButton({ onClick, href, title = 'Edit', disabled = false }: EditButtonProps) {
  const className = "p-2 text-muted-foreground transition-colors";
  const activeClassName = "hover:text-foreground hover:bg-muted rounded-lg cursor-pointer";
  const disabledClassName = "opacity-30 cursor-not-allowed";

  const content = (
    <>
      <Pencil className="w-4 h-4" />
      <span className="sr-only">{title}</span>
    </>
  );

  if (disabled) {
    return (
      <div className={`${className} ${disabledClassName}`} title="Permission Denied">
        {content}
      </div>
    );
  }

  if (href) {
    return (
      <Link href={href} className={`${className} ${activeClassName}`} title={title}>
        {content}
      </Link>
    );
  }

  return (
    <button
      onClick={onClick}
      className={`${className} ${activeClassName}`}
      title={title}
    >
      {content}
    </button>
  );
}

export function DeleteButton({ onClick, title = 'Delete', disabled = false }: DeleteButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
      title={title}
    >
      <Trash2 className="w-4 h-4" />
      <span className="sr-only">{title}</span>
    </button>
  );
}