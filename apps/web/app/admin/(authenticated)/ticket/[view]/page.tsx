import { notFound } from 'next/navigation';
import { renderTicketWorkspacePage } from '../components/ticket-workspace-page';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ view: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

const ALLOWED_VIEWS = ['all', 'acknowledged', 'unassigned', 'closed'] as const;

export default async function TicketWorkspaceViewPage({ params, searchParams }: PageProps) {
  const { view } = await params;
  if (!(ALLOWED_VIEWS as readonly string[]).includes(view)) {
    notFound();
  }
  return renderTicketWorkspacePage(view as typeof ALLOWED_VIEWS[number], searchParams);
}
