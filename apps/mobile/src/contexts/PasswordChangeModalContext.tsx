import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';

type PasswordChangeModalContextType = {
  isOpen: boolean;
  isForce: boolean;
  openPasswordChangeModal: (force?: boolean) => void;
  closePasswordChangeModal: () => void;
};

const PasswordChangeModalContext = createContext<PasswordChangeModalContextType | undefined>(undefined);

export function PasswordChangeModalProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isForce, setIsForce] = useState(false);

  const openPasswordChangeModal = useCallback((force: boolean = false) => {
    setIsForce(force);
    setIsOpen(true);
  }, []);

  const closePasswordChangeModal = useCallback(() => {
    setIsOpen(false);
    setIsForce(false);
  }, []);

  const value = useMemo(() => ({ 
    isOpen, 
    isForce, 
    openPasswordChangeModal, 
    closePasswordChangeModal 
  }), [isOpen, isForce, openPasswordChangeModal, closePasswordChangeModal]);

  return (
    <PasswordChangeModalContext.Provider value={value}>
      {children}
    </PasswordChangeModalContext.Provider>
  );
}

export function usePasswordChangeModal() {
  const context = useContext(PasswordChangeModalContext);
  if (context === undefined) {
    throw new Error('usePasswordChangeModal must be used within a PasswordChangeModalProvider');
  }
  return context;
}
