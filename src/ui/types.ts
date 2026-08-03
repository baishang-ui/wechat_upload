import type { PropsWithChildren } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

export interface UiButtonProps extends PropsWithChildren {
  variant?: ButtonVariant
  block?: boolean
  loading?: boolean
  disabled?: boolean
  className?: string
  onPress?: () => void
}

export interface UiCardProps extends PropsWithChildren {
  className?: string
}

export interface UiFieldProps {
  label: string
  value: string
  placeholder?: string
  password?: boolean
  disabled?: boolean
  errorMessage?: string
  onValueChange: (value: string) => void
  onConfirm?: () => void
}

export type IconName = 'scan' | 'tasks' | 'history' | 'account' | 'camera'

export interface IconProps {
  name: IconName
  size?: number
  label?: string
}
