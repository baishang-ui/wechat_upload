import { Input, Text, View } from '@tarojs/components'

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
    <View className={`ui-field ${errorMessage ? 'ui-field--invalid' : ''}`}>
      <Text className='ui-field__label'>{label}</Text>
      <Input
        className='ui-field__input'
        value={value}
        placeholder={placeholder}
        password={password}
        disabled={disabled}
        confirmType={password ? 'done' : 'next'}
        onInput={(event) => onValueChange(event.detail.value)}
        onConfirm={onConfirm}
      />
      {errorMessage ? <Text className='ui-field__error'>{errorMessage}</Text> : null}
    </View>
  )
}
