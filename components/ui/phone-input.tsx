'use client';

import React, { useState, useMemo } from 'react';
import PhoneInputWithCountrySelect, { Value } from 'react-phone-number-input';
import 'react-phone-number-input/style.css';
import { parsePhoneNumberWithError } from 'libphonenumber-js';

interface PhoneInputProps {
  id?: string;
  inputName: string;
  defaultValue?: Value;
  onChange?: (value: Value | undefined) => void;
  className?: string;
  placeholder?: string;
}

const PhoneInput: React.FC<PhoneInputProps> = ({ id, inputName, defaultValue, onChange, className, placeholder }) => {
  const [value, setValue] = useState<Value | undefined>(defaultValue);

  const handleChange = (newValue?: Value) => {
    setValue(newValue);
    if (onChange) {
      onChange(newValue);
    }
  };

  const defaultCountry = useMemo(() => {
    if (defaultValue) {
      try {
        return parsePhoneNumberWithError(defaultValue as string)?.country || 'ID';
      } catch (error) {
        return 'ID';
      }
    }
    return 'ID';
  }, [defaultValue]);

  return (
    <>
      <PhoneInputWithCountrySelect
        id={id}
        international
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        countryCallingCodeEditable={false}
        className={`w-full h-10 px-3 rounded-lg border border-gray-200 focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none transition-all ${className}`}
        defaultCountry={defaultCountry}
      />
      {/* Hidden input to submit the clean E164 number */}
      <input type="hidden" name={inputName} value={value || ''} />
    </>
  );
};

export default PhoneInput;
