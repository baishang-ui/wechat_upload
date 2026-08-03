import path from 'node:path'
import { defineConfig, type UserConfigExport } from '@tarojs/cli'

import devConfig from './dev'
import prodConfig from './prod'

const config: UserConfigExport = {
  projectName: 'smart-inspection-miniprogram',
  date: '2026-08-03',
  designWidth: 750,
  deviceRatio: {
    640: 2.34 / 2,
    750: 1,
    828: 1.81 / 2,
  },
  sourceRoot: 'src',
  outputRoot: 'dist',
  framework: 'react',
  compiler: 'webpack5',
  cache: {
    enable: true,
  },
  alias: {
    '@': path.resolve(__dirname, '..', 'src'),
    '@legacy': path.resolve(__dirname, '..', 'miniprogram'),
  },
  plugins: [
    '@tarojs/plugin-framework-react',
    '@tarojs/plugin-platform-weapp',
    '@tarojs/plugin-platform-h5',
  ],
  mini: {
    compile: {
      include: [path.resolve(__dirname, '..', 'miniprogram')],
    },
    postcss: {
      pxtransform: {
        enable: true,
        config: {},
      },
      url: {
        enable: true,
        config: {
          limit: 1024,
        },
      },
      cssModules: {
        enable: false,
        config: {
          namingPattern: 'module',
          generateScopedName: '[name]__[local]___[hash:base64:5]',
        },
      },
    },
  },
  h5: {
    publicPath: '/',
    staticDirectory: 'static',
    compile: {
      include: [path.resolve(__dirname, '..', 'miniprogram')],
    },
    postcss: {
      autoprefixer: {
        enable: true,
        config: {},
      },
      cssModules: {
        enable: false,
        config: {
          namingPattern: 'module',
          generateScopedName: '[name]__[local]___[hash:base64:5]',
        },
      },
    },
  },
}

export default defineConfig<'webpack5'>(async (merge) => {
  if (process.env.NODE_ENV === 'development') {
    return merge({}, config, devConfig)
  }
  return merge({}, config, prodConfig)
})
