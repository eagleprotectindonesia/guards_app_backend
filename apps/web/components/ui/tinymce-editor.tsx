'use client';

import { useId, useMemo, useState } from 'react';
import { Editor } from '@tinymce/tinymce-react';
import { cn } from '@repo/shared';
import { useTheme } from 'next-themes';

type TinyMceEditorProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  minHeight?: number;
};

export function TinyMceEditor({
  value,
  onChange,
  placeholder = 'Enter text...',
  className,
  disabled = false,
  minHeight = 280,
}: TinyMceEditorProps) {
  const [scriptError, setScriptError] = useState(false);
  const fallbackId = useId();
  const apiKey = process.env.NEXT_PUBLIC_TINYMCE_API_KEY?.trim() ?? '';
  const { theme } = useTheme();

  const isDarkMode = useMemo(() => {
    return theme === 'dark';
  }, [theme]);

  const useTinyMce = Boolean(apiKey) && !scriptError;
  const skin = isDarkMode ? 'oxide-dark' : 'oxide';
  const contentCss = isDarkMode ? 'dark' : 'default';
  const iframeContentStyle = isDarkMode
    ? `
      body {
        background: #111827;
        color: #f9fafb;
        font-family: Inter, ui-sans-serif, system-ui, sans-serif;
        font-size: 14px;
        line-height: 1.6;
        padding: 12px;
      }
      p { margin: 0 0 0.75rem; }
      ul, ol { margin: 0.75rem 0; padding-left: 1.5rem; }
      a { color: #93c5fd; text-decoration: underline; }
      blockquote {
        border-left: 3px solid #374151;
        margin: 0.75rem 0;
        padding-left: 1rem;
        color: #d1d5db;
      }
      pre {
        background: #1f2937;
        border-radius: 0.5rem;
        padding: 0.75rem;
        overflow-x: auto;
        color: #f9fafb;
      }
      .mce-content-body[data-mce-placeholder]:not(.mce-visualblocks)::before {
        color: #9ca3af !important;
        opacity: 1 !important;
        left: 12px !important;
        top: 12px !important;
        pointer-events: none !important;
      }
    `
    : `
      body {
        background: #ffffff;
        color: #111827;
        font-family: Inter, ui-sans-serif, system-ui, sans-serif;
        font-size: 14px;
        line-height: 1.6;
        padding: 12px;
      }
      p { margin: 0 0 0.75rem; }
      ul, ol { margin: 0.75rem 0; padding-left: 1.5rem; }
      a { color: #4f46e5; text-decoration: underline; }
      blockquote {
        border-left: 3px solid #e5e7eb;
        margin: 0.75rem 0;
        padding-left: 1rem;
        color: #6b7280;
      }
      pre {
        background: #f3f4f6;
        border-radius: 0.5rem;
        padding: 0.75rem;
        overflow-x: auto;
      }
      .mce-content-body[data-mce-placeholder]:not(.mce-visualblocks)::before {
        color: #6b7280 !important;
        opacity: 1 !important;
        left: 12px !important;
        top: 12px !important;
        pointer-events: none !important;
      }
    `;

  if (!useTinyMce) {
    return (
      <textarea
        id={fallbackId}
        value={value}
        onChange={event => onChange(event.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className={cn(
          'min-h-[280px] w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:bg-background dark:text-foreground',
          className
        )}
      />
    );
  }

  return (
    <div className={cn('overflow-hidden rounded-lg border border-border bg-background', className)}>
      <Editor
        key={skin}
        value={value}
        onEditorChange={nextValue => onChange(nextValue)}
        disabled={disabled}
        apiKey={apiKey}
        init={{
          skin,
          content_css: contentCss,
          menubar: false,
          branding: false,
          statusbar: false,
          height: minHeight,
          placeholder,
          resize: false,
          plugins: ['autolink', 'link', 'lists', 'code', 'wordcount'],
          toolbar:
            'undo redo | blocks | bold italic underline strikethrough | bullist numlist | link blockquote | removeformat | code',
          content_style: iframeContentStyle,
        }}
        scriptLoading={{ async: true, defer: true }}
        onScriptsLoadError={() => setScriptError(true)}
      />
    </div>
  );
}
