import { Fragment, type PropsWithChildren } from 'react'

export function UiProvider({ children }: PropsWithChildren) {
  return <Fragment>{children}</Fragment>
}
