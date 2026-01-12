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
          `!rounded-lg !border-border !bg-card !min-h-[40px] !min-w-[200px] ${
            state.isFocused ? '!border-red-500 !ring-2 !ring-red-500/20' : ''
          }`,
        singleValue: () => '!text-foreground !text-sm',
        input: () => '!text-foreground !text-sm',
        placeholder: () => '!text-muted-foreground !text-sm',
        menuList: () => '!text-sm !bg-card !border !border-border !rounded-lg',
        option: (state) => 
          `!text-sm ${
            state.isFocused 
              ? '!bg-muted !text-foreground' 
              : state.isSelected 
                ? '!bg-red-500 !text-white' 
                : '!text-foreground'
          }`,
        ...props.classNames,
      }}
    />
  );
}
