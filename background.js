// 后台脚本 - 处理插件安装和基本事件
chrome.runtime.onInstalled.addListener(() => {
  console.log('Learn Vocabulary 插件已安装');
  
  // 创建右键菜单
  chrome.contextMenus.create({
    id: "translateWord",
    title: "多多记单词",
    contexts: ["selection"],
    documentUrlPatterns: ["http://*/*", "https://*/*"]
  });
});

// 处理右键菜单点击事件
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "translateWord" && info.selectionText) {
    // 向content script发送消息，触发翻译功能
    chrome.tabs.sendMessage(tab.id, {
      action: "translateSelectedWord",
      word: info.selectionText.trim()
    });
  }
});

// 处理存储变化
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && changes.savedWords) {
    console.log('保存的单词已更新:', changes.savedWords.newValue);
  }
}); 