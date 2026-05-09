type LoadingBlockProps = {
  className?: string;
};

export function LoadingBlock({ className = '' }: LoadingBlockProps) {
  return <div className={`rounded-md bg-muted/70 dark:bg-muted/40 ${className}`} />;
}
