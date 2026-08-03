import { Camera, Image, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useRef, useState } from 'react'

import { UiButton } from '@/ui/button'
import { PageHeader } from '@/ui/page-header'

import './index.scss'

export default function DocumentCameraPage() {
  const cameraRef = useRef(Taro.createCameraContext())
  const [cameraReady, setCameraReady] = useState(false)
  const [cameraError, setCameraError] = useState('')
  const [previewPath, setPreviewPath] = useState('')
  const [capturing, setCapturing] = useState(false)

  const capture = async (): Promise<void> => {
    if (!cameraReady || capturing) return
    setCapturing(true)
    try {
      const imagePath = await new Promise<string>((resolve, reject) => {
        cameraRef.current.takePhoto({
          quality: 'high',
          success: (result) => resolve(result.tempImagePath),
          fail: (result) => reject(new Error(result.errMsg || '拍摄失败，请重试')),
        })
      })
      setPreviewPath(imagePath)
    } catch (error) {
      setCameraError(error instanceof Error ? error.message : '拍摄失败，请重试')
    } finally {
      setCapturing(false)
    }
  }

  const usePhoto = async (): Promise<void> => {
    if (!previewPath) return
    Taro.setStorageSync('taroMigration:pendingCameraImage', previewPath)
    await Taro.navigateBack()
  }

  return (
    <View className='camera-page'>
      <PageHeader title='拍摄检验报告' />
      <View className='camera-stage'>
        {previewPath ? (
          <Image className='camera-preview' src={previewPath} mode='aspectFit' />
        ) : (
          <Camera
            className='camera-view'
            devicePosition='back'
            flash='auto'
            onReady={() => {
              setCameraReady(true)
              setCameraError('')
            }}
            onError={(event) => {
              setCameraReady(false)
              setCameraError(event.detail.errMsg || '无法打开相机，请确认相机权限')
            }}
          />
        )}
        <View className='camera-frame'>
          <View className='camera-corner camera-corner--tl' />
          <View className='camera-corner camera-corner--tr' />
          <View className='camera-corner camera-corner--bl' />
          <View className='camera-corner camera-corner--br' />
        </View>
        <Text className='camera-guidance'>{cameraError || (previewPath ? '请检查报告是否完整清晰' : '请将检验报告完整放入取景框')}</Text>
      </View>
      <View className='camera-actions'>
        {previewPath ? (
          <>
            <UiButton variant='secondary' onPress={() => setPreviewPath('')}>重新拍摄</UiButton>
            <UiButton onPress={() => void usePhoto()}>使用照片</UiButton>
          </>
        ) : (
          <UiButton block loading={capturing} disabled={!cameraReady} onPress={() => void capture()}>拍摄</UiButton>
        )}
      </View>
    </View>
  )
}
