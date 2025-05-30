// 收藏单词管理页面脚本
class SavedWordsManager {
    constructor() {
      this.savedWords = [];
      this.savedWordsData = new Map();
      this.filteredWords = [];
      this.currentPage = 1;
      this.pageSize = 20;
      this.searchQuery = '';
      
      this.init();
    }
  
    async init() {
      await this.loadData();
      this.setupEventListeners();
      this.render();
    }
  
    async loadData() {
      try {
        const result = await chrome.storage.local.get(['savedWords', 'savedWordsData']);
        this.savedWords = result.savedWords || [];
        
        // 处理savedWordsData，可能是数组格式
        const rawData = result.savedWordsData || [];
        if (Array.isArray(rawData)) {
          this.savedWordsData = new Map(rawData);
        } else {
          this.savedWordsData = new Map(Object.entries(rawData));
        }
        
        this.filteredWords = [...this.savedWords];
        console.log('加载收藏单词数据:', this.savedWords.length, '个单词');
      } catch (error) {
        console.error('加载收藏单词数据失败:', error);
      }
    }
  
    setupEventListeners() {
      // ESC键关闭弹窗
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          const modal = document.getElementById('wordDetailModal');
          if (modal && modal.style.display === 'flex') {
            this.closeModal();
          } else {
            // 如果没有弹窗打开，则关闭整个页面
            window.close();
          }
        }
      });
  
      // 搜索功能
      const searchInput = document.getElementById('searchInput');
      const clearSearchBtn = document.getElementById('clearSearchBtn');
      
      searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value.trim();
        this.filterWords();
        this.currentPage = 1;
        this.render();
        
        clearSearchBtn.style.display = this.searchQuery ? 'flex' : 'none';
      });
  
      clearSearchBtn.addEventListener('click', () => {
        searchInput.value = '';
        this.searchQuery = '';
        this.filterWords();
        this.currentPage = 1;
        this.render();
        clearSearchBtn.style.display = 'none';
      });
  
      // 每页显示数量选择
      document.getElementById('pageSizeSelect').addEventListener('change', (e) => {
        this.pageSize = parseInt(e.target.value);
        this.currentPage = 1;
        this.render();
      });
  
      // 清空全部按钮
      document.getElementById('clearAllSavedBtn').addEventListener('click', () => {
        this.clearAllWords();
      });
  
      // 分页按钮
      document.getElementById('prevPageBtn').addEventListener('click', () => {
        if (this.currentPage > 1) {
          this.currentPage--;
          this.render();
        }
      });
  
      document.getElementById('nextPageBtn').addEventListener('click', () => {
        const totalPages = Math.ceil(this.filteredWords.length / this.pageSize);
        if (this.currentPage < totalPages) {
          this.currentPage++;
          this.render();
        }
      });
  
      // 导出导入按钮
      document.getElementById('exportBtn').addEventListener('click', () => {
        this.exportData();
      });
  
      document.getElementById('importBtn').addEventListener('click', () => {
        document.getElementById('fileInput').click();
      });
  
      document.getElementById('fileInput').addEventListener('change', (e) => {
        this.handleFileImport(e);
      });
  
      // 模态框关闭
      document.getElementById('closeModalBtn').addEventListener('click', () => {
        this.closeModal();
      });
  
      // 点击模态框背景关闭
      document.getElementById('wordDetailModal').addEventListener('click', (e) => {
        if (e.target.id === 'wordDetailModal') {
          this.closeModal();
        }
      });
  
      // 监听存储变化
      chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'local') {
          if (changes.savedWords || changes.savedWordsData) {
            this.loadData().then(() => {
              this.render();
            });
          }
        }
      });
    }
  
    filterWords() {
      if (!this.searchQuery) {
        this.filteredWords = [...this.savedWords];
      } else {
        const query = this.searchQuery.toLowerCase();
        this.filteredWords = this.savedWords.filter(word => 
          word.toLowerCase().includes(query)
        );
      }
    }
  
    render() {
      this.updateStats();
      this.renderWordsList();
      this.renderPagination();
    }
  
    updateStats() {
      document.getElementById('totalSavedWords').textContent = this.savedWords.length;
      
      const startIndex = (this.currentPage - 1) * this.pageSize;
      const endIndex = Math.min(startIndex + this.pageSize, this.filteredWords.length);
      const currentPageCount = Math.max(0, endIndex - startIndex);
      
      document.getElementById('currentPageStats').textContent = 
        `显示 ${currentPageCount} 个单词`;
  
      // 更新清空按钮状态
      document.getElementById('clearAllSavedBtn').disabled = this.savedWords.length === 0;
    }
  
    renderWordsList() {
      const wordsGrid = document.getElementById('wordsGrid');
      const emptyState = document.getElementById('emptyState');
      const noResultsState = document.getElementById('noResultsState');
  
      // 隐藏所有状态
      wordsGrid.style.display = 'grid';
      emptyState.style.display = 'none';
      noResultsState.style.display = 'none';
  
      if (this.savedWords.length === 0) {
        // 没有收藏单词
        wordsGrid.style.display = 'none';
        emptyState.style.display = 'block';
        return;
      }
  
      if (this.filteredWords.length === 0) {
        // 搜索无结果
        wordsGrid.style.display = 'none';
        noResultsState.style.display = 'block';
        return;
      }
  
      // 计算当前页的单词
      const startIndex = (this.currentPage - 1) * this.pageSize;
      const endIndex = Math.min(startIndex + this.pageSize, this.filteredWords.length);
      const currentPageWords = this.filteredWords.slice(startIndex, endIndex);
  
      // 渲染单词卡片
      wordsGrid.innerHTML = currentPageWords.map(word => this.createWordCard(word)).join('');
  
      // 添加事件监听器
      this.addWordCardListeners();
    }
  
    createWordCard(word) {
      const wordLower = word.toLowerCase();
      const wordData = this.savedWordsData.get(wordLower);
      
      // 获取翻译信息
      let translation = '暂无翻译';
      if (wordData && wordData.translationData) {
        const translations = wordData.translationData.translations.filter(t => t.type === 'translation');
        if (translations.length > 0) {
          translation = translations[0].text;
        }
      }
  
      // 获取添加时间
      let addedTime = '未知时间';
      if (wordData && wordData.addedTime) {
        addedTime = new Date(wordData.addedTime).toLocaleDateString('zh-CN');
      }
  
      return `
        <div class="word-card" data-word="${word}">
          <div class="word-header">
            <h3 class="word-title">${word}</h3>
            <div class="word-actions">
              <button class="action-btn know-btn" data-word="${word}" data-action="know">
                认识
              </button>
              <button class="action-btn delete-btn" data-word="${word}" data-action="delete">
                删除
              </button>
            </div>
          </div>
          <div class="word-info">
            <div class="word-translation">${translation}</div>
            <div class="word-meta">
              <span>添加时间: ${addedTime}</span>
            </div>
          </div>
        </div>
      `;
    }
  
    addWordCardListeners() {
      // 单词卡片点击事件（显示详情）
      document.querySelectorAll('.word-card').forEach(card => {
        card.addEventListener('click', (e) => {
          // 如果点击的是按钮，不触发卡片点击
          if (e.target.closest('.word-actions')) return;
          
          const word = card.dataset.word;
          this.showWordDetail(word);
        });
      });
  
      // 按钮点击事件
      document.querySelectorAll('.action-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const word = btn.dataset.word;
          const action = btn.dataset.action;
          
          if (action === 'delete') {
            this.deleteWord(word);
          } else if (action === 'know') {
            this.markWordAsKnown(word);
          }
        });
      });
    }
  
    renderPagination() {
      const pagination = document.getElementById('pagination');
      const totalPages = Math.ceil(this.filteredWords.length / this.pageSize);
      
      if (totalPages <= 1) {
        pagination.style.display = 'none';
        return;
      }
  
      pagination.style.display = 'flex';
      
      const prevBtn = document.getElementById('prevPageBtn');
      const nextBtn = document.getElementById('nextPageBtn');
      const pageInfo = document.getElementById('pageInfo');
      
      prevBtn.disabled = this.currentPage === 1;
      nextBtn.disabled = this.currentPage === totalPages;
      pageInfo.textContent = `第 ${this.currentPage} 页，共 ${totalPages} 页`;
    }
  
    async deleteWord(word) {
      if (!confirm(`确定要删除单词 "${word}" 吗？`)) {
        return;
      }
  
      try {
        const wordLower = word.toLowerCase();
        
        // 从数组中移除
        const updatedWords = this.savedWords.filter(w => w.toLowerCase() !== wordLower);
        
        // 从详细数据中移除
        this.savedWordsData.delete(wordLower);
        
        // 保存到存储
        await chrome.storage.local.set({
          savedWords: updatedWords,
          savedWordsData: Array.from(this.savedWordsData.entries())
        });
        
        // 更新本地数据
        this.savedWords = updatedWords;
        this.filterWords();
        
        // 调整当前页
        const totalPages = Math.ceil(this.filteredWords.length / this.pageSize);
        if (this.currentPage > totalPages && totalPages > 0) {
          this.currentPage = totalPages;
        }
        
        this.render();
        this.showMessage(`已删除单词: ${word}`, 'success');
      } catch (error) {
        console.error('删除单词失败:', error);
        this.showMessage('删除单词失败，请重试', 'error');
      }
    }
  
    async markWordAsKnown(word) {
      try {
        const wordLower = word.toLowerCase();
        
        // 获取已认识单词列表
        const result = await chrome.storage.local.get(['knownWords', 'knownWordsData']);
        const knownWords = result.knownWords || [];
        const knownWordsDataArray = result.knownWordsData || [];
        const knownWordsData = new Map(knownWordsDataArray);
        
        // 检查是否已经在已认识列表中
        if (knownWords.some(w => w.toLowerCase() === wordLower)) {
          this.showMessage('该单词已经在已认识列表中', 'info');
          return;
        }
        
        // 获取单词详细数据
        let wordData = this.savedWordsData.get(wordLower);
        if (wordData) {
          wordData.knownTime = Date.now();
        } else {
          wordData = {
            word: word,
            knownTime: Date.now(),
            addedTime: Date.now()
          };
        }
        
        // 从收藏列表移除
        const updatedSavedWords = this.savedWords.filter(w => w.toLowerCase() !== wordLower);
        this.savedWordsData.delete(wordLower);
        
        // 添加到已认识列表
        const updatedKnownWords = [...knownWords, word];
        knownWordsData.set(wordLower, wordData);
        
        // 保存到存储
        await chrome.storage.local.set({
          savedWords: updatedSavedWords,
          savedWordsData: Array.from(this.savedWordsData.entries()),
          knownWords: updatedKnownWords,
          knownWordsData: Array.from(knownWordsData.entries())
        });
        
        // 更新本地数据
        this.savedWords = updatedSavedWords;
        this.filterWords();
        
        // 调整当前页
        const totalPages = Math.ceil(this.filteredWords.length / this.pageSize);
        if (this.currentPage > totalPages && totalPages > 0) {
          this.currentPage = totalPages;
        }
        
        this.render();
        this.showMessage(`已将"${word}"标记为认识`, 'success');
      } catch (error) {
        console.error('标记单词为已认识失败:', error);
        this.showMessage('标记单词失败，请重试', 'error');
      }
    }
  
    async clearAllWords() {
      if (!confirm('确定要清空所有收藏的单词吗？此操作不可撤销。')) {
        return;
      }
  
      try {
        await chrome.storage.local.set({
          savedWords: [],
          savedWordsData: []
        });
        
        this.savedWords = [];
        this.savedWordsData = new Map();
        this.filteredWords = [];
        this.currentPage = 1;
        
        this.render();
        this.showMessage('已清空所有收藏的单词', 'success');
      } catch (error) {
        console.error('清空单词失败:', error);
        this.showMessage('清空单词失败，请重试', 'error');
      }
    }
  
    async exportData() {
      try {
        const allData = await chrome.storage.local.get([
          'savedWords',
          'savedWordsData',
          'knownWords',
          'knownWordsData',
          'translationCache',
          'highlightColor'
        ]);
        
        const data = {
          words: this.savedWords,
          wordsData: allData.savedWordsData || [],
          knownWords: allData.knownWords || [],
          knownWordsData: allData.knownWordsData || [],
          translationCache: allData.translationCache || [],
          highlightColor: allData.highlightColor || '#ffeb3b',
          version: '1.10.0',
          exportTime: new Date().toISOString(),
          count: this.savedWords.length,
          knownCount: (allData.knownWords || []).length,
          appName: '多多记单词'
        };
        
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `多多记单词_备份_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        this.showMessage('数据导出成功！', 'success');
      } catch (error) {
        console.error('数据导出失败:', error);
        this.showMessage('数据导出失败，请重试', 'error');
      }
    }
  
    async handleFileImport(event) {
      const file = event.target.files[0];
      if (!file) return;
      
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        
        if (!data.words || !Array.isArray(data.words)) {
          throw new Error('无效的数据格式');
        }
        
        // 合并数据
        const importedWords = data.words.filter(word => typeof word === 'string');
        const mergedWords = [...new Set([...this.savedWords, ...importedWords])];
        
        const dataToSave = {
          savedWords: mergedWords
        };
        
        if (data.wordsData && Array.isArray(data.wordsData)) {
          dataToSave.savedWordsData = data.wordsData;
        }
        
        await chrome.storage.local.set(dataToSave);
        
        await this.loadData();
        this.render();
        
        const importedCount = importedWords.length;
        this.showMessage(`数据导入成功！新增 ${importedCount} 个单词`, 'success');
      } catch (error) {
        console.error('数据导入失败:', error);
        this.showMessage('数据导入失败，请检查文件格式', 'error');
      }
      
      event.target.value = '';
    }
  
    showWordDetail(word) {
      const wordData = this.savedWordsData.get(word.toLowerCase());
      const modal = document.getElementById('wordDetailModal');
      const title = document.getElementById('modalWordTitle');
      const content = document.getElementById('modalWordContent');
      
      title.textContent = `${word}`;
      
      if (wordData && wordData.translationData) {
        content.innerHTML = this.createDetailContent(word, wordData);
      } else {
        content.innerHTML = `
          <div class="word-detail">
            <h3>${word}</h3>
            <p>暂无详细翻译信息</p>
          </div>
        `;
      }
      
      // 添加发音按钮事件监听器
      const pronunciationBtn = content.querySelector('.pronunciation-btn');
      if (pronunciationBtn) {
        pronunciationBtn.addEventListener('click', () => {
          this.playPronunciation(word);
        });
      }
      
      modal.style.display = 'flex';
    }
  
    createDetailContent(word, wordData) {
      const translationData = wordData.translationData;
      let content = `<div class="word-detail-enhanced">`;
      
      // 音标和发音区域（放在顶部）
      const phonetic = translationData.translations.find(t => t.type === 'phonetic');
      if (phonetic) {
        content += `<div style="display: flex; align-items: center; justify-content: center; gap: 12px; margin-bottom: 24px; padding: 16px; background: #f8f9fa; border-radius: 8px;">`;
        content += `<span style="font-size: 18px; color: #495057; font-family: 'Courier New', monospace; font-weight: 500;">${phonetic.text}</span>`;
        content += `<button class="pronunciation-btn" data-word="${word}" title="点击发音" style="background: #007bff; color: white; border: none; border-radius: 50%; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s ease; box-shadow: 0 2px 4px rgba(0,123,255,0.3);">`;
        content += `<span class="pronunciation-icon" style="font-size: 14px;">🔊</span>`;
        content += `</button>`;
        content += `</div>`;
      }
      
      // 翻译区域
      const translations = translationData.translations.filter(t => t.type === 'translation');
      if (translations.length > 0) {
        content += `<div style="margin-bottom: 24px;">`;
        content += `<h4 style="margin: 0 0 12px 0; color: #2d3748; font-size: 16px; font-weight: 600; display: flex; align-items: center; gap: 8px;"><span style="color: #007bff;">🌐</span> 翻译</h4>`;
        translations.forEach((trans, index) => {
          content += `<div style="background: linear-gradient(135deg, #e3f2fd 0%, #f3e5f5 100%); padding: 16px; border-radius: 10px; margin-bottom: 8px; border-left: 4px solid #007bff; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">`;
          content += `<span style="color: #1565c0; font-size: 16px; font-weight: 500;">${trans.text}</span>`;
          content += `<span style="background: #007bff; color: white; padding: 4px 8px; border-radius: 12px; font-size: 11px; margin-left: 12px; font-weight: 500;">${trans.source}</span>`;
          content += `</div>`;
        });
        content += `</div>`;
      }
      
      // 词典定义区域
      const definitions = translationData.translations.filter(t => t.type === 'definition');
      if (definitions.length > 0) {
        content += `<div style="margin-bottom: 24px;">`;
        content += `<h4 style="margin: 0 0 12px 0; color: #2d3748; font-size: 16px; font-weight: 600; display: flex; align-items: center; gap: 8px;"><span style="color: #28a745;">📖</span> 词典释义</h4>`;
        
        // 按词性分组
        const definitionsByPart = {};
        definitions.forEach(def => {
          if (!definitionsByPart[def.partOfSpeech]) {
            definitionsByPart[def.partOfSpeech] = [];
          }
          definitionsByPart[def.partOfSpeech].push(def);
        });
        
        Object.entries(definitionsByPart).forEach(([partOfSpeech, defs]) => {
          content += `<div style="margin-bottom: 20px; background: #fafafa; border-radius: 10px; padding: 16px; border: 1px solid #e9ecef;">`;
          content += `<div style="background: linear-gradient(135deg, #28a745 0%, #20c997 100%); color: white; padding: 6px 12px; border-radius: 16px; font-size: 13px; font-weight: 600; display: inline-block; margin-bottom: 12px; box-shadow: 0 2px 4px rgba(40,167,69,0.3);">${this.getPartOfSpeechChinese(partOfSpeech)}</div>`;
          
          defs.forEach((def, index) => {
            content += `<div style="background: white; padding: 14px; border-radius: 8px; margin-bottom: 10px; border: 1px solid #dee2e6; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">`;
            content += `<div style="color: #2d3748; font-size: 14px; line-height: 1.6; margin-bottom: 10px; font-weight: 500;">${def.text}</div>`;
            
            if (def.example) {
              content += `<div style="background: linear-gradient(135deg, #fff3e0 0%, #ffe0b2 100%); padding: 10px; border-radius: 6px; margin-bottom: 8px; border-left: 3px solid #ff9800;">`;
              content += `<span style="color: #e65100; font-size: 12px; font-weight: 600;">💡 例句: </span>`;
              content += `<span style="color: #bf360c; font-size: 13px; font-style: italic; line-height: 1.4;">${def.example}</span>`;
              content += `</div>`;
            }
            
            if (def.synonyms && def.synonyms.length > 0) {
              content += `<div style="background: linear-gradient(135deg, #e8f5e8 0%, #c8e6c9 100%); padding: 10px; border-radius: 6px; border-left: 3px solid #4caf50;">`;
              content += `<span style="color: #2e7d32; font-size: 12px; font-weight: 600;">🔗 同义词: </span>`;
              content += `<span style="color: #388e3c; font-size: 13px; font-weight: 500;">${def.synonyms.join(', ')}</span>`;
              content += `</div>`;
            }
            
            content += `</div>`;
          });
          content += `</div>`;
        });
        
        content += `</div>`;
      }
      
      // 简化的添加时间信息
      if (wordData.addedTime) {
        const addedDate = new Date(wordData.addedTime);
        content += `<div style="padding: 12px; background: #f8f9fa; border-radius: 8px; border-top: 2px solid #dee2e6; margin-top: 16px; text-align: center;">`;
        content += `<span style="color: #6c757d; font-size: 13px; display: flex; align-items: center; justify-content: center; gap: 6px;"><span style="color: #17a2b8;">📅</span> 添加时间: ${addedDate.toLocaleDateString('zh-CN')}</span>`;
        content += `</div>`;
      }
      
      content += `</div>`;
      return content;
    }
  
    // 词性中文映射
    getPartOfSpeechChinese(partOfSpeech) {
      const posMap = {
        'noun': '名词',
        'verb': '动词', 
        'adjective': '形容词',
        'adverb': '副词',
        'pronoun': '代词',
        'preposition': '介词',
        'conjunction': '连词',
        'interjection': '感叹词',
        'determiner': '限定词',
        'exclamation': '感叹词'
      };
      
      return posMap[partOfSpeech] || partOfSpeech;
    }
  
    // 播放单词发音
    playPronunciation(word) {
      try {
        if ('speechSynthesis' in window) {
          speechSynthesis.cancel();
          
          const utterance = new SpeechSynthesisUtterance(word);
          utterance.lang = 'en-US';
          utterance.rate = 0.8;
          utterance.pitch = 1;
          utterance.volume = 1;
          
          speechSynthesis.speak(utterance);
        } else {
          console.log('浏览器不支持语音合成');
        }
      } catch (error) {
        console.error('播放发音失败:', error);
      }
    }
  
    closeModal() {
      document.getElementById('wordDetailModal').style.display = 'none';
    }
  
    showMessage(message, type = 'info') {
      const messageElement = document.createElement('div');
      messageElement.className = `message message-${type}`;
      messageElement.textContent = message;
      
      messageElement.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 12px 20px;
        border-radius: 6px;
        color: white;
        font-weight: 500;
        z-index: 10000;
        animation: slideIn 0.3s ease;
      `;
      
      switch (type) {
        case 'success':
          messageElement.style.backgroundColor = '#28a745';
          break;
        case 'error':
          messageElement.style.backgroundColor = '#dc3545';
          break;
        default:
          messageElement.style.backgroundColor = '#17a2b8';
      }
      
      document.body.appendChild(messageElement);
      
      setTimeout(() => {
        if (messageElement.parentNode) {
          messageElement.remove();
        }
      }, 3000);
    }
  }
  
  // 页面加载完成后初始化
  document.addEventListener('DOMContentLoaded', () => {
    new SavedWordsManager();
  });