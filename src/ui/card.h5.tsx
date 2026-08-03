import { Card, CardBody } from '@heroui/react'

import type { UiCardProps } from './types'

export function UiCard({ className = '', children }: UiCardProps) {
  return (
    <Card shadow='none' className={`ui-card ${className}`.trim()}>
      <CardBody className='ui-card__body'>{children}</CardBody>
    </Card>
  )
}
