import type { PropsWithChildren } from 'react'

import { UiProvider } from '@/ui/provider'

import './styles/platform'

export default function App({ children }: PropsWithChildren) {
  return <UiProvider>{children}</UiProvider>
}
