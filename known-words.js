// 已认识单词管理页面脚本
class KnownWordsManager {
  constructor() {
    this.knownWords = [];
    this.knownWordsData = new Map();
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
      const result = await chrome.storage.local.get(['knownWords', 'knownWordsData']);
      this.knownWords = result.knownWords || [];
      this.knownWordsData = new Map(Object.entries(result.knownWordsData || {}));
      this.filteredWords = [...this.knownWords];
    } catch (error) {
      console.error('加载已认识单词数据失败:', error);
    }
  }

  setupEventListeners() {
    // ESC键关闭页面
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        window.close();
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

    // 每页显示数量
    document.getElementById('pageSizeSelect').addEventListener('change', (e) => {
      this.pageSize = parseInt(e.target.value);
      this.currentPage = 1;
      this.render();
    });

    // 清空全部按钮
    document.getElementById('clearAllKnownBtn').addEventListener('click', () => {
      this.clearAllKnownWords();
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

    // 模态框关闭
    document.getElementById('closeModalBtn').addEventListener('click', () => {
      this.closeModal();
    });

    document.getElementById('wordDetailModal').addEventListener('click', (e) => {
      if (e.target.id === 'wordDetailModal') {
        this.closeModal();
      }
    });
  }

  filterWords() {
    if (!this.searchQuery) {
      this.filteredWords = [...this.knownWords];
    } else {
      const query = this.searchQuery.toLowerCase();
      this.filteredWords = this.knownWords.filter(word => 
        word.toLowerCase().includes(query)
      );
    }
  }

  render() {
    this.updateStats();
    this.updateWordsList();
    this.updatePagination();
    this.updateControls();
  }

  updateStats() {
    document.getElementById('totalKnownWords').textContent = this.knownWords.length;
  }

  updateWordsList() {
    const wordsGrid = document.getElementById('wordsGrid');
    const emptyState = document.getElementById('emptyState');
    const noResultsState = document.getElementById('noResultsState');

    // 隐藏所有状态
    wordsGrid.style.display = 'grid';
    emptyState.style.display = 'none';
    noResultsState.style.display = 'none';

    if (this.knownWords.length === 0) {
      wordsGrid.style.display = 'none';
      emptyState.style.display = 'block';
      return;
    }

    if (this.filteredWords.length === 0) {
      wordsGrid.style.display = 'none';
      noResultsState.style.display = 'block';
      return;
    }

    // 计算当前页的单词
    const startIndex = (this.currentPage - 1) * this.pageSize;
    const endIndex = startIndex + this.pageSize;
    const currentPageWords = this.filteredWords.slice(startIndex, endIndex);

    // 渲染单词卡片
    wordsGrid.innerHTML = currentPageWords.map(word => this.createWordCard(word)).join('');

    // 添加事件监听器
    this.addWordCardListeners();
  }

  createWordCard(word) {
    const wordData = this.knownWordsData.get(word) || {};
    
    return `
      <div class="word-card" data-word="${word}">
        <div class="word-card-header">
          <h3 class="word-text">${word}</h3>
          <div class="word-actions">
            <button class="word-action-btn delete-word-btn" data-word="${word}" title="删除">
              🗑️
            </button>
          </div>
        </div>
      </div>
    `;
  }

  addWordCardListeners() {
    // 单词卡片点击事件
    document.querySelectorAll('.word-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (!e.target.classList.contains('word-action-btn')) {
          const word = card.dataset.word;
          this.showWordDetail(word);
        }
      });
    });

    // 删除按钮事件
    document.querySelectorAll('.delete-word-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const word = btn.dataset.word;
        this.deleteKnownWord(word);
      });
    });
  }

  updatePagination() {
    const pagination = document.getElementById('pagination');
    const prevBtn = document.getElementById('prevPageBtn');
    const nextBtn = document.getElementById('nextPageBtn');
    const pageInfo = document.getElementById('pageInfo');
    const currentPageStats = document.getElementById('currentPageStats');

    const totalPages = Math.ceil(this.filteredWords.length / this.pageSize);
    
    if (totalPages <= 1) {
      pagination.style.display = 'none';
    } else {
      pagination.style.display = 'flex';
      
      prevBtn.disabled = this.currentPage === 1;
      nextBtn.disabled = this.currentPage === totalPages;
      
      pageInfo.textContent = `第 ${this.currentPage} 页，共 ${totalPages} 页`;
    }

    // 更新底部统计
    const startIndex = (this.currentPage - 1) * this.pageSize;
    const endIndex = Math.min(startIndex + this.pageSize, this.filteredWords.length);
    const showing = this.filteredWords.length > 0 ? `${startIndex + 1}-${endIndex}` : '0';
    currentPageStats.textContent = `显示 ${showing} / ${this.filteredWords.length} 个单词`;
  }

  updateControls() {
    const clearAllBtn = document.getElementById('clearAllKnownBtn');
    clearAllBtn.disabled = this.knownWords.length === 0;
  }

  async deleteKnownWord(word) {
    if (!confirm(`确定要删除单词 "${word}" 吗？`)) {
      return;
    }

    try {
      // 从数组中移除
      const index = this.knownWords.indexOf(word);
      if (index > -1) {
        this.knownWords.splice(index, 1);
      }

      // 从详细数据中移除
      this.knownWordsData.delete(word);

      // 保存到存储
      await chrome.storage.local.set({
        knownWords: this.knownWords,
        knownWordsData: Object.fromEntries(this.knownWordsData)
      });

      // 更新过滤结果
      this.filterWords();

      // 调整当前页
      const totalPages = Math.ceil(this.filteredWords.length / this.pageSize);
      if (this.currentPage > totalPages && totalPages > 0) {
        this.currentPage = totalPages;
      }

      this.render();
      this.showMessage(`已删除单词 "${word}"`);
    } catch (error) {
      console.error('删除单词失败:', error);
      this.showMessage('删除失败，请重试', 'error');
    }
  }

  async clearAllKnownWords() {
    if (!confirm(`确定要清空所有已认识的单词吗？这个操作不能撤销！\n\n当前共有 ${this.knownWords.length} 个单词。`)) {
      return;
    }

    try {
      this.knownWords = [];
      this.knownWordsData.clear();
      this.filteredWords = [];
      this.currentPage = 1;

      await chrome.storage.local.set({
        knownWords: [],
        knownWordsData: {}
      });

      this.render();
      this.showMessage('已清空所有已认识单词');
    } catch (error) {
      console.error('清空单词失败:', error);
      this.showMessage('清空失败，请重试', 'error');
    }
  }

  showWordDetail(word) {
    const wordData = this.knownWordsData.get(word) || {};
    const modal = document.getElementById('wordDetailModal');
    const modalTitle = document.getElementById('modalWordTitle');
    const modalContent = document.getElementById('modalWordContent');

    modalTitle.textContent = word;
    modalContent.innerHTML = this.createWordDetailContent(word, wordData);
    modal.style.display = 'flex';
  }

  createWordDetailContent(word, wordData) {
    const pronunciation = wordData.pronunciation || {};
    
    let content = `
      <div class="word-detail">
    `;

    // 发音信息
    if (pronunciation.us || pronunciation.uk) {
      content += `<div class="pronunciation-section">`;
      if (pronunciation.us) {
        content += `<p><strong>美式发音:</strong> ${pronunciation.us}</p>`;
      }
      if (pronunciation.uk) {
        content += `<p><strong>英式发音:</strong> ${pronunciation.uk}</p>`;
      }
      content += `</div>`;
    }

    // 添加提示文字
    content += `
        <div class="known-word-hint" style="
          background: linear-gradient(135deg, #fff3e0 0%, #ffe0b2 100%);
          border: 1px solid #ff9800;
          border-radius: 8px;
          padding: 16px;
          margin-top: 20px;
          text-align: center;
          color: #e65100;
          font-size: 14px;
          line-height: 1.6;
          box-shadow: 0 2px 4px rgba(255,152,0,0.1);
        ">
          <div style="font-size: 16px; margin-bottom: 8px;">🤔</div>
          <div style="font-weight: 500; margin-bottom: 4px;">已经认识了，还点进来做什么呢？</div>
          <div>难道又忘了？忘了的话，就删除重新收藏吧。</div>
        </div>
    `;

    content += `
      </div>
    `;

    return content;
  }

  closeModal() {
    document.getElementById('wordDetailModal').style.display = 'none';
  }

  showMessage(message, type = 'success') {
    // 创建消息提示
    const messageEl = document.createElement('div');
    messageEl.className = `message ${type}`;
    messageEl.textContent = message;
    messageEl.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: ${type === 'error' ? '#e53e3e' : '#28a745'};
      color: white;
      padding: 12px 20px;
      border-radius: 6px;
      z-index: 10000;
      font-size: 14px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      animation: slideIn 0.3s ease-out;
    `;

    document.body.appendChild(messageEl);

    setTimeout(() => {
      messageEl.style.animation = 'slideOut 0.3s ease-out';
      setTimeout(() => {
        if (messageEl.parentNode) {
          messageEl.parentNode.removeChild(messageEl);
        }
      }, 300);
    }, 3000);
  }
}

// 添加动画样式
const style = document.createElement('style');
style.textContent = `
  @keyframes slideIn {
    from {
      transform: translateX(100%);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }
  
  @keyframes slideOut {
    from {
      transform: translateX(0);
      opacity: 1;
    }
    to {
      transform: translateX(100%);
      opacity: 0;
    }
  }
`;
document.head.appendChild(style);

// 初始化管理器
document.addEventListener('DOMContentLoaded', () => {
  new KnownWordsManager();
}); 