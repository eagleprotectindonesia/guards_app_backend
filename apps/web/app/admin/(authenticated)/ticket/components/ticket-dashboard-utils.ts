export function badgeClass(status: string) {
  if (status === 'NEW') return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
  if (status === 'ACKNOWLEDGED') return 'bg-sky-500/10 text-sky-400 border-sky-500/20';
  if (status === 'IN_PROGRESS') return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
  if (status === 'WAITING_INFORMATION') return 'bg-purple-500/10 text-purple-400 border-purple-500/20';
  if (status === 'SOLVED') return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
  if (status === 'CLOSED') return 'bg-zinc-600/10 text-zinc-400 border-zinc-500/20';
  if (status === 'CANNOT_RESOLVE') return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
  if (status === 'CANCELLED') return 'bg-red-500/10 text-red-400 border-red-500/20';
  return 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20';
}

export function formatDate(dateStr?: string | Date) {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

export function formatFileSize(bytes: number) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export function isImageMimeType(mimeType: string) {
  return mimeType.startsWith('image/');
}

export function isVideoMimeType(mimeType: string) {
  return mimeType.startsWith('video/');
}

export function getInitialsColor(name: string) {
  const colors = [
    'bg-[#5B3BF5] text-white',
    'bg-[#319795] text-white',
    'bg-[#38A169] text-white',
    'bg-[#3182CE] text-white',
    'bg-[#D69E2E] text-white',
    'bg-[#E53E3E] text-white',
  ];
  let sum = 0;
  for (let i = 0; i < name.length; i++) {
    sum += name.charCodeAt(i);
  }
  return colors[sum % colors.length];
}
