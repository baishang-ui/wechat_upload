import {
  CameraIcon,
  ClipboardDocumentListIcon,
  ClockIcon,
  UserCircleIcon,
  ViewfinderCircleIcon,
} from '@heroicons/react/24/solid'

import type { IconName, IconProps } from './types'

const icons: Record<IconName, typeof CameraIcon> = {
  scan: ViewfinderCircleIcon,
  tasks: ClipboardDocumentListIcon,
  history: ClockIcon,
  account: UserCircleIcon,
  camera: CameraIcon,
}

export function Icon({ name, size = 24, label = '' }: IconProps) {
  const HeroIcon = icons[name]
  return (
    <HeroIcon
      width={size}
      height={size}
      aria-label={label || undefined}
      aria-hidden={label ? undefined : true}
    />
  )
}
