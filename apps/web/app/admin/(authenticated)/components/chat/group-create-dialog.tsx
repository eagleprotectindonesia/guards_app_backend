'use client';

import React, { useState, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, Users, ShieldCheck, User } from 'lucide-react';
import { cn } from '@repo/shared';

interface DirectoryEmployee {
  id: string;
  fullName: string;
  employeeNumber: string | null;
}

interface DirectoryAdmin {
  id: string;
  name: string;
  email: string;
}

interface GroupCreateDialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  onTitleChange: (value: string) => void;
  description: string;
  onDescriptionChange: (value: string) => void;
  employeeDirectory: DirectoryEmployee[];
  adminDirectory: DirectoryAdmin[];
  selectedEmployeeIds: string[];
  onSelectedEmployeeIdsChange: (ids: string[]) => void;
  selectedAdminIds: string[];
  onSelectedAdminIdsChange: (ids: string[]) => void;
  onCreate: () => void;
  isLoading: boolean;
}

export function GroupCreateDialog({
  isOpen,
  onClose,
  title,
  onTitleChange,
  description,
  onDescriptionChange,
  employeeDirectory,
  adminDirectory,
  selectedEmployeeIds,
  onSelectedEmployeeIdsChange,
  selectedAdminIds,
  onSelectedAdminIdsChange,
  onCreate,
  isLoading,
}: GroupCreateDialogProps) {
  const [memberSearchTerm, setMemberSearchTerm] = useState('');
  const [tab, setTab] = useState<'employees' | 'admins'>('employees');

  const filteredEmployees = useMemo(() => {
    const search = memberSearchTerm.toLowerCase();
    return employeeDirectory.filter(
      e =>
        e.fullName.toLowerCase().includes(search) ||
        (e.employeeNumber && e.employeeNumber.toLowerCase().includes(search))
    );
  }, [employeeDirectory, memberSearchTerm]);

  const filteredAdmins = useMemo(() => {
    const search = memberSearchTerm.toLowerCase();
    return adminDirectory.filter(
      a => a.name.toLowerCase().includes(search) || a.email.toLowerCase().includes(search)
    );
  }, [adminDirectory, memberSearchTerm]);

  const toggleEmployee = (id: string) => {
    if (selectedEmployeeIds.includes(id)) {
      onSelectedEmployeeIdsChange(selectedEmployeeIds.filter(i => i !== id));
    } else {
      onSelectedEmployeeIdsChange([...selectedEmployeeIds, id]);
    }
  };

  const toggleAdmin = (id: string) => {
    if (selectedAdminIds.includes(id)) {
      onSelectedAdminIdsChange(selectedAdminIds.filter(i => i !== id));
    } else {
      onSelectedAdminIdsChange([...selectedAdminIds, id]);
    }
  };

  const totalSelected = selectedEmployeeIds.length + selectedAdminIds.length;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px] gap-0 p-0 overflow-hidden flex flex-col max-h-[90vh]">
        <DialogHeader className="p-6 border-b">
          <DialogTitle className="flex items-center gap-2">
            <Users size={20} className="text-blue-600" />
            Create New Group
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="group-title">Group Title</Label>
              <input
                id="group-title"
                placeholder="Enter group name..."
                value={title}
                onChange={e => onTitleChange(e.target.value)}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="group-description">Description (Optional)</Label>
              <textarea
                id="group-description"
                placeholder="What is this group about?"
                value={description}
                onChange={e => onDescriptionChange(e.target.value)}
                rows={2}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all resize-none"
              />
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>Add Members</Label>
              <span className="text-xs text-muted-foreground font-medium bg-muted px-2 py-0.5 rounded-full">
                {totalSelected} selected
              </span>
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
              <input
                placeholder="Search people..."
                value={memberSearchTerm}
                onChange={e => setMemberSearchTerm(e.target.value)}
                className="w-full bg-background border border-border rounded-lg pl-9 pr-4 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
              />
            </div>

            <div className="border rounded-lg overflow-hidden flex flex-col h-[280px]">
              <div className="flex border-b bg-muted/30">
                <button
                  onClick={() => setTab('employees')}
                  className={cn(
                    'flex-1 py-2 text-xs font-medium transition-colors',
                    tab === 'employees' ? 'bg-background text-blue-600' : 'text-muted-foreground hover:bg-muted/50'
                  )}
                >
                  Employees ({filteredEmployees.length})
                </button>
                <button
                  onClick={() => setTab('admins')}
                  className={cn(
                    'flex-1 py-2 text-xs font-medium transition-colors border-l',
                    tab === 'admins' ? 'bg-background text-blue-600' : 'text-muted-foreground hover:bg-muted/50'
                  )}
                >
                  Admins ({filteredAdmins.length})
                </button>
              </div>

              <ScrollArea className="flex-1">
                <div className="p-2 space-y-1">
                  {tab === 'employees' ? (
                    filteredEmployees.length > 0 ? (
                      filteredEmployees.map(employee => (
                        <div
                          key={employee.id}
                          className="flex items-center gap-3 px-2 py-2 hover:bg-muted/50 rounded-md transition-colors cursor-pointer"
                          onClick={() => toggleEmployee(employee.id)}
                        >
                          <Checkbox
                            checked={selectedEmployeeIds.includes(employee.id)}
                            onCheckedChange={() => toggleEmployee(employee.id)}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{employee.fullName}</p>
                            <p className="text-[10px] text-muted-foreground truncate">
                              ID: {employee.employeeNumber || 'N/A'}
                            </p>
                          </div>
                          <div className="w-7 h-7 bg-muted rounded-full flex items-center justify-center shrink-0">
                            <User size={14} className="text-muted-foreground" />
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-center text-xs text-muted-foreground py-10">No employees found</p>
                    )
                  ) : filteredAdmins.length > 0 ? (
                    filteredAdmins.map(admin => (
                      <div
                        key={admin.id}
                        className="flex items-center gap-3 px-2 py-2 hover:bg-muted/50 rounded-md transition-colors cursor-pointer"
                        onClick={() => toggleAdmin(admin.id)}
                      >
                        <Checkbox
                          checked={selectedAdminIds.includes(admin.id)}
                          onCheckedChange={() => toggleAdmin(admin.id)}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{admin.name}</p>
                          <p className="text-[10px] text-muted-foreground truncate">{admin.email}</p>
                        </div>
                        <div className="w-7 h-7 bg-blue-50 dark:bg-blue-900/20 rounded-full flex items-center justify-center shrink-0">
                          <ShieldCheck size={14} className="text-blue-600" />
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-center text-xs text-muted-foreground py-10">No admins found</p>
                  )}
                </div>
              </ScrollArea>
            </div>
          </div>
        </div>

        <DialogFooter className="p-6 border-t bg-muted/10">
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            onClick={onCreate}
            disabled={isLoading || !title.trim()}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {isLoading ? 'Creating...' : 'Create Group'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
