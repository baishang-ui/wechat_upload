import { Text, View } from '@tarojs/components'

export interface PageHeaderProps {
  title: string
}

export function PageHeader({ title }: PageHeaderProps) {
  return (
    <View className='page-header'>
      <Text className='page-header__title'>{title}</Text>
    </View>
  )
}
