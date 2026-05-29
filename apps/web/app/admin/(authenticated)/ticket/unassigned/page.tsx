import { renderTicketWorkspacePage } from '../components/ticket-workspace-page';

export const dynamic = 'force-dynamic';

type PageProps = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function UnassignedTicketsPage({ searchParams }: PageProps) {
  return renderTicketWorkspacePage('unassigned', searchParams);
}
