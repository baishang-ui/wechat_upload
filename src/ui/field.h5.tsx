import { Input } from '@heroui/react'

import type { UiFieldProps } from './types'

export function UiField({
  label,
  value,
  placeholder = '',
  password = false,
  disabled = false,
  errorMessage = '',
  onValueChange,
  onConfirm,
}: UiFieldProps) {
  return (
    <Input
      className='ui-field'
      label={label}
      labelPlacement='outside'
      value={value}
      placeholder={placeholder}
      type={password ? 'password' : 'text'}
      isDisabled={disabled}
      isInvalid={Boolean(errorMessage)}
      errorMessage={errorMessage}
      onValueChange={onValueChange}
      onKeyDown={(event) => {
        if (event.key === 'Enter') onConfirm?.()
      }}
      classNames={{
        label: 'ui-field__label',
        inputWrapper: 'ui-field__input',
        errorMessage: 'ui-field__error',
      }}
    />
  )
}
