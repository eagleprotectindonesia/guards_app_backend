'use client';

import { useEffect, useState } from 'react';
import { cn } from '@repo/shared';
import { stripHtmlToText } from '@repo/validations';

type RichTextViewerProps = {
  html: string;
  className?: string;
  fallback?: string;
};

const ALLOWED_TAGS = [
  'a',
  'b',
  'blockquote',
  'br',
  'code',
  'div',
  'em',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'i',
  'li',
  'ol',
  'p',
  'pre',
  'span',
  'strong',
  'u',
  'ul',
];
const BLOCKED_TAGS = new Set(['embed', 'iframe', 'link', 'meta', 'object', 'script', 'style']);

function isSafeHref(value: string) {
  const href = value.trim();
  if (!href) return false;
  if (href.startsWith('/') || href.startsWith('#')) return true;
  if (/^(mailto|tel):/i.test(href)) return true;

  try {
    const url = new URL(href, window.location.origin);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function sanitizeRichText(html: string) {
  const template = document.createElement('template');
  template.innerHTML = html;
  const output = document.createElement('div');

  const appendSanitized = (parent: HTMLElement | DocumentFragment, node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      parent.appendChild(document.createTextNode(node.textContent ?? ''));
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return;
    }

    const element = node as HTMLElement;
    const tagName = element.tagName.toLowerCase();

    if (BLOCKED_TAGS.has(tagName)) {
      return;
    }

    if (!ALLOWED_TAGS.includes(tagName)) {
      element.childNodes.forEach(child => appendSanitized(parent, child));
      return;
    }

    const cleanElement = document.createElement(tagName);

    if (tagName === 'a') {
      const href = element.getAttribute('href') ?? '';
      if (isSafeHref(href)) {
        cleanElement.setAttribute('href', href);
      }
      const target = element.getAttribute('target');
      if (target === '_blank') {
        cleanElement.setAttribute('target', '_blank');
        cleanElement.setAttribute('rel', 'noopener noreferrer');
      }
    }

    element.childNodes.forEach(child => appendSanitized(cleanElement, child));
    parent.appendChild(cleanElement);
  };

  template.content.childNodes.forEach(node => appendSanitized(output, node));
  return output.innerHTML;
}

export function RichTextViewer({ html, className, fallback = '-' }: RichTextViewerProps) {
  const [sanitizedHtml, setSanitizedHtml] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function sanitize() {
      if (!stripHtmlToText(html)) {
        setSanitizedHtml('');
        return;
      }

      if (!cancelled) {
        setSanitizedHtml(sanitizeRichText(html));
      }
    }

    void sanitize().catch(() => {
      if (!cancelled) {
        setSanitizedHtml(null);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [html]);

  if (sanitizedHtml === null) {
    return <div className={cn('ticket-rich-text', className)}>{stripHtmlToText(html) || fallback}</div>;
  }

  if (!sanitizedHtml) {
    return <div className={cn('ticket-rich-text', className)}>{fallback}</div>;
  }

  return <div className={cn('ticket-rich-text', className)} dangerouslySetInnerHTML={{ __html: sanitizedHtml }} />;
}
