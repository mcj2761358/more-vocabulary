// 后台脚本 - 处理插件安装和基本事件
chrome.runtime.onInstalled.addListener(() => {
  console.log('Learn Vocabulary 插件已安装');
});

// 处理存储变化
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && changes.savedWords) {
    console.log('保存的单词已更新:', changes.savedWords.newValue);
  }
}); 