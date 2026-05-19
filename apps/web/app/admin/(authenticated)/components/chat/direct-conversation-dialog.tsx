'use client';

import { useMemo, useState } from 'react';
import { Search, User } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';

type EmployeeDirectoryItem = {
  id: string;
  fullName: string;
  employeeNumber: string | null;
};

type DirectConversationDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  employees: EmployeeDirectoryItem[];
  onSelectEmployee: (employee: EmployeeDirectoryItem) => void;
};

export function DirectConversationDialog({
  isOpen,
  onClose,
  employees,
  onSelectEmployee,
}: DirectConversationDialogProps) {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredEmployees = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return employees;

    return employees.filter(employee => {
      return (
        employee.fullName.toLowerCase().includes(query) ||
        (employee.employeeNumber ?? '').toLowerCase().includes(query)
      );
    });
  }, [employees, searchTerm]);

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setSearchTerm('');
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px] gap-0 p-0 overflow-hidden flex flex-col max-h-[85vh]">
        <DialogHeader className="p-6 border-b">
          <DialogTitle>Start New Conversation</DialogTitle>
        </DialogHeader>

        <div className="p-6 border-b">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
            <input
              type="text"
              placeholder="Search by name or employee number..."
              value={searchTerm}
              onChange={event => setSearchTerm(event.target.value)}
              className="w-full bg-background border border-border rounded-lg pl-9 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
            />
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-2">
            {filteredEmployees.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-10 px-3">No employees found</p>
            ) : (
              filteredEmployees.map(employee => (
                <button
                  key={employee.id}
                  type="button"
                  onClick={() => onSelectEmployee(employee)}
                  className="w-full text-left flex items-center gap-3 px-3 py-2.5 hover:bg-muted/50 rounded-md transition-colors"
                >
                  <div className="w-8 h-8 bg-muted rounded-full flex items-center justify-center shrink-0">
                    <User size={14} className="text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{employee.fullName}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {employee.employeeNumber || 'No employee number'}
                    </p>
                  </div>
                </button>
              ))
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
