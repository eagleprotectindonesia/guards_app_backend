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
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, UserPlus, Trash2, ShieldCheck, User, X } from 'lucide-react';
import { cn } from '@repo/shared';

interface GroupMember {
  id: string;
  groupId: string;
  participantType: 'admin' | 'employee';
  adminId: string | null;
  employeeId: string | null;
  role: 'owner' | 'admin' | 'member';
  status: 'active' | 'left' | 'removed';
  displayName: string;
  displayEmail: string | null;
  displayEmployeeNumber: string | null;
}

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

interface GroupMemberManagerProps {
  isOpen: boolean;
  onClose: () => void;
  groupTitle: string;
  members: GroupMember[];
  isMembersLoading: boolean;
  availableEmployees: DirectoryEmployee[];
  availableAdmins: DirectoryAdmin[];
  selectedEmployeeIds: string[];
  onSelectedEmployeeIdsChange: (ids: string[]) => void;
  selectedAdminIds: string[];
  onSelectedAdminIdsChange: (ids: string[]) => void;
  onAddMembers: () => void;
  onRemoveMember: (participantId: string) => void;
  isManaging: boolean;
  canManage: boolean;
  canDisband: boolean;
  onDisbandGroup: () => Promise<boolean>;
  isDisbandingGroup?: boolean;
}

