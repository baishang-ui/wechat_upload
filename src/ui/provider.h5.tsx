import { HeroUIProvider } from '@heroui/react'
import type { PropsWithChildren } from 'react'

export function UiProvider({ children }: PropsWithChildren) {
  return <HeroUIProvider>{children}</HeroUIProvider>
}
