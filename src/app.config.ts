export default defineAppConfig({
  pages: [
    'pages/index/index',
    'pages/login/index',
    'pages/document-camera/index',
    'pages/inspection-workbench/index',
    'pages/logs/index',
  ],
  window: {
    navigationStyle: 'custom',
    navigationBarTextStyle: 'black',
    backgroundColor: '#f3f6f8',
  },
  networkTimeout: {
    request: 120000,
    uploadFile: 120000,
  },
  lazyCodeLoading: 'requiredComponents',
})