export function GroupMemberManager({
  isOpen,
  onClose,
  groupTitle,
  members,
  isMembersLoading,
  availableEmployees,
  availableAdmins,
  selectedEmployeeIds,
  onSelectedEmployeeIdsChange,
  selectedAdminIds,
  onSelectedAdminIdsChange,
  onAddMembers,
  onRemoveMember,
  isManaging,
  canManage,
  canDisband,
  onDisbandGroup,
  isDisbandingGroup,
}: GroupMemberManagerProps) {
  const [view, setView] = useState<'list' | 'add'>('list');
  const [searchTerm, setSearchTerm] = useState('');
  const [addTab, setAddTab] = useState<'employees' | 'admins'>('employees');
  const [disbandConfirmText, setDisbandConfirmText] = useState('');

  const filteredMembers = useMemo(() => {
    const search = searchTerm.toLowerCase();
    return members.filter(
      m =>
        m.displayName.toLowerCase().includes(search) ||
        (m.displayEmail && m.displayEmail.toLowerCase().includes(search)) ||
        (m.displayEmployeeNumber && m.displayEmployeeNumber.toLowerCase().includes(search))
    );
  }, [members, searchTerm]);

  const filteredAvailableEmployees = useMemo(() => {
    const search = searchTerm.toLowerCase();
    return availableEmployees.filter(
      e =>
        e.fullName.toLowerCase().includes(search) ||
        (e.employeeNumber && e.employeeNumber.toLowerCase().includes(search))
    );
  }, [availableEmployees, searchTerm]);

  const filteredAvailableAdmins = useMemo(() => {
    const search = searchTerm.toLowerCase();
    return availableAdmins.filter(
      a => a.name.toLowerCase().includes(search) || a.email.toLowerCase().includes(search)
    );
  }, [availableAdmins, searchTerm]);

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

  const handleClose = () => {
    setView('list');
    setSearchTerm('');
    setDisbandConfirmText('');
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[450px] gap-0 p-0 overflow-hidden flex flex-col max-h-[85vh]">
        <DialogHeader className="p-6 border-b">
          <div className="flex items-center justify-between">
            <DialogTitle className="truncate pr-4">
              {view === 'list' ? `Members: ${groupTitle}` : 'Add New Members'}
            </DialogTitle>
            {view === 'list' && canManage && (
              <Button
                size="sm"
                variant="outline"
                className="h-8 gap-1.5 text-xs border-blue-200 text-blue-600 hover:bg-blue-50"
                onClick={() => {
                    setView('add');
                    setSearchTerm('');
                }}
              >
                <UserPlus size={14} />
                Add
              </Button>
            )}
            {view === 'add' && (
              <Button
                size="sm"
                variant="ghost"
                className="h-8 gap-1.5 text-xs"
                onClick={() => {
                    setView('list');
                    setSearchTerm('');
                }}
              >
                Back to list
              </Button>
            )}
          </div>
        </DialogHeader>

        <div className="p-4 bg-muted/20 border-b">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
            <input
              placeholder={view === 'list' ? 'Search members...' : 'Search people to add...'}
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full bg-background border border-border rounded-lg pl-9 pr-4 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-hidden flex flex-col">
          {view === 'list' ? (
            <ScrollArea className="flex-1 h-[400px]">
              <div className="p-2 space-y-1">
                {isMembersLoading ? (
                  <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mb-2" />
                    <p className="text-xs">Loading members...</p>
                  </div>
                ) : filteredMembers.length > 0 ? (
                  filteredMembers.map(member => (
                    <div
                      key={member.id}
                      className="flex items-center gap-3 px-3 py-2 hover:bg-muted/50 rounded-lg transition-colors group"
                    >
                      <div className={cn(
                        "w-9 h-9 rounded-full flex items-center justify-center shrink-0 shadow-sm",
                        member.participantType === 'admin' ? "bg-blue-50 dark:bg-blue-900/20" : "bg-muted"
                      )}>
                        {member.participantType === 'admin' ? (
                          <ShieldCheck size={18} className="text-blue-600" />
                        ) : (
                          <User size={18} className="text-muted-foreground" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold truncate">{member.displayName}</p>
                          {member.role === 'owner' && (
                            <span className="text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 px-1.5 py-0.5 rounded font-medium">
                              Owner
                            </span>
                          )}
                          {member.role === 'admin' && (
                            <span className="text-[10px] bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 px-1.5 py-0.5 rounded font-medium">
                              Admin
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground truncate">
                          {member.participantType === 'admin' ? member.displayEmail : member.displayEmployeeNumber || 'No ID'}
                        </p>
                      </div>
                      {canManage && member.role !== 'owner' && (
                        <button
                          onClick={() => onRemoveMember(member.id)}
                          disabled={isManaging}
                          className="opacity-0 group-hover:opacity-100 p-2 text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-full transition-all disabled:opacity-30"
                          title="Remove from group"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="text-center text-xs text-muted-foreground py-20">No members found</p>
                )}
              </div>
            </ScrollArea>
          ) : (
            <div className="flex flex-col flex-1">
              <div className="flex border-b bg-muted/30">
                <button
                  onClick={() => setAddTab('employees')}
                  className={cn(
                    'flex-1 py-2 text-xs font-medium transition-colors',
                    addTab === 'employees' ? 'bg-background text-blue-600 border-b-2 border-blue-600' : 'text-muted-foreground hover:bg-muted/50'
                  )}
                >
                  Employees ({filteredAvailableEmployees.length})
                </button>
                <button
                  onClick={() => setAddTab('admins')}
                  className={cn(
                    'flex-1 py-2 text-xs font-medium transition-colors',
                    addTab === 'admins' ? 'bg-background text-blue-600 border-b-2 border-blue-600' : 'text-muted-foreground hover:bg-muted/50'
                  )}
                >
                  Admins ({filteredAvailableAdmins.length})
                </button>
              </div>

              <ScrollArea className="flex-1 h-[350px]">
                <div className="p-2 space-y-1">
                  {addTab === 'employees' ? (
                    filteredAvailableEmployees.length > 0 ? (
                      filteredAvailableEmployees.map(employee => (
                        <div
                          key={employee.id}
                          className="flex items-center gap-3 px-3 py-2 hover:bg-muted/50 rounded-lg transition-colors cursor-pointer"
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
                          <div className="w-8 h-8 bg-muted rounded-full flex items-center justify-center shrink-0">
                            <User size={16} className="text-muted-foreground" />
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-center text-xs text-muted-foreground py-20">No available employees</p>
                    )
                  ) : filteredAvailableAdmins.length > 0 ? (
                    filteredAvailableAdmins.map(admin => (
                      <div
                        key={admin.id}
                        className="flex items-center gap-3 px-3 py-2 hover:bg-muted/50 rounded-lg transition-colors cursor-pointer"
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
                        <div className="w-8 h-8 bg-blue-50 dark:bg-blue-900/20 rounded-full flex items-center justify-center shrink-0">
                          <ShieldCheck size={16} className="text-blue-600" />
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-center text-xs text-muted-foreground py-20">No available admins</p>
                  )}
                </div>
              </ScrollArea>

              <div className="p-4 border-t bg-muted/10 flex items-center justify-between">
                <span className="text-xs font-medium">
                  {totalSelected} selected
                </span>
                <Button
                  size="sm"
                  disabled={totalSelected === 0 || isManaging}
                  onClick={onAddMembers}
                  className="bg-blue-600 hover:bg-blue-700 h-8"
                >
                  {isManaging ? 'Adding...' : 'Add Selected'}
                </Button>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="p-4 border-t bg-muted/5">
          <Button variant="ghost" size="sm" onClick={handleClose} disabled={isManaging} className="w-full">
            Close
          </Button>
        </DialogFooter>

        {view === 'list' && canDisband && (
          <div className="border-t border-red-200/70 bg-red-50/60 dark:bg-red-950/20 p-4 space-y-2">
            <p className="text-xs font-semibold text-red-700 dark:text-red-400">Disband Group</p>
            <p className="text-[11px] text-red-700/80 dark:text-red-300/80">
              Archive this group and remove all active members. Messages remain for history.
            </p>
            <input
              value={disbandConfirmText}
              onChange={e => setDisbandConfirmText(e.target.value)}
              placeholder='Type "DISBAND" to confirm'
              className="w-full bg-background border border-red-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-red-400 transition-all"
              disabled={isDisbandingGroup}
            />
            <Button
              variant="destructive"
              size="sm"
              className="w-full"
              disabled={isDisbandingGroup || disbandConfirmText !== 'DISBAND'}
              onClick={async () => {
                const success = await onDisbandGroup();
                if (success) handleClose();
              }}
            >
              {isDisbandingGroup ? 'Disbanding...' : 'Disband Group'}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
