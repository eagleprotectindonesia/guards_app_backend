'use client';

import ReactSelect, { GroupBase, Props } from 'react-select';

export default function Select<
  Option = unknown,
  IsMulti extends boolean = false,
  Group extends GroupBase<Option> = GroupBase<Option>
>(props: Props<Option, IsMulti, Group>) {
  return (
    <ReactSelect
      {...props}
      classNames={{
        control: (state) =>
          `!rounded-lg !border-gray-200 !min-h-[40px] !min-w-[200px] ${
            state.isFocused ? '!border-red-500 !ring-2 !ring-red-500/20' : ''
          }`,
        singleValue: () => '!text-gray-900 !text-sm',
        input: () => '!text-gray-900 !text-sm',
        placeholder: () => '!text-sm',
        menuList: () => '!text-sm',
        option: () => '!text-sm',
        ...props.classNames,
      }}
    />
  );
}
